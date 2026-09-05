import { z } from 'zod';

export const periodicalCaseId = z.enum([
  'journal-doi',
  'journal-no-doi-public-url',
  'journal-no-doi-database-or-print',
  'journal-21-plus-authors',
  'journal-individual-group-authors',
  'journal-elocator',
  'journal-advance-online',
  'journal-in-press',
  'journal-other-language',
  'journal-translated-republication',
  'journal-reprint',
  'journal-special-section-issue',
  'journal-cochrane',
  'journal-uptodate',
  'magazine-article',
  'newspaper-article',
  'blog-post',
  'periodical-comment',
  'periodical-editorial',
]);

export type PeriodicalCaseId = z.infer<typeof periodicalCaseId>;

export interface Apa7VerifiedCase {
  id: PeriodicalCaseId;
  label: string;
  manualExample: number;
  manualSection: '10.1';
  manualPrintedPages: string;
  status: 'verified';
  requiredMetadata: string[];
  referenceTemplate: string;
  parentheticalCitation: string;
  narrativeCitation: string;
  rules: string[];
  refuseWhen: string[];
}

const base = {
  manualSection: '10.1' as const,
  status: 'verified' as const,
  parentheticalCitation: '(Autor, Año)',
  narrativeCitation: 'Autor (Año)',
  refuseWhen: [
    'No se verificó la identidad del autor o entidad.',
    'La fecha, el título o la publicación fueron completados por conjetura.',
    'Se presenta un DOI, URL, volumen, número, páginas o eLocator no encontrado en la fuente.',
  ],
};

export const periodicalCases: Record<PeriodicalCaseId, Apa7VerifiedCase> = {
  'journal-doi': {
    ...base, id: 'journal-doi', label: 'Artículo de revista científica con DOI', manualExample: 1, manualPrintedPages: '323',
    requiredMetadata: ['autores', 'año', 'título del artículo', 'revista', 'volumen', 'número si existe', 'páginas o eLocator', 'DOI verificado'],
    referenceTemplate: 'Autor, A. A., & Autor, B. B. (Año). Título del artículo. Título de la revista, volumen(número), páginas. https://doi.org/xxxxx',
    rules: ['El DOI se expresa como URL https://doi.org/...', 'Se omiten los elementos que realmente no existen.'],
  },
  'journal-no-doi-public-url': {
    ...base, id: 'journal-no-doi-public-url', label: 'Artículo sin DOI con URL pública ajena a una base de datos', manualExample: 2, manualPrintedPages: '323',
    requiredMetadata: ['autores', 'año', 'título', 'revista', 'volumen', 'número si existe', 'páginas o eLocator', 'URL pública'],
    referenceTemplate: 'Autor, A. A. (Año). Título del artículo. Título de la revista, volumen(número), páginas. URL',
    rules: ['Incluye la URL del artículo únicamente cuando es recuperable públicamente y no es la URL de una base de datos.'],
  },
  'journal-no-doi-database-or-print': {
    ...base, id: 'journal-no-doi-database-or-print', label: 'Artículo sin DOI de una base académica común o impreso', manualExample: 3, manualPrintedPages: '323',
    requiredMetadata: ['autores', 'fecha', 'título', 'publicación', 'volumen/número/páginas si existen'],
    referenceTemplate: 'Autor, A. A. (Fecha). Título del artículo. Título de la publicación, volumen(número), páginas.',
    rules: ['No incluye el nombre de la base de datos ni su URL.', 'Para periódico o revista usa la precisión de fecha disponible.'],
  },
  'journal-21-plus-authors': {
    ...base, id: 'journal-21-plus-authors', label: 'Artículo con 21 o más autores', manualExample: 4, manualPrintedPages: '323',
    requiredMetadata: ['lista completa y ordenada de autores', 'año', 'título', 'revista', 'volumen/número', 'páginas o eLocator', 'DOI/URL si corresponde'],
    referenceTemplate: 'Autores 1-19, ... Último autor. (Año). Título. Revista, volumen(número), páginas. DOI/URL',
    parentheticalCitation: '(Primer autor et al., Año)', narrativeCitation: 'Primer autor et al. (Año)',
    rules: ['En la referencia incluye los primeros 19 autores, puntos suspensivos y el último autor.', 'No coloca & antes del último autor después de los puntos suspensivos.'],
  },
  'journal-individual-group-authors': {
    ...base, id: 'journal-individual-group-authors', label: 'Artículo con autores personales y grupales', manualExample: 5, manualPrintedPages: '323',
    requiredMetadata: ['autores personales en orden', 'nombre exacto del autor grupal', 'año', 'título', 'revista', 'volumen/número', 'páginas', 'DOI/URL'],
    referenceTemplate: 'Autor personal, A. A., & Nombre exacto del grupo. (Año). Título. Revista, volumen(número), páginas. DOI/URL',
    parentheticalCitation: '(Primer autor et al., Año)', narrativeCitation: 'Primer autor et al. (Año)',
    rules: ['Conserva el nombre del grupo como aparece en la fuente.'],
  },
  'journal-elocator': {
    ...base, id: 'journal-elocator', label: 'Artículo con eLocator', manualExample: 6, manualPrintedPages: '324',
    requiredMetadata: ['autores', 'año', 'título', 'revista', 'volumen/número', 'eLocator', 'DOI/URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título. Revista, volumen(número), Artículo eLocator. DOI/URL',
    rules: ['Escribe Artículo antes del eLocator y no inventa un rango de páginas.'],
  },
  'journal-advance-online': {
    ...base, id: 'journal-advance-online', label: 'Artículo publicado anticipadamente en línea', manualExample: 7, manualPrintedPages: '324',
    requiredMetadata: ['autores', 'año', 'título', 'revista', 'estado de publicación anticipada', 'DOI'],
    referenceTemplate: 'Autor, A. A. (Año). Título. Revista. Publicación anticipada en línea. DOI',
    rules: ['Debe sustituirse por la referencia de la versión final cuando esta exista.'],
  },
  'journal-in-press': {
    ...base, id: 'journal-in-press', label: 'Artículo en prensa', manualExample: 8, manualPrintedPages: '324',
    requiredMetadata: ['autores', 'título', 'revista', 'confirmación de aceptación/en prensa'],
    referenceTemplate: 'Autor, A. A. (en prensa). Título. Revista.',
    parentheticalCitation: '(Autor, en prensa)', narrativeCitation: 'Autor (en prensa)',
    rules: ['No inventa año, volumen, número ni páginas todavía no publicados.'],
  },
  'journal-other-language': {
    ...base, id: 'journal-other-language', label: 'Artículo publicado en otro idioma', manualExample: 9, manualPrintedPages: '324',
    requiredMetadata: ['autores', 'año', 'título original', 'traducción del título al idioma del trabajo si corresponde', 'revista', 'volumen/número/páginas', 'DOI/URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título original [Traducción del título]. Revista, volumen(número), páginas. DOI/URL',
    rules: ['La traducción entre corchetes se añade cuando el idioma del artículo difiere del idioma del trabajo.'],
  },
  'journal-translated-republication': {
    ...base, id: 'journal-translated-republication', label: 'Artículo reeditado en traducción', manualExample: 10, manualPrintedPages: '324',
    requiredMetadata: ['autor', 'año de reedición', 'año original', 'título', 'traductores', 'revista', 'volumen/número/páginas', 'DOI/URL'],
    referenceTemplate: 'Autor, A. A. (Año reedición). Título (A. Traductor, Trad.). Revista, volumen(número), páginas. DOI/URL (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor, Año original/Año reedición)', narrativeCitation: 'Autor (Año original/Año reedición)',
    rules: ['Los dos años son obligatorios para la citación de la reedición consultada.'],
  },
  'journal-reprint': {
    ...base, id: 'journal-reprint', label: 'Artículo reimpreso de otra fuente', manualExample: 11, manualPrintedPages: '324-325',
    requiredMetadata: ['autor', 'año y fuente de la reimpresión consultada', 'título', 'datos completos de la publicación original'],
    referenceTemplate: 'Autor, A. A. (Año reimpresión). Título. Fuente de la reimpresión. (Reimpreso de Título original, Año original, Fuente original)',
    parentheticalCitation: '(Autor, Año original/Año reimpresión)', narrativeCitation: 'Autor (Año original/Año reimpresión)',
    rules: ['La referencia describe primero la versión realmente consultada.'],
  },
  'journal-special-section-issue': {
    ...base, id: 'journal-special-section-issue', label: 'Sección especial o edición especial', manualExample: 12, manualPrintedPages: '325',
    requiredMetadata: ['editores', 'año', 'título', 'tipo sección/edición', 'revista', 'volumen/número', 'páginas si es sección'],
    referenceTemplate: 'Editor, A. A. (Ed.). (Año). Título [Sección especial o Edición especial]. Revista, volumen(número), páginas si corresponde.',
    parentheticalCitation: '(Editor, Año)', narrativeCitation: 'Editor (Año)',
    rules: ['Incluye páginas para una sección especial, no para una edición especial completa.', 'Un artículo individual dentro del especial usa el formato normal de artículo.'],
  },
  'journal-cochrane': {
    ...base, id: 'journal-cochrane', label: 'Artículo de Cochrane Database of Systematic Reviews', manualExample: 13, manualPrintedPages: '325',
    requiredMetadata: ['autores', 'año', 'título', 'Cochrane Database of Systematic Reviews', 'DOI'],
    referenceTemplate: 'Autor, A. A. (Año). Título. Cochrane Database of Systematic Reviews. DOI',
    rules: ['Se presenta como artículo de publicación periódica.'],
  },
  'journal-uptodate': {
    ...base, id: 'journal-uptodate', label: 'Artículo de UpToDate', manualExample: 14, manualPrintedPages: '325-326',
    requiredMetadata: ['autor', 'año de última actualización', 'título', 'fecha de recuperación', 'URL'],
    referenceTemplate: 'Autor, A. A. (Año de última actualización). Título. UpToDate. Recuperado el día de mes de año, de URL',
    rules: ['Incluye fecha de recuperación porque el contenido cambia y las versiones no se archivan.'],
  },
  'magazine-article': {
    ...base, id: 'magazine-article', label: 'Artículo de revista o magazine', manualExample: 15, manualPrintedPages: '326',
    requiredMetadata: ['autor', 'fecha disponible', 'título', 'revista', 'volumen/número/páginas si existen', 'DOI/URL si corresponde'],
    referenceTemplate: 'Autor, A. A. (Año, día de mes). Título. Revista, volumen(número), páginas. DOI/URL',
    rules: ['Usa la precisión de fecha publicada por la revista y omite elementos inexistentes.'],
  },
  'newspaper-article': {
    ...base, id: 'newspaper-article', label: 'Artículo de periódico', manualExample: 16, manualPrintedPages: '326',
    requiredMetadata: ['autor', 'fecha completa', 'título', 'periódico', 'página o URL según versión'],
    referenceTemplate: 'Autor, A. A. (Año, día de mes). Título. Periódico, página si es impreso. URL si es en línea',
    rules: ['Un sitio web de noticias que no es un periódico se trata como página web, no como artículo de periódico.'],
  },
  'blog-post': {
    ...base, id: 'blog-post', label: 'Entrada de blog', manualExample: 17, manualPrintedPages: '326',
    requiredMetadata: ['autor', 'fecha completa', 'título de la entrada', 'nombre del blog', 'URL'],
    referenceTemplate: 'Autor, A. A. (Año, día de mes). Título de la entrada. Blog. URL',
    rules: ['El nombre del blog ocupa el elemento fuente.'],
  },
  'periodical-comment': {
    ...base, id: 'periodical-comment', label: 'Comentario en una publicación periódica en línea', manualExample: 18, manualPrintedPages: '326',
    requiredMetadata: ['nombre real o usuario del comentarista', 'fecha completa', 'título o primeras 20 palabras', 'artículo comentado', 'publicación', 'URL'],
    referenceTemplate: 'Usuario. (Año, día de mes). Título o primeras 20 palabras [Comentario en el artículo “Título del artículo”]. Publicación. URL',
    parentheticalCitation: '(Usuario, Año)', narrativeCitation: 'Usuario (Año)',
    rules: ['Acredita al comentarista con el nombre mostrado.', 'La descripción entre corchetes identifica el artículo comentado.'],
  },
  'periodical-editorial': {
    ...base, id: 'periodical-editorial', label: 'Editorial de una publicación periódica', manualExample: 19, manualPrintedPages: '326-327',
    requiredMetadata: ['autor si está firmado', 'año o fecha', 'título', 'tipo de publicación periódica', 'volumen/número/páginas si existen', 'DOI/URL si corresponde'],
    referenceTemplate: 'Autor, A. A. (Año). Título [Editorial]. Publicación, volumen(número), páginas. DOI/URL',
    rules: [
      'Usa el formato correspondiente al tipo de publicación periódica donde apareció.',
      'Añade [Editorial] después del título, salvo que la palabra Editorial ya forme parte del título.',
      'Si el editorial no está firmado, aplica las reglas de obra sin autor: el título pasa a la posición de autor y gobierna la cita en el texto.',
    ],
  },
};

export function getPeriodicalCase(id: PeriodicalCaseId): Apa7VerifiedCase {
  return periodicalCases[id];
}
