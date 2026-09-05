import { z } from 'zod';

export const tableFigureRuleId = z.enum([
  'table-figure-purpose',
  'table-figure-design',
  'graphic-versus-text',
  'table-figure-common-format',
  'table-figure-text-callout',
  'table-figure-placement',
  'reprinted-adapted-table-figure',
  'table-construction',
  'table-components',
  'table-number',
  'table-title',
  'table-headings',
  'table-body',
  'table-notes',
  'table-figure-abbreviations',
  'table-confidence-intervals',
  'table-borders-shading',
  'long-wide-tables',
  'table-relationships',
  'table-checklist',
  'sample-tables',
  'figure-principles',
  'figure-components',
  'figure-number',
  'figure-title',
  'figure-image',
  'figure-legend',
  'figure-notes',
  'figure-relationships',
  'photographs',
  'biological-data-figures',
  'electrophysiological-data',
  'radiological-data',
  'genetic-data',
  'figure-checklist',
  'sample-figures',
]);

export type TableFigureRuleId = z.infer<typeof tableFigureRuleId>;

export interface Apa7VerifiedTableFigureRule {
  id: TableFigureRuleId;
  label: string;
  manualSection: `7.${number}`;
  manualPrintedPages: string;
  status: 'verified';
  rules: string[];
  citationTreatment: string[];
  referenceTreatment: string[];
  permissionTreatment: string[];
  refuseWhen: string[];
}

const verified = (rule: Omit<Apa7VerifiedTableFigureRule, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): Apa7VerifiedTableFigureRule => ({
  ...rule,
  status: 'verified',
  refuseWhen: rule.refuseWhen ?? [
    'No se determinó si el material es propio, reproducido o adaptado.',
    'No se verificó la obra original de la que procede el material.',
    'Se propone una atribución, referencia o permiso inventado.',
  ],
});

export const tableFigureRules: Record<TableFigureRuleId, Apa7VerifiedTableFigureRule> = {
  'table-figure-purpose': verified({
    id: 'table-figure-purpose', label: 'Propósito de tablas y figuras', manualSection: '7.1', manualPrintedPages: '201',
    rules: ['Usa una tabla o figura para facilitar la comprensión del escrito.', 'Puede resumir información, presentar análisis, estimar una función o compartir datos completos.', 'Una tabla organiza contenido en filas y columnas; una figura es cualquier ilustración o representación no textual que no sea tabla.', 'No uses tablas o figuras como simple decoración; cada una debe tener un propósito claro.'],
    citationTreatment: ['Menciona en el texto cada tabla o figura por su número y explica qué debe observar el lector.', 'Si el contenido es ajeno, además aplica la cita o atribución correspondiente.'],
    referenceTreatment: ['Una tabla o figura creada íntegramente con datos y análisis propios no genera referencia externa.', 'El material derivado de otra obra debe vincularse con la referencia completa de esa obra.'],
    permissionTreatment: ['El propósito visual no determina por sí solo si hace falta permiso; debe evaluarse origen, licencia y forma de reutilización.'],
  }),
  'table-figure-design': verified({
    id: 'table-figure-design', label: 'Diseño y preparación', manualSection: '7.2', manualPrintedPages: '201-202',
    rules: ['Determina primero propósito e importancia y elige el formato que mejor los comunique.', 'Usa la forma estándar o canónica cuando exista.', 'Diseña para lectores: claridad, consistencia con el texto y presentación comprensible por sí misma.', 'Etiqueta todas las columnas y todos los elementos relevantes de una imagen, incluidos ejes.', 'Coloca juntos los elementos que deben compararse y las etiquetas junto a lo que describen.', 'En figuras usa tipografía sin serif legible sin ampliación.', 'Define abreviaturas dentro de la tabla o figura cuando sea necesario.', 'Elimina elementos decorativos que distraigan.', 'Revisa que los datos coincidan exactamente con el texto.'],
    citationTreatment: ['Las etiquetas internas no sustituyen la llamada por número ni la atribución de una fuente ajena.'],
    referenceTreatment: ['La autosuficiencia visual no elimina la referencia de datos o material externo.'],
    permissionTreatment: ['El diseño propio puede incorporar material protegido; verifica permisos antes de reproducirlo o adaptarlo.'],
  }),
  'graphic-versus-text': verified({
    id: 'graphic-versus-text', label: 'Presentación gráfica frente a textual', manualSection: '7.3', manualPrintedPages: '202-203',
    rules: ['Sé selectivo con la cantidad de tablas y figuras.', 'Presenta en texto una sola prueba estadística o unas pocas medias y desviaciones si una tabla no mejora la comunicación.', 'Usa tabla o figura para múltiples pruebas o grandes conjuntos de estadísticas descriptivas.', 'Combina varias visualizaciones pequeñas y relacionadas cuando una sola presentación más grande comunica mejor.', 'Evita repetir en tabla o figura exactamente la misma información del texto.'],
    citationTreatment: ['La forma elegida no modifica la obligación de citar el origen de datos o ideas ajenas.'],
    referenceTreatment: ['Una estadística citada en prosa y la misma estadística presentada visualmente remiten a la misma obra; no dupliques la entrada.'],
    permissionTreatment: ['Transformar información en otra forma visual no elimina automáticamente derechos de autor o licencias sobre el material original.'],
  }),
  'table-figure-common-format': verified({
    id: 'table-figure-common-format', label: 'Formato común', manualSection: '7.4', manualPrintedPages: '203',
    rules: ['Tanto tabla como figura contienen número, título, cuerpo o imagen y notas cuando se necesiten.', 'Usa la función de tablas del procesador; no alinees una tabla manualmente con tabulaciones o espacios.', 'Si importas una tabla desde otro programa, ajusta su formato a APA.', 'Genera figuras con resolución suficiente para una imagen clara y usa un formato de archivo que la conserve.', 'Para publicación pueden exigirse TIFF o EPS; JPG o PNG pueden aceptarse en otros trabajos.', 'Sigue los formatos y resoluciones exigidos por la revista, docente o institución.'],
    citationTreatment: ['Número y título identifican el elemento dentro del escrito; no son por sí mismos una cita de la fuente.'],
    referenceTreatment: ['La referencia se construye según el tipo de obra original, no según el programa con que se creó la tabla o figura.'],
    permissionTreatment: ['El formato del archivo no concede derechos para usar su contenido.'],
  }),
  'table-figure-text-callout': verified({
    id: 'table-figure-text-callout', label: 'Llamado en el texto', manualSection: '7.5', manualPrintedPages: '203',
    rules: ['Haz referencia a cada tabla y figura por su número.', 'En el llamado indica qué debe buscar el lector.', 'No escribas “la tabla de arriba”, “la figura de abajo” ni una página que puede cambiar.', 'No insertes instrucciones editoriales como “poner la Tabla 1 aquí”.', 'La referencia por número mejora la accesibilidad para lectores de pantalla.'],
    citationTreatment: ['Ejemplo interno: “Como se muestra en la Tabla 1…”; esto es un llamado, no una cita bibliográfica.', 'Si la tabla o figura procede de otra obra, añade también la atribución y cita que correspondan.'],
    referenceTreatment: ['El llamado a una tabla propia no genera entrada bibliográfica.', 'Una tabla o figura ajena conserva la referencia de su fuente original.'],
    permissionTreatment: ['Mencionar una figura por su número no autoriza reproducirla.'],
  }),
  'table-figure-placement': verified({
    id: 'table-figure-placement', label: 'Colocación de tablas y figuras', manualSection: '7.6', manualPrintedPages: '204',
    rules: ['Puede colocarse cada tabla y figura dentro del texto después de su primera mención o en páginas separadas después de referencias.', 'Sigue la preferencia de la revista, tarea, tesis o institución.', 'Alinea tablas y figuras al margen izquierdo.', 'Dentro del texto, colócalas después de un párrafo completo, idealmente el que contiene el primer llamado.', 'Intenta que quepan en una página y evita dejarlas aisladas en medio de una página.', 'Si comparten página con texto, deja una línea en blanco a doble espacio antes y después.', 'Material de apoyo no esencial puede ir en apéndices o suplementos y aun así debe mencionarse en el texto.'],
    citationTreatment: ['La primera mención debe preceder o acompañar la ubicación elegida.', 'La colocación en apéndice o suplemento no elimina la cita del origen ajeno.'],
    referenceTreatment: ['Las referencias permanecen en la lista general aunque la visualización aparezca en un apéndice o suplemento.'],
    permissionTreatment: ['Mover el material de lugar dentro del documento no cambia su situación de derechos.'],
  }),
  'reprinted-adapted-table-figure': verified({
    id: 'reprinted-adapted-table-figure', label: 'Tabla o figura reimpresa o adaptada', manualSection: '7.7', manualPrintedPages: '204-205',
    rules: ['Determina si el material fue reproducido sin cambios o adaptado.', 'Incluye en la nota de la tabla o figura una atribución de derechos que identifique el origen.', 'Añade la obra de origen a la lista de referencias.', 'Evalúa por separado si se necesita autorización del titular.', 'La regla se aplica también a material propio publicado previamente y a imágenes encontradas en internet.', 'Distingue dominio público, licencia aplicable, uso permitido y permiso expreso; no los presupongas.'],
    citationTreatment: ['La nota de atribución identifica el origen del elemento; cuando se discute la obra en el texto, usa además la cita autor-fecha normal.', 'No presentes una adaptación como creación enteramente propia.'],
    referenceTreatment: ['Incluye una entrada completa para la obra de la que se tomó o adaptó la tabla o figura.', 'Usa la plantilla correspondiente al tipo real de fuente: artículo, libro, página web, conjunto de datos, etc.'],
    permissionTreatment: ['Citar y referenciar no equivale a obtener autorización.', 'Si la reutilización no está cubierta por licencia, dominio público o excepción aplicable, puede requerirse permiso del titular.'],
    refuseWhen: ['No se conoce la fuente original de la tabla, figura o imagen.', 'Se afirma que encontrar una imagen en internet permite reutilizarla.', 'Se trata una atribución APA como sustituto automático del permiso.', 'No se determinó si el material fue reproducido o adaptado.'],
  }),
  'table-construction': verified({
    id: 'table-construction', label: 'Principios para construir tablas', manualSection: '7.8', manualPrintedPages: '205',
    rules: ['Integra la tabla con el argumento del texto y hazla concisa y comprensible por sí misma.', 'Una tabla en apéndice o suplemento también debe ser concisa y relacionarse directamente con el contenido.', 'Organiza los datos según el propósito específico que debe comunicar.', 'Coloca lado a lado las entradas que se compararán.', 'Presenta índices diferentes, como medias y tamaños muestrales, en filas o columnas distintas.', 'Sitúa etiquetas de variables y condiciones cerca de sus valores.'],
    citationTreatment: ['Menciona la tabla en el texto por su número y explica la comparación o hallazgo relevante.'],
    referenceTreatment: ['Si los datos proceden de otra obra, cita y referencia esa fuente; una reorganización propia no borra el origen.'],
    permissionTreatment: ['Una nueva organización de material protegido puede seguir siendo una adaptación que requiere evaluación de licencia o permiso.'],
  }),
  'table-components': verified({
    id: 'table-components', label: 'Componentes de una tabla', manualSection: '7.9', manualPrintedPages: '205-206',
    rules: ['Una tabla prototípica contiene número, título, encabezados, cuerpo y notas cuando sean necesarias.', 'El número aparece arriba y en negrita.', 'El título aparece una línea a doble espacio debajo, en cursiva y estilo oración.', 'Toda tabla necesita encabezados de columna, incluido el de la columna izquierda.', 'El cuerpo contiene filas, columnas y celdas y puede usar espacio sencillo, 1.5 o doble.', 'Las notas generales, específicas y de probabilidad aparecen debajo del cuerpo; no toda tabla necesita notas.'],
    citationTreatment: ['El número sirve para el llamado interno; una nota puede contener citas o atribución cuando corresponda.'],
    referenceTreatment: ['La presencia de una nota no sustituye la entrada bibliográfica de una fuente ajena.'],
    permissionTreatment: ['Cuando la nota atribuye material reproducido o adaptado, verifica también derechos y permiso.'],
  }),
  'table-number': verified({
    id: 'table-number', label: 'Número de tabla', manualSection: '7.10', manualPrintedPages: '206',
    rules: ['Numera con arábigos todas las tablas del texto principal: Tabla 1, Tabla 2, etc.', 'Asigna números según el orden de su primera mención en el texto.', 'Escribe “Tabla” y el número en negrita, alineados a la izquierda y sin sangría.', 'Las tablas de apéndices usan el esquema propio del apéndice, como Tabla A1.'],
    citationTreatment: ['Haz el llamado interno con “Tabla” y su número; no uses ubicación relativa o número de página.'],
    referenceTreatment: ['El número de tabla pertenece al manuscrito y no se incorpora a la referencia de la fuente original.'],
    permissionTreatment: ['Numerar una tabla no cambia su titularidad ni autoriza su uso.'],
  }),
  'table-title': verified({
    id: 'table-title', label: 'Título de tabla', manualSection: '7.11', manualPrintedPages: '207',
    rules: ['Da a cada tabla un título breve, claro y explicativo.', 'Debe permitir inferir fácilmente el contenido básico sin duplicar los encabezados.', 'Escríbelo en cursiva y estilo oración, debajo del número, con doble espacio entre ambos.', 'Evita títulos demasiado generales o excesivamente detallados.', 'Las abreviaturas del cuerpo pueden definirse entre paréntesis en el título o en una nota general; no uses una nota específica para explicar el título.'],
    citationTreatment: ['El título ayuda a identificar la tabla, pero el texto debe llamarla por número.'],
    referenceTreatment: ['No copies automáticamente el título de la fuente como título de la tabla; si es material ajeno, conserva la referencia de origen.'],
    permissionTreatment: ['Cambiar el título no convierte una tabla reproducida en propia.'],
  }),
  'table-headings': verified({
    id: 'table-headings', label: 'Encabezados de tabla', manualSection: '7.12', manualPrintedPages: '207-208',
    rules: ['Proporciona un encabezado breve para cada columna, incluida la columna izquierda.', 'Usa encabezados mayores, apilados o subencabezados solo cuando la estructura lo requiera; evita más de dos niveles apilados si es posible.', 'Cada elemento de una columna debe ser comparable y quedar descrito por su encabezado.', 'Si el encabezado ya contiene un símbolo como %, no lo repitas en cada celda.', 'Usa mayúscula solo en la primera palabra y nombres propios.', 'Centra los encabezados sobre sus columnas.', 'Los encabezados izquierdos, de columna y mayores suelen ser singulares salvo que nombren un grupo.'],
    citationTreatment: ['Un encabezado puede contener símbolos o abreviaturas, pero no reemplaza una cita necesaria.'],
    referenceTreatment: ['Los rótulos creados para resumir datos ajenos no sustituyen la referencia de esos datos.'],
    permissionTreatment: ['La estructura de encabezados no determina por sí sola la condición de derechos del contenido.'],
  }),
  'table-body': verified({
    id: 'table-body', label: 'Cuerpo de la tabla', manualSection: '7.13', manualPrintedPages: '208-209',
    rules: ['Organiza números, palabras o ambos en celdas.', 'El cuerpo, incluidos encabezados, puede usar espacio sencillo, 1.5 o doble según legibilidad y ajuste.', 'En la columna izquierda, aplica sangría de 0.15 pulgadas a entradas que ocupan más de una línea y alinea a la izquierda; puede centrarse una entrada muy corta si mejora la lectura.', 'Centra las demás celdas o alinea a la izquierda las entradas largas cuando sea más legible.', 'Usa estilo oración y nombres propios dentro del cuerpo.', 'Sé conciso: no incluyas columnas que puedan calcularse fácilmente desde otras.', 'Si la tabla contiene citas, aplica las reglas autor-fecha dentro de ella; en inglés se usa & para ahorrar espacio.'],
    citationTreatment: ['Las citas dentro de celdas siguen APA y deben poder vincularse con la lista general de referencias.', 'No uses el cuerpo de la tabla para ocultar una fuente que debería citarse.'],
    referenceTreatment: ['Cada obra citada dentro de la tabla aparece una sola vez en la lista general, no en una bibliografía separada para la tabla.'],
    permissionTreatment: ['Citar datos en las celdas no equivale a permiso para reproducir una tabla completa.'],
  }),
  'table-notes': verified({
    id: 'table-notes', label: 'Notas de tabla', manualSection: '7.14', manualPrintedPages: '209-211',
    rules: ['Usa, en este orden, nota general, notas específicas y nota de probabilidad; cada tipo comienza en línea nueva.', 'Una nota general empieza con “Nota.” en cursiva y explica el conjunto de la tabla, abreviaturas, símbolos, cursivas/negritas y atribución de material adaptado o reproducido.', 'Una nota específica se refiere a una celda, fila o columna mediante letras minúsculas en superíndice, ordenadas de izquierda a derecha y de arriba abajo.', 'Una nota de probabilidad explica asteriscos, dagas u otros símbolos; prefiere valores p exactos con dos o tres decimales y usa p < .001 cuando corresponda.', 'Usa el mismo número de asteriscos para los mismos umbrales en todo el escrito.', 'Las notas también pueden evitar repetición, pero si un dato se repite muchas veces puede ser mejor usar una fila o columna.', 'Alinea las notas a la izquierda, sin sangría y a doble espacio.'],
    citationTreatment: ['La nota general es el lugar de la atribución de una tabla reproducida o adaptada.', 'Una cita en la nota conserva el formato autor-fecha y requiere su referencia.'],
    referenceTreatment: ['Toda obra citada o acreditada en la nota debe tener su entrada completa en la lista general.'],
    permissionTreatment: ['La atribución de derechos aparece al final de la nota general, pero no sustituye el permiso cuando este sea necesario.'],
  }),
  'table-figure-abbreviations': verified({
    id: 'table-figure-abbreviations', label: 'Abreviaturas estándar en tablas y figuras', manualSection: '7.15', manualPrintedPages: '211',
    rules: ['No definas en una nota las abreviaturas y símbolos estadísticos estándar, letras griegas o unidades de medida comunes.', '“no.” y “%” pueden utilizarse sin definición.', 'Define las demás abreviaturas en el título, cuerpo o nota, aunque también estén definidas en el texto.', 'Salvo que convenga agrupar términos similares, define las abreviaturas en el orden en que aparecen: de arriba abajo y de izquierda a derecha.'],
    citationTreatment: ['Definir una abreviatura no constituye una cita; si representa una escala, prueba u obra ajena, cita su fuente según corresponda.'],
    referenceTreatment: ['Una definición terminológica no genera referencia por sí sola; la fuente original sí la genera cuando fue utilizada.'],
    permissionTreatment: ['Las abreviaturas estándar no requieren permiso; el contenido protegido al que puedan referirse se evalúa aparte.'],
  }),
  'table-confidence-intervals': verified({
    id: 'table-confidence-intervals', label: 'Intervalos de confianza en tablas', manualSection: '7.16', manualPrintedPages: '211',
    rules: ['Cuando una tabla contiene estimaciones puntuales, como medias, correlaciones o pendientes de regresión, incluye intervalos de confianza cuando sea posible.', 'Presenta los límites entre corchetes junto a la estimación o en columnas separadas para límite inferior y superior.', 'Indica explícitamente el nivel del intervalo, por ejemplo 95% o 99%.', 'Usa normalmente el mismo nivel de confianza en todas las tablas y en todo el escrito.'],
    citationTreatment: ['El intervalo de confianza describe el análisis; si la estimación procede de una fuente ajena, cita esa fuente dentro de la tabla o en su nota y también en el texto cuando se discuta.'],
    referenceTreatment: ['Una estimación calculada con datos propios no genera una referencia externa; una estimación tomada de otra obra sí debe enlazarse con su referencia completa.'],
    permissionTreatment: ['Reportar una estimación ajena con cita no autoriza reproducir el diseño completo de la tabla de origen.'],
  }),
  'table-borders-shading': verified({
    id: 'table-borders-shading', label: 'Bordes y sombreado de tablas', manualSection: '7.17', manualPrintedPages: '211-212',
    rules: ['Limita las líneas a las necesarias para dar claridad.', 'Suelen bastar líneas en la parte superior e inferior, debajo de los encabezados de columna y encima de encabezados que abarcan varias columnas; una fila de totales puede separarse.', 'No uses líneas verticales ni bordes alrededor de cada celda.', 'Usa espacio y alineación para mostrar relaciones entre datos.', 'Evita el sombreado; cuando sea indispensable, explica su propósito en una nota general.', 'Para resaltar entradas, prefiere una nota específica o de probabilidad, o cursiva/negrita explicada en la nota general.'],
    citationTreatment: ['El énfasis visual no identifica una fuente; conserva la cita correspondiente para cualquier dato ajeno.'],
    referenceTreatment: ['El estilo de bordes o sombreado no modifica la referencia de la fuente de los datos.'],
    permissionTreatment: ['Recrear el contenido de una tabla ajena con otro sombreado no elimina automáticamente la necesidad de atribución o permiso.'],
  }),
  'long-wide-tables': verified({
    id: 'long-wide-tables', label: 'Tablas largas o anchas', manualSection: '7.18', manualPrintedPages: '212',
    rules: ['En una tabla que continúa en varias páginas, repite la fila de encabezados en cada página, preferiblemente con la función automática del procesador.', 'Una tabla ancha puede colocarse en orientación horizontal.', 'Si todavía es demasiado ancha, repite la columna izquierda en cada parte subsiguiente.', 'Divide una tabla excesivamente ancha o larga en tablas separadas cuando eso mejore la lectura.'],
    citationTreatment: ['Cada parte conserva el llamado y la identidad de la tabla; no crees citas bibliográficas distintas por cada página.'],
    referenceTreatment: ['Dividir una presentación no duplica la entrada de referencia de su fuente.'],
    permissionTreatment: ['Cambiar orientación o dividir una tabla reproducida no altera sus condiciones de reutilización.'],
  }),
  'table-relationships': verified({
    id: 'table-relationships', label: 'Relación entre tablas', manualSection: '7.19', manualPrintedPages: '212',
    rules: ['Combina tablas que repiten datos cuando una sola presentación sea clara.', 'Evita repetir las mismas filas o columnas en varias tablas.', 'Mantén consistentes la presentación, los títulos, los encabezados y la terminología de tablas similares.', 'Cuando tablas similares no puedan combinarse, numéralas por separado, como Tabla 1 y Tabla 2; no uses Tabla 1A y Tabla 1B.'],
    citationTreatment: ['Cada tabla separada debe mencionarse por su propio número; una tabla combinada conserva las citas de todas las fuentes utilizadas.'],
    referenceTreatment: ['La misma obra citada en varias tablas aparece una sola vez en la lista general de referencias.'],
    permissionTreatment: ['Combinar material de varias obras exige evaluar atribución y derechos de cada fuente.'],
  }),
  'table-checklist': verified({
    id: 'table-checklist', label: 'Lista de verificación para tablas', manualSection: '7.20', manualPrintedPages: '212-213',
    rules: ['Antes de entregar, confirma que la tabla sea necesaria y decide si pertenece al cuerpo, a un suplemento o a otra versión del trabajo.', 'Comprueba consistencia, numeración arábiga consecutiva, orden de primera mención y llamados por número.', 'Verifica número en negrita y título breve, explicativo, en cursiva, estilo oración y alineado a la izquierda.', 'Comprueba encabezado en cada columna, alineación legible, abreviaturas explicadas y notas en orden general, específica y de probabilidad.', 'Revisa líneas, interlineado del cuerpo, intervalos de confianza y un nivel de confianza coherente.', 'Si reportas significación, identifica correctamente todos los valores p, usa p < .001 solo cuando corresponda y define símbolos de forma consistente.', 'Para material reproducido o adaptado, incluye atribución de derechos y confirma por separado cualquier autorización necesaria.'],
    citationTreatment: ['La revisión debe confirmar tanto el llamado interno por número como las citas de datos o material ajeno.'],
    referenceTreatment: ['Toda fuente acreditada en la tabla debe corresponder a una entrada de la lista general.'],
    permissionTreatment: ['La lista exige comprobar atribución y autorización como controles distintos; cumplir APA no concede por sí mismo derechos de reproducción.'],
  }),
  'sample-tables': verified({
    id: 'sample-tables', label: 'Selección de tablas de muestra', manualSection: '7.21', manualPrintedPages: '214-230',
    rules: ['Selecciona el tipo de tabla según el propósito del análisis, no por imitación visual.', 'Los modelos cubren características demográficas, propiedades de variables, metaanálisis, diseños experimentales complejos, estadísticas descriptivas, chi-cuadrada, pruebas t, comparaciones a priori o post hoc, correlaciones, ANOVA, análisis factorial y regresión múltiple.', 'También incluyen comparación de modelos, datos cualitativos y métodos mixtos.', 'Una sola prueba suele comunicarse en el texto; varias pruebas relacionadas pueden resumirse en tabla.', 'En correlaciones, numera y nombra variables en la columna izquierda y usa números en los encabezados para evitar repetir nombres.', 'En regresión, identifica el tipo de regresión y si los coeficientes son brutos o estandarizados; en modelos secuenciales informa incrementos de cambio.', 'En comparación de modelos, identifica claramente modelos competidores y comparaciones.', 'En tablas cualitativas o mixtas, el contenido y la estructura dependen del propósito y pueden combinar texto, citas de participantes y cantidades.'],
    citationTreatment: ['Las citas de participantes propios se tratan según la regla de participantes de investigación, no como fuentes recuperables.', 'Una tabla que resume estudios o datos ajenos mantiene citas trazables dentro de la tabla o su nota.'],
    referenceTreatment: ['Los ejemplos del manual son modelos de estructura, no referencias para copiar.', 'Incluye en la lista general cada obra externa realmente usada para construir la tabla.'],
    permissionTreatment: ['Imita la lógica estructural con datos propios; no reproduzcas una tabla de muestra o de otra publicación como si fuera una plantilla libre.'],
  }),
  'figure-principles': verified({
    id: 'figure-principles', label: 'Principios para elaborar figuras', manualSection: '7.22', manualPrintedPages: '231',
    rules: ['Considera figura todo gráfico, diagrama, dibujo, mapa, fotografía u otra representación no textual que no sea tabla.', 'La figura debe aumentar, no duplicar, el texto; transmitir solo información esencial; omitir detalles distractores; ser legible, comprensible, bien preparada y consistente con figuras similares.', 'Comprueba claridad de imágenes y líneas, tipografía simple, unidades de medida, ejes y elementos etiquetados.', 'Distingue barras de error de intervalos de confianza: identifica el tipo de error o el nivel del intervalo.', 'Incluye leyenda o nota suficiente para que se comprenda por sí misma y usa símbolos distinguibles y escala adecuada.'],
    citationTreatment: ['Una figura que contiene citas sigue el sistema autor-fecha; el llamado por número no sustituye esas citas.'],
    referenceTreatment: ['Una figura propia no genera referencia externa; datos o material ajeno deben vincularse con sus entradas completas.'],
    permissionTreatment: ['La claridad visual no resuelve derechos: una figura reproducida o adaptada conserva sus obligaciones de atribución y posible autorización.'],
  }),
  'figure-components': verified({
    id: 'figure-components', label: 'Componentes de una figura', manualSection: '7.23', manualPrintedPages: '231-232',
    rules: ['Una figura prototípica contiene número, título, imagen, leyenda o clave cuando sea necesaria y notas cuando sean necesarias.', 'La imagen puede ser gráfica, diagrama, dibujo, mapa, fotografía u otra ilustración.', 'Dentro de una gráfica, identifica puntos de datos, ejes, títulos y etiquetas de ejes y marcas.', 'La leyenda explica símbolos usados en la imagen; las notas complementan o aclaran información.'],
    citationTreatment: ['El número permite llamarla desde el texto; las citas de fuentes ajenas pueden aparecer dentro de la imagen o en la nota.'],
    referenceTreatment: ['Toda obra citada o acreditada en la figura se incluye en la lista general.'],
    permissionTreatment: ['Las notas pueden contener atribución de derechos, pero esta no sustituye una autorización exigible.'],
  }),
  'figure-number': verified({
    id: 'figure-number', label: 'Número de figura', manualSection: '7.24', manualPrintedPages: '233',
    rules: ['Numera con arábigos las figuras del texto principal según el orden de su primera mención.', 'Escribe “Figura” y el número en negrita, alineados a la izquierda, sin sangría ni centrado.', 'Las figuras de apéndices siguen el esquema propio del apéndice.'],
    citationTreatment: ['Haz el llamado interno como “Figura 1”; no uses “la figura de arriba” ni una página variable.'],
    referenceTreatment: ['El número interno no forma parte de la referencia de la fuente original.'],
    permissionTreatment: ['Asignar un número no convierte una imagen ajena en propia.'],
  }),
  'figure-title': verified({
    id: 'figure-title', label: 'Título de figura', manualSection: '7.25', manualPrintedPages: '233',
    rules: ['Da a cada figura un título breve, claro y explicativo.', 'Escríbelo en cursiva y estilo oración debajo del número, con doble espacio entre ambos.', 'Evita títulos demasiado generales o excesivamente detallados.'],
    citationTreatment: ['El título no sustituye el llamado por número ni la cita de una fuente externa.'],
    referenceTreatment: ['El título de la figura del estudiante no reemplaza el título de la obra en su referencia.'],
    permissionTreatment: ['Renombrar una figura reproducida no cambia sus derechos.'],
  }),
  'figure-image': verified({
    id: 'figure-image', label: 'Imagen y diseño interno de la figura', manualSection: '7.26', manualPrintedPages: '233-235',
    rules: ['Guarda la imagen con resolución suficiente para impresión o visualización clara.', 'Usa dentro de la imagen una tipografía sans serif legible, normalmente entre 8 y 14 puntos, uniforme y con espacio suficiente.', 'Haz que símbolos y grosores expresen la jerarquía visual sin dominar etiquetas o marcas.', 'Usa estilo oración en etiquetas; “%” y “n.º” pueden abreviarse; las estadísticas, letras griegas y unidades comunes no requieren definición.', 'Limita sombreados y patrones y asegúrate de que elementos superpuestos puedan distinguirse.', 'Usa color solo cuando comunique y mantén la figura comprensible en escala de grises cuando corresponda.', 'No dependas solo del color: combina alto contraste, patrones, estilos de línea o etiquetas directas para accesibilidad.', 'Evita cuadrículas y efectos tridimensionales decorativos; úsalos solo si transmiten información esencial.', 'En figuras con paneles, usa letras mayúsculas como A y B en la esquina superior izquierda y menciona “Figura 5A” o “Panel A de la Figura 5”.', 'Si la figura contiene citas, aplica las reglas autor-fecha.'],
    citationTreatment: ['Las citas pueden colocarse dentro de la figura o en su nota y deben corresponder a la lista general.', 'Las etiquetas de panel son localizadores internos, no citas bibliográficas.'],
    referenceTreatment: ['Cada fuente citada dentro de la imagen aparece una sola vez en la lista general.'],
    permissionTreatment: ['Editar color, recortar o reorganizar paneles de una figura ajena constituye una adaptación que debe atribuirse y evaluarse jurídicamente.'],
  }),
  'figure-legend': verified({
    id: 'figure-legend', label: 'Leyenda o clave de figura', manualSection: '7.27', manualPrintedPages: '235',
    rules: ['Usa leyenda solo cuando símbolos, estilos de línea, sombreados o patrones necesiten definición.', 'La leyenda es parte de la imagen y usa el mismo tipo y proporción de letra.', 'Escribe su texto en estilo oración.', 'Cuando sea posible, colócala dentro o debajo de la imagen para evitar espacio vacío innecesario.'],
    citationTreatment: ['Una leyenda explica codificación visual; no sustituye una cita o atribución.'],
    referenceTreatment: ['Una fuente mencionada en la leyenda conserva su entrada de referencia.'],
    permissionTreatment: ['Una clave nueva no elimina los derechos sobre una imagen reproducida.'],
  }),
  'figure-notes': verified({
    id: 'figure-notes', label: 'Notas de figura', manualSection: '7.28', manualPrintedPages: '235',
    rules: ['Usa, cuando correspondan, nota general, notas específicas y nota de probabilidad, siguiendo el formato de las notas de tabla.', 'En la nota general explica unidades, símbolos, abreviaturas, sombreado, color, elementos significativos, paneles y barras de error o intervalos.', 'Coloca al final de la nota general las abreviaturas y la atribución de una figura reproducida o adaptada.', 'Sitúa superíndices de notas específicas junto al elemento identificado.', 'Prefiere valores p exactos; si usas símbolos de significación, explícalos en una nota de probabilidad.'],
    citationTreatment: ['La nota general puede alojar citas y la atribución de la fuente visual.'],
    referenceTreatment: ['Las obras citadas o acreditadas en una nota de figura aparecen en la lista general.'],
    permissionTreatment: ['La atribución de derechos se consigna en la nota general, pero no reemplaza el permiso necesario.'],
  }),
  'figure-relationships': verified({
    id: 'figure-relationships', label: 'Relación entre figuras', manualSection: '7.29', manualPrintedPages: '236',
    rules: ['Presenta figuras similares o igualmente importantes con el mismo tamaño y escala.', 'Combina figuras similares cuando eso facilite comparar su contenido.', 'Usa varios paneles en una sola figura cuando sea más claro que mantener figuras separadas.'],
    citationTreatment: ['Una figura combinada mantiene las citas de todas las fuentes utilizadas y se llama por un solo número con paneles identificables.'],
    referenceTreatment: ['La misma obra usada en varios paneles se incluye una sola vez en referencias.'],
    permissionTreatment: ['Evalúa derechos y atribución por cada material incorporado en la figura combinada.'],
  }),
  'photographs': verified({
    id: 'photographs', label: 'Fotografías', manualSection: '7.30', manualPrintedPages: '236',
    rules: ['Sigue el formato y resolución exigidos por la editorial, docente o institución.', 'Asegura contraste y detalle suficientes y recorta para eliminar elementos extraños o centrar la imagen.', 'Declara en una nota general cualquier alteración más allá de recorte simple o ajustes ordinarios de luz.', 'No tergiverses imágenes ni manipules datos visuales de forma fraudulenta.', 'Obtén autorización firmada de una persona identificable fotografiada; si no es identificable, el manual no exige esa autorización.', 'Si tomaste la fotografía, no hace falta citarte ni incluir atribución de derechos en la nota.', 'Una fotografía de otra fuente puede requerir permiso del fotógrafo o titular.'],
    citationTreatment: ['Una fotografía propia no lleva cita APA de autoría; una ajena sí requiere atribución y, cuando se discute su fuente, cita autor-fecha.'],
    referenceTreatment: ['La fotografía ajena se referencia según su tipo y fuente recuperable; una fotografía propia inédita no genera una autorreferencia.'],
    permissionTreatment: ['Distingue consentimiento de la persona retratada de derechos de autor del fotógrafo: pueden requerirse ambos.', 'No publiques una persona identificable sin la autorización correspondiente.'],
  }),
  'biological-data-figures': verified({
    id: 'biological-data-figures', label: 'Figuras de datos biológicos', manualSection: '7.31', manualPrintedPages: '236-237',
    rules: ['Representa los datos con precisión y explica en la nota general cómo se procesaron o mejoraron las imágenes.', 'Etiqueta claramente las imágenes y mantén claridad, necesidad, consistencia y criterios de inclusión.', 'Mantén estilo y formato consistentes entre paneles y figuras, aunque algunas etiquetas o escalas varíen.', 'Usa color cuando sea necesario para interpretar datos biológicos o genéticos.', 'Considera materiales suplementarios para contenido que se comprende mejor o solo puede mostrarse en línea, como video dinámico.'],
    citationTreatment: ['Cita conjuntos de datos, métodos o imágenes externas utilizados; describe por separado el procesamiento propio.'],
    referenceTreatment: ['Referencia cada conjunto de datos, software o fuente externa realmente utilizada según su categoría.'],
    permissionTreatment: ['Procesar o mejorar una imagen de otra fuente sigue siendo una adaptación y requiere evaluar licencia o permiso.'],
  }),
  'electrophysiological-data': verified({
    id: 'electrophysiological-data', label: 'Datos electrofisiológicos', manualSection: '7.32', manualPrintedPages: '237',
    rules: ['Etiqueta claramente la imagen.', 'En potenciales relacionados con eventos, indica la dirección de la negatividad y la escala de respuesta.', 'Acompaña la figura con información necesaria para interpretarla, como número y ubicación de electrodos.'],
    citationTreatment: ['Cita la fuente de datos o método cuando no sean propios; las etiquetas técnicas no sustituyen la cita.'],
    referenceTreatment: ['Las fuentes externas de datos, métodos o instrumentos se incluyen según su tipo real.'],
    permissionTreatment: ['Una visualización derivada de datos ajenos requiere revisar licencia, atribución y posible permiso.'],
  }),
  'radiological-data': verified({
    id: 'radiological-data', label: 'Datos radiológicos e imágenes', manualSection: '7.33', manualPrintedPages: '237',
    rules: ['Etiqueta cada imagen cerebral y explica en la nota los detalles necesarios para interpretarla.', 'En cortes axiales o coronales identifica hemisferios; en sagitales indica el hemisferio mostrado.', 'Incluye una imagen de orientación cuando ayude a ubicar los cortes y especifica el espacio de coordenadas normalizado.', 'Explica qué activaciones se muestran y cómo se proyectaron; mantén consistente el mapa de color.', 'Documenta adquisición y procesamiento y, en fotomicrografías, incluye barra de escala y materiales de tinción.'],
    citationTreatment: ['Cita datos, atlas, métodos, software o imágenes externas utilizados.'],
    referenceTreatment: ['Cada fuente externa recuperable de datos o procesamiento debe tener su referencia apropiada.'],
    permissionTreatment: ['La normalización o el procesamiento no eliminan derechos sobre imágenes obtenidas de terceros.'],
  }),
  'genetic-data': verified({
    id: 'genetic-data', label: 'Datos genéticos', manualSection: '7.34', manualPrintedPages: '237',
    rules: ['Etiqueta con claridad mapas, tinciones y otras imágenes genéticas.', 'Incluye ubicaciones, distancias, marcadores y métodos de identificación junto a la figura.', 'Edita cuidadosamente la imagen y su leyenda para que una alta densidad de información no reduzca su valor comunicativo.'],
    citationTreatment: ['Cita la procedencia de datos, mapas y métodos que no sean propios.'],
    referenceTreatment: ['Referencia los conjuntos de datos, mapas o publicaciones externas realmente consultados.'],
    permissionTreatment: ['Un mapa genético ajeno reproducido o adaptado requiere atribución y revisión de licencia o permiso.'],
  }),
  'figure-checklist': verified({
    id: 'figure-checklist', label: 'Lista de verificación para figuras', manualSection: '7.35', manualPrintedPages: '238',
    rules: ['Confirma que la figura sea necesaria y decide si pertenece al cuerpo, a otra versión o a material suplementario.', 'Verifica formato de archivo, resolución, tamaño y escala consistentes, numeración, llamado, título y alineación.', 'Comprueba que la imagen sea simple, clara, sin detalles extraños y con elementos, magnitud, escala y dirección etiquetados.', 'Revisa tipografía sans serif de 8 a 14 puntos, abreviaturas, símbolos y leyenda dentro o debajo de la imagen.', 'Declara modificaciones sustanciales de fotografías.', 'Ordena y formatea correctamente notas generales, específicas y de probabilidad.', 'Para material reproducido o adaptado, verifica atribución y autorización escrita por separado.'],
    citationTreatment: ['El control final incluye llamados por número y citas trazables de material externo.'],
    referenceTreatment: ['Toda fuente citada o acreditada debe corresponder a una entrada en la lista general.'],
    permissionTreatment: ['Comprueba que una atribución no se esté tratando como sustituto del permiso o consentimiento.'],
  }),
  'sample-figures': verified({
    id: 'sample-figures', label: 'Selección de figuras de muestra', manualSection: '7.36', manualPrintedPages: '239-256',
    rules: ['Elige la forma según la información: gráficas para relaciones cuantitativas; diagramas para flujos, modelos o diseños; dibujos para montajes o estímulos; mapas para información espacial.', 'Usa diagramas de flujo para participantes o sujetos, y diagramas de modelos para relaciones conceptuales, ecuaciones estructurales, análisis factorial, trayectorias o diseños cualitativos y mixtos.', 'Usa plots para puntos individuales, como dispersión o escalamiento multidimensional.', 'Usa fotografías para representaciones visuales directas difíciles de comunicar con dibujo.', 'Combina varios tipos en paneles cuando ayude más que separarlos.', 'Los ejemplos biológicos incluyen potenciales relacionados con eventos, datos de resonancia magnética funcional y mapas genéticos.', 'Los modelos ilustran estructura y decisiones; no deben copiarse como si fueran recursos libres.'],
    citationTreatment: ['Cita los datos o materiales externos que alimentan cualquiera de estos tipos de figura.'],
    referenceTreatment: ['Los ejemplos del manual no se agregan como referencia salvo que realmente se reproduzcan o discutan; las fuentes reales del trabajo sí se referencian.'],
    permissionTreatment: ['Reproduce solo material autorizado; para Campus, genera ejemplos originales y preserva la lógica del tipo visual.'],
  }),
};

export function getTableFigureRule(id: TableFigureRuleId): Apa7VerifiedTableFigureRule {
  return tableFigureRules[id];
}
