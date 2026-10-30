/**
 * Contenido de las páginas de APA 7 de /herramientas/, compartido entre el HTML, la versión en Markdown
 * (index.md) y llms-full.txt, para que no se desincronicen.
 */
export const formatChecks = [
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

export const formatFaq = [
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

export const normasEssentials = [
  ['Cita en el texto', 'Autor (año) o (Autor, año). Con tres o más autores, solo el primero y «et al.», desde la primera cita. Con dos autores, «y» dentro de la frase y «&» entre paréntesis.'],
  ['Cita textual corta', 'Menos de 40 palabras: entre comillas, con apellido, año y página.'],
  ['Cita textual larga', '40 palabras o más: en bloque aparte, sin comillas y con sangría de 1,27 cm.'],
  ['Lista de referencias', 'Título «Referencias», página nueva, orden alfabético, doble espacio y sangría francesa de 1,27 cm. Solo lleva lo que citaste.'],
  ['Autores en la referencia', 'Se escriben todos hasta 20. Con 21 o más, los primeros 19, puntos suspensivos y el último.'],
  ['DOI y enlaces', 'Como enlace completo: https://doi.org/… Sin la etiqueta «DOI:» y sin punto final.'],
  ['Formato del documento', 'Interlineado doble, márgenes de 2,54 cm y número de página arriba a la derecha. Los pasos de Word están en la guía de formato.'],
];

export const normasChanges = [
  ['Ciudad de la editorial', 'Se escribía en los libros.', 'Ya no se escribe.'],
  ['Autores en la referencia', 'Hasta 7.', 'Hasta 20.'],
  ['Citas con 3 o más autores', 'En la primera cita, 3 a 5 autores completos.', '«et al.» desde la primera cita.'],
  ['DOI', 'Con la etiqueta «doi:» o como código.', 'Enlace https://doi.org/…, sin etiqueta.'],
  ['«Recuperado de»', 'Se ponía en casi todo lo que tenía enlace.', 'Solo en contenido que cambia con el tiempo.'],
];

export const normasFaq = [
  ['¿Qué son las normas APA 7.ª edición?', 'Son las reglas de la Asociación Americana de Psicología para citar fuentes, armar la lista de referencias y presentar un trabajo. La 7.ª edición salió en 2019. Muchas universidades las usan, a veces con ajustes propios.'],
  ['¿Cuál es la diferencia entre citas, referencias y bibliografía?', 'Las citas van dentro del texto. Las referencias son la lista al final y solo incluyen lo que citaste. Una bibliografía incluye también lo que leíste sin citar; APA pide referencias.'],
  ['¿Cuándo uso «et al.»?', 'Con tres o más autores, desde la primera cita. Con dos autores se escriben siempre los dos.'],
  ['¿Las normas APA son iguales en todas las universidades?', 'No siempre. Cada universidad o docente puede pedir ajustes: fuente, interlineado, portada o tipo de referencia. Lo que pida tu docente manda sobre APA, y en el texto para tu IA esa regla está puesta primero.'],
  ['¿Dónde está el manual oficial?', 'En las páginas de APA Style (apastyle.apa.org) y en el Publication Manual de la APA, 7.ª edición. Esta página es un resumen, no el manual.'],
  ['¿Qué hace el texto para mi IA?', 'Revisa citas, referencias y formato de tu trabajo, te muestra una lista de lo que está mal y espera tu confirmación antes de cambiar algo. El texto le pide a tu IA que trabaje sobre una copia.'],
  ['¿Es una guía oficial?', 'No. Es una versión beta hecha por Campus, basada en el manual APA 7, las páginas de APA Style y la guía de Biblioteca UPC, entre otras fuentes. No está avalada por ninguna institución.'],
];

type Pair = readonly string[];
const list = (items: readonly Pair[]) => items.map(([name, text]) => `- **${name}.** ${text}`).join("\n");
const faqMarkdown = (items: readonly Pair[]) => items.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n");

export const formatMarkdown = () => [
  "Pega este texto en tu IA y revisa interlineado, sangrías, márgenes, citas y referencias antes de entregar. Es una versión beta hecha por Campus, no una guía oficial. El texto para pegar está en https://campuscli.com/skills/apa7-campus-pegable.md.",
  "",
  "## Qué revisa",
  "",
  list(formatChecks),
  "",
  "Los valores de formato son los que usa APA 7 por defecto. Si tu curso pide otros, ellos mandan.",
  "",
  "## Preguntas frecuentes",
  "",
  faqMarkdown(formatFaq),
].join("\n");

export const normasMarkdown = () => [
  "Citas, referencias y formato en un solo lugar, y qué cambió desde la 6.ª edición. Es un resumen hecho por Campus, no el manual oficial. El texto para que tu IA revise tu trabajo está en https://campuscli.com/skills/apa7-campus-pegable.md.",
  "",
  "## Lo esencial",
  "",
  list(normasEssentials),
  "",
  "## De la 6.ª a la 7.ª edición",
  "",
  "| Elemento | 6.ª edición | 7.ª edición |",
  "|---|---|---|",
  ...normasChanges.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`),
  "",
  "Resumen hecho con guías de bibliotecas universitarias. No es el manual oficial: confirma los detalles en APA Style.",
  "",
  "## Preguntas frecuentes",
  "",
  faqMarkdown(normasFaq),
].join("\n");
