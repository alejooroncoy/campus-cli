#!/usr/bin/env python3
"""Compare a fresh UPC crawl with the shipped source inventory.

Run apa7-audit-upc.py first. A known broken link is reported separately; an
unknown failure, missing page, changed content or changed image fails this check.
This checks source capture coverage, not semantic equivalence of review criteria.
Development dependencies: requests, beautifulsoup4.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urldefrag, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup, Comment

ROOT = Path(__file__).resolve().parents[1]
REFS = ROOT / '.agents/skills/apa7-review-campus/references'


def canonical(url):
    p = urlparse(urldefrag(url)[0])
    return urlunparse(p._replace(query=urlencode([
        (k, v) for k, v in parse_qsl(p.query) if k != 'preview'])))


def verify(capture, audit, rules):
    lookup = {canonical(url): page for page in audit['pages']
              for url in [page['url'], *page['aliases']]}
    sections = {section['id']: section for section in rules['sections']}
    known_broken = {canonical(link['url']) for link in audit['brokenLinks']}
    registered_links = {canonical(link['url']) for link in audit['links']}
    recorded_images = {image['url'] for image in audit['images']}
    problems, known_failures, rows, observed = [], [], {}, {}
    links, images = set(), set()
    for error in capture['errors']:
        if canonical(error['url']) in known_broken and '404' in error['error']:
            known_failures.append(error)
        else:
            problems.append({'kind': 'fetch-error', **error})
    for page in capture['pages']:
        expected = lookup.get(canonical(page['url']))
        if not expected:
            problems.append({'kind': 'unregistered-page', 'url': page['url']})
            continue
        section_id = expected['sectionId']
        expected_blocks = {block['blockId']: block for block in expected['blocks']}
        actual_blocks = {block['blockId']: block for block in page['blocks']}
        if set(expected_blocks) != set(actual_blocks):
            problems.append({'kind': 'block-set-changed', 'url': page['url']})
        changed = []
        for block_id, block in actual_blocks.items():
            original = expected_blocks.get(block_id)
            if original:
                units = [{key: unit[key] for key in ('unitId', 'tag', 'sha256')}
                         for unit in block['units']]
                if original['sha256'] != block['sha256'] or original['units'] != units:
                    changed.append(block_id)
            found = [link['url'] for link in block['links']]
            found += re.findall(r'https?://[^\s<>]+', block['text'])
            links.update(canonical(url.rstrip('.,;)')) for url in found)
            images.update(image['url'] for image in block['images'])
            if block.get('embeds'):
                problems.append({'kind': 'embedded-content-needs-review', 'blockId': block_id})
        if changed:
            problems.append({'kind': 'content-changed', 'url': page['url'], 'blocks': changed})
        if sections[section_id]['sourceBlockIds'] != [b['blockId'] for b in expected['blocks']]:
            problems.append({'kind': 'rule-section-mapping-mismatch', 'sectionId': section_id})
        rows[section_id] = {
            'sectionId': section_id, 'title': sections[section_id]['title'],
            'url': expected['url'], 'blocks': len(page['blocks']),
            'textUnits': sum(len(b['units']) for b in page['blocks']),
            'imageReferences': sum(len(b['images']) for b in page['blocks']),
            'matchesStoredBlocksAndUnits': not changed and set(expected_blocks) == set(actual_blocks),
            'mainSha256': page['mainSha256'],
        }
        observed[section_id] = page
    for page in audit['pages']:
        if page['sectionId'] not in observed:
            problems.append({'kind': 'missing-page', 'sectionId': page['sectionId'], 'url': page['url']})
    if links != registered_links:
        problems.append({'kind': 'content-link-set-changed',
                         'unregistered': sorted(links - registered_links),
                         'missing': sorted(registered_links - links)})
    if images != recorded_images:
        problems.append({'kind': 'image-set-changed',
                         'unregistered': sorted(images - recorded_images),
                         'missing': sorted(recorded_images - images)})
    return {
        'entryUrl': capture['entryUrl'], 'requestedScope': 'upc-guide',
        'successfulUrlVariants': len(capture['pages']),
        'uniquePages': len(rows),
        'legalPages': sum(s.startswith('legal-') for s in rows),
        'contentBlocks': sum(row['blocks'] for row in rows.values()),
        'textUnits': sum(row['textUnits'] for row in rows.values()),
        'uniqueImages': len(images), 'registeredContentLinks': len(links),
        'knownBrokenLinks': known_failures, 'problems': problems,
        'pages': list(rows.values()),
    }


def check_html(directory, expected_files):
    """Ensure content text is covered by units, including hidden panels."""
    unit_tags = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'table'}
    seen, problems = set(), []
    files = list(directory.glob('*.html'))
    if len(files) != expected_files:
        problems.append({'kind': 'html-capture-count-mismatch',
                         'expected': expected_files, 'found': len(files)})
    for path in files:
        soup = BeautifulSoup(path.read_text(), 'html.parser')
        main = soup.select_one('#s-lg-guide-main')
        if main is None:
            problems.append({'kind': 'missing-guide-main', 'file': path.name})
            continue
        for block in main.select('[id^="s-lg-content-"]'):
            block_id = block['id']
            if block_id in seen:
                continue
            seen.add(block_id)
            if block.select('iframe,embed,object,svg,video,audio'):
                problems.append({'kind': 'non-image-media-needs-review', 'blockId': block_id})
            # Blocks without these tags use the crawler's complete-text fallback.
            if not block.find_all(list(unit_tags)):
                continue
            for node in block.find_all(string=True):
                if isinstance(node, Comment) or not str(node).strip():
                    continue
                if any(parent.name in {'script', 'style'} for parent in node.parents):
                    continue
                if not any(parent.name in unit_tags for parent in node.parents if parent != block):
                    problems.append({'kind': 'text-outside-inventoried-units', 'blockId': block_id})
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    audit_path = REFS / 'upc-source-audit.json'
    audit = json.loads(audit_path.read_text())
    rules = json.loads((REFS / 'upc-review-rules.json').read_text())
    result = verify(json.loads(args.capture.read_text()), audit, rules)
    result['problems'].extend(check_html(args.capture.parent, len(json.loads(args.capture.read_text())['pages'])))
    result['checkedAtUtc'] = datetime.now(timezone.utc).isoformat()
    result['sourceAuditSha256'] = hashlib.sha256(audit_path.read_bytes()).hexdigest()
    result['imageChecks'] = []
    session = requests.Session()
    for image in audit['images']:
        try:
            response = session.get(image['url'], timeout=40)
            response.raise_for_status()
            sha = hashlib.sha256(response.content).hexdigest()
            matches = sha == image['sha256']
            result['imageChecks'].append({'id': image['id'], 'url': image['url'],
                                         'sha256': sha, 'matchesStored': matches})
            if not matches:
                result['problems'].append({'kind': 'image-changed', 'id': image['id']})
        except requests.RequestException as error:
            result['problems'].append({'kind': 'image-fetch-error', 'id': image['id'], 'error': str(error)})
    result['captureMatchesSnapshot'] = not result['problems']
    result['semanticEquivalenceCertified'] = False
    result['interpretation'] = (
        'Verifica cobertura de captura y coincidencia con la web en esta consulta. '
        'No prueba automáticamente que cada regla o ejemplo esté interpretado correctamente '
        'en la síntesis, ni que todos los casos posibles de APA estén cubiertos. '
        'Los documentos externos completos no forman parte de la captura de la guía UPC.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in (
        'uniquePages', 'legalPages', 'contentBlocks', 'textUnits', 'uniqueImages',
        'registeredContentLinks', 'captureMatchesSnapshot', 'problems')}, ensure_ascii=False))
    return 0 if result['captureMatchesSnapshot'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
