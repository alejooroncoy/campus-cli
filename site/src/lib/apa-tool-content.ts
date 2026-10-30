/**
 * Contenido de las páginas de APA 7 de /herramientas/, compartido entre el HTML, la versión en Markdown
 * (index.md) y llms-full.txt, para que no se desincronicen.
 */
type Pair = readonly [string, string];
type Row = readonly [string, string, string];

export const formatChecks: readonly Pair[] = [
  ['Interlineado', 'Doble en todo el trabajo, también en las referencias.'],
  ['Espacio entre párrafos', 'Ninguno extra: 0 pt antes y después.'],
  ['Sangría', 'Primera línea a 1,27 cm; sangría francesa de 1,27 cm en las referencias.'],
  ['Alineación', 'A la izquierda, sin justificar.'],
  ['Márgenes y fuente', '2,54 cm por los cuatro lados y una sola fuente legible.'],
  ['Número de página', 'Arriba a la derecha, en todas las páginas.'],
  ['Encabezados y citas largas', 'Nivel 1 centrado y en negrita; citas de 40 palabras o más en bloque.'],
  ['Citas y referencias', 'Autores, año, cursivas, orden alfabético y correspondencia entre el texto y la lista.'],
  ['Tablas y figuras', 'Rótulo, título, llamado en el texto, bordes y nota de procedencia.'],
];

export const formatFaq: readonly Pair[] = [
  ['¿Cómo pongo el formato APA 7.ª edición en Word?', 'Interlineado doble y 0 pt de espacio antes y después, sangría de primera línea de 1,27 cm, márgenes de 2,54 cm, una fuente legible y el número de página arriba a la derecha. Más abajo están los pasos de Word, y el texto para tu IA lo revisa contigo.'],
  ['¿APA 7 pide doble espacio también en las referencias?', 'Sí. Se usa doble espacio en todo el trabajo, incluida la lista de referencias, y sin espacio extra entre una entrada y la siguiente.'],
  ['¿Qué sangría llevan los párrafos y las referencias?', 'La primera línea de cada párrafo va a 1,27 cm del margen (0,5 pulgadas). Las referencias llevan sangría francesa de 1,27 cm: la primera línea pegada al margen y las siguientes sangradas.'],
  ['¿Dónde va el número de página?', 'Arriba a la derecha, en el encabezado, en todas las páginas.'],
  ['¿Y si mi docente pide otro formato?', 'Manda lo que pida tu docente, tu rúbrica o la plantilla del curso. El texto le indica a la IA que te pregunte antes de cambiar nada.'],
  ['¿Cambia mi archivo original?', 'El texto le pide a tu IA que trabaje sobre una copia y que solo aplique lo que apruebes. Si tu IA edita el documento abierto (complementos de Word o Google Docs), guarda un duplicado antes. Con un PDF puede detectar problemas, pero no editarlo: necesita tu archivo de Word u otro editable.'],
  ['¿Revisa también mis citas y referencias?', 'Sí, la forma: autores, año, cursivas, orden y que cada cita tenga su referencia. No comprueba que la fuente respalde lo que afirmas; eso lo marca como no verificable.'],
  ['¿Puedo usarlo con Claude en Word o en Google Docs?', 'Sí, pegándolo en la barra lateral del complemento, según su documentación. Como editan el documento abierto, el texto les pide que uses el control de cambios o el historial de versiones para poder deshacer. No lo hemos probado dentro de esos complementos.'],
  ['¿Campus lee mis notas o mis comentarios?', 'Solo si tú lo permites. El texto le pide a tu IA que solo lea y que use únicamente la actividad que le indiques, pero las herramientas devuelven los datos de todo el curso y esos datos pasan por tu proveedor de IA. Pide que limite la consulta a un curso y una actividad. El texto le prohíbe enviar, guardar o subir nada en Blackboard.'],
  ['¿Necesito cuenta para copiar el texto?', 'No. Copiarlo o descargarlo es gratis y no pide registro. Campus solo hace falta si quieres que tu IA lea las instrucciones de tu aula virtual.'],
  ['¿Es una guía oficial?', 'No. Es una versión beta hecha por Campus, basada en el manual APA 7, las páginas de APA Style y la guía de Biblioteca UPC, entre otras fuentes. No está avalada por ninguna institución.'],
];

export const normasEssentials: readonly Pair[] = [
  ['Cita en el texto', 'Autor (año) o (Autor, año). Con tres o más autores, solo el primero y «et al.», desde la primera cita. Con dos autores, «y» dentro de la frase y «&» entre paréntesis.'],
  ['Cita textual corta', 'Menos de 40 palabras: entre comillas, con apellido, año y página.'],
  ['Cita textual larga', '40 palabras o más: en bloque aparte, sin comillas y con sangría de 1,27 cm.'],
  ['Lista de referencias', 'Título «Referencias», página nueva, orden alfabético, doble espacio y sangría francesa de 1,27 cm. Solo lleva lo que citaste.'],
  ['Autores en la referencia', 'Se escriben todos hasta 20. Con 21 o más, los primeros 19, puntos suspensivos y el último.'],
  ['DOI y enlaces', 'Como enlace completo: https://doi.org/… Sin la etiqueta «DOI:» y sin punto final.'],
  ['Formato del documento', 'Interlineado doble, márgenes de 2,54 cm y número de página arriba a la derecha. Los pasos para aplicarlo en Word están en la guía de formato APA 7.'],
];

export const normasChanges: readonly Row[] = [
  ['Ciudad de la editorial', 'Se escribía en los libros.', 'Ya no se escribe.'],
  ['Autores en la referencia', 'Hasta 7.', 'Hasta 20.'],
  ['Citas con 3 o más autores', 'En la primera cita, 3 a 5 autores completos.', '«et al.» desde la primera cita.'],
  ['DOI', 'Con la etiqueta «doi:» o como código.', 'Enlace https://doi.org/…, sin etiqueta.'],
  ['«Recuperado de»', 'Se ponía en casi todo lo que tenía enlace.', 'Solo en contenido que cambia con el tiempo.'],
];

export const normasFaq: readonly Pair[] = [
  ['¿Qué son las normas APA 7.ª edición?', 'Son las reglas de la Asociación Americana de Psicología para citar fuentes, armar la lista de referencias y presentar un trabajo. La 7.ª edición salió en 2019. Muchas universidades las usan, a veces con ajustes propios.'],
  ['¿Cuál es la diferencia entre citas, referencias y bibliografía?', 'Las citas van dentro del texto. Las referencias son la lista al final y solo incluyen lo que citaste. Una bibliografía incluye también lo que leíste sin citar; APA pide referencias.'],
  ['¿Cuándo uso «et al.»?', 'Con tres o más autores, desde la primera cita. Con dos autores se escriben siempre los dos.'],
  ['¿Las normas APA son iguales en todas las universidades?', 'No siempre. Cada universidad o docente puede pedir ajustes: fuente, interlineado, portada o tipo de referencia. Lo que pida tu docente manda sobre APA, y en el texto para tu IA esa regla está puesta primero.'],
  ['¿Dónde está el manual oficial?', 'En las páginas de APA Style (apastyle.apa.org) y en el Publication Manual de la APA, 7.ª edición. Esta página es un resumen, no el manual.'],
  ['¿Qué hace el texto para mi IA?', 'Revisa citas, referencias y formato de tu trabajo, te muestra una lista de lo que está mal y espera tu confirmación antes de cambiar algo. El texto le pide a tu IA que trabaje sobre una copia.'],
  ['¿Es una guía oficial?', 'No. Es una versión beta hecha por Campus, basada en el manual APA 7, las páginas de APA Style y la guía de Biblioteca UPC, entre otras fuentes. No está avalada por ninguna institución.'],
];

const list = (items: readonly Pair[]) => items.map(([name, text]) => `- **${name}.** ${text}`).join("\n");
/** Una celda de tabla Markdown: sin `|` ni saltos de línea, que partirían la fila. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const faqMarkdown = (items: readonly Pair[]) => items.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n");

/** Datos de cada página que comparten el HTML, el Markdown y llms-full.txt. */
export const formatMeta = {
  title: "Formato APA 7.ª edición: revisa tu trabajo",
  description: "Pega este texto en tu IA y revisa interlineado, sangrías, márgenes, citas y referencias antes de entregar. Beta, no es una guía oficial.",
  canonical: "https://campuscli.com/herramientas/formato-apa-7/",
} as const;

export const normasMeta = {
  title: "Normas APA 7.ª edición: lo esencial y qué cambió",
  description: "Resumen de las normas APA 7.ª edición y de qué cambió desde la 6.ª. No es el manual oficial.",
  canonical: "https://campuscli.com/herramientas/normas-apa-7ma-edicion/",
} as const;

const SKILL_URL = "https://campuscli.com/skills/apa7-campus-pegable.md";

const disclaimer =
  "**No es una guía oficial ni está avalada por ninguna institución.** Campus es independiente (https://campuscli.com/no-afiliacion/). Puede equivocarse: revisa lo que cambie antes de entregar.";

const steps = [
  "1. **Copia el texto.** Son instrucciones para tu IA: " + SKILL_URL,
  "2. **Pégalo en tu IA** y adjunta tu trabajo. Un archivo de Word se corrige; un PDF solo se revisa.",
  "3. **Confirma los cambios.** Te pregunta antes de tocar nada.",
].join("\n");

const wordSteps = [
  "### Interlineado doble y sin espacio entre párrafos",
  "",
  "Selecciona todo el texto con Ctrl + A (⌘ + A en Mac). En Inicio, abre Párrafo, elige Interlineado: Doble y pon Espaciado antes y después en 0 pt.",
  "",
  "### Sangría de primera línea y sangría francesa",
  "",
  "En Párrafo, abre Sangría especial. Para los párrafos del texto elige Primera línea con 1,27 cm. Para la lista de referencias elige Francesa con 1,27 cm.",
  "",
  "### Número de página arriba a la derecha",
  "",
  "En Insertar, abre Número de página, elige Principio de página y escoge el que queda a la derecha.",
  "",
  "### Márgenes de 2,54 cm",
  "",
  "En Diseño, abre Márgenes, elige Márgenes personalizados y pon 2,54 cm en Superior, Inferior, Izquierdo y Derecho. Los nombres de los menús pueden cambiar según tu versión de Word.",
].join("\n");

const addins = [
  "Algunos asistentes se instalan como complemento y editan el documento que tienes abierto. Ahí no hay copia aparte, así que el texto les pide que te avisen antes y que uses el control de cambios o el historial de versiones para poder deshacer.",
  "",
  "### Claude para Word",
  "",
  "Complemento de barra lateral. Según su documentación, tiene un modo de control de cambios: cada edición queda como una revisión que aceptas o rechazas en el panel de Word. Trabaja con archivos .docx (un .doc hay que guardarlo antes como .docx) y pide usarlo solo con documentos de confianza. Documentación: https://www.claude.com/docs/office-agents/word",
  "",
  "### Claude en Google Docs",
  "",
  "Complemento en beta, disponible en los planes de pago de Claude: se abre desde Extensiones, Claude, Abrir Claude. Según su documentación, en el modo por defecto cada cambio aparece como una tarjeta de aprobación y espera tu respuesta; existe otro modo que aplica todo sin preguntar, así que no lo actives. Edita el documento abierto: antes de empezar, guarda un duplicado o confirma que puedes deshacer desde el historial de versiones de Google Docs. Más información: https://claude.com/resources/articles/claude-now-works-in-google-docs-sheets-and-slides",
  "",
  "### Codex y ChatGPT en Word",
  "",
  "No encontramos un complemento de Codex para Word. OpenAI sí ofrece ChatGPT para Word, disponible en todos los planes, incluido el gratis, y el texto funciona igual: se pega en su barra lateral. Ayuda de OpenAI: https://help.openai.com/es-es/articles/20001526-chatgpt-for-word",
  "",
  "**Lo que no hemos probado:** el texto está probado con asistentes que leen un archivo adjunto, pero no dentro de estos complementos. Su disponibilidad depende de tu plan y de la versión de Word, y pueden limitar el largo de lo que pegas. Si no te deja pegarlo completo, descárgalo y adjúntalo.",
].join("\n");

const sources = [
  "Cuando las fuentes no coinciden manda este orden: lo que pida tu docente, la guía de Biblioteca UPC y el manual APA 7.",
  "",
  "- APA Style, páginas oficiales (https://apastyle.apa.org) y el *Publication Manual* de la APA, 7.ª edición.",
  "- Citas y referencias en APA 7, Biblioteca UPC (https://biblioteca.upc.edu.pe/citas-referencias-APA7).",
].join("\n");

const teacherNote =
  "¿Tu docente pidió algo distinto? Esa instrucción manda sobre APA. Con tu permiso, Campus puede leer en tu aula virtual el enunciado y los comentarios de tus entregas; el texto le pide a tu IA que solo lea.";

export const formatMarkdown = () => [
  "Pega este texto en tu IA y revisa interlineado, sangrías, márgenes, citas y referencias antes de entregar. Es una versión beta hecha por Campus, no una guía oficial. Copiar el texto es gratis y no pide registro.",
  "",
  "## Cómo se usa",
  "",
  steps,
  "",
  "## Qué revisa",
  "",
  list(formatChecks),
  "",
  "Los valores de formato son los que usa APA 7 por defecto. Si tu curso pide otros, ellos mandan.",
  "",
  teacherNote,
  "",
  "## Hacerlo a mano en Word",
  "",
  wordSteps,
  "",
  "## Preguntas frecuentes",
  "",
  faqMarkdown(formatFaq),
  "",
  "## Dentro de Word o Google Docs",
  "",
  addins,
  "",
  "## Fuentes y alcance",
  "",
  sources,
  "",
  disclaimer,
].join("\n");

export const normasMarkdown = () => [
  "Citas, referencias y formato en un solo lugar, y qué cambió desde la 6.ª edición. Es un resumen hecho por Campus, no el manual oficial. El texto para que tu IA revise tu trabajo está en " + SKILL_URL + ".",
  "",
  "## Lo esencial",
  "",
  list(normasEssentials),
  "",
  "Si tu docente o tu curso piden otra cosa, esa instrucción manda. Formato APA 7 paso a paso en Word: " + formatMeta.canonical,
  "",
  teacherNote,
  "",
  "## De la 6.ª a la 7.ª edición",
  "",
  "| Elemento | 6.ª edición | 7.ª edición |",
  "|---|---|---|",
  ...normasChanges.map(([a, b, c]) => `| ${cell(a)} | ${cell(b)} | ${cell(c)} |`),
  "",
  "Resumen hecho con guías de bibliotecas universitarias, como las de Massey University (https://owll.massey.ac.nz/referencing/apa-6th-vs-7th-edition.php) y Nova Southeastern University (https://libguides.nova.edu/apa/differences_from_6th_ed). No es el manual oficial: confirma los detalles en APA Style.",
  "",
  "## Preguntas frecuentes",
  "",
  faqMarkdown(normasFaq),
  "",
  "## Fuentes y alcance",
  "",
  sources,
  "",
  disclaimer,
].join("\n");
