#!/usr/bin/env python3
"""Export the maintained UPC synthesis and semantic review evidence as Markdown."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REFS = ROOT / '.agents/skills/apa7-review-campus/references'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    book = json.loads((REFS / 'upc-review-rules.json').read_text())
    audit = json.loads((REFS / 'upc-source-audit.json').read_text())
    semantic = json.loads((REFS / 'upc-semantic-coverage.json').read_text())
    considerations = json.loads((REFS / 'upc-considerations.json').read_text())
    first = ['citations', 'direct-quotes', 'paraphrases', 'multiple-citations',
             'secondary-citations', 'personal-communications', 'interviews', 'ai-content',
             'citation-faq', 'references', 'reference-faq', 'books']
    priority = {key: i for i, key in enumerate(first)}
    sections = sorted(book['sections'], key=lambda section: (
        priority.get(section['id'], len(first) + (10 if section['id'].startswith('legal-') else 0)),
        book['sections'].index(section)))
    count = sum(len(section['criteria']) for section in sections)
    lines = ['# Información de la guía UPC de citas y referencias APA 7', '',
             f"[Fuente de entrada]({book['entryUrl']})", '',
             f"Consulta y revisión: {book['checkedOn']} ({book['checkedTimezone']}).", '',
             f"Síntesis propia de 45 páginas UPC: 185 bloques, 1.105 unidades de texto, 82 etiquetas, 14 imágenes y 98 enlaces. Cada unidad tiene destino explícito en la matriz semántica. Este documento reúne {count} criterios y {len(book['sourceIssues'])} discrepancias o ambigüedades. Los recuentos de unidades incluyen ejemplos y créditos; no equivalen a reglas independientes. Los libros externos enlazados no forman parte de la lectura íntegra de esta guía.", '',
             'La revisión de la fuente y la prueba de comportamiento son evidencias distintas. Una revisión por unidad no garantiza que toda respuesta futura de una IA sea correcta. Ante una fuente ambigua, se explicita el contraste y se coteja la fuente o la pauta docente; no se inventan datos.', '', '## Índice', '']
    for section in sections:
        lines.append(f"- [{section['title']}](#{section['id']})")
    for section in sections:
        page = next(page for page in audit['pages'] if page['sectionId'] == section['id'])
        blocks = set(section['sourceBlockIds'])
        units = [unit for unit in semantic['units'] if unit['sectionId'] == section['id']]
        lines += ['', f'<a id="{section["id"]}"></a>', f"## {section['title']}", '',
                  f"[Página oficial UPC]({section['url']})", '',
                  f"Evidencia revisada: {len(page['blocks'])} bloques, {len(units)} unidades y {len(page['labels'])} etiquetas.", '', '### Criterios', '']
        for i, criterion in enumerate(section['criteria'], 1):
            evidence = next(item for item in semantic['criterionEvidence'] if item['criterionRef'] == f"{section['id']}:{i}")
            ids = [*evidence['sourceUnitIds'], *evidence['sourceLabelIds'], *evidence['sourceImageIds']]
            lines.append(f"{i}. {criterion}")
            lines.append(f"   Evidencia: `{', '.join(ids)}`. Base: `{evidence['basis']}`.")
        notes = [item for item in considerations['considerations'] if item['sectionId'] == section['id']]
        if notes:
            lines += ['', '### Esquemas y consideraciones completas', '']
            for item in notes:
                lines.append(f"- **{item['sourceUnitId']}** ({item['kind']}): {' '.join(item['guidance'])}")
        warnings = [item for item in considerations['warnings'] if item['sectionId'] == section['id']]
        if warnings:
            lines += ['', '### Salvaguardas ante discrepancias de los ejemplos', '']
            for item in warnings:
                lines.append(f"- **{item['id']}** ({item['classification']}): {item['condition']} {item['application']}")
        images = [image for image in audit['images'] if blocks.intersection(image['sourceBlocks'])]
        if images:
            lines += ['', '### Información de las imágenes', '']
            lines += [f"- [{image['id']}]({image['url']}): {image['assessment']}" for image in images]
        issues = [issue for issue in book['sourceIssues'] if issue['sectionId'] == section['id']]
        if issues:
            lines += ['', '### Notas sobre ejemplos y discrepancias', '']
            lines += [f"- **{issue['id']}:** {issue['detail']} {issue['decision']}" for issue in issues]
        links = [link for link in audit['links'] if blocks.intersection(link['sourceBlocks'])]
        if links:
            lines += ['', '### Enlaces registrados', '']
            lines += [f"- [{link['category']}]({link['url']}) — {link['status']}" for link in links]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('\n'.join(lines) + '\n')
    print(json.dumps({'output': str(args.output.resolve()), 'sections': len(sections),
                      'criteria': count, 'normativeUnits': len(considerations['considerations']),
                      'guidanceItems': sum(len(item['guidance']) for item in considerations['considerations']),
                      'warnings': len(considerations['warnings']), 'semanticStatus': semantic['status']}))


if __name__ == '__main__':
    main()
