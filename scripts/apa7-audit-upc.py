#!/usr/bin/env python3
"""Inventory UPC's APA guide, including hidden tabs, notes, links and images.

Development-only dependencies: requests, beautifulsoup4. The original page text
is stored only in the requested audit directory, never in the npm package.
"""
import argparse
import hashlib
import json
import re
import time
from collections import deque
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse, parse_qs, parse_qsl, urlencode, urlunparse

import requests
from bs4 import BeautifulSoup, Comment

ENTRY = 'https://biblioteca.upc.edu.pe/citas-referencias-APA7/citas'


def guide_link(url):
    parsed = urlparse(url)
    return parsed.hostname == 'biblioteca.upc.edu.pe' and (
        parsed.path.startswith(('/citas-referencias-APA7', '/Documentos_Juridicos')) or
        (parsed.path == '/c.php' and parse_qs(parsed.query).get('g') == ['1159763'])
    )


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def canonical_link(url):
    parsed = urlparse(urldefrag(url)[0])
    query = urlencode([(key, value) for key, value in parse_qsl(parsed.query) if key != 'preview'])
    return urlunparse(parsed._replace(query=query))


def inventory_page(url, html):
    soup = BeautifulSoup(html, 'html.parser')
    main = soup.select_one('#s-lg-guide-main')
    if main is None:
        raise ValueError(f'Guide content not found: {url}')
    title = soup.select_one('h1')
    blocks = []
    for block in main.select('[id^="s-lg-content-"]'):
        text = block.get_text(' ', strip=True)
        units = []
        for node in block.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'table']):
            # A table is one example/schema, rather than duplicating its cells.
            if node.find_parent('table') or (node.name == 'p' and node.find_parent('li')):
                continue
            value = node.get_text(' ', strip=True)
            if not value:
                continue
            units.append({'unitId': f'{block["id"]}:{len(units) + 1}',
                          'tag': node.name, 'text': value, 'sha256': digest(value)})
        if text and not units:
            units.append({'unitId': f'{block["id"]}:1', 'tag': 'text',
                          'text': text, 'sha256': digest(text)})
        links = [{'url': urljoin(url, anchor['href']), 'label': anchor.get_text(' ', strip=True)}
                 for anchor in block.select('a[href]')]
        images = [{'url': urljoin(url, image.get('src') or image.get('data-src', '')),
                   'alt': image.get('alt', '')} for image in block.find_all('img')]
        embeds = [urljoin(url, node['src']) for node in block.select('iframe[src],embed[src]')]
        blocks.append({'blockId': block['id'], 'text': text, 'sha256': digest(str(block)),
                       'units': units, 'links': links, 'images': images, 'embeds': embeds})
    labels = []
    for node in main.find_all(string=True):
        if isinstance(node, Comment) or not str(node).strip():
            continue
        if any(parent.name in {'script', 'style'} for parent in node.parents):
            continue
        if any(parent.get('id', '').startswith('s-lg-content-') for parent in node.parents if parent != main):
            continue
        value = str(node).strip()
        labels.append({'tag': node.parent.name, 'text': value, 'sha256': digest(value)})
    links = [canonical_link(urljoin(url, a['href'])) for a in soup.select('a[href]')]
    updated = soup.select_one('#s-lg-guide-header-updated')
    return {'url': url, 'title': title.get_text(' ', strip=True) if title else url,
            'htmlSha256': digest(html), 'mainSha256': digest(str(main)),
            'lastUpdated': updated.get_text(' ', strip=True) if updated else None,
            'blocks': blocks, 'labels': labels, 'guideLinks': sorted(set(filter(guide_link, links)))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--entry', default=ENTRY)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    queue, seen, pages, errors = deque([args.entry]), set(), [], []
    session = requests.Session()
    session.headers['User-Agent'] = 'campus-cli/APA7-source-audit (+https://campuscli.com)'
    while queue:
        url = queue.popleft()
        if url in seen:
            continue
        seen.add(url)
        try:
            response = session.get(url, timeout=40)
            response.raise_for_status()
            page = inventory_page(response.url, response.text)
            for link in page['guideLinks']:
                if link not in seen:
                    queue.append(link)
            pages.append(page)
            name = f'{len(pages):02d}-{re.sub(r"[^a-zA-Z0-9]+", "-", urlparse(url).path.strip("/"))}'
            (args.output / f'{name}.html').write_text(response.text)
            print(json.dumps({'page': len(pages), 'url': url, 'blocks': len(page['blocks']),
                              'units': sum(len(b['units']) for b in page['blocks']),
                              'images': sum(len(b['images']) for b in page['blocks'])}), flush=True)
        except Exception as error:
            errors.append({'url': url, 'error': str(error)})
            print(json.dumps(errors[-1]), flush=True)
        time.sleep(.75)
    result = {'entryUrl': args.entry, 'pages': pages, 'errors': errors}
    (args.output / 'source-audit.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({'pages': len(pages), 'errors': len(errors),
                      'output': str(args.output / 'source-audit.json')}), flush=True)
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
