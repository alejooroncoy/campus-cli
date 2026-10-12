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
    pageLabels: z.number().int().nonnegative(),
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
    labels: z.array(z.object({ labelId: z.string(), tag: z.string(), text: z.string(), sha256: hash })),
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

const decisionSchema = z.object({
  status: z.literal('reviewed'), kind: z.string().min(1),
  criterionRefs: z.array(z.string()), decision: z.string().min(1),
});

const semanticSchema = z.object({
  schemaVersion: z.literal(1), scope: z.literal('upc-guide'), status: z.literal('complete'),
  sourceCheckedOn: z.iso.date(), method: z.string().min(1),
  units: z.array(decisionSchema.extend({ unitId: z.string(), sectionId: z.string(), blockId: z.string(), sha256: hash })),
  labels: z.array(decisionSchema.extend({ labelId: z.string(), sectionId: z.string(), sha256: hash })),
  images: z.array(decisionSchema.extend({ imageId: z.string(), sha256: hash })),
  links: z.array(z.object({ url: z.string(), sourceBlocks: z.array(z.string()),
    status: z.literal('reviewed-classification'), kind: z.string(), decision: z.string().min(1) })),
  criterionEvidence: z.array(z.object({
    criterionRef: z.string(),
    criterionSha256: hash,
    basis: z.enum(['source-content', 'source-example', 'cross-source-safeguard', 'supporting-normative-source']),
    sourceUnitIds: z.array(z.string()), sourceImageIds: z.array(z.string()),
    sourceLabelIds: z.array(z.string()), supportingSourceIds: z.array(z.string()),
  })),
  summary: z.object({
    totalLabels: z.number(), reviewedLabels: z.number(), totalUnits: z.number(),
    reviewedUnits: z.number(), pendingUnits: z.literal(0), totalImages: z.number(),
    reviewedImages: z.number(), pendingImages: z.literal(0), totalCriteria: z.number(),
    criteriaWithEvidence: z.number(), totalLinks: z.number(), reviewedLinks: z.number(),
    allSemanticSourcesComplete: z.literal(true),
  }),
});

const considerationsSchema = z.object({
  schemaVersion: z.literal(1), sourceCheckedOn: z.iso.date(), method: z.string().min(1),
  considerations: z.array(z.object({
    sourceUnitId: z.string(), sectionId: z.string(), sha256: hash, kind: z.string().min(1),
    guidance: z.array(z.string().min(1)).min(1), criterionRefs: z.array(z.string()),
    requiresOriginal: z.boolean(),
  })),
  nonNormativeUnitIds: z.array(z.string()),
  warnings: z.array(z.object({
    id: z.string(), sectionId: z.string(), classification: z.enum(['rule-conflict', 'needs-original', 'extraction-artifact', 'incomplete-example']),
    sourceUnitIds: z.array(z.string()), sourceImageIds: z.array(z.string()), criterionRefs: z.array(z.string()),
    condition: z.string().min(1), application: z.string().min(1),
  })),
});

export function parseApa7ReviewCorpus(rawRulebook: unknown, rawAudit: unknown, rawSemantic: unknown, rawConsiderations: unknown) {
  const rulebook = rulebookSchema.parse(rawRulebook);
  const audit = sourceAuditSchema.parse(rawAudit);
  const summary = rulebook.coverageSummary;
  const sections = new Map(rulebook.sections.map(section => [section.id, section]));
  const blocks = audit.pages.flatMap(page => page.blocks);
  const units = blocks.flatMap(block => block.units);
  const labels = audit.pages.flatMap(page => page.labels);
  const imageIds = new Set(audit.images.map(image => image.id));
  if (sections.size !== rulebook.sections.length || audit.pages.length !== summary.upcPages ||
      summary.apaPages + summary.legalPages !== summary.upcPages ||
      blocks.length !== summary.contentBlocks || units.length !== summary.textUnits ||
      audit.images.length !== summary.uniqueImages || imageIds.size !== audit.images.length ||
      audit.links.length !== summary.registeredContentLinks ||
      labels.length !== summary.pageLabels ||
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
  const semantic = semanticSchema.parse(rawSemantic);
  const unitMap = new Map(audit.pages.flatMap(page => page.blocks.flatMap(block =>
    block.units.map(unit => [unit.unitId, { ...unit, sectionId: page.sectionId, blockId: block.blockId }] as const))));
  const labelMap = new Map(audit.pages.flatMap(page => page.labels.map(label =>
    [label.labelId, { ...label, sectionId: page.sectionId }] as const)));
  const imageMap = new Map(audit.images.map(image => [image.id, image]));
  const criteria = new Map(rulebook.sections.flatMap(section => section.criteria.map((text, i) =>
    [`${section.id}:${i + 1}` as string, { text, sectionId: section.id, url: section.url }] as const)));
  const evidence = new Map(semantic.criterionEvidence.map(item => [item.criterionRef, item]));
  const decisions = [...semantic.units, ...semantic.labels, ...semantic.images];
  const semanticSummary = semantic.summary;
  if (semantic.sourceCheckedOn !== rulebook.checkedOn ||
      semantic.units.length !== units.length || new Set(semantic.units.map(unit => unit.unitId)).size !== units.length ||
      semantic.labels.length !== labels.length || new Set(semantic.labels.map(label => label.labelId)).size !== labels.length ||
      semantic.images.length !== audit.images.length || new Set(semantic.images.map(image => image.imageId)).size !== audit.images.length ||
      semantic.links.length !== audit.links.length || new Set(semantic.links.map(link => link.url)).size !== audit.links.length ||
      evidence.size !== criteria.size || semantic.criterionEvidence.length !== criteria.size ||
      semanticSummary.totalUnits !== units.length || semanticSummary.reviewedUnits !== units.length ||
      semanticSummary.totalLabels !== labels.length || semanticSummary.reviewedLabels !== labels.length ||
      semanticSummary.totalImages !== audit.images.length || semanticSummary.reviewedImages !== audit.images.length ||
      semanticSummary.totalLinks !== audit.links.length || semanticSummary.reviewedLinks !== audit.links.length ||
      semanticSummary.totalCriteria !== criteria.size || semanticSummary.criteriaWithEvidence !== criteria.size) {
    throw new Error('APA semantic coverage does not match the source inventory.');
  }
  for (const unit of semantic.units) {
    const source = unitMap.get(unit.unitId);
    if (!source || source.sha256 !== unit.sha256 || source.sectionId !== unit.sectionId || source.blockId !== unit.blockId) {
      throw new Error(`APA semantic coverage has a changed or unresolved unit: ${unit.unitId}`);
    }
  }
  for (const label of semantic.labels) {
    const source = labelMap.get(label.labelId);
    if (!source || source.sha256 !== label.sha256 || source.sectionId !== label.sectionId) {
      throw new Error(`APA semantic coverage has an unresolved page label: ${label.labelId}`);
    }
  }
  if (semantic.images.some(image => imageMap.get(image.imageId)?.sha256 !== image.sha256) ||
      semantic.links.some(link => !audit.links.some(source => source.url === link.url &&
        JSON.stringify(source.sourceBlocks) === JSON.stringify(link.sourceBlocks))) ||
      decisions.some(item => item.criterionRefs.some(ref => !criteria.has(ref)) ||
        (['rule', 'example', 'instructional-diagram'].includes(item.kind) && !item.criterionRefs.length))) {
    throw new Error('APA semantic coverage has unresolved criteria, images or links.');
  }
  for (const [ref, item] of evidence) {
    const unitIds = semantic.units.filter(unit => unit.criterionRefs.includes(ref)).map(unit => unit.unitId);
    const labelIds = semantic.labels.filter(label => label.criterionRefs.includes(ref)).map(label => label.labelId);
    const imageIds = semantic.images.filter(image => image.criterionRefs.includes(ref)).map(image => image.imageId);
    if (!criteria.has(ref) || item.criterionSha256 !== createHash('sha256').update(criteria.get(ref)!.text).digest('hex') ||
        !unitIds.length && !labelIds.length && !imageIds.length ||
        JSON.stringify(item.sourceUnitIds) !== JSON.stringify(unitIds) ||
        JSON.stringify(item.sourceLabelIds) !== JSON.stringify(labelIds) ||
        JSON.stringify(item.sourceImageIds) !== JSON.stringify(imageIds) ||
        item.supportingSourceIds.some(id => !rulebook.normativeSources.some(source => source.id === id && source.status !== 'partial'))) {
      throw new Error(`APA semantic criterion has no matching evidence: ${ref}`);
    }
  }
  const considerations = considerationsSchema.parse(rawConsiderations);
  const dispositionIds = [...considerations.considerations.map(item => item.sourceUnitId), ...considerations.nonNormativeUnitIds];
  const normativeIds = new Set(considerations.considerations.map(item => item.sourceUnitId));
  if (considerations.sourceCheckedOn !== rulebook.checkedOn || dispositionIds.length !== units.length ||
      new Set(dispositionIds).size !== units.length || dispositionIds.some(id => !unitMap.has(id)) ||
      semantic.units.some(unit => unit.kind === 'rule' && !normativeIds.has(unit.unitId)) ||
      new Set(considerations.warnings.map(item => item.id)).size !== considerations.warnings.length) {
    throw new Error('APA considerations do not account for every source unit and explicit rule.');
  }
  for (const item of considerations.considerations) {
    const source = unitMap.get(item.sourceUnitId);
    if (!source || source.sha256 !== item.sha256 || source.sectionId !== item.sectionId ||
        item.criterionRefs.some(ref => !criteria.has(ref))) {
      throw new Error(`APA consideration has changed or unresolved evidence: ${item.sourceUnitId}`);
    }
  }
  for (const warning of considerations.warnings) {
    const sectionBlocks = new Set(sections.get(warning.sectionId)?.sourceBlockIds ?? []);
    if (!sections.has(warning.sectionId) || !warning.sourceUnitIds.length && !warning.sourceImageIds.length ||
        warning.sourceUnitIds.some(id => unitMap.get(id)?.sectionId !== warning.sectionId) ||
        warning.sourceImageIds.some(id => !imageMap.get(id)?.sourceBlocks.some(block => sectionBlocks.has(block))) ||
        warning.criterionRefs.some(ref => !criteria.has(ref))) {
      throw new Error(`APA review warning has unresolved evidence: ${warning.id}`);
    }
  }
  return { rulebook, audit, semantic, criteria, considerations };
}

// Both src/ and dist/ have the same depth below the published package root.
const skillDirectory = resolve(__dirname, '../../../.agents/skills/apa7-review-campus');

export async function loadApa7ReviewSkill(reviewSectionId?: string) {
  const [instructions, rawRulebook, rawAudit, rawSemantic, rawConsiderations] = await Promise.all([
    readFile(resolve(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(resolve(skillDirectory, 'references/upc-review-rules.json'), 'utf8'),
    readFile(resolve(skillDirectory, 'references/upc-source-audit.json'), 'utf8'),
    readFile(resolve(skillDirectory, 'references/upc-semantic-coverage.json'), 'utf8'),
    readFile(resolve(skillDirectory, 'references/upc-considerations.json'), 'utf8'),
  ]);
  const { rulebook, audit, semantic, criteria, considerations } = parseApa7ReviewCorpus(JSON.parse(rawRulebook), JSON.parse(rawAudit), JSON.parse(rawSemantic), JSON.parse(rawConsiderations));
  const section = reviewSectionId ? rulebook.sections.find(section => section.id === reviewSectionId) : undefined;
  if (reviewSectionId && !section) throw new Error(`Unknown UPC review section: ${reviewSectionId}`);
  const selectedPages = section ? audit.pages.filter(page => page.sectionId === section.id) : [];
  const selectedBlocks = new Set(selectedPages.flatMap(page => page.blocks.map(block => block.blockId)));
  const selectedUnits = semantic.units.filter(unit => unit.sectionId === section?.id);
  const selectedLabels = semantic.labels.filter(label => label.sectionId === section?.id);
  const selectedImages = semantic.images.filter(image => audit.images.some(source =>
    source.id === image.imageId && source.sourceBlocks.some(id => selectedBlocks.has(id))));
  const selectedConsiderations = considerations.considerations.filter(item => item.sectionId === section?.id);
  const selectedWarnings = considerations.warnings.filter(item => item.sectionId === section?.id);
  const selectedCriteria = new Set([...selectedUnits, ...selectedLabels, ...selectedImages, ...selectedConsiderations, ...selectedWarnings].flatMap(item => item.criterionRefs));
  return {
    name: 'apa7-review-campus',
    execution: 'client-agent' as const,
    instructions,
    rulebook: section ? { ...rulebook, sections: [section], sourceIssues: rulebook.sourceIssues.filter(issue => issue.sectionId === section.id) } : rulebook,
    catalog: rulebook.sections.map(({ id, title, url }) => ({ id, title, url })),
    selection: section?.id ?? 'all',
    relatedSectionIds: [...new Set([...selectedCriteria].map(ref => criteria.get(ref)!.sectionId))]
      .filter(id => id !== section?.id),
    considerations: {
      sha256: createHash('sha256').update(rawConsiderations).digest('hex'),
      method: considerations.method,
      summary: { dispositions: semantic.units.length, normativeUnits: considerations.considerations.length,
        guidanceItems: considerations.considerations.reduce((count, item) => count + item.guidance.length, 0),
        warnings: considerations.warnings.length },
      catalog: rulebook.sections.map(({ id }) => ({ sectionId: id,
        normativeUnits: considerations.considerations.filter(item => item.sectionId === id).length,
        warnings: considerations.warnings.filter(item => item.sectionId === id).length })),
      ...(section ? { items: selectedConsiderations, warnings: selectedWarnings } : {}),
    },
    semanticAudit: {
      sha256: createHash('sha256').update(rawSemantic).digest('hex'),
      status: semantic.status, method: semantic.method, summary: semantic.summary,
      ...(section ? {
        units: selectedUnits, labels: selectedLabels, images: selectedImages,
        links: semantic.links.filter(link => link.sourceBlocks.some(id => selectedBlocks.has(id))),
        criteria: [...selectedCriteria].map(criterionRef => ({ criterionRef, ...criteria.get(criterionRef)! })),
        criterionEvidence: semantic.criterionEvidence.filter(item => selectedCriteria.has(item.criterionRef)),
      } : {}),
    },
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
