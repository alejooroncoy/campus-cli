import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAcademicTools } from '../src/providers/academic/apa7-mcp-tools.js';

test('APA 7 guidance is publicly available and exposes a journal template', async () => {
  const tools = new Map<string, any>();
  const server = {
    registerTool(name: string, config: unknown, handler: unknown) {
      tools.set(name, { config, handler });
    },
  };

  registerAcademicTools(server as any);

  const tool = tools.get('campus_apa7_guidance');
  assert.ok(tool);
  assert.equal(tool.config.annotations.readOnlyHint, true);
  const result = await tool.handler({ topic: 'reference', sourceType: 'journal-article' });
  const content = JSON.parse(result.content[0].text);
  assert.match(content.template, /https:\/\/doi.org/);
  assert.match(content.safety, /No inventes/);
});

test('APA 7 guidance returns usable content for every supported topic and source type', async () => {
  let handler: any;
  registerAcademicTools({
    registerTool(_name: string, _config: unknown, registeredHandler: unknown) {
      handler = registeredHandler;
    },
  } as any);

  for (const topic of ['principles-ethics', 'citation', 'reference', 'format', 'reporting', 'writing-style', 'bias-free-language', 'mechanics', 'table-figure', 'legal', 'publication', 'review', 'course-requirements']) {
    const result = await handler({ topic });
    const content = JSON.parse(result.content[0].text);
    assert.match(content.authority, /Biblioteca UPC/);
  }

  for (const sourceType of [
    'book', 'book-chapter', 'journal-article', 'webpage', 'report', 'thesis',
    'newspaper-article', 'video-webinar', 'podcast', 'social-media', 'software',
    'personal-communication', 'other',
  ]) {
    const result = await handler({ topic: 'reference', sourceType });
    const content = JSON.parse(result.content[0].text);
    assert.ok(content.template, `missing template for ${sourceType}`);
  }
});

test('APA 7 guidance covers every JARS reporting section 3.1 through 3.18', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'reporting' })).content[0].text);
  assert.equal(catalogue.availableReportingRules.length, 18);
  assert.match(catalogue.warning, /no prueban/i);
  const rules = await Promise.all(catalogue.availableReportingRules.map(async (reportingRuleId: string) =>
    JSON.parse((await handler({ topic: 'reporting', reportingRuleId })).content[0].text).reportingRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 18 }, (_, index) => `3.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.appliesTo.length > 0);
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('JARS guidance separates study reporting, citations and references without inventing evidence', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const method = JSON.parse((await handler({ topic: 'reporting', reportingRuleId: 'quantitative-method' })).content[0].text).reportingRule;
  const qualitative = JSON.parse((await handler({ topic: 'reporting', reportingRuleId: 'qualitative-findings' })).content[0].text).reportingRule;
  const mixed = JSON.parse((await handler({ topic: 'reporting', reportingRuleId: 'mixed-methods-reporting' })).content[0].text).reportingRule;
  assert.match(method.rules.join(' '), /tamaño muestral/);
  assert.match(method.citationTreatment.join(' '), /medida/);
  assert.match(method.referenceTreatment.join(' '), /software/);
  assert.match(method.refuseWhen.join(' '), /inventar una muestra/);
  assert.match(qualitative.citationTreatment.join(' '), /participantes/);
  assert.match(qualitative.referenceTreatment.join(' '), /entrevistas confidenciales.*no se listan/);
  assert.match(mixed.rules.join(' '), /valor añade integrarlos/);
  assert.match(mixed.rules.join(' '), /no existe integración metodológica/);
});

test('APA 7 guidance covers every Spanish writing-style section 4.1 through 4.28', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'writing-style' })).content[0].text);
  assert.equal(catalogue.availableWritingStyleRules.length, 28);
  const rules = await Promise.all(catalogue.availableWritingStyleRules.map(async (writingStyleRuleId: string) =>
    JSON.parse((await handler({ topic: 'writing-style', writingStyleRuleId })).content[0].text).writingStyleRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 28 }, (_, index) => `4.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('Spanish writing guidance preserves attribution, identity and institutional integrity rules', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const gender = JSON.parse((await handler({ topic: 'writing-style', writingStyleRuleId: 'gender-pronouns' })).content[0].text).writingStyleRule;
  const passive = JSON.parse((await handler({ topic: 'writing-style', writingStyleRuleId: 'active-passive-voice' })).content[0].text).writingStyleRule;
  const editors = JSON.parse((await handler({ topic: 'writing-style', writingStyleRuleId: 'copyeditors-writing-centers' })).content[0].text).writingStyleRule;
  assert.match(gender.rules.join(' '), /No inventes género/);
  assert.match(passive.rules.join(' '), /permite ambas voces/);
  assert.match(editors.rules.join(' '), /integridad académica/);
  assert.match(editors.refuseWhen.join(' '), /trabajo intelectual/);
});

test('APA 7 guidance covers every bias-free-language section 5.1 through 5.10', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'bias-free-language' })).content[0].text);
  assert.equal(catalogue.availableBiasFreeLanguageRules.length, 10);
  const rules = await Promise.all(catalogue.availableBiasFreeLanguageRules.map(async (biasFreeLanguageRuleId: string) =>
    JSON.parse((await handler({ topic: 'bias-free-language', biasFreeLanguageRuleId })).content[0].text).biasFreeLanguageRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 10 }, (_, index) => `5.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('Bias-free-language guidance never infers identity or turns participants into references', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const gender = JSON.parse((await handler({ topic: 'bias-free-language', biasFreeLanguageRuleId: 'gender' })).content[0].text).biasFreeLanguageRule;
  const race = JSON.parse((await handler({ topic: 'bias-free-language', biasFreeLanguageRuleId: 'racial-ethnic-identity' })).content[0].text).biasFreeLanguageRule;
  const participants = JSON.parse((await handler({ topic: 'bias-free-language', biasFreeLanguageRuleId: 'research-participation' })).content[0].text).biasFreeLanguageRule;
  assert.match(gender.rules.join(' '), /no los uses como sinónimos/i);
  assert.match(gender.refuseWhen.join(' '), /asignarlos/);
  assert.match(race.refuseWhen.join(' '), /apellido, fotografía, idioma o nacionalidad/);
  assert.match(participants.referenceTreatment.join(' '), /No incluyas participantes confidenciales/);
  assert.match(participants.citationTreatment.join(' '), /no reciben citas autor-fecha/);
});

test('APA 7 guidance covers every mechanics section 6.1 through 6.52', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'mechanics' })).content[0].text);
  assert.equal(catalogue.availableMechanicsRules.length, 52);
  const rules = await Promise.all(catalogue.availableMechanicsRules.map(async (mechanicsRuleId: string) =>
    JSON.parse((await handler({ topic: 'mechanics', mechanicsRuleId })).content[0].text).mechanicsRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 52 }, (_, index) => `6.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('Mechanics guidance preserves quotation, DOI, statistical and list semantics', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const period = JSON.parse((await handler({ topic: 'mechanics', mechanicsRuleId: 'period' })).content[0].text).mechanicsRule;
  const quotes = JSON.parse((await handler({ topic: 'mechanics', mechanicsRuleId: 'quotation-marks' })).content[0].text).mechanicsRule;
  const decimals = JSON.parse((await handler({ topic: 'mechanics', mechanicsRuleId: 'decimal-fractions' })).content[0].text).mechanicsRule;
  const lists = JSON.parse((await handler({ topic: 'mechanics', mechanicsRuleId: 'list-guidelines' })).content[0].text).mechanicsRule;
  assert.match(period.referenceTreatment.join(' '), /no añadas punto después de DOI o URL/i);
  assert.match(quotes.citationTreatment.join(' '), /Menos de 40 palabras/);
  assert.match(decimals.rules.join(' '), /no pueden superar 1/);
  assert.match(lists.citationTreatment.join(' '), /respalda solo ese elemento/);
});

test('APA 7 guidance covers every publication-process section 12.1 through 12.24', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'publication' })).content[0].text);
  assert.equal(catalogue.availablePublicationRules.length, 24);
  assert.match(catalogue.warning, /obligaciones distintas/);
  const rules = await Promise.all(catalogue.availablePublicationRules.map(async (publicationRuleId: string) =>
    JSON.parse((await handler({ topic: 'publication', publicationRuleId })).content[0].text).publicationRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 24 }, (_, index) => `12.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.permissionTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('Publication guidance separates citation, attribution, permission and legal jurisdiction', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const adaptation = JSON.parse((await handler({ topic: 'publication', publicationRuleId: 'reprint-adaptation-guidelines' })).content[0].text).publicationRule;
  const fairUse = JSON.parse((await handler({ topic: 'publication', publicationRuleId: 'permission-fair-use' })).content[0].text).publicationRule;
  const correction = JSON.parse((await handler({ topic: 'publication', publicationRuleId: 'correction-notice' })).content[0].text).publicationRule;
  assert.match(adaptation.rules.join(' '), /obligaciones distintas/);
  assert.match(adaptation.permissionTreatment.join(' '), /Citar no concede permiso/);
  assert.match(fairUse.rules.join(' '), /derecho estadounidense/);
  assert.match(fairUse.permissionTreatment.join(' '), /Para Perú/);
  assert.match(correction.referenceTreatment.join(' '), /propia entrada/);
});

test('APA 7 guidance covers every principles-and-ethics section 1.1 through 1.25', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'principles-ethics' })).content[0].text);
  assert.equal(catalogue.availablePrinciplesEthicsRules.length, 25);
  const rules = await Promise.all(catalogue.availablePrinciplesEthicsRules.map(async (principlesEthicsRuleId: string) =>
    JSON.parse((await handler({ topic: 'principles-ethics', principlesEthicsRuleId })).content[0].text).principlesEthicsRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 25 }, (_, index) => `1.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('Ethics guidance distinguishes plagiarism, data reuse, authorship and confidentiality', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const plagiarism = JSON.parse((await handler({ topic: 'principles-ethics', principlesEthicsRuleId: 'plagiarism-self-plagiarism' })).content[0].text).principlesEthicsRule;
  const duplicate = JSON.parse((await handler({ topic: 'principles-ethics', principlesEthicsRuleId: 'duplicate-piecemeal-publication' })).content[0].text).principlesEthicsRule;
  const authors = JSON.parse((await handler({ topic: 'principles-ethics', principlesEthicsRuleId: 'publication-credit' })).content[0].text).principlesEthicsRule;
  const confidential = JSON.parse((await handler({ topic: 'principles-ethics', principlesEthicsRuleId: 'confidentiality-protection' })).content[0].text).principlesEthicsRule;
  assert.match(plagiarism.rules.join(' '), /aunque exista referencia/);
  assert.match(plagiarism.refuseWhen.join(' '), /evadir detección/);
  assert.match(duplicate.citationTreatment.join(' '), /mismos datos/);
  assert.match(authors.rules.join(' '), /autoría honoraria/);
  assert.match(confidential.refuseWhen.join(' '), /reidentificación/);
});

test('APA 7 guidance covers every legal-reference section 11.1 through 11.12', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'legal' })).content[0].text);
  assert.equal(catalogue.availableLegalRules.length, 12);
  const rules = await Promise.all(catalogue.availableLegalRules.map(async (legalRuleId: string) =>
    JSON.parse((await handler({ topic: 'legal', legalRuleId })).content[0].text).legalRule,
  ));
  assert.deepEqual(rules.map(rule => rule.manualSection), Array.from({ length: 12 }, (_, index) => `11.${index + 1}`));
  for (const rule of rules) {
    assert.equal(rule.status, 'verified');
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.peruApplicability.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
  assert.match(rules.find(rule => rule.id === 'legal-versus-apa').rules.join(' '), /citaciones paralelas/);
  assert.match(rules.find(rule => rule.id === 'legal-in-text-citation').rules.join(' '), /título y año/);
  assert.match(rules.find(rule => rule.id === 'mexico-examples').peruApplicability.join(' '), /No aplicable por analogía/);
});

test('Campus exposes citation and reference handling for every Peruvian legal case', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'legal' })).content[0].text);
  assert.equal(catalogue.availablePeruLegalCases.length, 10);
  for (const peruLegalCaseId of catalogue.availablePeruLegalCases) {
    const item = JSON.parse((await handler({ topic: 'legal', peruLegalCaseId })).content[0].text).legalCase;
    assert.equal(item.status, 'verified-source-adaptation');
    assert.ok(item.requiredMetadata.length > 0);
    assert.ok(item.referenceTemplate.length > 0);
    assert.ok(item.parentheticalCitation.length > 0);
    assert.ok(item.narrativeCitation.length > 0);
    assert.ok(item.directQuoteLocator.length > 0);
    assert.ok(item.officialVerification.length > 0);
    assert.ok(item.refuseWhen.length >= 3);
  }
});

test('Peruvian legal profiles reject common hallucinations and preserve official identifiers', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const law = JSON.parse((await handler({ topic: 'legal', peruLegalCaseId: 'peru-law-or-legislative-decree' })).content[0].text).legalCase;
  const tc = JSON.parse((await handler({ topic: 'legal', peruLegalCaseId: 'peru-constitutional-court-decision' })).content[0].text).legalCase;
  const patent = JSON.parse((await handler({ topic: 'legal', peruLegalCaseId: 'peru-patent' })).content[0].text).legalCase;
  const treaty = JSON.parse((await handler({ topic: 'legal', peruLegalCaseId: 'peru-treaty' })).content[0].text).legalCase;
  assert.match(law.referenceTemplate, /Diario Oficial El Peruano/);
  assert.match(law.rules.join(' '), /texto único ordenado/);
  assert.match(tc.parentheticalCitation, /fundamento X/);
  assert.match(tc.rules.join(' '), /Distingue sentencia, auto y resolución/);
  assert.match(patent.rules.join(' '), /año de concesión, no de solicitud/);
  assert.match(treaty.rules.join(' '), /firma, aprobación, ratificación y entrada en vigor/);
});

test('APA 7 guidance exposes verified common table and figure rules', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'table-figure' })).content[0].text);
  assert.equal(catalogue.availableTableFigureRules.length, 36);
  for (const tableFigureRuleId of catalogue.availableTableFigureRules) {
    const rule = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId })).content[0].text).tableFigureRule;
    assert.equal(rule.status, 'verified');
    assert.match(rule.manualSection, /^7\./);
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationTreatment.length > 0);
    assert.ok(rule.referenceTreatment.length > 0);
    assert.ok(rule.permissionTreatment.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
});

test('APA 7 guidance covers table construction through section 7.21', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'table-figure' })).content[0].text);
  assert.equal(catalogue.availableTableFigureRules.length, 36);
  const components = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-components' })).content[0].text).tableFigureRule;
  const body = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-body' })).content[0].text).tableFigureRule;
  const notes = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-notes' })).content[0].text).tableFigureRule;
  assert.match(components.rules.join(' '), /número, título, encabezados, cuerpo y notas/);
  assert.match(body.citationTreatment.join(' '), /celdas siguen APA/);
  assert.match(notes.rules.join(' '), /nota general, notas específicas y nota de probabilidad/);
  assert.match(notes.permissionTreatment.join(' '), /no sustituye el permiso/);
  const confidence = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-confidence-intervals' })).content[0].text).tableFigureRule;
  const borders = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-borders-shading' })).content[0].text).tableFigureRule;
  const longWide = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'long-wide-tables' })).content[0].text).tableFigureRule;
  const relationships = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-relationships' })).content[0].text).tableFigureRule;
  const checklist = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'table-checklist' })).content[0].text).tableFigureRule;
  const samples = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'sample-tables' })).content[0].text).tableFigureRule;
  assert.match(confidence.rules.join(' '), /95% o 99%/);
  assert.match(borders.rules.join(' '), /No uses líneas verticales/);
  assert.match(longWide.rules.join(' '), /repite la fila de encabezados/);
  assert.match(relationships.rules.join(' '), /no uses Tabla 1A y Tabla 1B/);
  assert.match(checklist.rules.join(' '), /p < \.001/);
  assert.match(samples.rules.join(' '), /datos cualitativos y métodos mixtos/);
});

test('APA 7 guidance covers every figure section 7.22 through 7.36', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'table-figure' })).content[0].text);
  const sections = await Promise.all(catalogue.availableTableFigureRules.slice(21).map(async (tableFigureRuleId: string) =>
    JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId })).content[0].text).tableFigureRule,
  ));
  assert.deepEqual(sections.map(rule => rule.manualSection), Array.from({ length: 15 }, (_, index) => `7.${index + 22}`));
  const image = sections.find(rule => rule.id === 'figure-image');
  const photo = sections.find(rule => rule.id === 'photographs');
  const radiological = sections.find(rule => rule.id === 'radiological-data');
  const checklist = sections.find(rule => rule.id === 'figure-checklist');
  assert.match(image.rules.join(' '), /No dependas solo del color/);
  assert.match(image.rules.join(' '), /8 y 14 puntos/);
  assert.match(photo.permissionTreatment.join(' '), /consentimiento.*derechos de autor/);
  assert.match(radiological.rules.join(' '), /espacio de coordenadas/);
  assert.match(checklist.permissionTreatment.join(' '), /atribución.*permiso o consentimiento/);
});

test('APA 7 separates visual attribution, bibliography and copyright permission', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const rule = JSON.parse((await handler({ topic: 'table-figure', tableFigureRuleId: 'reprinted-adapted-table-figure' })).content[0].text).tableFigureRule;
  assert.match(rule.rules.join(' '), /nota de la tabla o figura/);
  assert.match(rule.referenceTreatment.join(' '), /entrada completa/);
  assert.match(rule.permissionTreatment.join(' '), /no equivale a obtener autorización/);
  assert.match(rule.refuseWhen.join(' '), /imagen en internet/);
});

test('APA 7 guidance distinguishes professional and student paper requirements', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'format' })).content[0].text);
  assert.equal(catalogue.availableFormatRules.length, 28);
  const professional = JSON.parse((await handler({ topic: 'format', formatRuleId: 'professional-paper-required-elements' })).content[0].text).formatRule;
  const student = JSON.parse((await handler({ topic: 'format', formatRuleId: 'student-paper-required-elements' })).content[0].text).formatRule;
  const titlePage = JSON.parse((await handler({ topic: 'format', formatRuleId: 'title-page' })).content[0].text).formatRule;
  assert.equal(professional.status, 'verified');
  assert.match(professional.rules.join(' '), /título abreviado/);
  assert.match(student.rules.join(' '), /No suele incluir título abreviado/);
  assert.match(student.rules.join(' '), /docente o la institución/);
  assert.match(titlePage.rules.join(' '), /número y nombre del curso/);
});

test('APA 7 guidance covers every manuscript-format section 2.1 through 2.28', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'format' })).content[0].text);
  assert.equal(catalogue.availableFormatRules.length, 28);
  for (const formatRuleId of catalogue.availableFormatRules) {
    const rule = JSON.parse((await handler({ topic: 'format', formatRuleId })).content[0].text).formatRule;
    assert.equal(rule.status, 'verified');
    assert.match(rule.manualSection, /^2\./);
    assert.ok(rule.rules.length > 0, `missing rules for ${formatRuleId}`);
    assert.ok(rule.citationReferenceImpact.length > 0, `missing citation/reference impact for ${formatRuleId}`);
    assert.ok(rule.refuseWhen.length >= 3, `missing refusal guards for ${formatRuleId}`);
  }
  const running = JSON.parse((await handler({ topic: 'format', formatRuleId: 'running-head' })).content[0].text).formatRule;
  const notes = JSON.parse((await handler({ topic: 'format', formatRuleId: 'footnotes' })).content[0].text).formatRule;
  const appendix = JSON.parse((await handler({ topic: 'format', formatRuleId: 'appendices' })).content[0].text).formatRule;
  assert.match(running.rules.join(' '), /máximo de 50 caracteres/);
  assert.match(notes.citationReferenceImpact.join(' '), /no sustituye la cita autor-fecha/);
  assert.match(appendix.rules.join(' '), /Tabla D1/);
});

test('APA 7 physical-format rules preserve allowed variants and exact heading levels', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const typography = JSON.parse((await handler({ topic: 'format', formatRuleId: 'typography' })).content[0].text).formatRule;
  const spacing = JSON.parse((await handler({ topic: 'format', formatRuleId: 'line-spacing' })).content[0].text).formatRule;
  const margins = JSON.parse((await handler({ topic: 'format', formatRuleId: 'margins' })).content[0].text).formatRule;
  const headings = JSON.parse((await handler({ topic: 'format', formatRuleId: 'heading-levels' })).content[0].text).formatRule;
  assert.match(typography.rules.join(' '), /Calibri 11/);
  assert.match(typography.refuseWhen.join(' '), /No es correcto afirmar.*única/);
  assert.match(spacing.rules.join(' '), /tabla.*espacio sencillo, 1\.5 o doble/);
  assert.match(margins.rules.join(' '), /2\.54 cm/);
  assert.match(headings.rules.join(' '), /Nivel 5/);
  assert.match(headings.rules.join(' '), /sin saltar niveles/);
});

test('APA 7 title, byline and affiliation rules reject invented identity details', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  for (const formatRuleId of ['paper-title', 'author-byline', 'author-affiliation']) {
    const rule = JSON.parse((await handler({ topic: 'format', formatRuleId })).content[0].text).formatRule;
    assert.match(rule.manualSection, /^2\./);
    assert.ok(rule.rules.length > 0);
    assert.ok(rule.citationReferenceImpact.length > 0);
    assert.ok(rule.refuseWhen.length >= 3);
  }
  const byline = JSON.parse((await handler({ topic: 'format', formatRuleId: 'author-byline' })).content[0].text).formatRule;
  const affiliation = JSON.parse((await handler({ topic: 'format', formatRuleId: 'author-affiliation' })).content[0].text).formatRule;
  assert.match(byline.rules.join(' '), /Omite títulos profesionales/);
  assert.match(affiliation.rules.join(' '), /no incluyas más de dos/);
});

test('APA 7 guidance exposes every verified case with citations and refusal guards', async () => {
  let handler: any;
  registerAcademicTools({
    registerTool(_name: string, _config: unknown, registeredHandler: unknown) {
      handler = registeredHandler;
    },
  } as any);

  const catalogue = JSON.parse((await handler({ topic: 'reference' })).content[0].text);
  assert.equal(catalogue.availableVerifiedCases.length, 114);

  for (const caseId of catalogue.availableVerifiedCases) {
    const result = JSON.parse((await handler({ topic: 'reference', sourceType: 'journal-article', caseId })).content[0].text);
    assert.equal(result.case.status, 'verified');
    assert.ok(result.case.requiredMetadata.length > 0, `missing metadata for ${caseId}`);
    assert.ok(result.case.referenceTemplate, `missing reference for ${caseId}`);
    assert.ok(result.case.parentheticalCitation, `missing parenthetical citation for ${caseId}`);
    assert.ok(result.case.narrativeCitation, `missing narrative citation for ${caseId}`);
    assert.ok(result.case.refuseWhen.length >= 3, `missing refusal guards for ${caseId}`);
  }
});

test('APA 7 guidance distinguishes signed and unsigned editorials', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const editorial = JSON.parse((await handler({ topic: 'reference', caseId: 'periodical-editorial' })).content[0].text);
  assert.equal(editorial.case.manualExample, 19);
  assert.match(editorial.case.referenceTemplate, /\[Editorial\]/);
  assert.match(editorial.case.rules.join(' '), /no está firmado/);
});

test('APA 7 guidance uses ampersand in a two-author parenthetical citation and reference', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const result = JSON.parse((await handler({ topic: 'reference', caseId: 'journal-doi' })).content[0].text);
  assert.match(result.case.referenceTemplate, / & /);
  assert.equal(result.case.parentheticalCitation, '(Autor, Año)');
  assert.equal(result.case.narrativeCitation, 'Autor (Año)');
});

test('APA 7 guidance covers all 18 verified book and reference-work examples', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'reference' })).content[0].text);
  const bookCases = catalogue.availableVerifiedCases.filter((id: string) => id.startsWith('book-') || [
    'diagnostic-manual', 'dictionary-thesaurus-encyclopedia', 'anthology', 'religious-work',
    'ancient-greek-roman-work', 'shakespeare-work',
  ].includes(id));
  assert.equal(bookCases.length, 18);

  const translated = JSON.parse((await handler({ topic: 'citation', caseId: 'book-translated-republication' })).content[0].text);
  assert.match(translated.case.parentheticalCitation, /Año original\/Año reedición/);
  const dictionary = JSON.parse((await handler({ topic: 'reference', caseId: 'dictionary-thesaurus-encyclopedia' })).content[0].text);
  assert.match(dictionary.case.rules.join(' '), /fecha de recuperación/);
});

test('APA 7 guidance covers all 12 chapter and reference-entry examples', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'reference' })).content[0].text);
  const ids = catalogue.availableVerifiedCases.filter((id: string) => [
    'chapter-edited-doi', 'chapter-edited-no-doi-database-or-print', 'chapter-electronic-public-url',
    'chapter-other-language', 'chapter-translated-republication', 'chapter-reprinted-from-journal',
    'chapter-reprinted-from-book', 'chapter-multivolume-work', 'work-in-anthology',
    'reference-entry-group-author', 'reference-entry-individual-author', 'wikipedia-entry',
  ].includes(id));
  assert.equal(ids.length, 12);

  const wikipedia = JSON.parse((await handler({ topic: 'citation', caseId: 'wikipedia-entry' })).content[0].text);
  assert.match(wikipedia.case.rules.join(' '), /revisión archivada/);
  const reprint = JSON.parse((await handler({ topic: 'reference', caseId: 'chapter-reprinted-from-journal' })).content[0].text);
  assert.match(reprint.case.parentheticalCitation, /Año original\/Año reimpresión/);
});

test('APA 7 guidance covers reports, conferences and theses through example 66', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'reference' })).content[0].text);
  const cases = await Promise.all([
    'report-government-or-organization', 'report-individual-authors-in-organization', 'report-series',
    'report-working-group', 'annual-report', 'code-of-ethics', 'grant-award', 'issue-brief',
    'policy-brief', 'press-release', 'conference-session', 'conference-paper-presentation',
    'conference-poster-presentation', 'symposium-contribution', 'thesis-unpublished',
    'thesis-database', 'thesis-online-not-database',
  ].map(async caseId => JSON.parse((await handler({ topic: 'reference', caseId })).content[0].text).case));
  assert.equal(cases.length, 17);
  assert.equal(catalogue.availableVerifiedCases.length, 114);
  assert.match(cases.find(item => item.id === 'grant-award').rules.join(' '), /solicitud de subvención no recuperable/);
  assert.match(cases.find(item => item.id === 'symposium-contribution').rules.join(' '), /actas publicadas/);
  assert.match(cases.find(item => item.id === 'thesis-database').referenceTemplate, /Nombre de la base de datos/);
});

test('APA 7 guidance covers reviews and unpublished or informally published works', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const review = JSON.parse((await handler({ topic: 'reference', caseId: 'review-film-in-journal' })).content[0].text).case;
  const submitted = JSON.parse((await handler({ topic: 'reference', caseId: 'manuscript-submitted' })).content[0].text).case;
  const eric = JSON.parse((await handler({ topic: 'reference', caseId: 'informal-eric' })).content[0].text).case;
  assert.equal(review.manualExample, 67);
  assert.match(review.referenceTemplate, /Reseña de la película/);
  assert.match(submitted.rules.join(' '), /No nombra la revista/);
  assert.match(eric.referenceTemplate, /documento ERIC/);
});

test('APA 7 guidance covers datasets, software and tests through example 83', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const dataset = JSON.parse((await handler({ topic: 'reference', caseId: 'dataset-published' })).content[0].text).case;
  const software = JSON.parse((await handler({ topic: 'reference', caseId: 'specialized-software' })).content[0].text).case;
  const testRecord = JSON.parse((await handler({ topic: 'reference', caseId: 'test-database-record' })).content[0].text).case;
  assert.equal(dataset.manualExample, 75);
  assert.match(dataset.rules.join(' '), /análisis secundarios/);
  assert.match(software.rules.join(' '), /distribución limitada/);
  assert.match(testRecord.rules.join(' '), /información descriptiva o administrativa única/);
});

test('APA 7 guidance covers audiovisual and audio works through example 96', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const ted = JSON.parse((await handler({ topic: 'reference', caseId: 'ted-talk' })).content[0].text).case;
  const webinar = JSON.parse((await handler({ topic: 'reference', caseId: 'recorded-webinar' })).content[0].text).case;
  const interview = JSON.parse((await handler({ topic: 'reference', caseId: 'archived-radio-interview' })).content[0].text).case;
  assert.equal(ted.manualExample, 88);
  assert.match(ted.rules.join(' '), /En YouTube/);
  assert.match(webinar.rules.join(' '), /comunicación personal/);
  assert.match(interview.rules.join(' '), /persona entrevistada/);
});

test('APA 7 guidance covers visual, social and web works through example 114', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const map = JSON.parse((await handler({ topic: 'reference', caseId: 'map' })).content[0].text).case;
  const tweet = JSON.parse((await handler({ topic: 'reference', caseId: 'tweet' })).content[0].text).case;
  const news = JSON.parse((await handler({ topic: 'reference', caseId: 'webpage-news-site' })).content[0].text).case;
  const changing = JSON.parse((await handler({ topic: 'reference', caseId: 'webpage-retrieval-date' })).content[0].text).case;
  assert.equal(map.manualExample, 100);
  assert.match(map.rules.join(' '), /dinámico/);
  assert.match(tweet.rules.join(' '), /Cada emoji cuenta como una palabra/);
  assert.match(news.rules.join(' '), /no son ediciones de un periódico/);
  assert.match(changing.rules.join(' '), /no existe versión archivada/);
});

test('APA 7 guidance exposes verified citation rules 8.1 through 8.36', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'citation' })).content[0].text);
  assert.equal(catalogue.availableCitationRules.length, 37);

  for (const citationRuleId of catalogue.availableCitationRules) {
    const result = JSON.parse((await handler({ topic: 'citation', citationRuleId })).content[0].text);
    assert.equal(result.citationRule.status, 'verified');
    assert.match(result.citationRule.manualSection, /^8\./);
    assert.ok(result.citationRule.rules.length > 0, `missing rules for ${citationRuleId}`);
    assert.ok(result.citationRule.referenceTreatment, `missing reference treatment for ${citationRuleId}`);
    assert.ok(result.citationRule.refuseWhen.length >= 3, `missing refusal guards for ${citationRuleId}`);
  }
});

test('APA 7 guidance distinguishes recoverable, personal and participant interviews', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const interview = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'interview-source' })).content[0].text).citationRule;
  const personal = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'personal-communication' })).content[0].text).citationRule;
  const classroom = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'classroom-intranet-source' })).content[0].text).citationRule;
  assert.match(interview.referenceTreatment, /Publicada: referencia del medio/);
  assert.match(personal.referenceTreatment, /No aparece/);
  assert.match(classroom.rules.join(' '), /público destinatario puede acceder/);
  assert.match(classroom.rules.join(' '), /URL de inicio de sesión/);
});

test('APA 7 guidance handles secondary sources without inventing a primary reference', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const secondary = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'primary-secondary-source' })).content[0].text).citationRule;
  assert.match(secondary.examples.join(' '), /como se cita en/);
  assert.match(secondary.referenceTreatment, /Solo la fuente secundaria consultada/);
  assert.match(secondary.refuseWhen.join(' '), /primaria no consultada/);
});

test('APA 7 guidance preserves special treatment for unrecorded Indigenous knowledge', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const rule = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'indigenous-traditional-knowledge' })).content[0].text).citationRule;
  assert.match(rule.rules.join(' '), /Si no están registrados/);
  assert.match(rule.rules.join(' '), /Obtén consentimiento/);
  assert.match(rule.referenceTreatment, /no registrado: sin referencia/);
});

test('APA 7 guidance covers author-date ambiguity and repeated citations', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const unknown = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'unknown-or-anonymous-author' })).content[0].text).citationRule;
  const repeated = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'repeated-narrative-year' })).content[0].text).citationRule;
  const sameDate = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'same-author-same-date' })).content[0].text).citationRule;
  assert.match(unknown.rules.join(' '), /solo cuando la fuente firma explícitamente/);
  assert.match(repeated.rules.join(' '), /no uses ibid/);
  assert.match(sameDate.examples.join(' '), /2020a/);
});

test('APA 7 guidance distinguishes short, block and participant quotations', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const short = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'short-quote' })).content[0].text).citationRule;
  const block = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'block-quote' })).content[0].text).citationRule;
  const participant = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'research-participant-quotation' })).content[0].text).citationRule;
  assert.match(short.whenToUse, /menos de 40/);
  assert.match(block.whenToUse, /40 palabras o más/);
  assert.match(block.rules.join(' '), /sin otro punto después/);
  assert.match(participant.referenceTreatment, /No se incluye/);
  assert.match(participant.rules.join(' '), /No las trates como comunicaciones personales/);
});

test('APA 7 guidance refuses invented locators and separates citation from copyright permission', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const noPages = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'quote-without-page-numbers' })).content[0].text).citationRule;
  const permission = JSON.parse((await handler({ topic: 'citation', citationRuleId: 'permission-for-long-quotation' })).content[0].text).citationRule;
  assert.match(noPages.rules.join(' '), /No uses ubicaciones Kindle/);
  assert.match(noPages.refuseWhen.join(' '), /Se inventó una página/);
  assert.match(permission.rules.join(' '), /obligaciones distintas/);
  assert.match(permission.refuseWhen.join(' '), /citar equivale a tener permiso/);
});

test('APA 7 guidance exposes verified reference-list rules 9.1 through 9.52', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const catalogue = JSON.parse((await handler({ topic: 'reference' })).content[0].text);
  assert.equal(catalogue.availableReferenceRules.length, 52);

  for (const referenceRuleId of catalogue.availableReferenceRules) {
    const result = JSON.parse((await handler({ topic: 'reference', referenceRuleId })).content[0].text).referenceRule;
    assert.equal(result.status, 'verified');
    assert.match(result.manualSection, /^9\./);
    assert.ok(result.rules.length > 0, `missing rules for ${referenceRuleId}`);
    assert.ok(result.citationImpact.length > 0, `missing citation impact for ${referenceRuleId}`);
    assert.ok(result.referencePattern, `missing pattern for ${referenceRuleId}`);
    assert.ok(result.refuseWhen.length >= 3, `missing refusal guards for ${referenceRuleId}`);
  }
});

test('APA 7 reference rules preserve translations and original publication years', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const language = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'other-language-work' })).content[0].text).referenceRule;
  const translated = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'translated-work' })).content[0].text).referenceRule;
  const reprinted = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'reprinted-work' })).content[0].text).referenceRule;
  assert.match(language.rules.join(' '), /traduce solo el título de la parte/);
  assert.match(language.referencePattern, /\[Traducción del título\]/);
  assert.match(translated.citationImpact.join(' '), /año original y el de la traducción/);
  assert.match(reprinted.citationImpact.join(' '), /año.*original.*reimpresión/);
});

test('APA 7 reference-list rules cover formatting, ordering, annotations and meta-analysis', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const format = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'reference-list-format' })).content[0].text).referenceRule;
  const sameDate = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'same-author-same-date-order' })).content[0].text).referenceRule;
  const annotations = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'annotated-bibliography' })).content[0].text).referenceRule;
  const meta = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'meta-analysis-references' })).content[0].text).referenceRule;
  assert.match(format.rules.join(' '), /1\.27 cm/);
  assert.match(sameDate.rules.join(' '), /2020a, 2020b/);
  assert.match(annotations.rules.join(' '), /párrafo nuevo debajo/);
  assert.match(meta.rules.join(' '), /asterisco al inicio/);
  assert.match(meta.rules.join(' '), /no crees una lista aparte/);
});

test('APA 7 source rules choose DOI over URL and omit common databases', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const ids = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'when-to-include-doi-url' })).content[0].text).referenceRule;
  const database = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'database-archive-source' })).content[0].text).referenceRule;
  assert.match(ids.rules.join(' '), /incluye solo DOI/);
  assert.match(ids.rules.join(' '), /ISBN e ISSN no se incluyen/);
  assert.match(database.rules.join(' '), /Omítela para obras ampliamente disponibles/);
  assert.match(database.refuseWhen.join(' '), /sesión, token/);
});

test('APA 7 periodical rules omit rather than invent missing publication data', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const missing = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'periodical-missing-information' })).content[0].text).referenceRule;
  const article = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'article-number' })).content[0].text).referenceRule;
  assert.match(missing.rules.join(' '), /Omite volumen, número, páginas/);
  assert.match(missing.refuseWhen.join(' '), /inventó volumen/);
  assert.match(article.referencePattern, /Artículo eLocator/);
});

test('APA 7 no-source rule produces an in-text personal communication only', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const result = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'no-source' })).content[0].text).referenceRule;
  assert.match(result.referencePattern, /Sin entrada en referencias/);
  assert.match(result.citationImpact.join(' '), /comunicación personal/);
});

test('APA 7 author rules preserve 20 versus 21 author behavior', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const authors = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'author-element-format' })).content[0].text).referenceRule;
  assert.match(authors.rules.join(' '), /hasta 20 autores incluye todos/);
  assert.match(authors.rules.join(' '), /primeros 19/);
  assert.match(authors.refuseWhen.join(' '), /et al\./);
});

test('APA 7 date rules limit retrieval dates to changing unarchived works', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const retrieval = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'retrieval-date' })).content[0].text).referenceRule;
  const noDate = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'no-date' })).content[0].text).referenceRule;
  assert.match(retrieval.rules.join(' '), /La mayoría de referencias no lleva/);
  assert.match(retrieval.rules.join(' '), /versiones estables archivadas/);
  assert.match(noDate.referencePattern, /\(s\. f\.\)/);
});

test('APA 7 title rules distinguish independent works from parts of a whole', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const title = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'title-element-format' })).content[0].text).referenceRule;
  const noTitle = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'no-title' })).content[0].text).referenceRule;
  assert.match(title.rules.join(' '), /no lleva cursiva ni comillas/);
  assert.match(title.rules.join(' '), /obra independiente/);
  assert.match(noTitle.referencePattern, /\[Descripción de la obra y medio\]/);
});

test('APA 7 reference rules do not confuse online access with webpage category', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const web = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'web-category-last-resort' })).content[0].text).referenceRule;
  const medium = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'online-versus-print' })).content[0].text).referenceRule;
  assert.match(web.rules.join(' '), /solo si no encaja mejor/);
  assert.match(web.rules.join(' '), /informe gubernamental/);
  assert.match(medium.rules.join(' '), /misma plantilla/);
});

test('APA 7 missing-data rule changes both the reference and its citation', async () => {
  let handler: any;
  registerAcademicTools({ registerTool(_n: string, _c: unknown, h: unknown) { handler = h; } } as any);
  const missing = JSON.parse((await handler({ topic: 'reference', referenceRuleId: 'four-reference-elements' })).content[0].text).referenceRule;
  assert.match(missing.rules.join(' '), /Sin autor/);
  assert.match(missing.rules.join(' '), /Sin fecha/);
  assert.match(missing.rules.join(' '), /Sin título/);
  assert.match(missing.citationImpact.join(' '), /\[Descripción de la obra\]/);
  assert.match(missing.refuseWhen.join(' '), /fabricar una entrada/);
});
