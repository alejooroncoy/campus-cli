#!/usr/bin/env python3
"""Score independent review decisions; correction semantics need adjudication.

The evaluator sees inputs only. This script measures the frozen labels and source
grounding, and exports corrections for explicit review. It does not equate a
non-empty proposed correction with a correct correction.
"""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cases', required=True, type=Path)
    parser.add_argument('--results', required=True, type=Path)
    parser.add_argument('--rules', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--adjudication', type=Path,
                        help='Explicit human/agent semantic decisions, separate from frozen automatic metrics')
    args = parser.parse_args()
    gold = json.loads(args.cases.read_text())
    reviewed = json.loads(args.results.read_text())
    rules = json.loads(args.rules.read_text())
    expected = {case['id']: case for case in gold['cases']}
    actual = {case['id']: case for case in reviewed['cases']}
    if len(actual) != len(reviewed['cases']) or set(actual) != set(expected):
        raise ValueError('Missing, extra or duplicate review results')
    criterion_urls = {f'{section["id"]}:{i + 1}': section['url']
                      for section in rules['sections'] for i in range(len(section['criteria']))}
    labels = ['cumple', 'corregir', 'no verificable']
    matrix = {label: {other: 0 for other in labels} for label in labels}
    errors, rows = [], []
    for key, case in expected.items():
        answer = actual[key]
        wanted = case['expected']['status']
        got = answer['status']
        if got not in labels:
            raise ValueError(f'Unknown status: {key}: {got}')
        matrix[wanted][got] += 1
        refs = answer.get('criterionRefs', [])
        unknown_refs = [ref for ref in refs if ref not in criterion_urls]
        matching_refs = set(refs).intersection(case['expected']['criterionRefs'])
        cited = set(answer.get('sourceUrls', []))
        grounded = bool(matching_refs) and not unknown_refs and any(
            criterion_urls[ref] in cited for ref in matching_refs)
        row = {'id': key, 'sectionId': case['sectionId'], 'expectedStatus': wanted,
               'actualStatus': got, 'statusMatches': wanted == got,
               'sourceGrounded': grounded, 'unknownCriterionRefs': unknown_refs,
               'expectedRepair': case['expected']['repair'],
               'proposedCorrection': answer.get('correction', ''),
               'findings': answer.get('findings', []),
               'correctionAdjudication': 'pending' if wanted != 'cumple' else 'not-applicable'}
        rows.append(row)
        if not row['statusMatches'] or not grounded:
            errors.append(row)
    tp = matrix['corregir']['corregir']
    fp = sum(matrix[label]['corregir'] for label in labels if label != 'corregir')
    fn = sum(matrix['corregir'][label] for label in labels if label != 'corregir')
    result = {'schemaVersion': 1, 'reviewer': reviewed.get('reviewer'),
              'caseCount': len(rows), 'sectionsTested': len({row['sectionId'] for row in rows}),
              'confusionMatrix': matrix,
              'statusAccuracy': sum(row['statusMatches'] for row in rows) / len(rows),
              'sourceGroundingRate': sum(row['sourceGrounded'] for row in rows) / len(rows),
              'errorDetectionPrecision': tp / (tp + fp) if tp + fp else None,
              'errorDetectionRecall': tp / (tp + fn) if tp + fn else None,
              'correctControlsWithoutFalseAlarms': matrix['cumple']['cumple'],
              'unverifiableControlsRespected': matrix['no verificable']['no verificable'],
              'correctionSemanticsVerified': False,
              'interpretation': 'Resultados de estos casos concretos; no prueba de infalibilidad. Las correcciones todavía requieren adjudicación semántica.',
              'errors': errors, 'cases': rows}
    if args.adjudication:
        adjudication = json.loads(args.adjudication.read_text())
        decisions = {row['id']: row for row in adjudication['cases']}
        if len(decisions) != len(adjudication['cases']) or set(decisions) != set(expected):
            raise ValueError('Missing, extra or duplicate adjudication decisions')
        for row in rows:
            decision = decisions[row['id']]
            if decision['status'] not in {'pass', 'fail'} or not decision.get('reason'):
                raise ValueError(f'Unresolved semantic adjudication: {row["id"]}')
            row['correctionAdjudication'] = decision
        result['semanticAdjudication'] = {
            'reviewer': adjudication['reviewer'],
            'passed': sum(row['status'] == 'pass' for row in decisions.values()),
            'failed': sum(row['status'] == 'fail' for row in decisions.values()),
            'sourceSupported': sum(row.get('sourceSupported') is True for row in decisions.values()),
            'notes': adjudication.get('notes', [])}
        result['correctionSemanticsVerified'] = all(row['status'] == 'pass' for row in decisions.values())
        result['interpretation'] = ('Resultados de estos casos concretos; no prueba de infalibilidad. '
                                    'Las decisiones semánticas están registradas aparte; '
                                    'las métricas automáticas conservan las respuestas esperadas originales.')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in result.items() if key not in {'cases', 'errors'}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
