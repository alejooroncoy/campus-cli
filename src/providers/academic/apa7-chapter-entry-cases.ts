import { z } from 'zod';

export const chapterEntryCaseId = z.enum([
  'chapter-edited-doi',
  'chapter-edited-no-doi-database-or-print',
  'chapter-electronic-public-url',
  'chapter-other-language',
  'chapter-translated-republication',
  'chapter-reprinted-from-journal',
  'chapter-reprinted-from-book',
  'chapter-multivolume-work',
  'work-in-anthology',
  'reference-entry-group-author',
  'reference-entry-individual-author',
  'wikipedia-entry',
]);

export type ChapterEntryCaseId = z.infer<typeof chapterEntryCaseId>;

export interface Apa7VerifiedChapterEntryCase {
  id: ChapterEntryCaseId;
  label: string;
  manualExample: number;
  manualSection: '10.3';
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
  manualSection: '10.3' as const,
  status: 'verified' as const,
  parentheticalCitation: '(Autor del capítulo, Año)',
  narrativeCitation: 'Autor del capítulo (Año)',
  refuseWhen: [
    'No se verificó quién escribió el capítulo o la entrada.',
    'Se infirieron editores, páginas, edición, volumen o fecha original.',
    'Se añadió un DOI, URL, base de datos o fecha de recuperación inexistente.',
  ],
};

export const chapterEntryCases: Record<ChapterEntryCaseId, Apa7VerifiedChapterEntryCase> = {
  'chapter-edited-doi': {
    ...base, id: 'chapter-edited-doi', label: 'Capítulo de libro editado con DOI', manualExample: 38, manualPrintedPages: '332',
    requiredMetadata: ['autores del capítulo', 'año', 'título del capítulo', 'editores', 'título del libro', 'edición/volumen si existen', 'páginas', 'editorial', 'DOI'],
    referenceTemplate: 'Autor, A. A. (Año). Título del capítulo. En E. E. Editor (Ed.), Título del libro (edición, pp. xx-xx). Editorial. https://doi.org/xxxxx',
    rules: ['El autor del capítulo, no el editor del libro, gobierna la cita.', 'El DOI se expresa como URL.'],
  },
  'chapter-edited-no-doi-database-or-print': {
    ...base, id: 'chapter-edited-no-doi-database-or-print', label: 'Capítulo sin DOI de base académica común o impreso', manualExample: 39, manualPrintedPages: '332-333',
    requiredMetadata: ['autores del capítulo', 'año', 'título', 'editores', 'libro', 'edición/volumen si existen', 'páginas', 'editorial'],
    referenceTemplate: 'Autor, A. A. (Año). Título del capítulo. En E. E. Editor (Ed.), Título del libro (edición, pp. xx-xx). Editorial.',
    rules: ['No incluye el nombre ni la URL de una base de datos académica común.'],
  },
  'chapter-electronic-public-url': {
    ...base, id: 'chapter-electronic-public-url', label: 'Capítulo electrónico o de audiolibro sin DOI con URL pública', manualExample: 40, manualPrintedPages: '333',
    requiredMetadata: ['autores del capítulo', 'año', 'título', 'editores', 'libro', 'edición', 'páginas', 'editorial', 'URL pública'],
    referenceTemplate: 'Autor, A. A. (Año). Título del capítulo. En E. E. Editor (Ed.), Título del libro (edición, pp. xx-xx). Editorial. URL',
    rules: ['Incluye la URL cuando no pertenece a una base de datos.', 'No añade plataforma o dispositivo; trata los detalles especiales de audiolibro solo cuando sean relevantes.'],
  },
  'chapter-other-language': {
    ...base, id: 'chapter-other-language', label: 'Capítulo de libro editado en otro idioma', manualExample: 41, manualPrintedPages: '333',
    requiredMetadata: ['autor', 'año', 'título original del capítulo', 'traducción del título', 'editores', 'libro', 'páginas', 'editorial', 'DOI/URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título original del capítulo [Traducción del título]. En E. Editor (Ed.), Título del libro (pp. xx-xx). Editorial. DOI/URL',
    rules: ['Añade entre corchetes la traducción del título del capítulo cuando su idioma difiere del idioma del trabajo.'],
  },
  'chapter-translated-republication': {
    ...base, id: 'chapter-translated-republication', label: 'Capítulo reeditado en traducción', manualExample: 42, manualPrintedPages: '333',
    requiredMetadata: ['autor', 'año original', 'año de reedición', 'título', 'traductor del capítulo', 'editores', 'libro', 'páginas', 'editorial'],
    referenceTemplate: 'Autor, A. A. (Año reedición). Título del capítulo (T. Traductor, Trad.). En E. Editor (Ed.), Título del libro (pp. xx-xx). Editorial. (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor, Año original/Año reedición)', narrativeCitation: 'Autor (Año original/Año reedición)',
    rules: ['La cita de la versión consultada conserva el año original y el de la reedición.'],
  },
  'chapter-reprinted-from-journal': {
    ...base, id: 'chapter-reprinted-from-journal', label: 'Capítulo reimpreso de un artículo de revista científica', manualExample: 43, manualPrintedPages: '333',
    requiredMetadata: ['autores', 'año de reimpresión', 'título', 'editores y libro de la reimpresión', 'páginas de la reimpresión', 'editorial', 'año y datos completos del artículo original'],
    referenceTemplate: 'Autor, A. A. (Año reimpresión). Título. En E. Editor (Ed.), Libro de la reimpresión (pp. xx-xx). Editorial. (Reimpreso de “Título del artículo”, Año original, Revista, volumen[número], páginas, DOI/URL)',
    parentheticalCitation: '(Autor, Año original/Año reimpresión)', narrativeCitation: 'Autor (Año original/Año reimpresión)',
    rules: ['Describe primero la versión reimpresa utilizada y después el artículo original.', 'El número de la revista original va entre corchetes para evitar paréntesis anidados.'],
  },
  'chapter-reprinted-from-book': {
    ...base, id: 'chapter-reprinted-from-book', label: 'Capítulo reimpreso de otro libro', manualExample: 44, manualPrintedPages: '334',
    requiredMetadata: ['autor', 'año de reimpresión', 'título', 'editores y libro de la reimpresión', 'páginas', 'editorial', 'título/páginas/responsable/año/editorial del libro original'],
    referenceTemplate: 'Autor, A. A. (Año reimpresión). Título. En E. Editor (Ed.), Libro de la reimpresión (pp. xx-xx). Editorial. (Reimpreso de Libro original, pp. xx-xx, de A. Autor/Editor, Año original, Editorial original)',
    parentheticalCitation: '(Autor, Año original/Año reimpresión)', narrativeCitation: 'Autor (Año original/Año reimpresión)',
    rules: ['Describe primero la versión consultada y después la procedencia completa del libro original.'],
  },
  'chapter-multivolume-work': {
    ...base, id: 'chapter-multivolume-work', label: 'Capítulo de un volumen de una obra multivolumen', manualExample: 45, manualPrintedPages: '334',
    requiredMetadata: ['autor del capítulo', 'año', 'título del capítulo', 'editores del volumen', 'título general', 'número y título del volumen', 'edición', 'páginas', 'editorial', 'DOI/URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título del capítulo. En E. Editor del volumen (Ed.), Título general: Vol. x. Título del volumen (edición, pp. xx-xx). Editorial. DOI/URL',
    rules: ['Si hay editores de serie y de volumen, solo los editores del volumen aparecen en la información del libro.', 'Si el volumen carece de título propio, el número de volumen va entre paréntesis después del título general.'],
  },
  'work-in-anthology': {
    ...base, id: 'work-in-anthology', label: 'Obra individual incluida en una antología', manualExample: 46, manualPrintedPages: '334',
    requiredMetadata: ['autor de la obra', 'año de la antología', 'título de la obra', 'editor de la antología', 'título de la antología', 'páginas', 'editorial', 'DOI/URL', 'año original si ya se publicó'],
    referenceTemplate: 'Autor, A. A. (Año antología). Título de la obra. En E. Editor (Ed.), Título de la antología (pp. xx-xx). Editorial. DOI/URL (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor, Año original/Año antología)', narrativeCitation: 'Autor (Año original/Año antología)',
    rules: ['Si la obra se publicó antes en otro lugar, se trata como reedición, no como reimpresión.'],
  },
  'reference-entry-group-author': {
    ...base, id: 'reference-entry-group-author', label: 'Entrada de diccionario, tesauro o enciclopedia con autor grupal', manualExample: 47, manualPrintedPages: '334',
    requiredMetadata: ['autor grupal', 'fecha o s. f.', 'título de entrada', 'obra de consulta', 'URL', 'fecha de recuperación si cambia sin archivo'],
    referenceTemplate: 'Autor grupal. (Fecha o s. f.). Título de la entrada. En Obra de consulta. Recuperado el día de mes de año, de URL si cambia sin archivo',
    parentheticalCitation: '(Autor grupal, Año o s. f.)', narrativeCitation: 'Autor grupal (Año o s. f.)',
    rules: ['Usa s. f. y fecha de recuperación cuando la entrada cambia continuamente y no se archivan versiones.', 'No repite como editorial una entidad que ya figura como autor.'],
  },
  'reference-entry-individual-author': {
    ...base, id: 'reference-entry-individual-author', label: 'Entrada de obra de consulta con autor individual', manualExample: 48, manualPrintedPages: '334',
    requiredMetadata: ['autor de la entrada', 'año', 'título de la entrada', 'editor', 'obra de consulta', 'edición o versión', 'editorial', 'URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título de la entrada. En E. Editor (Ed.), Obra de consulta (edición o versión). Editorial. URL',
    rules: ['Se estructura como capítulo de libro editado.', 'Una versión archivada estable no necesita fecha de recuperación.'],
  },
  'wikipedia-entry': {
    ...base, id: 'wikipedia-entry', label: 'Entrada de Wikipedia', manualExample: 49, manualPrintedPages: '335',
    requiredMetadata: ['título exacto de la entrada', 'fecha de la revisión consultada', 'URL permanente de esa revisión o, si no existe, URL actual y fecha de recuperación'],
    referenceTemplate: 'Título de la entrada. (Año, día de mes). En Wikipedia. URL permanente de la revisión archivada',
    parentheticalCitation: '(“Título de la entrada”, Año)', narrativeCitation: '“Título de la entrada” (Año)',
    rules: ['Cita una revisión archivada para que el lector recupere la versión consultada.', 'Si no hay enlace permanente a una versión, usa la URL actual y añade fecha de recuperación.', 'El título ocupa la posición de autor y en el texto se abrevia si resulta necesario.'],
  },
};

export function getChapterEntryCase(id: ChapterEntryCaseId): Apa7VerifiedChapterEntryCase {
  return chapterEntryCases[id];
}
