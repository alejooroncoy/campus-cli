import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const officialUrl = z.url().refine(url => new URL(url).hostname === 'biblioteca.upc.edu.pe', {
  message: 'APA review evidence must link to Biblioteca UPC',
});

const rulebookSchema = z.object({
  schemaVersion: z.literal(2),
  authority: z.string().min(1),
  guideUrl: officialUrl,
  entryUrl: officialUrl,
  checkedOn: z.iso.date(),
  checkedTimezone: z.literal('America/Lima'),
  guideLastUpdatedOn: z.iso.date(),
  coverage: z.string().min(1),
  coverageSummary: z.object({
    requestedScope: z.literal('upc-guide'),
    upcPages: z.number().int().positive(),
    apaPages: z.number().int().positive(),
    legalPages: z.number().int().positive(),
    contentBlocks: z.number().int().positive(),
    textUnits: z.number().int().positive(),
    uniqueImages: z.number().int().nonnegative(),
    upcStatus: z.literal('reviewed-snapshot'),
    normativeExternalStatus: z.enum(['partial', 'reviewed']),
    allRequestedSourcesComplete: z.boolean(),
    sourceAuditFile: z.literal('references/upc-source-audit.json'),
    snapshotOnly: z.literal(true),
    normativeSources: z.number().int().positive(),
    normativeSourcesReviewed: z.number().int().nonnegative(),
    registeredContentLinks: z.number().int().nonnegative(),
    pendingSourceIds: z.array(z.string()),
    supportingPendingSourceIds: z.array(z.string()),
  }),
  sections: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: officialUrl,
    locator: z.string().min(1),
    criteria: z.array(z.string().min(1)).min(1),
    aliases: z.array(officialUrl),
    sourceBlockIds: z.array(z.string().min(1)).min(1),
  })).min(1),
  normativeSources: z.array(z.object({
    id: z.string().min(1), url: z.url(),
    status: z.enum(['reviewed', 'superseded', 'partial']),
    requiredForRequestedScope: z.boolean(),
    criteria: z.array(z.string().min(1)), detail: z.string(),
  })),
  sourceIssues: z.array(z.object({
    id: z.string().min(1), sectionId: z.string().min(1), url: officialUrl,
    detail: z.string().min(1), decision: z.string().min(1),
  })),
});

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sourceAuditSchema = z.object({
  schemaVersion: z.literal(1), checkedOn: z.iso.date(), scope: z.string(), method: z.string(),
  pages: z.array(z.object({
    sectionId: z.string(), url: officialUrl, aliases: z.array(officialUrl),
    htmlSha256: hash, mainSha256: hash, reviewStatus: z.literal('reviewed'),
    blocks: z.array(z.object({
      blockId: z.string(), sha256: hash, disposition: z.string(), sectionId: z.string(),
      units: z.array(z.object({ unitId: z.string(), tag: z.string(), sha256: hash })),
      imageIds: z.array(z.string()),
    })),
  })),
  images: z.array(z.object({
    id: z.string(), url: z.url(), sha256: hash, reviewStatus: z.literal('visually-reviewed'),
    assessment: z.string(), sourceBlocks: z.array(z.string()),
  })),
  links: z.array(z.object({ url: z.string(), sourceBlocks: z.array(z.string()), category: z.string(), status: z.string() })),
  brokenLinks: z.array(z.object({ url: z.url(), status: z.number(), alternatives: z.array(z.url()) })),
}).passthrough();

export function parseApa7ReviewCorpus(rawRulebook: unknown, rawAudit: unknown) {
  const rulebook = rulebookSchema.parse(rawRulebook);
  const audit = sourceAuditSchema.parse(rawAudit);
  const summary = rulebook.coverageSummary;
  const sections = new Map(rulebook.sections.map(section => [section.id, section]));
  const blocks = audit.pages.flatMap(page => page.blocks);
  const units = blocks.flatMap(block => block.units);
  const imageIds = new Set(audit.images.map(image => image.id));
  if (sections.size !== rulebook.sections.length || audit.pages.length !== summary.upcPages ||
      summary.apaPages + summary.legalPages !== summary.upcPages ||
      blocks.length !== summary.contentBlocks || units.length !== summary.textUnits ||
      audit.images.length !== summary.uniqueImages || imageIds.size !== audit.images.length ||
      audit.links.length !== summary.registeredContentLinks ||
      audit.checkedOn !== rulebook.checkedOn ||
      new Set(audit.pages.map(page => page.sectionId)).size !== sections.size ||
      new Set(blocks.map(block => block.blockId)).size !== blocks.length ||
      new Set(units.map(unit => unit.unitId)).size !== units.length) {
    throw new Error('APA review source audit does not match the declared coverage.');
  }
  for (const page of audit.pages) {
    const section = sections.get(page.sectionId);
    if (!section || page.url !== section.url ||
        JSON.stringify(page.blocks.map(block => block.blockId)) !== JSON.stringify(section.sourceBlockIds) ||
        page.blocks.some(block => block.sectionId !== section.id ||
          block.imageIds.some(id => !imageIds.has(id)) ||
          block.units.some(unit => !unit.unitId.startsWith(`${block.blockId}:`)))) {
      throw new Error(`APA review has unmapped source evidence: ${page.sectionId}`);
    }
  }
  const blockIds = new Set(blocks.map(block => block.blockId));
  if (audit.images.some(image => image.sourceBlocks.some(id => !blockIds.has(id))) ||
      audit.links.some(link => link.sourceBlocks.some(id => !blockIds.has(id))) ||
      rulebook.sourceIssues.some(issue => sections.get(issue.sectionId)?.url !== issue.url)) {
    throw new Error('APA review has unresolved source references.');
  }
  const pendingSources = rulebook.normativeSources.filter(source => source.status === 'partial');
  const pending = pendingSources.filter(source => source.requiredForRequestedScope).map(source => source.id);
  const supportingPending = pendingSources.filter(source => !source.requiredForRequestedScope).map(source => source.id);
  if (summary.normativeSources !== rulebook.normativeSources.length ||
      summary.normativeSourcesReviewed !== rulebook.normativeSources.length - pendingSources.length ||
      JSON.stringify(pending) !== JSON.stringify(summary.pendingSourceIds) ||
      JSON.stringify(supportingPending) !== JSON.stringify(summary.supportingPendingSourceIds) ||
      summary.normativeExternalStatus !== (pendingSources.length ? 'partial' : 'reviewed') ||
      (pending.length > 0 && summary.allRequestedSourcesComplete)) {
    throw new Error('APA review cannot declare complete coverage with pending normative sources.');
  }
  return { rulebook, audit };
}

// Both src/ and dist/ have the same depth below the published package root.
const skillDirectory = resolve(__dirname, '../../../.agents/skills/apa7-review-campus');

export async function loadApa7ReviewSkill(reviewSectionId?: string) {
  const [instructions, rawRulebook, rawAudit] = await Promise.all([
    readFile(resolve(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(resolve(skillDirectory, 'references/upc-review-rules.json'), 'utf8'),
    readFile(resolve(skillDirectory, 'references/upc-source-audit.json'), 'utf8'),
  ]);
  const { rulebook, audit } = parseApa7ReviewCorpus(JSON.parse(rawRulebook), JSON.parse(rawAudit));
  const section = reviewSectionId ? rulebook.sections.find(section => section.id === reviewSectionId) : undefined;
  if (reviewSectionId && !section) throw new Error(`Unknown UPC review section: ${reviewSectionId}`);
  const selectedPages = section ? audit.pages.filter(page => page.sectionId === section.id) : [];
  const selectedBlocks = new Set(selectedPages.flatMap(page => page.blocks.map(block => block.blockId)));
  return {
    name: 'apa7-review-campus',
    execution: 'client-agent' as const,
    instructions,
    rulebook: section ? { ...rulebook, sections: [section], sourceIssues: rulebook.sourceIssues.filter(issue => issue.sectionId === section.id) } : rulebook,
    catalog: rulebook.sections.map(({ id, title, url }) => ({ id, title, url })),
    selection: section?.id ?? 'all',
    sourceAudit: {
      sha256: createHash('sha256').update(rawAudit).digest('hex'),
      method: audit.method,
      brokenLinks: audit.brokenLinks,
      ...(section ? {
        pages: selectedPages,
        images: audit.images.filter(image => image.sourceBlocks.some(id => selectedBlocks.has(id))),
        links: audit.links.filter(link => link.sourceBlocks.some(id => selectedBlocks.has(id))),
      } : {}),
    },
  };
}
