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
import { loadApa7ReviewSkill } from './apa7-review-skill.js';

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
  book: 'Con autor acreditado: Autor, A. A.; Autor, A. A., & Autor, B. B.; o lista completa conforme a APA. (Año). *Título del libro* (edición, desde la segunda). Editorial. Sin autor con editor acreditado: Un editor: Editor, E. E. (Ed.); dos: Editor, E. E., & Editor, F. F. (Eds.); de 3 a 20: lista completa de editores (Eds.); 21 o más: editores 1–19, …, Último editor (Eds.). (Año). *Título del libro* (edición, desde la segunda). Editorial. Con editor, la cita parentética usa (Editor, Año), (Editor & Editor, Año) o (Primer editor et al., Año), y la narrativa la misma forma sin paréntesis. Sin autor ni editor acreditado: *Título del libro*. (Año). Editorial. Sin autor, la cita parentética usa (*Título abreviado*, Año) y la narrativa usa *Título abreviado* (Año). Añade DOI si existe; si no, añade una URL pública cuando corresponda; para una obra impresa o de base académica común sin DOI, omite DOI y URL.',
  'book-chapter': 'Con autor: Autor, A. A.; Autor, A. A., & Autor, B. B.; o lista completa conforme a APA. (Año). Título del capítulo. Sin autor acreditado: Título del capítulo. (Año). En ambos casos: En E. Editor (Ed.); E. Editor & F. Editor (Eds.); o lista completa: E. Editor, F. Editor, & G. Editor (Eds.), *Título del libro* (edición/volumen si existen, pp. xx-xx). Editorial. Añade DOI si existe; si no, una URL pública ajena a una base de datos cuando corresponda; para una obra impresa o de base académica común sin DOI, omite DOI y URL. Sin autor, la cita parentética usa (“Título abreviado”, Año) y la narrativa usa “Título abreviado” (Año).',
  'journal-article': 'Con autor: Autor, A. A.; Autor, A. A., & Autor, B. B.; o lista completa conforme a APA. (Año). Título del artículo. Sin autor acreditado: Título del artículo. (Año). En ambos casos, con volumen, número y páginas/eLocator: *Revista, volumen*(número), páginas o Artículo e12345. Sin número: *Revista, volumen*, páginas o Artículo e12345. Sin volumen: *Revista*, (número), páginas o Artículo e12345. Sin volumen ni número: *Revista*, páginas o Artículo e12345; omite también páginas/eLocator si no existen. Añade https://doi.org/xxxxx si existe DOI; de lo contrario, una URL pública ajena a una base de datos si existe; si es impreso o proviene de una base académica común, omite DOI y URL. Sin autor, la cita parentética usa ("Título abreviado", Año) y la narrativa usa “Título abreviado” (Año).',
  webpage: 'Con autor personal: Un autor: Autor, A. A.; dos: Autor, A. A., & Autor, B. B.; de 3 a 20: lista completa en orden acreditado; 21 o más: autores 1–19, …, Último autor. Con entidad: Entidad autora. Luego: (Año), (Año, mes), (Año, día de mes) o (s. f.), según la fecha realmente publicada. *Título de la página*. Nombre del sitio, solo si difiere del autor. URL\nSin autor identificable: *Título de la página*. (Año), (Año, mes), (Año, día de mes) o (s. f.). Nombre del sitio. URL\nSin autor, la cita parentética usa (*Título abreviado*, Año) y la narrativa usa *Título abreviado* (Año). No inventes mes ni día.',
  report: 'Con autor o entidad acreditados: Autor o entidad. (Año). *Título del informe* (N.º de informe xxx, solo si existe). Editorial o entidad, solo si difiere del autor. Sin autor ni entidad acreditados: *Título del informe*. (Año). Editorial o entidad. En ambos casos, añade DOI o URL si corresponde; omítelos si no existe un localizador aplicable. Si el informe no tiene número asignado, omite por completo ese paréntesis. Sin autor, la cita parentética usa (*Título abreviado*, Año) y la narrativa usa *Título abreviado* (Año).',
  thesis: 'Inédita: Autor, A. A. (Año). *Título* [Tesis de licenciatura/maestría/doctoral inédita]. Universidad. En base de datos: Autor, A. A. (Año). *Título* (N.º de publicación, solo si existe) [Tesis de licenciatura/maestría/doctoral, Universidad]. Base de datos. En repositorio: Autor, A. A. (Año). *Título* [Tesis de licenciatura/maestría/doctoral, Universidad]. Repositorio. URL',
  'newspaper-article': 'Con autor: Autor, A. A.; Autor, A. A., & Autor, B. B.; o lista completa conforme a APA. (Año, día de mes). Título. *Periódico*, p. x para una página o pp. xx–xx para varias páginas en versión impresa. URL para versión en línea. Sin autor acreditado: Título. (Año, día de mes). *Periódico*, p. x para una página o pp. xx–xx para varias páginas en versión impresa. URL para versión en línea. Sin autor, la cita parentética usa (“Título abreviado”, Año) y la narrativa usa “Título abreviado” (Año).',
  'video-webinar': 'Video en línea: Autor o entidad. (Año, día de mes). *Título* [Video]. Plataforma. URL\nSeminario web grabado: Un instructor: Instructor, I. I.; dos: Instructor, I. I., & Instructor, J. J.; de 3 a 20: lista completa de instructores; 21 o más: instructores 1–19, …, Último instructor. (Año). *Título* [Seminario web]. Organización. URL\nCitas del seminario web grabado: (Instructor, Año), (Instructor & Instructor, Año) o (Primer instructor et al., Año) para tres o más; usa solo el año aunque se conozcan mes y día. El video en línea usa la fecha completa publicada. Un webinar no grabado se cita como comunicación personal.',
  podcast: 'Responsables para serie o episodio: Un responsable: Responsable, R. R. (Anfitrión o Productor ejecutivo); dos: Responsable, R. R., & Responsable, S. S. (Anfitriones o Productores ejecutivos); de 3 a 20: lista completa de responsables (rol plural); 21 o más: responsables 1–19, …, Último responsable (rol plural). Citas: (Responsable, Año), (Responsable & Responsable, Año) o (Primer responsable et al., Año) para tres o más; la narrativa usa las mismas formas sin paréntesis. Serie completa: responsables. (Año único; Año inicial–Año final; o Año inicial–presente). *Título del pódcast* [Pódcast de audio o video]. Productora. URL si se conoce. Episodio: responsables. (Año, día de mes). Título del episodio (N.º de episodio, solo si existe) [Episodio de pódcast]. En *Título del pódcast*. Productora. URL si se conoce.',
  'social-media': 'Publicación individual: Autor [@usuario]. (Año, día de mes). *Primeras 20 palabras del contenido* [Tipo de publicación]. Red social. URL\nPerfil, página o historia destacada que cambia: Autor [@usuario]. (s. f.). *Título de la pestaña, página o historia* [Perfil, página o historia destacada]. Red social. Recuperado el día de mes de año, de URL',
  software: 'Mención común de software o aplicación (p. ej., R o Microsoft Word): no lleva cita autor-fecha ni entrada en referencias. Software especializado, directamente citado o recuperable: Autor, autores o entidad responsable. (Año). *Nombre* (Versión, solo si existe) [Software]. Editor, desarrollador o tienda, solo si difiere del autor. URL si corresponde.',
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

function referenceFormattingForCase(id: VerifiedCaseId) {
  const encoding = 'El campo referenceTemplate usa texto plano; aplica la cursiva a los componentes semánticos indicados y no escribas asteriscos en la referencia final.';
  if (id === 'symposium-contribution') return {
    encoding,
    italicize: ['título del simposio contenedor que sigue al coordinador; no el título de la contribución'],
  };
  if (id === 'blog-post') return {
    encoding,
    italicize: ['título de la entrada de blog'],
    doNotItalicize: ['nombre del blog que ocupa el elemento fuente'],
  };
  if (id === 'journal-special-section-issue') return {
    encoding,
    italicize: ['nombre y volumen de la publicación periódica; el número entre paréntesis queda sin cursiva'],
    doNotItalicize: ['título de la sección o edición especial'],
  };
  if (id === 'journal-reprint') return {
    encoding,
    italicize: ['título del libro de la reimpresión consultada', 'nombre y volumen de la publicación periódica original o de la reimpresión cuando corresponda; el número entre paréntesis queda sin cursiva'],
  };
  if (id === 'chapter-reprinted-from-journal') return {
    encoding,
    italicize: ['título del libro de la reimpresión consultada', 'nombre y volumen de la publicación periódica original; el número entre paréntesis queda sin cursiva'],
  };
  if (id in periodicalCases) return {
    encoding,
    italicize: ['nombre de la publicación periódica o base de revisiones', 'volumen de la publicación; el número entre paréntesis queda sin cursiva'],
  };
  if (id in bookCases) return {
    encoding,
    italicize: ['título de la obra independiente, libro, manual, antología o volumen'],
  };
  if (id in chapterEntryCases) return {
    encoding,
    italicize: ['título del libro, obra de consulta o contenedor; no el título del capítulo o entrada'],
  };
  if (id in reportConferenceThesisCases) return {
    encoding,
    italicize: ['título del informe, proyecto, comunicado, contribución de congreso, tesis o disertación que funciona como obra independiente'],
  };
  if (id === 'review-tv-episode-on-website') return {
    encoding,
    italicize: ['título de la reseña que funciona como página web independiente'],
    doNotItalicize: ['nombre del sitio', 'título del episodio citado dentro de la descripción entre corchetes'],
  };
  if (id in reviewUnpublishedCases) return {
    encoding,
    italicize: ['título y volumen de la publicación contenedora', 'título de la obra reseñada o del manuscrito independiente cuando corresponda'],
  };
  if (id in dataSoftwareTestCases) return {
    encoding,
    italicize: ['título del conjunto de datos, software, aplicación, aparato, prueba o manual que funciona como obra independiente'],
  };
  if (id in audiovisualAudioCases) return {
    encoding,
    italicize: ['título de la obra audiovisual o sonora independiente, serie, álbum o pódcast', 'título de la serie, álbum o pódcast contenedor; no el episodio o canción'],
  };
  if (id === 'artwork-museum-or-museum-site' || id === 'clip-art-or-stock-image' || id === 'map' || id === 'photograph' || id === 'slides-or-lecture-notes') return {
    encoding,
    italicize: ['título real de la obra visual, cuando existe', 'descripción entre corchetes que reemplaza un título ausente'],
    doNotItalicize: ['descripción de medio o formato entre corchetes que sigue a un título real', 'nombre del sitio, museo o plataforma'],
  };
  return {
    encoding,
    italicize: ['título o descripción de la obra visual, publicación social o página web independiente; no el nombre del sitio o plataforma'],
  };
}

function getVerifiedCaseWithFormatting(id: VerifiedCaseId) {
  return {
    ...getVerifiedCase(id),
    referenceFormatting: referenceFormattingForCase(id),
  };
}

const allowedSelectorsByTopic: Record<z.infer<typeof topic>, readonly string[]> = {
  'principles-ethics': ['principlesEthicsRuleId'],
  citation: ['sourceType', 'caseId', 'citationRuleId', 'peruLegalCaseId'],
  reference: ['sourceType', 'caseId', 'referenceRuleId', 'peruLegalCaseId'],
  format: ['formatRuleId'],
  reporting: ['reportingRuleId'],
  'writing-style': ['writingStyleRuleId'],
  'bias-free-language': ['biasFreeLanguageRuleId'],
  mechanics: ['mechanicsRuleId'],
  'table-figure': ['tableFigureRuleId'],
  legal: ['legalRuleId', 'peruLegalCaseId'],
  publication: ['publicationRuleId'],
  review: ['reviewSectionId'],
  'course-requirements': [],
};

function validateSelectors(selectedTopic: z.infer<typeof topic>, selectors: Record<string, unknown>) {
  const selected = Object.entries(selectors)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);
  const incompatible = selected.filter(name => !allowedSelectorsByTopic[selectedTopic].includes(name));
  if (incompatible.length > 0) {
    throw new Error(`Selectors incompatible with topic "${selectedTopic}": ${incompatible.join(', ')}`);
  }
  if (selected.length > 1) {
    throw new Error(`Choose only one selector for topic "${selectedTopic}": ${selected.join(', ')}`);
  }
}

function availableSelectorsForTopic(selectedTopic: z.infer<typeof topic>) {
  const verifiedCases = [
    ...Object.keys(periodicalCases),
    ...Object.keys(bookCases),
    ...Object.keys(chapterEntryCases),
    ...Object.keys(reportConferenceThesisCases),
    ...Object.keys(reviewUnpublishedCases),
    ...Object.keys(dataSoftwareTestCases),
    ...Object.keys(audiovisualAudioCases),
    ...Object.keys(visualSocialWebCases),
  ];

  switch (selectedTopic) {
    case 'principles-ethics':
      return { availablePrinciplesEthicsRules: Object.keys(principlesEthicsRules) };
    case 'citation':
      return {
        availableCitationRules: Object.keys(citationRules),
        availableVerifiedCases: verifiedCases,
        availablePeruLegalCases: Object.keys(peruLegalCases),
      };
    case 'reference':
      return {
        availableReferenceRules: Object.keys(referenceRules),
        availableVerifiedCases: verifiedCases,
        availablePeruLegalCases: Object.keys(peruLegalCases),
      };
    case 'format':
      return { availableFormatRules: Object.keys(formatRules) };
    case 'reporting':
      return { availableReportingRules: Object.keys(reportingRules) };
    case 'writing-style':
      return { availableWritingStyleRules: Object.keys(writingStyleRules) };
    case 'bias-free-language':
      return { availableBiasFreeLanguageRules: Object.keys(biasFreeLanguageRules) };
    case 'mechanics':
      return { availableMechanicsRules: Object.keys(mechanicsRules) };
    case 'table-figure':
      return { availableTableFigureRules: Object.keys(tableFigureRules) };
    case 'legal':
      return {
        availableLegalRules: Object.keys(legalRules),
        availablePeruLegalCases: Object.keys(peruLegalCases),
      };
    case 'publication':
      return { availablePublicationRules: Object.keys(publicationRules) };
    case 'review':
    case 'course-requirements':
      return {};
  }
}

function guidanceFor(selectedTopic: z.infer<typeof topic>, selectedSourceType?: SourceType, selectedCaseId?: VerifiedCaseId, selectedCitationRuleId?: CitationRuleId, selectedReferenceRuleId?: ReferenceRuleId, selectedFormatRuleId?: FormatRuleId, selectedReportingRuleId?: ReportingRuleId, selectedWritingStyleRuleId?: WritingStyleRuleId, selectedBiasFreeLanguageRuleId?: BiasFreeLanguageRuleId, selectedMechanicsRuleId?: MechanicsRuleId, selectedTableFigureRuleId?: TableFigureRuleId, selectedLegalRuleId?: LegalRuleId, selectedPeruLegalCaseId?: PeruLegalCaseId, selectedPublicationRuleId?: PublicationRuleId, selectedPrinciplesEthicsRuleId?: PrinciplesEthicsRuleId) {
  const base = {
    authority: 'Prioriza la rúbrica o plantilla del docente; luego la guía vigente de Biblioteca UPC y APA 7.',
    sourceGuide: 'https://biblioteca.upc.edu.pe/citas-referencias-APA7',
    safety: 'No inventes autor, fecha, página, DOI, URL ni datos bibliográficos. Usa [marcadores] para datos no confirmados solo en plantillas provisionales y nunca los dejes en una referencia final. En la referencia final, aplica la omisión o sustitución indicada por el caso; las descripciones APA requeridas entre corchetes no son marcadores provisionales.',
    templateNotation: 'En las plantillas de referencia, el texto entre asteriscos debe mostrarse en cursiva; los asteriscos son notación Markdown y no forman parte de la referencia final.',
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
      if (selectedPeruLegalCaseId) return { ...base, legalCase: getPeruLegalCase(selectedPeruLegalCaseId) };
      if (selectedCitationRuleId) return { ...base, citationRule: getCitationRule(selectedCitationRuleId) };
      if (selectedCaseId) return { ...base, case: getVerifiedCaseWithFormatting(selectedCaseId) };
      if (selectedSourceType === 'personal-communication') {
        return { ...base, citationRule: getCitationRule('personal-communication') };
      }
      if (selectedSourceType === 'software') {
        return {
          ...base,
          sourceTypeNote: 'Primero clasifica el uso: una mención general de software común no lleva cita autor-fecha; software especializado, directamente citado o del que se atribuye contenido requiere el caseId correspondiente.',
          rules: [
            'Para una mención general de software común, menciona nombre y versión si se conocen; no agregues cita autor-fecha ni referencia.',
            'Para software especializado, directamente citado o parafraseado, usa el caso especializado y verifica autor o entidad, fecha, título, versión, fuente y URL si corresponde.',
          ],
        };
      }
      return {
        ...base,
        sourceTypeNote: selectedSourceType
          ? 'El tipo de soporte no cambia por sí solo la cita autor-fecha. Usa caseId para un caso bibliográfico verificado o citationRuleId para una regla de citación específica.'
          : undefined,
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
      if (selectedPeruLegalCaseId) return { ...base, legalCase: getPeruLegalCase(selectedPeruLegalCaseId) };
      if (selectedReferenceRuleId) return { ...base, referenceRule: getReferenceRule(selectedReferenceRuleId) };
      if (selectedCaseId) return { ...base, case: getVerifiedCaseWithFormatting(selectedCaseId) };
      return {
        ...base,
        requiredMetadata: selectedSourceType === 'personal-communication'
          ? ['Iniciales y apellido de la persona', 'fecha exacta', 'medio de comunicación']
          : selectedSourceType === 'software'
            ? ['clasificación: mención general o software especializado/directamente citado', 'solo para software especializado o directamente citado: autor o entidad, fecha, título, versión si existe, fuente y URL si corresponde']
          : selectedSourceType === 'report'
            ? ['autor o entidad si se acreditan', 'año', 'título', 'número de informe si existe', 'editorial o entidad si difiere del autor', 'DOI o URL si corresponde']
          : ['book', 'book-chapter', 'journal-article', 'webpage', 'newspaper-article'].includes(selectedSourceType ?? '')
            ? ['tipo de fuente', 'autor o entidad si se acredita', 'fecha', 'título', 'fuente contenedora/editorial', 'DOI o URL si corresponde']
            : ['tipo de fuente', 'autor o entidad', 'fecha', 'título', 'fuente contenedora/editorial', 'DOI o URL si corresponde'],
        template: selectedSourceType === 'personal-communication'
          ? 'No lleva referencia. Cita en texto: (A. Apellido, comunicación personal, [fecha exacta]).'
          : referenceTemplates[selectedSourceType ?? 'other'] ?? 'Clasifica primero el tipo real de obra. Patrón general: Autor. (Fecha). Título. Fuente. Añade DOI o URL solo cuando corresponda; omite el localizador si la categoría aplicable no lo requiere o no existe.',
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
          'Comprueba correspondencia entre citas y referencias, respetando las excepciones de comunicaciones personales, participantes propios y citas secundarias.',
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
export function registerAcademicTools(
  server: McpServer,
  options: { authorize: () => boolean | Promise<boolean> },
) {
  server.registerTool('campus_apa7_guidance', {
    description: 'Get Spanish APA 7 guidance and templates. For reviewing or correcting a UPC paper, use topic=review: it loads the apa7-review-campus skill with official Biblioteca UPC criteria, source URLs and verification dates for the client agent to apply to the supplied paper. Does not require Blackboard login and never invents metadata.',
    inputSchema: {
      topic: topic.describe('The APA 7 help needed; review loads a source-grounded review skill for the client agent, not an automatic verdict on a document'),
      reviewSectionId: z.string().min(1).max(80).optional().describe('With topic=review only: select a UPC section id from reviewSkill.catalog to retrieve all its schemas, considerations, exceptions and conditional safeguards, including notes without examples, plus detailed source evidence'),
      sourceType: sourceType.optional().describe('Source type for a reference template; citation requests specialize personal communications and otherwise use caseId or citationRuleId'),
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
  }, async ({ topic, reviewSectionId, sourceType, caseId, citationRuleId, referenceRuleId, formatRuleId, reportingRuleId, writingStyleRuleId, biasFreeLanguageRuleId, mechanicsRuleId, tableFigureRuleId, legalRuleId, peruLegalCaseId, publicationRuleId, principlesEthicsRuleId }) => {
    if (!options?.authorize) {
      throw new Error('APA 7 guidance unavailable: this host has not configured authorization.');
    }
    if (!(await options.authorize())) {
      throw new Error('Not authorized for APA 7 guidance: this account does not have the required entitlement. Signing in again does not grant access; verify the Campus plan or contact support.');
    }
    const selectors = { reviewSectionId, sourceType, caseId, citationRuleId, referenceRuleId, formatRuleId, reportingRuleId, writingStyleRuleId, biasFreeLanguageRuleId, mechanicsRuleId, tableFigureRuleId, legalRuleId, peruLegalCaseId, publicationRuleId, principlesEthicsRuleId };
    validateSelectors(topic, selectors);
    const hasSelectedRule = Object.values(selectors).some(value => value !== undefined);
    const reviewSkill = topic === 'review' ? await loadApa7ReviewSkill(reviewSectionId) : undefined;
    return {
      content: [{ type: 'text', text: JSON.stringify({
      ...guidanceFor(topic, sourceType, caseId, citationRuleId, referenceRuleId, formatRuleId, reportingRuleId, writingStyleRuleId, biasFreeLanguageRuleId, mechanicsRuleId, tableFigureRuleId, legalRuleId, peruLegalCaseId, publicationRuleId, principlesEthicsRuleId),
      ...(reviewSkill ? { sourceGuide: reviewSkill.rulebook.entryUrl, reviewSkill } : {}),
      ...(hasSelectedRule ? {} : availableSelectorsForTopic(topic)),
      }) }],
    };
  });
}
