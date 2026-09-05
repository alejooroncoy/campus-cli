import { z } from 'zod';

export const peruLegalCaseId = z.enum([
  'peru-constitution-general',
  'peru-constitution-article',
  'peru-law-or-legislative-decree',
  'peru-regulation-or-executive-norm',
  'peru-legislative-bill',
  'peru-constitutional-court-decision',
  'peru-judicial-decision',
  'peru-administrative-resolution',
  'peru-patent',
  'peru-treaty',
]);

export type PeruLegalCaseId = z.infer<typeof peruLegalCaseId>;

export interface PeruLegalCase {
  id: PeruLegalCaseId;
  label: string;
  status: 'verified-source-adaptation';
  authorityNote: string;
  requiredMetadata: string[];
  optionalMetadata: string[];
  referenceTemplate: string;
  parentheticalCitation: string;
  narrativeCitation: string;
  directQuoteLocator: string;
  rules: string[];
  officialVerification: Array<{ label: string; url: string }>;
  refuseWhen: string[];
}

const commonRefusals = [
  'No se verificó el documento en una fuente oficial peruana o en el repositorio oficial del organismo internacional.',
  'Falta un identificador indispensable y se pretende inventarlo.',
  'No se sabe si la versión consultada está vigente, modificada, derogada, anulada o reemplazada.',
];

const legalCase = (item: Omit<PeruLegalCase, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): PeruLegalCase => ({
  ...item,
  status: 'verified-source-adaptation',
  refuseWhen: [...commonRefusals, ...(item.refuseWhen ?? [])],
});

export const peruLegalCases: Record<PeruLegalCaseId, PeruLegalCase> = {
  'peru-constitution-general': legalCase({
    id: 'peru-constitution-general', label: 'Mención general de la Constitución peruana',
    authorityNote: 'El manual, sección 11.9, permite mencionar una constitución completa sin cita en su contexto estadounidense. Para Perú se conserva como opción solo si la rúbrica acepta el tratamiento jurídico del capítulo 11.',
    requiredMetadata: ['nombre oficial', 'año de promulgación de la Constitución mencionada'],
    optionalMetadata: ['edición oficial consultada', 'URL oficial'],
    referenceTemplate: 'No lleva entrada si es solo una mención general y la institución adopta la excepción de la sección 11.9. Si exige documentar la edición: Constitución Política del Perú. (Año de la edición). Congreso de la República. URL',
    parentheticalCitation: 'Normalmente no se usa para una mención general; escribe el nombre en la oración.',
    narrativeCitation: 'La Constitución Política del Perú de 1993 establece…',
    directQuoteLocator: 'Para texto literal deja de ser mención general: identifica el artículo y usa el caso peru-constitution-article.',
    rules: ['No conviertas automáticamente al Congreso en autor de la Constitución.', 'Aclara si 1993 identifica el texto constitucional o si otro año identifica la edición consultada.'],
    officialVerification: [{ label: 'Biblioteca del Congreso: Constituciones del Perú', url: 'https://www3.congreso.gob.pe/biblioteca/constituciones-peru/' }],
  }),
  'peru-constitution-article': legalCase({
    id: 'peru-constitution-article', label: 'Artículo de la Constitución peruana',
    authorityNote: 'Adaptación peruana conservadora de las reglas generales de las secciones 11.3 y 11.9, verificada contra la edición oficial del Congreso.',
    requiredMetadata: ['nombre oficial', 'artículo o disposición', 'año del texto constitucional', 'versión oficial consultada'],
    optionalMetadata: ['inciso o numeral', 'año de la edición', 'URL oficial'],
    referenceTemplate: 'Constitución Política del Perú [Const.], art. X (1993). Congreso de la República. URL',
    parentheticalCitation: '(Constitución Política del Perú, 1993, art. X)',
    narrativeCitation: 'El artículo X de la Constitución Política del Perú (1993)…',
    directQuoteLocator: 'Usa art. X y, si corresponde, inciso o numeral exacto; no inventes página para una versión web.',
    rules: ['Si el artículo fue modificado, verifica y documenta la versión aplicable.', 'No cites una edición antigua como si fuera la vigente.'],
    officialVerification: [{ label: 'Constitución vigente y Reglamento del Congreso', url: 'https://www.congreso.gob.pe/constitucion-del-peru-y-reglamento/' }],
  }),
  'peru-law-or-legislative-decree': legalCase({
    id: 'peru-law-or-legislative-decree', label: 'Ley o norma con rango de ley peruana',
    authorityNote: 'Perfil Campus basado en las secciones 11.3 y 11.5 y en los metadatos del Archivo Digital de la Legislación del Perú.',
    requiredMetadata: ['tipo de norma', 'número completo', 'título oficial', 'fecha de publicación', 'versión consultada'],
    optionalMetadata: ['artículo o disposición', 'fecha de promulgación', 'Diario Oficial El Peruano', 'URL oficial', 'texto único ordenado o modificatorias'],
    referenceTemplate: 'Tipo de norma N.º XXXX, Título oficial. (día de mes de año de publicación). Diario Oficial El Peruano. URL oficial',
    parentheticalCitation: '(Tipo de norma N.º XXXX, Año, art. X)',
    narrativeCitation: 'El artículo X de la Tipo de norma N.º XXXX (Año)…',
    directQuoteLocator: 'Indica artículo, numeral, inciso o disposición exacta; usa página solo si citas una paginación oficial estable.',
    rules: ['Distingue ley, decreto legislativo, decreto de urgencia, decreto ley y resolución legislativa.', 'Si usaste un texto único ordenado, identifica además la norma que lo aprueba.', 'El año es el de la versión/publicación utilizada, no uno inferido del número.'],
    officialVerification: [
      { label: 'Archivo Digital de la Legislación del Perú', url: 'https://leyes.congreso.gob.pe/LeyNumePP.aspx?xNorma=3' },
      { label: 'Diario Oficial El Peruano: Normas Legales', url: 'https://diariooficial.elperuano.pe/Normas' },
    ],
  }),
  'peru-regulation-or-executive-norm': legalCase({
    id: 'peru-regulation-or-executive-norm', label: 'Reglamento o norma del Poder Ejecutivo',
    authorityNote: 'Adaptación de la sección 11.7 a las denominaciones oficiales peruanas y a la publicación obligatoria en El Peruano.',
    requiredMetadata: ['tipo exacto', 'número completo', 'entidad emisora', 'título o asunto', 'fecha de publicación'],
    optionalMetadata: ['norma reglamentada o aprobada', 'artículo', 'anexo', 'URL oficial'],
    referenceTemplate: 'Tipo N.º XXXX-AAAA-SIGLA, Título o asunto. (día de mes de año). Entidad emisora o Diario Oficial El Peruano. URL oficial',
    parentheticalCitation: '(Tipo N.º XXXX-AAAA-SIGLA, Año, art. X)',
    narrativeCitation: 'El Tipo N.º XXXX-AAAA-SIGLA (Año)…',
    directQuoteLocator: 'Artículo, numeral, inciso, disposición o anexo exacto.',
    rules: ['No sustituyas el tipo exacto por “decreto” o “resolución” genéricos.', 'Distingue la norma aprobatoria del reglamento, directiva o lineamiento que aprueba.'],
    officialVerification: [{ label: 'El Peruano: normas de publicación oficial', url: 'https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=100012' }],
  }),
  'peru-legislative-bill': legalCase({
    id: 'peru-legislative-bill', label: 'Proyecto de ley peruano',
    authorityNote: 'Adaptación de la sección 11.6; conserva expresamente el estado no promulgado.',
    requiredMetadata: ['número completo del proyecto', 'periodo parlamentario', 'título', 'fecha de presentación', 'estado verificado'],
    optionalMetadata: ['autoría parlamentaria o iniciativa', 'comisiones', 'expediente', 'URL oficial'],
    referenceTemplate: 'Proyecto de Ley N.º XXXX/AAAA-CR, Título. (día de mes de año de presentación). Congreso de la República. URL oficial',
    parentheticalCitation: '(Proyecto de Ley N.º XXXX/AAAA-CR, Año)',
    narrativeCitation: 'El Proyecto de Ley N.º XXXX/AAAA-CR (Año)…',
    directQuoteLocator: 'Artículo propuesto, página o sección verificable del expediente.',
    rules: ['No llames ley a un proyecto.', 'Comprueba si fue retirado, archivado, acumulado, aprobado o promulgado; si se promulgó, cita la ley resultante cuando esa sea la autoridad discutida.'],
    officialVerification: [{ label: 'Congreso: expedientes y proyectos de ley', url: 'https://wb2server.congreso.gob.pe/spley-portal/#/expediente/search' }],
  }),
  'peru-constitutional-court-decision': legalCase({
    id: 'peru-constitutional-court-decision', label: 'Sentencia o resolución del Tribunal Constitucional',
    authorityNote: 'Adaptación peruana de las secciones 11.3 y 11.4; el TC publica expediente, órgano, fecha y texto oficial.',
    requiredMetadata: ['tipo de pronunciamiento', 'número completo de expediente', 'Tribunal Constitucional', 'sala o Pleno cuando aparezca', 'fecha de decisión'],
    optionalMetadata: ['partes', 'fundamento', 'fecha de publicación', 'URL oficial'],
    referenceTemplate: 'Sentencia recaída en el Expediente N.º XXXXX-AAAA-TIPO/TC (Tribunal Constitucional del Perú, Sala o Pleno, día de mes de año). URL oficial',
    parentheticalCitation: '(Sentencia del Expediente N.º XXXXX-AAAA-TIPO/TC, Año, fundamento X)',
    narrativeCitation: 'En la Sentencia del Expediente N.º XXXXX-AAAA-TIPO/TC (Año, fundamento X), el Tribunal Constitucional…',
    directQuoteLocator: 'Fundamento X o párrafo numerado real; no inventes una página si la versión HTML no la tiene.',
    rules: ['Conserva las siglas oficiales del tipo de proceso.', 'Distingue sentencia, auto y resolución.', 'Verifica si existe precedente vinculante o si solo se cita un fundamento del caso.'],
    officialVerification: [{ label: 'Tribunal Constitucional: Jurisprudencia', url: 'https://www.tc.gob.pe/jurisprudencia/' }],
  }),
  'peru-judicial-decision': legalCase({
    id: 'peru-judicial-decision', label: 'Sentencia, casación o resolución del Poder Judicial',
    authorityNote: 'Perfil conservador basado en 11.4 y en los identificadores de documentos oficiales del Poder Judicial.',
    requiredMetadata: ['tipo de decisión', 'número de expediente o casación', 'distrito judicial cuando forma parte del identificador', 'órgano y sala', 'fecha'],
    optionalMetadata: ['partes', 'ponente', 'fundamento', 'historia procesal', 'URL oficial'],
    referenceTemplate: 'Tipo de decisión N.º XXXX-AAAA/LOCALIDAD (Corte/Sala del Poder Judicial, día de mes de año). URL oficial',
    parentheticalCitation: '(Tipo de decisión N.º XXXX-AAAA/LOCALIDAD, Año, fundamento X)',
    narrativeCitation: 'La Tipo de decisión N.º XXXX-AAAA/LOCALIDAD (Año, fundamento X)…',
    directQuoteLocator: 'Fundamento, considerando, párrafo o página estable de la versión oficial.',
    rules: ['No confundas número de expediente con número de resolución.', 'Incluye historia procesal solo si está verificada y es relevante.', 'No presentes una decisión de instancia como precedente vinculante sin evidencia oficial.'],
    officialVerification: [{ label: 'Poder Judicial del Perú', url: 'https://www.pj.gob.pe/' }],
  }),
  'peru-administrative-resolution': legalCase({
    id: 'peru-administrative-resolution', label: 'Resolución o precedente administrativo peruano',
    authorityNote: 'Adaptación de 11.7. El reglamento de publicaciones oficiales exige identificar órgano, partes, resolución, expediente y fecha para precedentes administrativos publicados por extracto.',
    requiredMetadata: ['tipo y número completo de resolución', 'entidad y órgano emisor', 'fecha de emisión', 'asunto o título'],
    optionalMetadata: ['expediente', 'partes', 'precedente o regla vinculante', 'fecha de publicación', 'URL oficial'],
    referenceTemplate: 'Tipo de resolución N.º XXXX-AAAA-ENTIDAD/ÓRGANO, Título o asunto (Entidad, día de mes de año). URL oficial',
    parentheticalCitation: '(Tipo de resolución N.º XXXX-AAAA-ENTIDAD/ÓRGANO, Año, fundamento X)',
    narrativeCitation: 'La Tipo de resolución N.º XXXX-AAAA-ENTIDAD/ÓRGANO (Año)…',
    directQuoteLocator: 'Artículo, fundamento, numeral o precedente exacto.',
    rules: ['Distingue una resolución particular de una norma general o precedente.', 'No atribuyas carácter vinculante sin declaración y publicación oficial.'],
    officialVerification: [
      { label: 'El Peruano: reglas de publicación oficial', url: 'https://diariooficial.elperuano.pe/Normas/obtenerDocumento?idNorma=100012' },
      { label: 'Gob.pe: normas y documentos legales por entidad', url: 'https://www.gob.pe/busquedas?contenido[]=normas' },
    ],
  }),
  'peru-patent': legalCase({
    id: 'peru-patent', label: 'Patente peruana',
    authorityNote: 'La sección 11.8 usa formato APA ordinario; Indecopi permite verificar solicitudes y publicaciones de patentes.',
    requiredMetadata: ['inventor o inventores', 'año de concesión', 'título', 'tipo y número de patente', 'oficina'],
    optionalMetadata: ['solicitante o titular', 'fecha de publicación', 'URL oficial'],
    referenceTemplate: 'Inventor, A. A. (Año de concesión). Título de la patente (Patente peruana N.º XXXXX). Indecopi. URL oficial',
    parentheticalCitation: '(Inventor, Año)',
    narrativeCitation: 'Inventor (Año)',
    directQuoteLocator: 'Reivindicación, párrafo o página estable del documento de patente.',
    rules: ['Usa año de concesión, no de solicitud.', 'No confundas número de expediente, solicitud, publicación y patente concedida.', 'Con tres o más inventores, la cita usa primer inventor et al.; la referencia conserva la regla de autores APA.'],
    officialVerification: [{ label: 'Indecopi: Gaceta Electrónica de Propiedad Industrial', url: 'https://www.gob.pe/15748-buscar-publicaciones-en-la-gaceta-electronica-de-propiedad-industrial' }],
  }),
  'peru-treaty': legalCase({
    id: 'peru-treaty', label: 'Tratado o convención aplicable al Perú',
    authorityNote: 'Perfil basado en 11.10 y en el Archivo Nacional de Tratados de Cancillería.',
    requiredMetadata: ['nombre oficial', 'partes', 'fecha de firma o aprobación usada en la referencia', 'instrumento oficial'],
    optionalMetadata: ['fecha de entrada en vigor', 'código del Archivo Nacional de Tratados', 'norma peruana de aprobación o ratificación', 'artículo o párrafo', 'URL oficial'],
    referenceTemplate: 'Nombre oficial del tratado o convención, día de mes de año. Archivo Nacional de Tratados, código si aparece. URL oficial',
    parentheticalCitation: '(Nombre abreviado inequívoco del tratado, Año, art. X)',
    narrativeCitation: 'El Nombre oficial o abreviado del tratado (Año, art. X)…',
    directQuoteLocator: 'Artículo y párrafo exactos; omite párrafo solo cuando se cita el artículo completo.',
    rules: ['No confundas firma, aprobación, ratificación y entrada en vigor.', 'Si el argumento depende de incorporación al derecho peruano, verifica y cita también la resolución legislativa o decreto supremo correspondiente.'],
    officialVerification: [{ label: 'Cancillería: Archivo Nacional de Tratados', url: 'https://apps.rree.gob.pe/portal/webtratados.nsf' }],
  }),
};

export function getPeruLegalCase(id: PeruLegalCaseId): PeruLegalCase {
  return peruLegalCases[id];
}
