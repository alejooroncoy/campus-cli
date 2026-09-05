import { z } from 'zod';

export const visualSocialWebCaseId = z.enum([
  'artwork-museum-or-museum-site',
  'clip-art-or-stock-image',
  'infographic',
  'map',
  'photograph',
  'slides-or-lecture-notes',
  'tweet',
  'twitter-profile',
  'facebook-post',
  'facebook-page',
  'instagram-photo-or-video',
  'instagram-highlight',
  'online-forum-post',
  'webpage-news-site',
  'webpage-group-author',
  'webpage-individual-author',
  'webpage-no-date',
  'webpage-retrieval-date',
]);

export type VisualSocialWebCaseId = z.infer<typeof visualSocialWebCaseId>;

export interface Apa7VerifiedVisualSocialWebCase {
  id: VisualSocialWebCaseId;
  label: string;
  manualExample: number;
  manualSection: '10.14' | '10.15' | '10.16';
  manualPrintedPages: string;
  status: 'verified';
  requiredMetadata: string[];
  referenceTemplate: string;
  parentheticalCitation: string;
  narrativeCitation: string;
  rules: string[];
  refuseWhen: string[];
}

const shared = {
  status: 'verified' as const,
  parentheticalCitation: '(Autor o entidad, Año)',
  narrativeCitation: 'Autor o entidad (Año)',
  refuseWhen: [
    'No se verificó el creador, titular de la cuenta o autor de la página.',
    'Se infirieron fecha, título, tipo de contenido, ubicación o estado dinámico.',
    'Se añadió una URL, sitio, museo, plataforma o fecha de recuperación inexistente.',
  ],
};

const visualBase = { ...shared, manualSection: '10.14' as const };
const socialBase = { ...shared, manualSection: '10.15' as const };
const webBase = { ...shared, manualSection: '10.16' as const };

export const visualSocialWebCases: Record<VisualSocialWebCaseId, Apa7VerifiedVisualSocialWebCase> = {
  'artwork-museum-or-museum-site': {
    ...visualBase, id: 'artwork-museum-or-museum-site', label: 'Obra de arte en museo o sitio web de museo', manualExample: 97, manualPrintedPages: '352',
    requiredMetadata: ['artista', 'fecha o rango', 'título o descripción', 'medio/formato', 'museo', 'ubicación', 'URL si corresponde'],
    referenceTemplate: 'Artista, A. A. (Año o rango). Título [Medio o formato]. Museo, Ciudad, región, país. URL',
    rules: ['Aplica a pinturas, esculturas, fotografías, grabados, dibujos e instalaciones de museo.', 'Si no tiene título, usa una descripción entre corchetes en lugar del título.', 'Reproducir la obra puede exigir permiso o atribución de derechos además de citarla.'],
  },
  'clip-art-or-stock-image': {
    ...visualBase, id: 'clip-art-or-stock-image', label: 'Clip art o imagen de stock', manualExample: 98, manualPrintedPages: '352-353',
    requiredMetadata: ['creador o entidad', 'año', 'título o descripción', 'tipo clip art/imagen de stock', 'sitio', 'URL'],
    referenceTemplate: 'Autor o entidad. (Año). Título o descripción [Clip art o Imagen de stock]. Sitio. URL',
    rules: ['Este formato sirve para citar, no necesariamente para autorizar la reproducción.', 'Clip art incluido en programas como Microsoft Word o PowerPoint no requiere cita, permiso ni atribución.', 'Otras imágenes de stock pueden requerir permiso o atribución de derechos para reproducirse.'],
  },
  infographic: {
    ...visualBase, id: 'infographic', label: 'Infografía', manualExample: 99, manualPrintedPages: '353',
    requiredMetadata: ['autores o entidad', 'año', 'título', 'descripción infografía', 'sitio', 'URL'],
    referenceTemplate: 'Autor, A. A. (Año). Título [Infografía]. Sitio. URL',
    parentheticalCitation: '(Autor & Autor, Año)', narrativeCitation: 'Autor y Autor (Año)',
    rules: ['Reproducir una infografía puede exigir permiso o atribución de derechos además de la referencia.'],
  },
  map: {
    ...visualBase, id: 'map', label: 'Mapa estático o dinámico', manualExample: 100, manualPrintedPages: '353',
    requiredMetadata: ['autor o entidad', 'año o s. f.', 'título o descripción', 'descripción mapa', 'fuente/sitio', 'URL', 'fecha de recuperación si cambia'],
    referenceTemplate: 'Autor o entidad. (Año o s. f.). Título o [Descripción del mapa] [Mapa]. Fuente. Recuperado el día de mes de año, de URL si es dinámico',
    parentheticalCitation: '(Autor o entidad, Año o s. f.)', narrativeCitation: 'Autor o entidad (Año o s. f.)',
    rules: ['Un mapa dinámico sin título se describe entre corchetes y lleva fecha de recuperación.', 'Un mapa estático y archivado no necesita fecha de recuperación.'],
  },
  photograph: {
    ...visualBase, id: 'photograph', label: 'Fotografía fuera de un museo', manualExample: 101, manualPrintedPages: '353',
    requiredMetadata: ['fotógrafo', 'año', 'título o descripción', 'descripción fotografía', 'sitio', 'URL'],
    referenceTemplate: 'Fotógrafo, A. A. (Año). Título o [Descripción] [Fotografía]. Nombre del sitio. URL',
    parentheticalCitation: '(Fotógrafo, Año)', narrativeCitation: 'Fotógrafo (Año)',
    rules: ['La fuente es el nombre del sitio que aloja la fotografía.', 'Si carece de título, usa una descripción entre corchetes.', 'Reproducirla puede exigir permiso o atribución de derechos además de la cita.'],
  },
  'slides-or-lecture-notes': {
    ...visualBase, id: 'slides-or-lecture-notes', label: 'Diapositivas de PowerPoint o notas de conferencia', manualExample: 102, manualPrintedPages: '353',
    requiredMetadata: ['autores', 'fecha', 'título o descripción', 'tipo de material', 'departamento/universidad o sitio/plataforma', 'URL accesible'],
    referenceTemplate: 'Autor, A. A. (Año, día de mes). Título o [Descripción] [Diapositivas de PowerPoint o Notas de conferencia]. Departamento, Universidad o Plataforma. URL',
    rules: ['Si el recurso está en un LMS o intranet, úsalo solo para un público con acceso.', 'Para sitios con inicio de sesión, usa la URL de la página de acceso.'],
  },
  tweet: {
    ...socialBase, id: 'tweet', label: 'Tweet o publicación equivalente', manualExample: 103, manualPrintedPages: '354-355',
    requiredMetadata: ['nombre real o grupal', 'usuario', 'fecha completa', 'primeras 20 palabras', 'descripción de medios/enlaces si existen', 'plataforma', 'URL'],
    referenceTemplate: 'Autor o entidad [@usuario]. (Año, día de mes). Primeras 20 palabras [Descripción de medios si existe] [Tweet]. Twitter. URL',
    parentheticalCitation: '(Autor o entidad, Año)', narrativeCitation: 'Autor o entidad (Año)',
    rules: ['Conserva ortografía, mayúsculas, hashtags, enlaces y emojis del original.', 'Cada emoji cuenta como una palabra; si no puede reproducirse, usa su nombre entre corchetes.', 'En respuestas, no añade “en respuesta a” a la referencia; puede explicarse en el texto.', 'Si solo descubriste otra fuente mediante el tweet, cita directamente esa fuente.'],
  },
  'twitter-profile': {
    ...socialBase, id: 'twitter-profile', label: 'Perfil de Twitter', manualExample: 104, manualPrintedPages: '355',
    requiredMetadata: ['nombre', 'usuario', 'pestaña del perfil', 'plataforma', 'fecha de recuperación', 'URL'],
    referenceTemplate: 'Autor o entidad [@usuario]. (s. f.). Nombre de la pestaña [Perfil de Twitter]. Twitter. Recuperado el día de mes de año, de URL',
    parentheticalCitation: '(Autor o entidad, s. f.)', narrativeCitation: 'Autor o entidad (s. f.)',
    rules: ['Incluye fecha de recuperación porque el perfil cambia.', 'Usa el nombre de la pestaña citada, por ejemplo Tweets, Listas o Momentos.'],
  },
  'facebook-post': {
    ...socialBase, id: 'facebook-post', label: 'Publicación de Facebook', manualExample: 105, manualPrintedPages: '355',
    requiredMetadata: ['autor o entidad', 'fecha completa', 'primeras 20 palabras', 'descripción de medios o enlaces', 'tipo de publicación', 'URL'],
    referenceTemplate: 'Autor o entidad. (Año, día de mes). Primeras 20 palabras [Descripción de imagen, infografía, video o enlace] [Actualización de estado]. Facebook. URL',
    rules: ['El formato puede adaptarse a otras plataformas de publicaciones.', 'Identifica entre corchetes imágenes, videos, miniaturas o contenido compartido.', 'Conserva los emojis cuando sea posible.'],
  },
  'facebook-page': {
    ...socialBase, id: 'facebook-page', label: 'Página de Facebook', manualExample: 106, manualPrintedPages: '355-356',
    requiredMetadata: ['entidad o persona', 'título de la pestaña', 'plataforma', 'fecha de recuperación', 'URL'],
    referenceTemplate: 'Autor o entidad. (s. f.). Título de la pestaña [Página de Facebook]. Facebook. Recuperado el día de mes de año, de URL',
    parentheticalCitation: '(Autor o entidad, s. f.)', narrativeCitation: 'Autor o entidad (s. f.)',
    rules: ['Usa el título real de la página o pestaña, como Inicio, Fotos, Biografía o Información.', 'Incluye fecha de recuperación porque la página cambia.'],
  },
  'instagram-photo-or-video': {
    ...socialBase, id: 'instagram-photo-or-video', label: 'Foto o video de Instagram', manualExample: 107, manualPrintedPages: '356',
    requiredMetadata: ['nombre o entidad', 'usuario', 'fecha completa', 'primeras 20 palabras', 'tipo y cantidad de medios', 'URL'],
    referenceTemplate: 'Autor o entidad [@usuario]. (Año, día de mes). Primeras 20 palabras [Fotografía(s) o Video]. Instagram. URL',
    rules: ['La descripción indica el tipo de medio y puede reflejar pluralidad, por ejemplo [Fotografías].'],
  },
  'instagram-highlight': {
    ...socialBase, id: 'instagram-highlight', label: 'Historia destacada de Instagram', manualExample: 108, manualPrintedPages: '356',
    requiredMetadata: ['nombre o entidad', 'usuario', 'título de la historia destacada', 'fecha de recuperación', 'URL'],
    referenceTemplate: 'Autor o entidad [@usuario]. (s. f.). Título [Historia destacada]. Instagram. Recuperado el día de mes de año, de URL',
    parentheticalCitation: '(Autor o entidad, s. f.)', narrativeCitation: 'Autor o entidad (s. f.)',
    rules: ['Usa s. f. porque la colección destacada no tiene una sola fecha aunque sus historias sí.', 'Incluye fecha de recuperación porque puede cambiar.'],
  },
  'online-forum-post': {
    ...socialBase, id: 'online-forum-post', label: 'Publicación en un foro en línea', manualExample: 109, manualPrintedPages: '356',
    requiredMetadata: ['nombre o entidad', 'usuario', 'fecha completa', 'primeras 20 palabras', 'descripción publicación en foro', 'plataforma', 'URL'],
    referenceTemplate: 'Autor o entidad [usuario]. (Año, día de mes). Primeras 20 palabras [Publicación en un foro en línea]. Plataforma. URL',
    rules: ['Conserva el nombre de usuario con el formato mostrado por la plataforma.'],
  },
  'webpage-news-site': {
    ...webBase, id: 'webpage-news-site', label: 'Página web de un sitio de noticias', manualExample: 110, manualPrintedPages: '357',
    requiredMetadata: ['autor', 'fecha completa', 'título', 'sitio de noticias', 'URL'],
    referenceTemplate: 'Autor, A. A. (Año, día de mes). Título de la página. Sitio de noticias. URL',
    parentheticalCitation: '(Autor, Año)', narrativeCitation: 'Autor (Año)',
    rules: ['Usa este caso para noticias de sitios como CNN, BBC o HuffPost que no son ediciones de un periódico.', 'Un artículo de revista o periódico en línea usa el caso periódico correspondiente.'],
  },
  'webpage-group-author': {
    ...webBase, id: 'webpage-group-author', label: 'Página web con autor grupal', manualExample: 111, manualPrintedPages: '357',
    requiredMetadata: ['entidad autora', 'fecha más específica disponible', 'título', 'nombre del sitio si difiere', 'URL'],
    referenceTemplate: 'Entidad autora. (Año, mes o día de mes). Título. Nombre del sitio si difiere. URL',
    parentheticalCitation: '(Entidad, Año)', narrativeCitation: 'Entidad (Año)',
    rules: ['Si el autor y el sitio son la misma entidad, omite el nombre del sitio.'],
  },
  'webpage-individual-author': {
    ...webBase, id: 'webpage-individual-author', label: 'Página web con autor individual', manualExample: 112, manualPrintedPages: '357',
    requiredMetadata: ['autor', 'fecha más específica disponible', 'título', 'sitio', 'URL'],
    referenceTemplate: 'Autor, A. A. (Año, día de mes). Título. Nombre del sitio. URL',
    parentheticalCitation: '(Autor, Año)', narrativeCitation: 'Autor (Año)',
    rules: ['Comprueba autor en la propia página, en “Acerca de” o en reconocimientos antes de declararlo ausente.'],
  },
  'webpage-no-date': {
    ...webBase, id: 'webpage-no-date', label: 'Página web sin fecha', manualExample: 113, manualPrintedPages: '358',
    requiredMetadata: ['autor individual o grupal verificado', 'título', 'sitio si difiere', 'URL'],
    referenceTemplate: 'Autor o entidad. (s. f.). Título. Nombre del sitio si difiere. URL',
    parentheticalCitation: '(Autor o entidad, s. f.)', narrativeCitation: 'Autor o entidad (s. f.)',
    rules: ['Usa s. f. solo después de comprobar que no existe fecha publicada, actualizada o revisada.', 'Los autores pueden estar identificados en agradecimientos o reconocimientos.', 'Si autor y sitio coinciden, omite el nombre del sitio.'],
  },
  'webpage-retrieval-date': {
    ...webBase, id: 'webpage-retrieval-date', label: 'Página web con fecha de recuperación', manualExample: 114, manualPrintedPages: '358',
    requiredMetadata: ['autor o entidad', 'título', 'sitio si difiere', 'fecha de recuperación', 'URL', 'confirmación de que cambia y no está archivada'],
    referenceTemplate: 'Autor o entidad. (s. f.). Título. Nombre del sitio si difiere. Recuperado el día de mes de año, de URL',
    parentheticalCitation: '(Autor o entidad, s. f.)', narrativeCitation: 'Autor o entidad (s. f.)',
    rules: ['Incluye fecha de recuperación solo cuando la página está diseñada para cambiar y no existe versión archivada.', 'Si autor y sitio coinciden, omite el sitio.'],
  },
};

export function getVisualSocialWebCase(id: VisualSocialWebCaseId): Apa7VerifiedVisualSocialWebCase {
  return visualSocialWebCases[id];
}
