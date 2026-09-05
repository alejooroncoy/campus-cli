import assert from 'node:assert/strict';
import test from 'node:test';
import { principlesEthicsRules } from '../src/providers/academic/apa7-principles-ethics-rules.js';
import { formatRules } from '../src/providers/academic/apa7-format-rules.js';
import { reportingRules } from '../src/providers/academic/apa7-reporting-rules.js';
import { writingStyleRules } from '../src/providers/academic/apa7-writing-style-rules.js';
import { biasFreeLanguageRules } from '../src/providers/academic/apa7-bias-free-language-rules.js';
import { mechanicsRules } from '../src/providers/academic/apa7-mechanics-rules.js';
import { tableFigureRules } from '../src/providers/academic/apa7-table-figure-rules.js';
import { citationRules } from '../src/providers/academic/apa7-citation-rules.js';
import { referenceRules } from '../src/providers/academic/apa7-reference-rules.js';
import { legalRules } from '../src/providers/academic/apa7-legal-rules.js';
import { publicationRules } from '../src/providers/academic/apa7-publication-rules.js';
import { peruLegalCases } from '../src/providers/academic/apa7-peru-legal-cases.js';
import { periodicalCases } from '../src/providers/academic/apa7-periodical-cases.js';
import { bookCases } from '../src/providers/academic/apa7-book-cases.js';
import { chapterEntryCases } from '../src/providers/academic/apa7-chapter-entry-cases.js';
import { reportConferenceThesisCases } from '../src/providers/academic/apa7-report-conference-thesis-cases.js';
import { reviewUnpublishedCases } from '../src/providers/academic/apa7-review-unpublished-cases.js';
import { dataSoftwareTestCases } from '../src/providers/academic/apa7-data-software-test-cases.js';
import { audiovisualAudioCases } from '../src/providers/academic/apa7-audiovisual-audio-cases.js';
import { visualSocialWebCases } from '../src/providers/academic/apa7-visual-social-web-cases.js';

const numberedChapters = [
  { chapter: 1, last: 25, rules: Object.values(principlesEthicsRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 2, last: 28, rules: Object.values(formatRules), citation: 'citationReferenceImpact', reference: 'citationReferenceImpact' },
  { chapter: 3, last: 18, rules: Object.values(reportingRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 4, last: 28, rules: Object.values(writingStyleRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 5, last: 10, rules: Object.values(biasFreeLanguageRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 6, last: 52, rules: Object.values(mechanicsRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 7, last: 36, rules: Object.values(tableFigureRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 8, last: 36, rules: Object.values(citationRules), citation: 'examples', reference: 'referenceTreatment' },
  { chapter: 9, last: 52, rules: Object.values(referenceRules), citation: 'citationImpact', reference: 'referencePattern' },
  { chapter: 11, last: 12, rules: Object.values(legalRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
  { chapter: 12, last: 24, rules: Object.values(publicationRules), citation: 'citationTreatment', reference: 'referenceTreatment' },
] as const;

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) && value.length > 0;
}

test('completion audit covers every numbered APA 7 section with citation and reference treatment', () => {
  for (const item of numberedChapters) {
    const sections = new Set(item.rules.map(rule => rule.manualSection));
    assert.deepEqual(
      [...sections],
      Array.from({ length: item.last }, (_, index) => `${item.chapter}.${index + 1}`),
      `chapter ${item.chapter} has a missing or out-of-order section`,
    );
    for (const rule of item.rules) {
      const record = rule as unknown as Record<string, unknown>;
      assert.equal(record.status, 'verified', String(record.id));
      assert.ok(nonEmpty(record[item.citation]), `${String(record.id)} has no citation treatment`);
      assert.ok(nonEmpty(record[item.reference]), `${String(record.id)} has no reference treatment`);
      assert.ok(nonEmpty(record.refuseWhen), `${String(record.id)} has no anti-hallucination guard`);
      assert.ok(nonEmpty(record.manualPrintedPages), `${String(record.id)} has no manual page evidence`);
    }
  }
  // Section 8.13 deliberately has two records: one for paraphrases and one
  // for quotations. The section set remains complete even though there are 37 records.
  assert.equal(Object.keys(citationRules).length, 37);
});

test('completion audit covers all 114 Chapter 10 examples with both citation forms and a reference', () => {
  const cases = [
    ...Object.values(periodicalCases),
    ...Object.values(bookCases),
    ...Object.values(chapterEntryCases),
    ...Object.values(reportConferenceThesisCases),
    ...Object.values(reviewUnpublishedCases),
    ...Object.values(dataSoftwareTestCases),
    ...Object.values(audiovisualAudioCases),
    ...Object.values(visualSocialWebCases),
  ];
  assert.equal(cases.length, 114);
  assert.deepEqual(cases.map(item => item.manualExample), Array.from({ length: 114 }, (_, index) => index + 1));
  assert.deepEqual([...new Set(cases.map(item => item.manualSection))], Array.from({ length: 16 }, (_, index) => `10.${index + 1}`));
  for (const item of cases) {
    assert.equal(item.status, 'verified', item.id);
    assert.ok(item.requiredMetadata.length, item.id);
    assert.ok(item.parentheticalCitation.trim(), item.id);
    assert.ok(item.narrativeCitation.trim(), item.id);
    assert.ok(item.referenceTemplate.trim(), item.id);
    assert.ok(item.refuseWhen.length, item.id);
    assert.ok(item.manualPrintedPages.trim(), item.id);
  }
});

test('completion audit keeps Peru legal adaptations jurisdiction-specific and source-verifiable', () => {
  assert.equal(Object.keys(peruLegalCases).length, 10);
  for (const item of Object.values(peruLegalCases)) {
    assert.equal(item.status, 'verified-source-adaptation', item.id);
    assert.ok(item.requiredMetadata.length, item.id);
    assert.ok(item.parentheticalCitation.trim(), item.id);
    assert.ok(item.narrativeCitation.trim(), item.id);
    assert.ok(item.directQuoteLocator.trim(), item.id);
    assert.ok(item.referenceTemplate.trim(), item.id);
    assert.ok(item.officialVerification.length, item.id);
    assert.ok(item.officialVerification.every(source => source.url.startsWith('https://')), item.id);
    assert.ok(item.refuseWhen.length >= 3, item.id);
  }
});
