export const APA7_GUIDANCE_DESCRIPTION = 'Get Spanish APA 7 guidance and templates. A call with only topic returns an overview and a catalogue, not the detailed rules. Follow detailLookup.examples using the exact selector for that topic. For figure notes call {"topic":"table-figure","tableFigureRuleId":"figure-notes"}; details are in tableFigureRule.rules. For the full UPC figure section call {"topic":"review","reviewSectionId":"figures"}; read reviewSkill.considerations.items and related sections. Review guidance is instructions for the client agent, not a verdict on a document. Does not require Blackboard login; host account authorization still applies.';

export const APA7_TABLE_FIGURE_SELECTOR_DESCRIPTION = 'Only with topic="table-figure": select an id from availableTableFigureRules, e.g. "figure-notes", "figure-components" or "reprinted-adapted-table-figure". Returns the detailed rule in tableFigureRule.rules, plus citation, reference and permission treatment. Do not use reviewSectionId, caseId or a generic ruleId for these rules.';

// Use the catalogue actually returned by this version, rather than promising
// ids absent from the installed package. Also works with the hosted 2.x bundle.
const lookups: Record<string, Array<[string, string, string]>> = {
  'principles-ethics': [['principlesEthicsRuleId', 'availablePrinciplesEthicsRules', 'principlesEthicsRule']],
  citation: [['citationRuleId', 'availableCitationRules', 'citationRule'], ['caseId', 'availableVerifiedCases', 'case'], ['peruLegalCaseId', 'availablePeruLegalCases', 'legalCase']],
  reference: [['referenceRuleId', 'availableReferenceRules', 'referenceRule'], ['caseId', 'availableVerifiedCases', 'case'], ['peruLegalCaseId', 'availablePeruLegalCases', 'legalCase']],
  format: [['formatRuleId', 'availableFormatRules', 'formatRule']],
  reporting: [['reportingRuleId', 'availableReportingRules', 'reportingRule']],
  'writing-style': [['writingStyleRuleId', 'availableWritingStyleRules', 'writingStyleRule']],
  'bias-free-language': [['biasFreeLanguageRuleId', 'availableBiasFreeLanguageRules', 'biasFreeLanguageRule']],
  mechanics: [['mechanicsRuleId', 'availableMechanicsRules', 'mechanicsRule']],
  'table-figure': [['tableFigureRuleId', 'availableTableFigureRules', 'tableFigureRule']],
  legal: [['legalRuleId', 'availableLegalRules', 'legalRule'], ['peruLegalCaseId', 'availablePeruLegalCases', 'legalCase']],
  publication: [['publicationRuleId', 'availablePublicationRules', 'publicationRule']],
};

export function addApa7DetailDiscovery(topic: string, payload: Record<string, any>) {
  const selectors = (lookups[topic] ?? []).filter(([, catalogue]) => payload[catalogue]?.length);
  if (topic === 'review' && payload.reviewSkill?.selection === 'all') {
    selectors.push(['reviewSectionId', 'reviewSkill.catalog', 'reviewSkill']);
  }
  if (!selectors.length) return { ...payload, guidanceScope: topic === 'course-requirements' ? 'course-workflow' : 'selected-guidance' };
  const examples = selectors.flatMap(([parameter, catalogue, resultField]) => {
    const ids: string[] = parameter === 'reviewSectionId'
      ? payload.reviewSkill.catalog.map((section: { id: string }) => section.id)
      : payload[catalogue];
    const preferred = topic === 'table-figure'
      ? ['figure-notes', 'figure-components', 'reprinted-adapted-table-figure']
      : topic === 'review' ? ['figures', 'tables'] : [];
    const selected = preferred.filter(id => ids.includes(id));
    return (selected.length ? selected : ids.slice(0, 1)).map(id => ({
      tool: 'campus_apa7_guidance', arguments: { topic, [parameter]: id }, resultField,
    }));
  });
  return {
    ...payload,
    guidanceScope: 'overview',
    detailLookup: {
      instructions: 'Esta respuesta es una vista general y un catálogo. Para una duda concreta, ejecuta las consultas de ejemplo con el selector exacto; no sustituyas las reglas detalladas por el resumen ni inventes nombres de parámetros. Usa un solo selector por llamada. Las reglas son orientación redactada por Campus, no una transcripción literal del manual.',
      selectors: selectors.map(([parameter, availableIdsField, resultField]) => ({ parameter, availableIdsField, resultField })),
      examples,
      ...(topic === 'table-figure' ? {
        upcSection: { tool: 'campus_apa7_guidance', arguments: { topic: 'review', reviewSectionId: 'figures' }, resultField: 'reviewSkill.considerations.items' },
        warning: 'Que una figura propia no necesite atribución externa no establece por sí solo que deba llevar «Nota. Elaboración propia.»; comprueba las reglas detalladas y las instrucciones reales del docente.',
      } : {}),
    },
  };
}
