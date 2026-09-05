import { z } from 'zod';

export const bookCaseId = z.enum([
  'book-author-doi',
  'book-author-no-doi-database-or-print',
  'book-author-electronic-public-url',
  'book-author-editor-on-cover',
  'book-edited-doi-multiple-publishers',
  'book-edited-no-doi-database-or-print',
  'book-edited-electronic-public-url',
  'book-other-language',
  'book-translated-republication',
  'book-republished',
  'book-multivolume-single-volume',
  'book-in-series',
  'diagnostic-manual',
  'dictionary-thesaurus-encyclopedia',
  'anthology',
  'religious-work',
  'ancient-greek-roman-work',
  'shakespeare-work',
]);

export type BookCaseId = z.infer<typeof bookCaseId>;

export interface Apa7VerifiedBookCase {
  id: BookCaseId;
  label: string;
  manualExample: number;
  manualSection: '10.2';
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
  manualSection: '10.2' as const,
  status: 'verified' as const,
  parentheticalCitation: '(Autor, Año)',
  narrativeCitation: 'Autor (Año)',
  refuseWhen: [
    'No se verificó el autor, editor o entidad responsable.',
    'La edición, volumen, traducción, narración o fecha original fue inferida.',
    'Se añadió una editorial, DOI, URL o fecha de recuperación inexistente.',
  ],
};

export const bookCases: Record<BookCaseId, Apa7VerifiedBookCase> = {
  'book-author-doi': {
    ...base, id: 'book-author-doi', label: 'Libro de autor con DOI', manualExample: 20, manualPrintedPages: '327',
    requiredMetadata: ['autores', 'año', 'título', 'edición desde la segunda', 'editorial', 'DOI verificado'],
    referenceTemplate: 'Autor, A. A. (Año). Título del libro (edición). Editorial. https://doi.org/xxxxx',
    rules: ['La edición se incluye desde la segunda.', 'El DOI se expresa como URL.'],
  },
  'book-author-no-doi-database-or-print': {
    ...base, id: 'book-author-no-doi-database-or-print', label: 'Libro de autor sin DOI, de base académica común o impreso', manualExample: 21, manualPrintedPages: '327',
    requiredMetadata: ['autores', 'año', 'título', 'edición desde la segunda', 'editorial'],
    referenceTemplate: 'Autor, A. A. (Año). Título del libro (edición). Editorial.',
    rules: ['No incluye nombre ni URL de la base de datos.'],
  },
  'book-author-electronic-public-url': {
    ...base, id: 'book-author-electronic-public-url', label: 'Libro electrónico o audiolibro de autor sin DOI con URL pública', manualExample: 22, manualPrintedPages: '327-328',
    requiredMetadata: ['autores', 'año', 'título', 'editorial', 'URL pública', 'narrador y formato solo si son relevantes'],
    referenceTemplate: 'Autor, A. A. (Año). Título del libro (N. Narrador, Narr.) [Audiolibro, si corresponde]. Editorial. URL',
    rules: ['No incluye plataforma o dispositivo cuando el contenido coincide con el libro.', 'Identifica audiolibro cuando el contenido o la narración son relevantes.'],
  },
  'book-author-editor-on-cover': {
    ...base, id: 'book-author-editor-on-cover', label: 'Libro de autor con editor acreditado en portada', manualExample: 23, manualPrintedPages: '328',
    requiredMetadata: ['autor', 'año', 'título', 'editor acreditado', 'editorial'],
    referenceTemplate: 'Autor, A. A. (Año). Título del libro (E. Editor, Ed.). Editorial.',
    rules: ['El autor, no el editor, determina la cita.', 'El editor aparece entre paréntesis después del título.'],
  },
  'book-edited-doi-multiple-publishers': {
    ...base, id: 'book-edited-doi-multiple-publishers', label: 'Libro editado con DOI y varias editoriales', manualExample: 24, manualPrintedPages: '328',
    requiredMetadata: ['editores', 'año', 'título', 'editoriales en orden', 'DOI'],
    referenceTemplate: 'Editor, E. E. (Ed.). (Año). Título del libro. Editorial 1; Editorial 2. DOI',
    parentheticalCitation: '(Editor, Año)', narrativeCitation: 'Editor (Año)',
    rules: ['Separa editoriales con punto y coma y conserva su orden.'],
  },
  'book-edited-no-doi-database-or-print': {
    ...base, id: 'book-edited-no-doi-database-or-print', label: 'Libro editado sin DOI, de base académica común o impreso', manualExample: 25, manualPrintedPages: '328',
    requiredMetadata: ['editores', 'año', 'título', 'editorial'],
    referenceTemplate: 'Editor, E. E. (Ed.). (Año). Título del libro. Editorial.',
    parentheticalCitation: '(Editor, Año)', narrativeCitation: 'Editor (Año)',
    rules: ['No incluye nombre ni URL de la base de datos.'],
  },
  'book-edited-electronic-public-url': {
    ...base, id: 'book-edited-electronic-public-url', label: 'Libro electrónico o audiolibro editado sin DOI con URL pública', manualExample: 26, manualPrintedPages: '328',
    requiredMetadata: ['editores', 'año', 'título', 'editorial', 'URL pública', 'formato si corresponde'],
    referenceTemplate: 'Editor, E. E. (Ed.). (Año). Título del libro [Formato, si corresponde]. Editorial. URL',
    parentheticalCitation: '(Editor, Año)', narrativeCitation: 'Editor (Año)',
    rules: ['No incluye la URL de una base de datos académica común.'],
  },
  'book-other-language': {
    ...base, id: 'book-other-language', label: 'Libro en otro idioma', manualExample: 27, manualPrintedPages: '329',
    requiredMetadata: ['autores', 'año', 'título original', 'traducción del título si el idioma difiere', 'volumen/edición si existe', 'editorial'],
    referenceTemplate: 'Autor, A. A. (Año). Título original [Traducción del título] (volumen/edición). Editorial.',
    rules: ['Añade la traducción del título entre corchetes cuando el idioma difiere del trabajo.'],
  },
  'book-translated-republication': {
    ...base, id: 'book-translated-republication', label: 'Libro reeditado en traducción', manualExample: 28, manualPrintedPages: '329',
    requiredMetadata: ['autores', 'año original', 'año de reedición', 'título', 'traductores', 'edición', 'editorial'],
    referenceTemplate: 'Autor, A. A. (Año reedición). Título (T. Traductor, Trad.; edición). Editorial. (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor, Año original/Año reedición)', narrativeCitation: 'Autor (Año original/Año reedición)',
    rules: ['Conserva ambos años en la cita.'],
  },
  'book-republished': {
    ...base, id: 'book-republished', label: 'Libro, libro electrónico o audiolibro reeditado', manualExample: 29, manualPrintedPages: '329',
    requiredMetadata: ['autor', 'año original', 'año de reedición', 'título', 'editor/traductor/narrador si aplica', 'formato si aplica', 'editorial', 'DOI/URL si corresponde'],
    referenceTemplate: 'Autor, A. A. (Año reedición). Título (responsable, función) [Formato, si aplica]. Editorial. DOI/URL (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor, Año original/Año reedición)', narrativeCitation: 'Autor (Año original/Año reedición)',
    rules: ['Describe la versión efectivamente consultada.', 'Un audiolibro publicado en año diferente se trata como reedición.'],
  },
  'book-multivolume-single-volume': {
    ...base, id: 'book-multivolume-single-volume', label: 'Volumen de una obra de varios volúmenes', manualExample: 30, manualPrintedPages: '329',
    requiredMetadata: ['autores o editores del volumen', 'año', 'título general', 'número de volumen', 'título propio del volumen si existe', 'edición', 'editorial', 'DOI/URL'],
    referenceTemplate: 'Autor/Editor. (Año). Título general (edición, Vol. x) o Título general: Vol. x. Título del volumen. Editorial. DOI/URL',
    rules: ['Si el volumen no tiene título propio, el número va entre paréntesis sin cursiva.', 'Si tiene título propio, número y título siguen al título general.', 'Solo los editores del volumen ocupan la posición de autor.'],
  },
  'book-in-series': {
    ...base, id: 'book-in-series', label: 'Libro perteneciente a una serie', manualExample: 31, manualPrintedPages: '329-330',
    requiredMetadata: ['autor', 'año', 'título', 'edición', 'editorial', 'DOI/URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título del libro (edición). Editorial. DOI/URL',
    rules: ['No incluye el título de una serie de obras conceptualmente relacionadas.'],
  },
  'diagnostic-manual': {
    ...base, id: 'diagnostic-manual', label: 'Manual de diagnóstico (DSM, CIE)', manualExample: 32, manualPrintedPages: '330',
    requiredMetadata: ['autor grupal', 'año', 'título completo', 'edición', 'abreviatura si se usará', 'DOI/URL'],
    referenceTemplate: 'Entidad. (Año). Título completo del manual (edición). DOI/URL',
    parentheticalCitation: '(Entidad, Año)', narrativeCitation: 'Entidad (Año)',
    rules: ['Si autor y editorial son iguales, omite la editorial.', 'Título, edición y abreviatura pueden introducirse en la primera mención del texto, pero no se abrevian en referencias.', 'Después de introducir el manual, repite la cita solo cuando sustenta directamente una afirmación.'],
  },
  'dictionary-thesaurus-encyclopedia': {
    ...base, id: 'dictionary-thesaurus-encyclopedia', label: 'Diccionario, tesauro o enciclopedia completos', manualExample: 33, manualPrintedPages: '330-331',
    requiredMetadata: ['autor grupal o editor', 'fecha o s. f.', 'título', 'edición/versión', 'editorial si corresponde', 'URL', 'fecha de recuperación si cambia sin archivo'],
    referenceTemplate: 'Autor/Editor. (Fecha o s. f.). Título de la obra (edición/versión). Editorial. Recuperado el día de mes de año, de URL si cambia sin archivo',
    rules: ['Usa s. f. y fecha de recuperación para obras actualizadas continuamente sin versiones archivadas.', 'Omite fecha de recuperación para versiones estables o archivadas.'],
  },
  anthology: {
    ...base, id: 'anthology', label: 'Antología completa', manualExample: 34, manualPrintedPages: '331',
    requiredMetadata: ['editores de la antología', 'año de la antología', 'título', 'editorial', 'DOI/URL'],
    referenceTemplate: 'Editor, E. E. (Ed.). (Año). Título de la antología. Editorial. DOI/URL',
    parentheticalCitation: '(Editor, Año)', narrativeCitation: 'Editor (Año)',
    rules: ['Para una obra individual incluida en la antología se utiliza el caso de capítulo/obra incluida, no esta referencia global.'],
  },
  'religious-work': {
    ...base, id: 'religious-work', label: 'Obra religiosa', manualExample: 35, manualPrintedPages: '331',
    requiredMetadata: ['título de la obra', 'año de versión', 'traductores/edición si existen', 'editorial o URL', 'año original si corresponde'],
    referenceTemplate: 'Título de la obra. (Año de versión). (Traductor, Trad.; edición). Editorial/URL. (Obra original publicada en Año original)',
    parentheticalCitation: '(Título, Año original/Año versión)', narrativeCitation: 'Título (Año original/Año versión)',
    rules: ['El título ocupa la posición de autor cuando no hay autor.', 'Para libro, versículo o pasaje se añade el localizador canónico en el texto.'],
  },
  'ancient-greek-roman-work': {
    ...base, id: 'ancient-greek-roman-work', label: 'Obra griega o romana antigua', manualExample: 36, manualPrintedPages: '331',
    requiredMetadata: ['autor clásico', 'año de la versión consultada', 'título', 'traductor/editor', 'editorial/URL', 'fecha original o aproximada'],
    referenceTemplate: 'Autor. (Año versión). Título (T. Traductor, Trad.). Editorial/URL. (Obra original publicada ca. Año antiguo)',
    parentheticalCitation: '(Autor, ca. Año original/Año versión)', narrativeCitation: 'Autor (ca. Año original/Año versión)',
    rules: ['Usa ca. únicamente cuando la fecha original es aproximada.', 'Las partes canónicas requieren su localizador propio en la cita.'],
  },
  'shakespeare-work': {
    ...base, id: 'shakespeare-work', label: 'Obra de Shakespeare u otra obra clásica con edición moderna', manualExample: 37, manualPrintedPages: '331',
    requiredMetadata: ['autor', 'año de edición consultada', 'título', 'editores/traductores', 'editorial', 'año original'],
    referenceTemplate: 'Autor. (Año edición). Título (E. Editor, Ed.). Editorial. (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor, Año original/Año edición)', narrativeCitation: 'Autor (Año original/Año edición)',
    rules: ['Acto, escena, línea o pasaje se añade como localizador al citar una parte.'],
  },
};

export function getBookCase(id: BookCaseId): Apa7VerifiedBookCase {
  return bookCases[id];
}
