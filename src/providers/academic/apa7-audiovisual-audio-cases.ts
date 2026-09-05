import { z } from 'zod';

export const audiovisualAudioCaseId = z.enum([
  'film-or-video',
  'film-other-language',
  'television-series',
  'television-episode-or-webisode',
  'ted-talk',
  'recorded-webinar',
  'online-video',
  'music-album',
  'song-or-track',
  'podcast-series',
  'podcast-episode',
  'archived-radio-interview',
  'speech-audio-recording',
]);

export type AudiovisualAudioCaseId = z.infer<typeof audiovisualAudioCaseId>;

export interface Apa7VerifiedAudiovisualAudioCase {
  id: AudiovisualAudioCaseId;
  label: string;
  manualExample: number;
  manualSection: '10.12' | '10.13';
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
  parentheticalCitation: '(Responsable, Año)',
  narrativeCitation: 'Responsable (Año)',
  refuseWhen: [
    'No se verificó el rol que determina la autoría de este tipo de medio.',
    'Se infirieron fecha, versión, temporada, episodio, compañía o año original.',
    'Se añadió una URL, plataforma, productora, discográfica o archivo inexistente.',
  ],
};

const audiovisualBase = { ...shared, manualSection: '10.12' as const };
const audioBase = { ...shared, manualSection: '10.13' as const };

export const audiovisualAudioCases: Record<AudiovisualAudioCaseId, Apa7VerifiedAudiovisualAudioCase> = {
  'film-or-video': {
    ...audiovisualBase, id: 'film-or-video', label: 'Película o video', manualExample: 84, manualPrintedPages: '348-349',
    requiredMetadata: ['director u otro rol equivalente verificable', 'año de la versión', 'título', 'descripción película/video y edición especial si importa', 'productora(s)', 'URL si corresponde'],
    referenceTemplate: 'Director, D. D. (Director). (Año). Título [Película; información especial de versión si es necesaria]. Productora 1; Productora 2. URL',
    parentheticalCitation: '(Director, Año)', narrativeCitation: 'Director (Año)',
    rules: ['El director ocupa la posición de autor; si es desconocido puede acreditarse un rol equivalente que facilite recuperar la obra.', 'No indica cine, DVD o streaming por defecto; añade detalles solo si la versión concreta es relevante.', 'Una cita textual de una obra audiovisual usa marca de tiempo real.'],
  },
  'film-other-language': {
    ...audiovisualBase, id: 'film-other-language', label: 'Película o video en otro idioma', manualExample: 85, manualPrintedPages: '349',
    requiredMetadata: ['director', 'año', 'título original', 'traducción del título', 'descripción', 'productora(s)'],
    referenceTemplate: 'Director, D. D. (Director). (Año). Título original [Traducción del título] [Película]. Productora.',
    parentheticalCitation: '(Director, Año)', narrativeCitation: 'Director (Año)',
    rules: ['Añade entre corchetes la traducción del título cuando el idioma difiere del idioma del trabajo.'],
  },
  'television-series': {
    ...audiovisualBase, id: 'television-series', label: 'Serie de televisión completa', manualExample: 86, manualPrintedPages: '349',
    requiredMetadata: ['productores ejecutivos', 'años de emisión', 'título de la serie', 'productora(s)'],
    referenceTemplate: 'Productor, P. P. (Productor ejecutivo). (Año inicial–Año final o presente). Título de la serie [Serie de TV]. Productora(s).',
    parentheticalCitation: '(Primer productor et al., Años)', narrativeCitation: 'Primer productor et al. (Años)',
    rules: ['Los productores ejecutivos ocupan la posición de autor.', 'Usa un rango para una serie concluida y “Año inicial–presente” para una serie en emisión.'],
  },
  'television-episode-or-webisode': {
    ...audiovisualBase, id: 'television-episode-or-webisode', label: 'Episodio de televisión o webisodio', manualExample: 87, manualPrintedPages: '349',
    requiredMetadata: ['guionistas', 'director del episodio', 'fecha completa', 'título', 'temporada y episodio', 'productores ejecutivos', 'serie', 'productora(s)', 'URL si corresponde'],
    referenceTemplate: 'Guionista, G. G. (Guionista), & Director, D. D. (Director). (Año, día de mes). Título (Temporada x, Episodio y) [Episodio de serie de TV]. En P. Productor (Productor ejecutivo), Título de la serie. Productora(s). URL',
    parentheticalCitation: '(Primer responsable et al., Año)', narrativeCitation: 'Primer responsable et al. (Año)',
    rules: ['Incluye guionista(s) y director del episodio con sus roles.', 'Incluye temporada y episodio entre paréntesis después del título.', 'Distingue responsables del episodio de productores ejecutivos de la serie.'],
  },
  'ted-talk': {
    ...audiovisualBase, id: 'ted-talk', label: 'Charla TED', manualExample: 88, manualPrintedPages: '349-350',
    requiredMetadata: ['sitio donde se consultó', 'orador o cuenta que subió el video', 'fecha disponible', 'título', 'plataforma/productora', 'URL'],
    referenceTemplate: 'En TED: Orador, A. A. (Año, mes). Título [Video]. TED Conferences. URL. En YouTube: Cuenta que subió. (Año, día de mes). Título [Video]. YouTube. URL',
    parentheticalCitation: '(Orador, Año) si está en TED; (Cuenta, Año) si está en YouTube', narrativeCitation: 'Orador (Año) si está en TED; Cuenta (Año) si está en YouTube',
    rules: ['En la web de TED, el orador es autor.', 'En YouTube, el dueño de la cuenta que subió el video es autor; el orador puede mencionarse narrativamente sin cambiar la cita.'],
  },
  'recorded-webinar': {
    ...audiovisualBase, id: 'recorded-webinar', label: 'Seminario web grabado', manualExample: 89, manualPrintedPages: '350',
    requiredMetadata: ['instructor', 'año o fecha', 'título', 'organización', 'URL recuperable'],
    referenceTemplate: 'Instructor, I. I. (Año). Título [Seminario web]. Organización. URL',
    parentheticalCitation: '(Instructor, Año)', narrativeCitation: 'Instructor (Año)',
    rules: ['Este formato es solo para webinars grabados y recuperables.', 'Un webinar no grabado se cita como comunicación personal y no entra en referencias.'],
  },
  'online-video': {
    ...audiovisualBase, id: 'online-video', label: 'Video de YouTube u otro video en línea', manualExample: 90, manualPrintedPages: '350',
    requiredMetadata: ['persona o grupo que subió el video', 'nombre de usuario si existe', 'fecha completa', 'título', 'plataforma', 'URL'],
    referenceTemplate: 'Autor o grupo [Nombre de usuario]. (Año, día de mes). Título [Video]. Plataforma. URL',
    parentheticalCitation: '(Cuenta que subió, Año)', narrativeCitation: 'Cuenta que subió (Año)',
    rules: ['La cuenta que subió el video se acredita como autor aunque no haya creado la obra.', 'Las contribuciones de otras personas pueden explicarse narrativamente, sin sustituir al autor de la referencia.', 'Las citas textuales usan una marca de tiempo verificable.'],
  },
  'music-album': {
    ...audioBase, id: 'music-album', label: 'Álbum de música', manualExample: 91, manualPrintedPages: '350-351',
    requiredMetadata: ['compositor para obra clásica o artista de grabación para moderna', 'año de versión', 'título', 'intérprete si es clásica', 'discográfica', 'año original si es clásica', 'URL solo si es único medio'],
    referenceTemplate: 'Clásica: Compositor. (Año versión). Título [Álbum grabado por Intérprete]. Discográfica. (Obra original publicada en Año). Moderna: Artista. (Año). Título [Álbum]. Discográfica.',
    parentheticalCitation: '(Compositor, Año original/Año versión) o (Artista, Año)', narrativeCitation: 'Compositor (Año original/Año versión) o Artista (Año)',
    rules: ['En música clásica, el compositor es autor y el intérprete se identifica después del título.', 'En música moderna, el artista que realizó la grabación es autor.', 'No indica Spotify, CD u otra plataforma salvo que identifique una versión relevante; añade URL solo cuando es el único medio de recuperación.'],
  },
  'song-or-track': {
    ...audioBase, id: 'song-or-track', label: 'Canción o pista', manualExample: 92, manualPrintedPages: '351',
    requiredMetadata: ['compositor clásico o artista de grabación', 'año', 'título de la canción', 'intérprete si difiere', 'álbum si existe', 'discográfica(s)', 'año original si corresponde', 'URL solo si es único medio'],
    referenceTemplate: 'Autor musical. (Año). Título de la canción [Canción; grabada por Intérprete si corresponde]. En Título del álbum, si existe. Discográfica(s). (Obra original publicada en Año original)',
    parentheticalCitation: '(Autor musical, Año original/Año versión o Año)', narrativeCitation: 'Autor musical (Año original/Año versión o Año)',
    rules: ['Omite el elemento álbum cuando la canción no pertenece a uno.', 'Usa URL solo cuando esa ubicación es el único medio de recuperación.'],
  },
  'podcast-series': {
    ...audioBase, id: 'podcast-series', label: 'Pódcast completo', manualExample: 93, manualPrintedPages: '351',
    requiredMetadata: ['anfitrión o productor ejecutivo', 'rol', 'años de publicación', 'título', 'tipo audio/video', 'productora', 'URL si se conoce'],
    referenceTemplate: 'Anfitrión, A. A. (Anfitrión). (Año inicial–presente o Año final). Título [Pódcast de audio o video]. Productora. URL',
    parentheticalCitation: '(Anfitrión, Años)', narrativeCitation: 'Anfitrión (Años)',
    rules: ['El anfitrión ocupa la posición de autor; alternativamente, usa productores ejecutivos conocidos.', 'Incluye el rol y especifica si es pódcast de audio o video.', 'Si la URL se desconoce porque se accedió desde una aplicación, omítela.'],
  },
  'podcast-episode': {
    ...audioBase, id: 'podcast-episode', label: 'Episodio de pódcast', manualExample: 94, manualPrintedPages: '351',
    requiredMetadata: ['anfitrión del episodio', 'rol', 'fecha completa', 'título', 'número si existe', 'tipo audio/video', 'pódcast contenedor', 'productora', 'URL si se conoce'],
    referenceTemplate: 'Anfitrión, A. A. (Anfitrión). (Año, día de mes). Título (N.º x) [Episodio de pódcast de audio o video]. En Título del pódcast. Productora. URL',
    parentheticalCitation: '(Anfitrión, Año)', narrativeCitation: 'Anfitrión (Año)',
    rules: ['Omite el número si el pódcast no numera episodios.', 'Si la URL se desconoce por acceso desde una aplicación, omítela.'],
  },
  'archived-radio-interview': {
    ...audioBase, id: 'archived-radio-interview', label: 'Grabación de entrevista de radio en archivo', manualExample: 95, manualPrintedPages: '352',
    requiredMetadata: ['persona entrevistada', 'fecha completa', 'título', 'descripción entrevista', 'archivo', 'institución/museo si corresponde', 'URL'],
    referenceTemplate: 'Entrevistado, A. A. (Año, día de mes). Título [Entrevista]. Archivo; Institución. URL',
    parentheticalCitation: '(Entrevistado, Año)', narrativeCitation: 'Entrevistado (Año)',
    rules: ['En entrevistas recuperadas desde archivos digitales o físicos, la persona entrevistada ocupa la posición de autor.'],
  },
  'speech-audio-recording': {
    ...audioBase, id: 'speech-audio-recording', label: 'Grabación de audio de un discurso', manualExample: 96, manualPrintedPages: '352',
    requiredMetadata: ['orador', 'fecha completa', 'título', 'descripción de grabación', 'sitio/archivo', 'URL'],
    referenceTemplate: 'Orador, A. A. (Año, día de mes). Título [Grabación de audio de un discurso]. Sitio o archivo. URL',
    parentheticalCitation: '(Orador, Año)', narrativeCitation: 'Orador (Año)',
    rules: ['El orador ocupa la posición de autor.', 'Una cita textual de audio utiliza una marca de tiempo real.'],
  },
};

export function getAudiovisualAudioCase(id: AudiovisualAudioCaseId): Apa7VerifiedAudiovisualAudioCase {
  return audiovisualAudioCases[id];
}
