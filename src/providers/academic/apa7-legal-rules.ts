import { z } from 'zod';

export const legalRuleId = z.enum([
  'legal-versus-apa',
  'legal-general-format',
  'legal-in-text-citation',
  'court-cases',
  'statutes-laws-decrees',
  'legislative-materials',
  'administrative-executive-materials',
  'patents',
  'constitutions-charters',
  'treaties-conventions',
  'mexico-examples',
  'colombia-examples',
]);

export type LegalRuleId = z.infer<typeof legalRuleId>;

export interface Apa7VerifiedLegalRule {
  id: LegalRuleId;
  label: string;
  manualSection: `11.${number}`;
  manualPrintedPages: string;
  status: 'verified';
  jurisdiction: 'general' | 'United States' | 'Mexico' | 'Colombia';
  rules: string[];
  citationTreatment: string[];
  referenceTreatment: string[];
  peruApplicability: string[];
  refuseWhen: string[];
}

const verified = (rule: Omit<Apa7VerifiedLegalRule, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): Apa7VerifiedLegalRule => ({
  ...rule,
  status: 'verified',
  refuseWhen: rule.refuseWhen ?? [
    'No se identificó la jurisdicción ni el tipo de material jurídico.',
    'No se verificó número, órgano, fecha, versión o publicación en una fuente oficial.',
    'Se intenta trasladar por analogía una abreviatura o un sistema de otro país.',
  ],
});

export const legalRules: Record<LegalRuleId, Apa7VerifiedLegalRule> = {
  'legal-versus-apa': verified({
    id: 'legal-versus-apa', label: 'Referencias APA frente a referencias jurídicas', manualSection: '11.1', manualPrintedPages: '361-362', jurisdiction: 'general',
    rules: ['El material jurídico usa normalmente el sistema estándar de citación jurídica de su jurisdicción, incluso en trabajos APA.', 'Una referencia jurídica suele necesitar pocos cambios para entrar en la lista APA.', 'Conserva todas las citaciones paralelas ya publicadas para una decisión.', 'Verifica que la autoridad siga vigente y no haya sido anulada, derogada o modificada.'],
    citationTreatment: ['La cita en el texto se deriva del primer elemento de la referencia jurídica, no de un autor personal supuesto.'],
    referenceTreatment: ['La referencia debe permitir localizar la versión y situación actual de la autoridad jurídica.'],
    peruApplicability: ['Para Perú usa repositorios oficiales nacionales; no conviertas ejemplos estadounidenses, mexicanos o colombianos por analogía.'],
  }),
  'legal-general-format': verified({
    id: 'legal-general-format', label: 'Formato general jurídico', manualSection: '11.2', manualPrintedPages: '362-363', jurisdiction: 'general',
    rules: ['Una referencia jurídica suele ordenar título o nombre, fuente jurídica y fecha.', 'La palabra “citación” dentro del capítulo 11 puede significar el identificador jurídico de la fuente, no necesariamente la cita en el texto.', 'Cita la compilación oficial donde se clasifica la norma; si aún no está codificada, usa el identificador asignado durante su promulgación.', 'Añade historia procesal o legislativa solo cuando sea relevante y con formato jurídico confirmado.', 'Las abreviaturas jurídicas son propias de cada sistema.'],
    citationTreatment: ['En contraste con APA ordinario, una cita jurídica en el texto suele usar título y año.'],
    referenceTreatment: ['No fuerces el orden autor-fecha-título-fuente de una referencia APA ordinaria.'],
    peruApplicability: ['Usa la denominación oficial peruana del tipo de norma, el número completo, la fecha relevante y la fuente oficial.'],
  }),
  'legal-in-text-citation': verified({
    id: 'legal-in-text-citation', label: 'Citación jurídica en el texto', manualSection: '11.3', manualPrintedPages: '363', jurisdiction: 'general',
    rules: ['La mayoría de las referencias jurídicas comienzan por el título; por eso la cita usa normalmente título y año.', 'Acorta un título largo solo si conserva información suficiente para encontrar inequívocamente la referencia.', 'Para una parte específica añade artículo, sección, fundamento, párrafo u otro localizador jurídico real.'],
    citationTreatment: ['Parentética general: (Título o identificador jurídico, Año).', 'Narrativa general: Título o identificador jurídico (Año).'],
    referenceTreatment: ['El texto abreviado debe corresponder inequívocamente al primer elemento de la entrada completa.'],
    peruApplicability: ['En Perú conserva tipo y número cuando sean el identificador más estable, por ejemplo “Ley N.º 27444” o “Expediente N.º …”.'],
  }),
  'court-cases': verified({
    id: 'court-cases', label: 'Casos o fallos de tribunales', manualSection: '11.4', manualPrintedPages: '363-367', jurisdiction: 'United States',
    rules: ['Incluye nombre del caso, citación al relator o registro, tribunal que decidió, fecha y URL opcional.', 'Si hay número de página del fallo, usa solo la primera página, no el rango completo.', 'El nombre del caso va en tipografía estándar en la referencia y en cursiva en la cita en el texto.', 'Una apelación puede exigir historia procesal y años separados por una diagonal.', 'Las citaciones paralelas se conservan juntas.'],
    citationTreatment: ['Parentética: (Nombre vs. Nombre, Año).', 'Narrativa: Nombre vs. Nombre (Año).'],
    referenceTreatment: ['Plantilla estadounidense: Nombre vs. Nombre, volumen Relator página (Tribunal año). URL.'],
    peruApplicability: ['Sustituye el relator estadounidense por el identificador oficial peruano: expediente, casación o número de sentencia, órgano y sala, fecha y URL oficial.'],
  }),
  'statutes-laws-decrees': verified({
    id: 'statutes-laws-decrees', label: 'Estatutos, leyes y decretos', manualSection: '11.5', manualPrintedPages: '367-369', jurisdiction: 'United States',
    rules: ['Incluye nombre, título/fuente oficial, sección, año de la versión publicada y URL opcional.', 'El año debe ser el de la versión de la norma realmente utilizada, que puede diferir del año contenido en su nombre.', 'Una norma codificada usa su compilación; una aún no codificada usa su número público o identificador de promulgación.', 'Cuando una norma fue revisada, la cita puede incluir años separados por una diagonal si el sistema aplicable así lo requiere.'],
    citationTreatment: ['Parentética: (Nombre oficial o popular de la norma, Año de la versión).', 'Narrativa: Nombre oficial o popular de la norma (Año de la versión).'],
    referenceTreatment: ['No atribuyas una ley a una persona ni inventes un autor gubernamental.'],
    peruApplicability: ['Verifica tipo, número, título, fecha de publicación y versión en Congreso, El Peruano o SPIJ; identifica por separado una modificación o texto único ordenado.'],
  }),
  'legislative-materials': verified({
    id: 'legislative-materials', label: 'Materiales legislativos', manualSection: '11.6', manualPrintedPages: '369-371', jurisdiction: 'United States',
    rules: ['Incluyen testimonios, audiencias, proyectos, resoluciones, reportes y documentos relacionados.', 'Una iniciativa promulgada se cita como ley; una no promulgada conserva su condición de proyecto o resolución.', 'Incluye cámara u órgano, número, periodo legislativo, año y URL oficial cuando exista.'],
    citationTreatment: ['Usa como primer elemento un título o identificador capaz de distinguir el material y añade el año.'],
    referenceTreatment: ['No presentes un proyecto archivado o pendiente como ley vigente.'],
    peruApplicability: ['Para proyectos peruanos registra número completo, periodo parlamentario, título, estado, fecha y expediente oficial del Congreso.'],
  }),
  'administrative-executive-materials': verified({
    id: 'administrative-executive-materials', label: 'Materiales administrativos y ejecutivos', manualSection: '11.7', manualPrintedPages: '371-373', jurisdiction: 'United States',
    rules: ['Distingue reglamento codificado, propuesta aún no codificada y orden ejecutiva.', 'Un reglamento codificado identifica título, compilación, sección y año.', 'Una propuesta conserva la fecha de propuesta y el destino previsto de codificación.', 'Usa la publicación oficial correspondiente y una URL recuperable.'],
    citationTreatment: ['La cita usa título o número identificador y año.'],
    referenceTreatment: ['No elimines el estado de propuesta, proyecto o versión no codificada.'],
    peruApplicability: ['En Perú distingue decreto supremo, resolución suprema, ministerial, administrativa, directiva u otra clase exacta; conserva entidad emisora, número, fecha, asunto y publicación oficial.'],
  }),
  patents: verified({
    id: 'patents', label: 'Patentes', manualSection: '11.8', manualPrintedPages: '373', jurisdiction: 'general',
    rules: ['Una patente sigue el orden APA autor/inventor, año, título, número y fuente.', 'Usa el año de expedición o concesión, no el de solicitud.', 'El número de patente es un identificador único.', 'La URL es opcional pero útil cuando es oficial y recuperable.'],
    citationTreatment: ['La cita autor-fecha usa inventor o inventores y año de expedición.'],
    referenceTreatment: ['Plantilla: Inventor, A. A. (Año de expedición). Título (Patente de país N.º ...). Oficina de patentes. URL.'],
    peruApplicability: ['Verifica solicitante/inventor, título, número, estado y fechas en la Gaceta Electrónica de Propiedad Industrial de Indecopi.'],
  }),
  'constitutions-charters': verified({
    id: 'constitutions-charters', label: 'Constituciones y cartas', manualSection: '11.9', manualPrintedPages: '373-375', jurisdiction: 'United States',
    rules: ['El manual permite una mención general de una constitución completa sin referencia para su contexto estadounidense.', 'Una cita de artículo o enmienda sí lleva entrada y cita en el texto.', 'Identifica artículo, sección, enmienda o rango de enmiendas con la numeración jurídica aplicable.', 'Si una disposición fue derogada, indícalo y añade el año correspondiente.'],
    citationTreatment: ['La narrativa puede nombrar directamente artículo y constitución; la parentética usa abreviatura jurídica y localizador.'],
    referenceTreatment: ['No mezcles una edición comercial con la versión constitucional oficial que realmente consultaste.'],
    peruApplicability: ['Para Perú usa la edición oficial vigente del Congreso y el artículo específico; no presupongas que la excepción estadounidense de “sin referencia” sea obligatoria para toda institución.'],
  }),
  'treaties-conventions': verified({
    id: 'treaties-conventions', label: 'Tratados y convenciones internacionales', manualSection: '11.10', manualPrintedPages: '375-376', jurisdiction: 'general',
    rules: ['Incluye nombre del tratado o convención, fecha de firma o aprobación y URL oficial si está disponible.', 'En el texto usa nombre y año.', 'Para la Carta de las Naciones Unidas, el ejemplo del manual identifica artículo y párrafo; omite el párrafo al citar el artículo completo.', 'Distingue fecha de firma, aprobación, ratificación y entrada en vigor.'],
    citationTreatment: ['Parentética: (Nombre del tratado o convención, Año).', 'Narrativa: Nombre del tratado o convención (Año).'],
    referenceTreatment: ['Plantilla general: Nombre del tratado o convención, día de mes de año. URL oficial.'],
    peruApplicability: ['Verifica el instrumento en el Archivo Nacional de Tratados de Cancillería y registra por separado la norma peruana de aprobación o ratificación cuando sea relevante.'],
  }),
  'mexico-examples': verified({
    id: 'mexico-examples', label: 'Ejemplos jurídicos de México', manualSection: '11.11', manualPrintedPages: '376-377', jurisdiction: 'Mexico',
    rules: ['Los ejemplos cubren casos, abreviaturas, códigos federales y leyes mexicanas.', 'Conservan rubro, tribunal, época, datos del semanario, número de caso, primera página y país, o título oficial del código, abreviatura, enmiendas, disposición y Diario Oficial.'],
    citationTreatment: ['Aplica únicamente cuando la obra pertenece al sistema jurídico mexicano.'],
    referenceTreatment: ['Los modelos proceden de guías mexicanas basadas en Bluebook; no son plantillas peruanas.'],
    peruApplicability: ['No aplicable por analogía a Perú; sirve solo para reconocer que cada país requiere su propio perfil.'],
  }),
  'colombia-examples': verified({
    id: 'colombia-examples', label: 'Ejemplos jurídicos de Colombia', manualSection: '11.12', manualPrintedPages: '377', jurisdiction: 'Colombia',
    rules: ['Los ejemplos cubren Constitución, leyes que no son códigos, códigos y jurisprudencia.', 'La jurisprudencia identifica tribunal, sala o sección, número de sentencia o proceso, magistrado/consejero/juez ponente y fecha.'],
    citationTreatment: ['Aplica únicamente a materiales del sistema jurídico colombiano.'],
    referenceTreatment: ['Los formatos proceden de una guía colombiana y no constituyen un perfil jurídico latinoamericano universal.'],
    peruApplicability: ['No reutilices abreviaturas, Diario Oficial ni roles judiciales colombianos en una referencia peruana.'],
  }),
};

export function getLegalRule(id: LegalRuleId): Apa7VerifiedLegalRule {
  return legalRules[id];
}
