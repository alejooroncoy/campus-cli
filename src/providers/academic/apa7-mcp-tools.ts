import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPeriodicalCase, periodicalCaseId, periodicalCases, type PeriodicalCaseId } from './apa7-periodical-cases.js';
import { bookCaseId, bookCases, getBookCase, type BookCaseId } from './apa7-book-cases.js';
import { chapterEntryCaseId, chapterEntryCases, getChapterEntryCase, type ChapterEntryCaseId } from './apa7-chapter-entry-cases.js';
import { reportConferenceThesisCaseId, reportConferenceThesisCases, getReportConferenceThesisCase, type ReportConferenceThesisCaseId } from './apa7-report-conference-thesis-cases.js';
import { reviewUnpublishedCaseId, reviewUnpublishedCases, getReviewUnpublishedCase, type ReviewUnpublishedCaseId } from './apa7-review-unpublished-cases.js';
import { dataSoftwareTestCaseId, dataSoftwareTestCases, getDataSoftwareTestCase, type DataSoftwareTestCaseId } from './apa7-data-software-test-cases.js';
import { audiovisualAudioCaseId, audiovisualAudioCases, getAudiovisualAudioCase, type AudiovisualAudioCaseId } from './apa7-audiovisual-audio-cases.js';
import { visualSocialWebCaseId, visualSocialWebCases, getVisualSocialWebCase, type VisualSocialWebCaseId } from './apa7-visual-social-web-cases.js';
import { citationRuleId, citationRules, getCitationRule, type CitationRuleId } from './apa7-citation-rules.js';
import { referenceRuleId, referenceRules, getReferenceRule, type ReferenceRuleId } from './apa7-reference-rules.js';
import { formatRuleId, formatRules, getFormatRule, type FormatRuleId } from './apa7-format-rules.js';
import { tableFigureRuleId, tableFigureRules, getTableFigureRule, type TableFigureRuleId } from './apa7-table-figure-rules.js';
import { legalRuleId, legalRules, getLegalRule, type LegalRuleId } from './apa7-legal-rules.js';
import { peruLegalCaseId, peruLegalCases, getPeruLegalCase, type PeruLegalCaseId } from './apa7-peru-legal-cases.js';
import { reportingRuleId, reportingRules, getReportingRule, type ReportingRuleId } from './apa7-reporting-rules.js';
import { writingStyleRuleId, writingStyleRules, getWritingStyleRule, type WritingStyleRuleId } from './apa7-writing-style-rules.js';
import { biasFreeLanguageRuleId, biasFreeLanguageRules, getBiasFreeLanguageRule, type BiasFreeLanguageRuleId } from './apa7-bias-free-language-rules.js';
import { mechanicsRuleId, mechanicsRules, getMechanicsRule, type MechanicsRuleId } from './apa7-mechanics-rules.js';
import { publicationRuleId, publicationRules, getPublicationRule, type PublicationRuleId } from './apa7-publication-rules.js';
import { principlesEthicsRuleId, principlesEthicsRules, getPrinciplesEthicsRule, type PrinciplesEthicsRuleId } from './apa7-principles-ethics-rules.js';

const topic = z.enum(['principles-ethics', 'citation', 'reference', 'format', 'reporting', 'writing-style', 'bias-free-language', 'mechanics', 'table-figure', 'legal', 'publication', 'review', 'course-requirements']);
const sourceType = z.enum([
  'book',
  'book-chapter',
  'journal-article',
  'webpage',
  'report',
  'thesis',
  'newspaper-article',
  'video-webinar',
  'podcast',
  'social-media',
  'software',
  'personal-communication',
  'other',
]);

type SourceType = z.infer<typeof sourceType>;

const referenceTemplates: Partial<Record<SourceType, string>> = {
  book: 'Apellido, A. A. (Año). Título del libro. Editorial. URL o DOI',
  'book-chapter': 'Apellido, A. A. (Año). Título del capítulo. En A. Editor (Ed.), Título del libro (pp. xx-xx). Editorial.',
  'journal-article': 'Apellido, A. A., & Apellido, B. B. (Año). Título del artículo. Revista, volumen(número), xx-xx. https://doi.org/xxxxx',
  webpage: 'Autor o entidad. (Año, día de mes). Título de la página. Nombre del sitio. URL',
  report: 'Entidad o Apellido, A. A. (Año). Título del informe (N.º de informe xxx). Editorial o entidad. URL',
  thesis: 'Apellido, A. A. (Año). Título [Tesis de licenciatura/maestría/doctoral, Universidad]. Repositorio. URL',
  'newspaper-article': 'Apellido, A. A. (Año, día de mes). Título. Periódico. URL',
  'video-webinar': 'Autor o entidad. (Año, día de mes). Título [Video o seminario web grabado]. Plataforma. URL',
  podcast: 'Apellido, A. A. (Host). (Año, día de mes). Título del episodio (N.º de episodio) [Episodio de pódcast]. En Título del pódcast. Productora. URL',
  'social-media': 'Autor [@usuario]. (Año, día de mes). Primeras 20 palabras del contenido [Tipo de publicación]. Red social. URL',
  software: 'Autor o entidad. (Año). Nombre (Versión) [Software]. Editor o tienda. URL',
};

const verifiedCaseId = z.union([periodicalCaseId, bookCaseId, chapterEntryCaseId, reportConferenceThesisCaseId, reviewUnpublishedCaseId, dataSoftwareTestCaseId, audiovisualAudioCaseId, visualSocialWebCaseId]);
type VerifiedCaseId = PeriodicalCaseId | BookCaseId | ChapterEntryCaseId | ReportConferenceThesisCaseId | ReviewUnpublishedCaseId | DataSoftwareTestCaseId | AudiovisualAudioCaseId | VisualSocialWebCaseId;

function getVerifiedCase(id: VerifiedCaseId) {
  if (id in periodicalCases) return getPeriodicalCase(id as PeriodicalCaseId);
  if (id in bookCases) return getBookCase(id as BookCaseId);
  if (id in chapterEntryCases) return getChapterEntryCase(id as ChapterEntryCaseId);
  if (id in reportConferenceThesisCases) return getReportConferenceThesisCase(id as ReportConferenceThesisCaseId);
  if (id in reviewUnpublishedCases) return getReviewUnpublishedCase(id as ReviewUnpublishedCaseId);
  if (id in dataSoftwareTestCases) return getDataSoftwareTestCase(id as DataSoftwareTestCaseId);
  if (id in audiovisualAudioCases) return getAudiovisualAudioCase(id as AudiovisualAudioCaseId);
  return getVisualSocialWebCase(id as VisualSocialWebCaseId);
}

function guidanceFor(selectedTopic: z.infer<typeof topic>, selectedSourceType?: SourceType, selectedCaseId?: VerifiedCaseId, selectedCitationRuleId?: CitationRuleId, selectedReferenceRuleId?: ReferenceRuleId, selectedFormatRuleId?: FormatRuleId, selectedReportingRuleId?: ReportingRuleId, selectedWritingStyleRuleId?: WritingStyleRuleId, selectedBiasFreeLanguageRuleId?: BiasFreeLanguageRuleId, selectedMechanicsRuleId?: MechanicsRuleId, selectedTableFigureRuleId?: TableFigureRuleId, selectedLegalRuleId?: LegalRuleId, selectedPeruLegalCaseId?: PeruLegalCaseId, selectedPublicationRuleId?: PublicationRuleId, selectedPrinciplesEthicsRuleId?: PrinciplesEthicsRuleId) {
  const base = {
    authority: 'Prioriza la rúbrica o plantilla del docente; luego la guía vigente de Biblioteca UPC y APA 7.',
    sourceGuide: 'https://biblioteca.upc.edu.pe/citas-referencias-APA7',
    safety: 'No inventes autor, fecha, página, DOI, URL ni datos bibliográficos. Marca los datos faltantes entre corchetes.',
  };

  switch (selectedTopic) {
    case 'principles-ethics':
      if (selectedPrinciplesEthicsRuleId) return { ...base, principlesEthicsRule: getPrinciplesEthicsRule(selectedPrinciplesEthicsRuleId) };
      return {
        ...base,
        workflow: [
          'Identifica el tipo real de escrito o el problema ético de la sección 1.x.',
          'Verifica aprobación, consentimiento, autoría, conflicto, originalidad, datos y derechos con evidencia.',
          'Separa atribución académica, referencia recuperable, confidencialidad y permiso.',
          'No certifiques cumplimiento ni ausencia de plagio basándote solo en apariencia o similitud automática.',
        ],
      };
    case 'citation':
      if (selectedCitationRuleId) return { ...base, citationRule: getCitationRule(selectedCitationRuleId) };
      if (selectedCaseId) return { ...base, case: getVerifiedCase(selectedCaseId) };
      return {
        ...base,
        rules: [
          'Distingue paráfrasis de cita textual y cita narrativa de parentética.',
          'Una cita textual necesita autor, año y localizador verificable; si no hay página, usa párrafo, sección o marca de tiempo.',
          'Con tres o más autores usa el primer apellido seguido de et al. desde la primera cita.',
          'Las comunicaciones personales se citan en el texto con fecha exacta, pero no se incluyen en referencias.',
        ],
        examples: {
          paraphrase: '(Apellido, 2024) o Apellido (2024)',
          shortQuote: '“Texto exacto” (Apellido, 2024, p. 15).',
          longQuote: '40+ palabras: bloque sin comillas, sangría izquierda de 1,27 cm y punto antes de la cita parentética.',
        },
      };
    case 'reference':
      if (selectedReferenceRuleId) return { ...base, referenceRule: getReferenceRule(selectedReferenceRuleId) };
      if (selectedCaseId) return { ...base, case: getVerifiedCase(selectedCaseId) };
      return {
        ...base,
        requiredMetadata: selectedSourceType === 'personal-communication'
          ? ['Iniciales y apellido de la persona', 'fecha exacta', 'medio de comunicación']
          : ['tipo de fuente', 'autor o entidad', 'fecha', 'título', 'fuente contenedora/editorial', 'DOI o URL si corresponde'],
        template: selectedSourceType === 'personal-communication'
          ? 'No lleva referencia. Cita en texto: (A. Apellido, comunicación personal, 5 de septiembre de 2026).'
          : referenceTemplates[selectedSourceType ?? 'other'] ?? 'Autor. (Fecha). Título. Fuente. DOI o URL.',
        rules: [
          'Incluye solamente obras consultadas y citadas en el texto.',
          'Ordena alfabéticamente y aplica sangría francesa de 1,27 cm.',
          'No agregues ciudad de publicación a un libro APA 7.',
          'Usa DOI en formato URL cuando exista; no añadas un DOI o URL por conjetura.',
        ],
      };
    case 'format':
      if (selectedFormatRuleId) return { ...base, formatRule: getFormatRule(selectedFormatRuleId) };
      return {
        ...base,
        checklist: [
          'Confirma primero la plantilla o rúbrica del curso.',
          'Usa doble espacio, texto alineado a la izquierda y numeración de página arriba a la derecha como base, salvo indicación del curso.',
          'Usa una fuente legible permitida por APA o la fuente exigida por el curso.',
          'Aplica títulos por niveles con consistencia; no presupongas una estructura IMRyD si la consigna no la pide.',
        ],
      };
    case 'reporting':
      if (selectedReportingRuleId) return { ...base, reportingRule: getReportingRule(selectedReportingRuleId) };
      return {
        ...base,
        warning: 'Los JARS indican qué información reportar; no prueban que el estudio fue bien diseñado o ejecutado.',
        workflow: [
          'Identifica si el estudio es cuantitativo, cualitativo, de métodos mixtos o una síntesis.',
          'Selecciona la sección 3.x y los módulos especializados que correspondan al diseño real.',
          'Reporta solamente procedimientos, decisiones y resultados documentados.',
          'Cita y referencia por separado métodos, instrumentos, datos, software, protocolos y literatura externa.',
        ],
      };
    case 'writing-style':
      if (selectedWritingStyleRuleId) return { ...base, writingStyleRule: getWritingStyleRule(selectedWritingStyleRuleId) };
      return {
        ...base,
        checklist: [
          'Elige una regla 4.x para revisar continuidad, claridad, gramática o proceso de revisión.',
          'Conserva significado, grado de certeza, datos y atribución al editar.',
          'Aplica la adaptación al español de esta edición y consulta una autoridad lingüística confiable si la duda no está cubierta.',
        ],
      };
    case 'bias-free-language':
      if (selectedBiasFreeLanguageRuleId) return { ...base, biasFreeLanguageRule: getBiasFreeLanguageRule(selectedBiasFreeLanguageRuleId) };
      return {
        ...base,
        workflow: [
          'Identifica qué característica es realmente relevante para la pregunta o muestra.',
          'Usa la autoidentificación y el nivel de especificidad documentado, sin inferir identidades.',
          'Separa los datos de participantes de las definiciones, clasificaciones e instrumentos externos.',
          'Cita y referencia únicamente las fuentes externas realmente consultadas.',
        ],
      };
    case 'mechanics':
      if (selectedMechanicsRuleId) return { ...base, mechanicsRule: getMechanicsRule(selectedMechanicsRuleId) };
      return {
        ...base,
        checklist: [
          'Selecciona la sección 6.x exacta: puntuación, ortografía, mayúsculas, cursivas, abreviaturas, números, estadística, ecuaciones o listas.',
          'Aplica la mecánica sin alterar texto citado, nombres, metadatos, símbolos, DOI o URL.',
          'Conserva siempre la estructura específica de citas y referencias APA.',
        ],
      };
    case 'table-figure':
      if (selectedTableFigureRuleId) return { ...base, tableFigureRule: getTableFigureRule(selectedTableFigureRuleId) };
      return {
        ...base,
        checklist: [
          'Incluye número y título claros, y una nota/fuente cuando corresponda.',
          'Una tabla o figura propia no necesita atribución externa.',
          'Para contenido adaptado o reproducido, verifica la atribución y los derechos de uso en la fuente original.',
        ],
      };
    case 'legal':
      if (selectedPeruLegalCaseId) return { ...base, legalCase: getPeruLegalCase(selectedPeruLegalCaseId) };
      if (selectedLegalRuleId) return { ...base, legalRule: getLegalRule(selectedLegalRuleId) };
      return {
        ...base,
        warning: 'Las referencias jurídicas dependen de la jurisdicción. No adaptes por analogía un ejemplo de otro país.',
        workflow: [
          'Identifica país, tipo de material, órgano e identificador jurídico.',
          'Verifica título, número, fecha, versión, vigencia y localizador en una fuente oficial.',
          'Selecciona una regla del capítulo 11 y, para Perú, un caso peruLegalCaseId.',
          'Genera cita y referencia solo con metadatos verificados; reporta toda incertidumbre.',
        ],
      };
    case 'publication':
      if (selectedPublicationRuleId) return { ...base, publicationRule: getPublicationRule(selectedPublicationRuleId) };
      return {
        ...base,
        warning: 'Citar, referenciar, atribuir derechos y obtener permiso son obligaciones distintas.',
        workflow: [
          'Selecciona la sección 12.x correspondiente al estado real del manuscrito o material.',
          'Verifica políticas vigentes, versión del artículo, titularidad, licencia y jurisdicción.',
          'Conserva citas y referencias y añade atribución o permiso cuando corresponda.',
          'No certifiques aceptación, ética, permiso, licencia o uso justo sin evidencia.',
        ],
      };
    case 'review':
      return {
        ...base,
        checklist: [
          'Separa hallazgos en: cumple, corregir y no verificable.',
          'Comprueba correspondencia bidireccional: cada cita tiene referencia y cada referencia está citada.',
          'Una revisión APA no detecta ni determina plagio; solo puede señalar problemas de atribución visibles.',
        ],
      };
    case 'course-requirements':
      return {
        ...base,
        workflow: [
          'Ubica el curso con blackboard_list_courses.',
          'Explora blackboard_list_contents de forma recursiva y descarga rúbricas, plantillas o guías relevantes.',
          'Usa blackboard_list_assignments solo para confirmar una tarea publicada y su fecha.',
          'Al responder, nombra los archivos que sustentan el requisito y separa lo confirmado de lo no especificado.',
        ],
      };
  }
}

/**
 * Read-only APA guidance. The host decides which authenticated or entitled
 * users may register it. It intentionally returns rules and templates
 * instead of attempting to manufacture a citation from incomplete metadata.
 * It does not require a Blackboard session.
 */
export function registerAcademicTools(server: McpServer) {
  server.registerTool('campus_apa7_guidance', {
    description: 'Get reliable Spanish APA 7 guidance, templates and review checklists for citations, references, manuscript format, research reporting, tables/figures, legal materials or Blackboard course requirements. Does not require Blackboard login and never invents metadata.',
    inputSchema: {
      topic: topic.describe('The APA 7 help needed'),
      sourceType: sourceType.optional().describe('Source type when asking about a reference or citation'),
      caseId: verifiedCaseId.optional().describe('Verified APA 7 case; use this instead of guessing a specialized format'),
      citationRuleId: citationRuleId.optional().describe('Verified APA 7 citation rule from chapter 8; use this for exact quotation and attribution behavior'),
      referenceRuleId: referenceRuleId.optional().describe('Verified APA 7 reference-list rule from chapter 9; use this for category, missing-data, punctuation and metadata decisions'),
      formatRuleId: formatRuleId.optional().describe('Verified APA 7 manuscript-format rule from chapter 2; use this instead of assuming professional and student papers are identical'),
      reportingRuleId: reportingRuleId.optional().describe('Verified APA 7 research-reporting rule from chapter 3, including citation and reference treatment'),
      writingStyleRuleId: writingStyleRuleId.optional().describe('Verified Spanish-language APA 7 writing-style and grammar rule from chapter 4'),
      biasFreeLanguageRuleId: biasFreeLanguageRuleId.optional().describe('Verified APA 7 bias-free language rule from chapter 5, with citation and reference treatment'),
      mechanicsRuleId: mechanicsRuleId.optional().describe('Verified Spanish-language APA 7 mechanics rule from chapter 6'),
      tableFigureRuleId: tableFigureRuleId.optional().describe('Verified APA 7 table/figure rule from chapter 7, including citation, reference and permission treatment'),
      legalRuleId: legalRuleId.optional().describe('Verified APA 7 legal-reference rule from chapter 11; jurisdiction-specific and never transferable by analogy'),
      peruLegalCaseId: peruLegalCaseId.optional().describe('Peruvian legal-source profile with citation, reference, required metadata and official verification sources'),
      publicationRuleId: publicationRuleId.optional().describe('Verified APA 7 publication, copyright, permission and post-publication rule from chapter 12'),
      principlesEthicsRuleId: principlesEthicsRuleId.optional().describe('Verified APA 7 writing, publication-ethics and professional rule from chapter 1'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ topic, sourceType, caseId, citationRuleId, referenceRuleId, formatRuleId, reportingRuleId, writingStyleRuleId, biasFreeLanguageRuleId, mechanicsRuleId, tableFigureRuleId, legalRuleId, peruLegalCaseId, publicationRuleId, principlesEthicsRuleId }) => ({
    content: [{ type: 'text', text: JSON.stringify({
      ...guidanceFor(topic, sourceType, caseId, citationRuleId, referenceRuleId, formatRuleId, reportingRuleId, writingStyleRuleId, biasFreeLanguageRuleId, mechanicsRuleId, tableFigureRuleId, legalRuleId, peruLegalCaseId, publicationRuleId, principlesEthicsRuleId),
      availableCitationRules: citationRuleId ? undefined : Object.keys(citationRules),
      availableReferenceRules: referenceRuleId ? undefined : Object.keys(referenceRules),
      availableFormatRules: formatRuleId ? undefined : Object.keys(formatRules),
      availableReportingRules: reportingRuleId ? undefined : Object.keys(reportingRules),
      availableWritingStyleRules: writingStyleRuleId ? undefined : Object.keys(writingStyleRules),
      availableBiasFreeLanguageRules: biasFreeLanguageRuleId ? undefined : Object.keys(biasFreeLanguageRules),
      availableMechanicsRules: mechanicsRuleId ? undefined : Object.keys(mechanicsRules),
      availableTableFigureRules: tableFigureRuleId ? undefined : Object.keys(tableFigureRules),
      availableLegalRules: legalRuleId ? undefined : Object.keys(legalRules),
      availablePeruLegalCases: peruLegalCaseId ? undefined : Object.keys(peruLegalCases),
      availablePublicationRules: publicationRuleId ? undefined : Object.keys(publicationRules),
      availablePrinciplesEthicsRules: principlesEthicsRuleId ? undefined : Object.keys(principlesEthicsRules),
      availableVerifiedCases: caseId ? undefined : [
        ...Object.keys(periodicalCases),
        ...Object.keys(bookCases),
        ...Object.keys(chapterEntryCases),
        ...Object.keys(reportConferenceThesisCases),
        ...Object.keys(reviewUnpublishedCases),
        ...Object.keys(dataSoftwareTestCases),
        ...Object.keys(audiovisualAudioCases),
        ...Object.keys(visualSocialWebCases),
      ],
    }) }],
  }));
}
