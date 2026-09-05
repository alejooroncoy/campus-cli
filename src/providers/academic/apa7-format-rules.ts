import { z } from 'zod';

export const formatRuleId = z.enum([
  'professional-paper-required-elements',
  'student-paper-required-elements',
  'title-page',
  'paper-title',
  'author-byline',
  'author-affiliation',
  'author-note',
  'running-head',
  'abstract',
  'keywords',
  'paper-body',
  'reference-list-element',
  'footnotes',
  'appendices',
  'supplemental-materials',
  'format-importance',
  'page-order',
  'page-header',
  'typography',
  'special-characters',
  'line-spacing',
  'margins',
  'paragraph-alignment',
  'paragraph-indentation',
  'paper-length',
  'organization-principles',
  'heading-levels',
  'section-labels',
]);

export type FormatRuleId = z.infer<typeof formatRuleId>;

export interface Apa7VerifiedFormatRule {
  id: FormatRuleId;
  label: string;
  manualSection: `2.${number}`;
  manualPrintedPages: string;
  status: 'verified';
  audience: 'professional' | 'student' | 'both';
  rules: string[];
  citationReferenceImpact: string[];
  refuseWhen: string[];
}

const verified = (rule: Omit<Apa7VerifiedFormatRule, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): Apa7VerifiedFormatRule => ({
  ...rule,
  status: 'verified',
  refuseWhen: rule.refuseWhen ?? [
    'No se confirmó si el trabajo es estudiantil o profesional.',
    'La rúbrica o plantilla del curso exige una variante diferente.',
    'Se pretende completar un dato institucional o personal por conjetura.',
  ],
});

export const formatRules: Record<FormatRuleId, Apa7VerifiedFormatRule> = {
  'professional-paper-required-elements': verified({
    id: 'professional-paper-required-elements', label: 'Elementos de un escrito profesional', manualSection: '2.1', manualPrintedPages: '29', audience: 'professional',
    rules: ['Incluye página de título con título, autores, afiliaciones y nota del autor.', 'Incluye título abreviado y número de página en el encabezado.', 'Incluye resumen, texto y lista de referencias.', 'Puede incluir palabras clave, notas al pie, tablas, figuras, apéndices y materiales suplementarios.', 'Para un manuscrito destinado a publicación, las instrucciones de la revista pueden añadir o modificar requisitos.'],
    citationReferenceImpact: ['El texto y las referencias conservan las reglas de los capítulos 8-10.', 'Las tablas, figuras y suplementos que incorporen material ajeno también requieren atribución.'],
  }),
  'student-paper-required-elements': verified({
    id: 'student-paper-required-elements', label: 'Elementos de un escrito estudiantil', manualSection: '2.2', manualPrintedPages: '30', audience: 'student',
    rules: ['Incluye como mínimo página de título estudiantil, números de página, texto y lista de referencias.', 'Puede incluir tablas, figuras y apéndices cuando el trabajo los necesite.', 'No suele incluir título abreviado, nota del autor ni resumen, salvo solicitud expresa del docente o la institución.', 'La consigna, rúbrica o plantilla del curso determina cualquier requisito adicional.'],
    citationReferenceImpact: ['La lista de referencias sigue siendo obligatoria para las obras recuperables citadas.', 'Una tabla, figura o apéndice no elimina la obligación de citar el material ajeno que contenga.'],
  }),
  'title-page': verified({
    id: 'title-page', label: 'Página de título', manualSection: '2.3', manualPrintedPages: '30-32', audience: 'both',
    rules: ['Todo escrito APA usa página de título, en versión profesional o estudiantil.', 'La profesional contiene título, autores, afiliaciones, nota del autor, título abreviado y número de página.', 'La estudiantil contiene título, autores, afiliación, número y nombre del curso, nombre del docente, fecha de entrega y número de página.', 'En un trabajo estudiantil prevalece la variante exigida por el docente o institución.', 'En la página estudiantil, curso, docente y fecha se escriben en líneas separadas, centradas y en ese orden después de la afiliación.', 'Escribe la fecha de entrega con el mes en palabras y el orden usado en el país.'],
    citationReferenceImpact: ['La página de título no lleva citas ni referencias por sí misma.', 'Los nombres del pie de autor deben ser consistentes con la autoría del trabajo, pero no se convierten en una entrada bibliográfica.'],
  }),
  'paper-title': verified({
    id: 'paper-title', label: 'Título del escrito', manualSection: '2.4', manualPrintedPages: '32-33', audience: 'both',
    rules: ['Resume la idea principal de forma sencilla, enfocada y concisa.', 'En investigación identifica el tema principal y, cuando corresponda, las variables o cuestiones y su relación.', 'Incluye términos esenciales para facilitar búsqueda e indexación; elimina palabras sin propósito.', 'Evita frases vacías como “un estudio de” y abreviaturas innecesarias.', 'Escribe el título en title case, negrita y centrado, en la mitad superior de la página de título.', 'Deja una línea en blanco a doble espacio antes del pie de autor.', 'Puede dividirse título y subtítulo en líneas a doble espacio si es largo.', 'Repite el título en la parte superior de la primera página del texto.'],
    citationReferenceImpact: ['No se añade una cita al título del propio trabajo.', 'Si el título menciona una obra ajena, la fuente se acredita en el texto donde se discute, no dentro del título.'],
  }),
  'author-byline': verified({
    id: 'author-byline', label: 'Nombre del autor o pie de autor', manualSection: '2.5', manualPrintedPages: '33', audience: 'both',
    rules: ['Usa la forma preferida y consistente del nombre: nombre, inicial del segundo nombre si se usa y apellido.', 'Omite títulos profesionales y grados académicos.', 'Coloca el pie de autor centrado, en letra estándar, después del título y una línea en blanco a doble espacio.', 'Ordena varios autores según sus contribuciones.', 'Separa dos nombres con “y”; con tres o más, usa comas y “y” antes del último.', 'En un nombre con sufijo, separa el sufijo con un espacio, no con coma.'],
    citationReferenceImpact: ['El pie de autor identifica a quienes escribieron el trabajo; no es una cita.', 'La forma consistente del nombre ayuda a evitar confundir registros bibliográficos de una misma persona.'],
  }),
  'author-affiliation': verified({
    id: 'author-affiliation', label: 'Afiliación del autor', manualSection: '2.6', manualPrintedPages: '33-35', audience: 'both',
    rules: ['Indica dónde trabajó o estudió cada autor cuando se realizó el trabajo.', 'Para estudiantes suele ser la universidad e incluye departamento o división cuando corresponda.', 'Incluye dos afiliaciones solo si ambas dieron apoyo sustancial y no incluyas más de dos por autor.', 'Si la afiliación cambió después, presenta la actual en la nota del autor del escrito profesional.', 'Cuando todos comparten una o dos afiliaciones, colócalas centradas en líneas propias sin superíndices.', 'Cuando autores diferentes tienen afiliaciones distintas, vincúlalos con números arábigos en superíndice y lista las afiliaciones en el orden de los autores.', 'Los autores grupales normalmente no usan superíndice porque el grupo constituye su propia afiliación.'],
    citationReferenceImpact: ['La afiliación del autor del trabajo no forma parte de sus citas ni de su lista de referencias.', 'Una afiliación institucional no convierte automáticamente a la institución en autora de las fuentes citadas.'],
  }),
  'author-note': verified({
    id: 'author-note', label: 'Nota del autor', manualSection: '2.7', manualPrintedPages: '35-38', audience: 'professional',
    rules: ['La nota del autor aporta información sobre autores, registro del estudio, intercambio de datos, conflictos, financiación, agradecimientos y contacto.', 'Organízala en hasta cuatro bloques: ORCID; cambios de afiliación; declaraciones y agradecimientos; e información de contacto.', 'Incluye ORCID únicamente para quienes lo tengan y conserva el símbolo dentro del enlace.', 'Declara registro, datos/materiales abiertos, reportes relacionados, conflictos de intereses y apoyo financiero cuando correspondan.', 'Cita y referencia un conjunto de datos compartido y cualquier reporte previo en que se base el artículo.', 'No agradezcas a revisores o editores por tareas habituales; una idea específica de un revisor se reconoce mediante nota al pie donde se discute.', 'Coloca la nota en la mitad inferior de la página de título; etiqueta “Nota del autor” centrada y en negrita, y párrafos alineados a la izquierda con sangría.', 'Normalmente no se exige en trabajos estudiantiles salvo indicación expresa.'],
    citationReferenceImpact: ['Los reportes previos y conjuntos de datos mencionados como base del estudio requieren cita en el texto y entrada en referencias.', 'Declaraciones de financiación, ORCID y datos de contacto no son referencias bibliográficas.'],
  }),
  'running-head': verified({
    id: 'running-head', label: 'Título abreviado', manualSection: '2.8', manualPrintedPages: '37-38', audience: 'professional',
    rules: ['Es una versión abreviada del título que aparece en el encabezado de cada página.', 'Solo se requiere normalmente para manuscritos profesionales destinados a publicación; un trabajo estudiantil lleva solo el número de página, salvo solicitud.', 'Limítalo a un máximo de 50 caracteres, contando letras, puntuación y espacios.', 'Conserva la idea del título; puede cambiar palabras u orden y debe evitar abreviaturas innecesarias.', 'Escríbelo en mayúsculas, alineado al margen izquierdo, a la altura del número de página alineado a la derecha.', 'Usa exactamente el mismo título abreviado en todas las páginas y no escribas la etiqueta “Título abreviado”.'],
    citationReferenceImpact: ['El título abreviado no cambia ninguna cita ni entrada de referencia.'],
  }),
  abstract: verified({
    id: 'abstract', label: 'Resumen', manualSection: '2.9', manualPrintedPages: '38', audience: 'both',
    rules: ['Resume breve y detalladamente el contenido del escrito.', 'Los manuscritos profesionales suelen requerirlo; un escrito estudiantil normalmente no, salvo solicitud del docente o institución.', 'Sigue la extensión y estructura exigidas por la revista; como regla general, 250 palabras o menos.', 'Colócalo en página propia después de la página de título.', 'Escribe “Resumen” en negrita y centrado arriba.', 'Un resumen de párrafo se escribe como un solo párrafo sin sangría inicial.', 'Un resumen estructurado también forma un solo párrafo sin sangría y usa etiquetas para sus secciones según la revista.'],
    citationReferenceImpact: ['El resumen normalmente describe el trabajo sin introducir referencias nuevas; cualquier atribución necesaria debe corresponder con la lista del escrito.'],
  }),
  keywords: verified({
    id: 'keywords', label: 'Palabras clave', manualSection: '2.10', manualPrintedPages: '38-39', audience: 'both',
    rules: ['Selecciona palabras, frases o acrónimos que describan los aspectos centrales y faciliten la indexación.', 'Para revistas APA se proporcionan normalmente de tres a cinco; en trabajos estudiantiles no se exigen salvo solicitud.', 'Una línea después del resumen, escribe “Palabras clave:” en cursiva y con sangría de 0.5 pulgadas o 1.27 cm.', 'Escribe las palabras en minúscula salvo nombres propios, separadas por comas y sin punto final.', 'Si continúan en otra línea, la segunda línea no lleva sangría.'],
    citationReferenceImpact: ['Las palabras clave no llevan citas ni generan referencias.'],
  }),
  'paper-body': verified({
    id: 'paper-body', label: 'Texto o cuerpo', manualSection: '2.11', manualPrintedPages: '39', audience: 'both',
    rules: ['Organiza el cuerpo según el tipo y propósito del escrito; no todos requieren las mismas secciones.', 'Un trabajo cuantitativo suele usar Método, Resultados y Discusión; uno cualitativo puede emplear Hallazgos u otra estructura.', 'Un escrito estudiantil breve puede no necesitar encabezados.', 'Comienza el texto en página nueva después de la página de título y del resumen si existe.', 'Repite el título del trabajo en negrita, centrado y en title case en la primera línea.', 'Alinea el texto a la izquierda, usa doble espacio y sangra 0.5 pulgadas o 1.27 cm la primera línea de cada párrafo.', 'No inicies página nueva ni añadas líneas en blanco antes de cada encabezado.'],
    citationReferenceImpact: ['Aplica en el cuerpo todas las reglas verificadas del capítulo 8 y vincula cada cita recuperable con su referencia.'],
  }),
  'reference-list-element': verified({
    id: 'reference-list-element', label: 'Lista de referencias como elemento del escrito', manualSection: '2.12', manualPrintedPages: '39-40', audience: 'both',
    rules: ['Incluye las obras citadas que permiten fundamentar y contextualizar el escrito.', 'Comienza en página nueva después del texto y antes de tablas, figuras o apéndices colocados al final.', 'Usa “Referencias” en negrita y centrado.', 'Aplica doble espacio y sangría francesa de 0.5 pulgadas o 1.27 cm a todas las entradas.', 'Para construcción y orden exactos aplica las 52 reglas verificadas del capítulo 9.'],
    citationReferenceImpact: ['Cada cita recuperable debe corresponder con una entrada y cada entrada debe estar citada, salvo excepciones documentadas.'],
  }),
  footnotes: verified({
    id: 'footnotes', label: 'Notas al pie', manualSection: '2.13', manualPrintedPages: '40-41', audience: 'both',
    rules: ['Usa notas breves para contenido adicional útil o atribuciones de derechos de autor.', 'Una nota de contenido complementa una idea y no debe contener información compleja, irrelevante o esencial; si se vuelve extensa, integra la información en el texto o un apéndice.', 'La atribución de derechos de una cita larga o ítem reproducido suele ir en nota al pie; la de una tabla o figura se coloca en la nota de la propia tabla o figura.', 'Numera consecutivamente con arábigos en superíndice según aparecen.', 'Coloca el indicador después de la puntuación salvo ante un guion; no lo pongas en encabezados y no lo repitas al remitir de nuevo a la misma nota.', 'Puede colocarse cada nota al pie de su página o reunirlas en una página “Notas a pie de página” después de referencias.'],
    citationReferenceImpact: ['Una nota de contenido no sustituye la cita autor-fecha.', 'La atribución de derechos y la referencia bibliográfica son obligaciones diferentes; aplica ambas cuando correspondan.'],
  }),
  appendices: verified({
    id: 'appendices', label: 'Apéndices', manualSection: '2.14', manualPrintedPages: '41-42', audience: 'both',
    rules: ['Incluye material relativamente breve que ayuda a comprender, evaluar o replicar el trabajo, pero distraería dentro del texto.', 'Respeta ética, derechos de autor, representación correcta de datos y privacidad de participantes.', 'Comienza cada apéndice en página separada después de referencias, notas, tablas y figuras.', 'Con uno solo usa “Apéndice”; con varios usa Apéndice A, Apéndice B, etc., en el orden en que se mencionan.', 'Menciona cada apéndice al menos una vez en el texto.', 'Coloca etiqueta y título descriptivo en negrita, centrados y en líneas separadas.', 'Numera tablas y figuras internas con la letra del apéndice, como Tabla D1; si el apéndice contiene únicamente una tabla o figura, puede llevar el nombre del apéndice.'],
    citationReferenceImpact: ['El material ajeno incluido en un apéndice conserva su cita, referencia y, cuando corresponda, atribución de derechos.'],
  }),
  'supplemental-materials': verified({
    id: 'supplemental-materials', label: 'Materiales suplementarios', manualSection: '2.15', manualPrintedPages: '42-43', audience: 'professional',
    rules: ['Son archivos en línea que enriquecen el artículo y resultan más útiles descargables o difíciles de presentar en papel.', 'Los trabajos estudiantiles normalmente no los incluyen.', 'Pueden contener audio, video, animación, código, modelos, tablas grandes, protocolos, metodología ampliada, imágenes, plantillas o archivos de datos.', 'Incluye información suficiente para interpretar el suplemento junto con el texto.', 'Garantiza que los archivos se abran y sean accesibles para todos los lectores.', 'Los conjuntos de datos completos pueden alojarse en repositorios y requieren la referencia correspondiente.', 'Prefiere formatos ampliamente accesibles; evita ejecutables o formatos poco comunes salvo que sean críticos y aceptados por la revista.', 'Los suplementos publicados forman parte del registro permanente y no deben alterarse o eliminarse después.'],
    citationReferenceImpact: ['Cita y referencia los conjuntos de datos u obras ajenas incorporados al suplemento.', 'El enlace al suplemento no sustituye la referencia de una fuente externa reutilizada.'],
  }),
  'format-importance': verified({
    id: 'format-importance', label: 'Importancia del formato', manualSection: '2.16', manualPrintedPages: '43', audience: 'both',
    rules: ['Aplica el formato de manera consistente a todos los elementos del escrito.', 'La presentación debe facilitar que lectores, docentes, revisores y editores se concentren en el contenido.', 'Los errores mecánicos pueden inducir interpretaciones erróneas y perjudicar la evaluación.', 'Un manuscrito destinado a publicación debe prepararse correctamente aunque la editorial produzca después su versión tipográfica.'],
    citationReferenceImpact: ['El formato no corrige una cita o referencia incorrecta; contenido y presentación deben revisarse por separado.'],
  }),
  'page-order': verified({
    id: 'page-order', label: 'Orden de las páginas', manualSection: '2.17', manualPrintedPages: '43', audience: 'both',
    rules: ['Ordena: página de título; resumen si existe; texto; referencias; notas al pie reunidas; tablas; figuras; y apéndices.', 'La página de título es la página 1 y cada elemento principal posterior comienza en página nueva.', 'Las tablas y figuras también pueden incorporarse dentro del texto después de su primera mención.', 'Las notas pueden colocarse al pie de la página donde se mencionan o reunirse después de referencias.', 'Si no existe resumen, el texto comienza después de la página de título.'],
    citationReferenceImpact: ['Cambiar la ubicación de una tabla o figura no elimina su mención en el texto ni su atribución.', 'La lista de referencias se coloca después del texto aunque contenga las fuentes citadas en tablas o apéndices.'],
  }),
  'page-header': verified({
    id: 'page-header', label: 'Cornisa y número de página', manualSection: '2.18', manualPrintedPages: '44', audience: 'both',
    rules: ['Todos los escritos llevan número de página en la esquina superior derecha de cada página.', 'Usa la función automática del procesador de texto; no escribas los números manualmente.', 'La página de título es la página 1.', 'Un manuscrito profesional añade título abreviado alineado a la izquierda.', 'Un escrito estudiantil normalmente muestra solo el número, salvo que el docente o institución pida título abreviado.'],
    citationReferenceImpact: ['El número de página del manuscrito no se usa como localizador de las fuentes citadas.'],
  }),
  typography: verified({
    id: 'typography', label: 'Tipografía', manualSection: '2.19', manualPrintedPages: '44', audience: 'both',
    rules: ['Elige una tipografía accesible y usa la misma en todo el escrito.', 'Opciones sin serif: Calibri 11, Arial 11 o Lucida Sans Unicode 10.', 'Opciones con serif: Times New Roman 12, Georgia 11 o Computer Modern normal 10.', 'La consigna, revista o institución puede establecer otra tipografía.', 'Dentro de figuras puede usarse una fuente sin serif entre 8 y 14 puntos.', 'Para código informático puede usarse una fuente monoespaciada como Lucida Console 10 o Courier New 10.', 'Las notas al pie pueden conservar la configuración predeterminada del procesador.'],
    citationReferenceImpact: ['La tipografía no modifica el contenido de citas o referencias; debe conservar legibilidad, incluidos símbolos y enlaces.'],
    refuseWhen: ['No es correcto afirmar que Times New Roman 12 es la única fuente permitida por APA 7.', 'La rúbrica exige una tipografía distinta y no se respeta.', 'Se mezclan fuentes sin una excepción funcional prevista.'],
  }),
  'special-characters': verified({
    id: 'special-characters', label: 'Caracteres especiales', manualSection: '2.20', manualPrintedPages: '44', audience: 'both',
    rules: ['Inserta letras acentuadas, diacríticos, letras griegas, signos matemáticos y símbolos con la función de caracteres especiales o una herramienta apropiada.', 'Si un carácter no está disponible, puede presentarse como imagen.', 'Verifica que el carácter se renderice y sea accesible en el archivo final.'],
    citationReferenceImpact: ['Conserva diacríticos y caracteres especiales de nombres, títulos, DOI y URL para no alterar la identidad de la fuente.'],
  }),
  'line-spacing': verified({
    id: 'line-spacing', label: 'Espacio entre líneas', manualSection: '2.21', manualPrintedPages: '45', audience: 'both',
    rules: ['Usa doble espacio en página de título, resumen, cuerpo, encabezados, citas en bloque, referencias, notas de tablas y figuras y apéndices.', 'No añadas espacios extra entre párrafos ni antes o después de encabezados.', 'En la página de título deja las líneas en blanco previstas entre título, pie de autor, afiliación y nota.', 'El cuerpo de una tabla o el texto dentro de una figura puede usar espacio sencillo, 1.5 o doble según la presentación más eficaz.', 'Una nota al pie colocada abajo de la página puede ir a espacio sencillo; reunida en página propia va a doble espacio.', 'Puede usarse espacio triple o cuádruple antes y después de una ecuación desplegada.'],
    citationReferenceImpact: ['Las citas en bloque y la lista de referencias permanecen a doble espacio.'],
  }),
  margins: verified({
    id: 'margins', label: 'Márgenes', manualSection: '2.22', manualPrintedPages: '45', audience: 'both',
    rules: ['Usa márgenes de 1 pulgada o 2.54 cm en los cuatro lados.', 'Una tesis o disertación encuadernada puede exigir un margen diferente, por ejemplo 1.5 pulgadas a la izquierda.', 'La plantilla institucional prevalece cuando establece una variante justificada.'],
    citationReferenceImpact: ['El margen no cambia el contenido de citas o referencias, pero sí la sangría relativa que se aplica dentro de él.'],
  }),
  'paragraph-alignment': verified({
    id: 'paragraph-alignment', label: 'Alineación de los párrafos', manualSection: '2.23', manualPrintedPages: '45', audience: 'both',
    rules: ['Alinea el texto a la izquierda y deja el margen derecho irregular.', 'No justifiques el texto.', 'No dividas palabras manualmente ni actives separación automática con guiones al final de línea.', 'No insertes saltos de línea manuales dentro de DOI o URL; se aceptan los saltos automáticos del procesador.'],
    citationReferenceImpact: ['Las citas y referencias siguen la misma alineación general; los enlaces deben conservarse intactos y funcionales.'],
  }),
  'paragraph-indentation': verified({
    id: 'paragraph-indentation', label: 'Sangría de los párrafos', manualSection: '2.24', manualPrintedPages: '45-46', audience: 'both',
    rules: ['Sangra 0.5 pulgadas o 1.27 cm la primera línea de cada párrafo mediante tabulación o formato automático.', 'No sangres la primera línea del resumen.', 'Una cita en bloque lleva 0.5 pulgadas de sangría total; párrafos adicionales dentro del bloque añaden otra sangría de 0.5 pulgadas en su primera línea.', 'Los niveles 1-3 y las etiquetas de sección no usan sangría; los encabezados 4-5 sí.', 'Números, títulos y notas de tablas y figuras se alinean a la izquierda.', 'Las referencias usan sangría francesa de 0.5 pulgadas.', 'Etiquetas y títulos de apéndices se centran.'],
    citationReferenceImpact: ['Distingue la sangría de primera línea, la sangría total de cita en bloque y la sangría francesa de referencias; no son intercambiables.'],
  }),
  'paper-length': verified({
    id: 'paper-length', label: 'Extensión del escrito', manualSection: '2.25', manualPrintedPages: '46', audience: 'both',
    rules: ['La revista, consigna o rúbrica determina la extensión requerida.', 'Si debe acortarse, enfoca el problema, elimina repeticiones y combina presentaciones de datos sin perder información necesaria.', 'Prefiere especificar y medir la extensión por número de palabras porque la tipografía altera el número de páginas.', 'Si se cuentan páginas, incluye página de título y referencias.', 'Si se cuentan palabras, incluye citas, referencias, tablas, figuras —salvo palabras incrustadas en imágenes— y apéndices.', 'No cuentes encabezado, título abreviado o número de página ni añadas manualmente palabras de imágenes al contador.', 'Sigue el método de cómputo particular de la revista o curso si difiere.'],
    citationReferenceImpact: ['No elimines citas o referencias necesarias solo para cumplir una extensión; acorta la redacción y conserva la atribución suficiente.'],
  }),
  'organization-principles': verified({
    id: 'organization-principles', label: 'Principios de organización', manualSection: '2.26', manualPrintedPages: '47', audience: 'both',
    rules: ['Planifica una estructura clara, precisa y lógica antes de escribir.', 'Usa encabezados concisos y suficientemente descriptivos para anticipar los puntos y facilitar navegación accesible.', 'Los temas de igual importancia llevan el mismo nivel de encabezado.', 'Usa redacción paralela para secciones equivalentes.', 'No dejes una única subsección dentro de una sección: crea al menos dos subsecciones del mismo nivel o ninguna.'],
    citationReferenceImpact: ['La estructura puede reorganizar dónde aparecen las citas, pero no cambia su vínculo con las referencias.'],
  }),
  'heading-levels': verified({
    id: 'heading-levels', label: 'Cinco niveles de encabezados', manualSection: '2.27', manualPrintedPages: '47-49', audience: 'both',
    rules: ['Usa solo los niveles necesarios, comenzando siempre por el nivel 1 y sin saltar niveles.', 'No numeres ni pongas letras a los encabezados.', 'Nivel 1: centrado, negrita, title case; el texto comienza en párrafo nuevo.', 'Nivel 2: margen izquierdo, negrita, title case; texto en párrafo nuevo.', 'Nivel 3: margen izquierdo, negrita y cursiva, title case; texto en párrafo nuevo.', 'Nivel 4: con sangría, negrita, title case y punto final; el texto continúa en la misma línea.', 'Nivel 5: con sangría, negrita y cursiva, title case y punto final; el texto continúa en la misma línea.', 'Un escrito corto puede no requerir encabezados.'],
    citationReferenceImpact: ['Una cita colocada después de un encabezado pertenece al párrafo o enunciado correspondiente; el encabezado no sustituye contexto ni localizador.'],
  }),
  'section-labels': verified({
    id: 'section-labels', label: 'Etiquetas de sección', manualSection: '2.28', manualPrintedPages: '49', audience: 'both',
    rules: ['Son etiquetas como Nota del autor, Resumen, el título repetido al inicio del texto, Referencias, Notas a pie de página y Apéndice A.', 'Coloca cada etiqueta en una línea propia en la parte superior de la página donde comienza la sección.', 'Escríbela centrada y en negrita.', 'No trates estas etiquetas como un nivel numerado de encabezado.'],
    citationReferenceImpact: ['La etiqueta “Referencias” identifica la lista; no se cita ni se convierte en una entrada.'],
  }),
};

export function getFormatRule(id: FormatRuleId): Apa7VerifiedFormatRule {
  return formatRules[id];
}
