import test from 'node:test';
import assert from 'node:assert/strict';
import { documentInput } from '../src/providers/academic/research-document.js';
import { verifyResearchEvidence } from '../src/providers/academic/research-evidence.js';

for (const target of [1, 20, 21, 210]) {
  test(`section ${target} is verified inside the reader's bounded context window`, async () => {
    const excerpt = 'Participants completed the survey.';
    let requested: { startSection: number; sectionCount: number } | undefined;
    const result = await verifyResearchEvidence({
      url: 'https://repository.example.edu/article.html', format: 'html', section: target, excerpt,
    }, { readDocument: (async (raw: unknown) => {
      // Use the actual reader schema: mocks that skip it hid the 21-section
      // request rejected in production for every target after section 20.
      const input = documentInput.parse(raw);
      requested = input;
      return { requestedUrl: input.url, resolvedUrl: input.url,
        retrievedAt: '2026-10-24T12:00:00.000Z', sha256: 'c'.repeat(64), format: 'html',
        totalSections: 300, nextSection: target + 1, guidance: [],
        sections: Array.from({ length: input.sectionCount }, (_, i) => ({
          section: input.startSection + i, heading: null,
          text: input.startSection + i === target ? excerpt : 'Other source context.', truncated: false,
        })),
      };
    }) as any });
    assert.equal(result.status, 'verified');
    assert.equal(result.evidenceAllowed, true);
    assert.equal(result.proof.locator, target);
    assert.equal(requested!.startSection + requested!.sectionCount - 1, target);
    assert.ok(requested!.sectionCount <= 20);
  });
}
