import { z } from 'zod';

export const reportingRuleId = z.enum([
  'jars-principles',
  'jars-terminology',
  'research-abstract',
  'research-introduction',
  'quantitative-basic-expectations',
  'quantitative-method',
  'quantitative-results',
  'quantitative-discussion',
  'quantitative-experimental-nonexperimental-modules',
  'quantitative-special-designs',
  'quantitative-special-analyses',
  'quantitative-meta-analysis',
  'qualitative-basic-expectations',
  'qualitative-method',
  'qualitative-findings',
  'qualitative-discussion',
  'qualitative-meta-analysis',
  'mixed-methods-reporting',
]);

export type ReportingRuleId = z.infer<typeof reportingRuleId>;

export interface Apa7VerifiedReportingRule {
  id: ReportingRuleId;
  label: string;
  manualSection: `3.${number}`;
  manualPrintedPages: string;
  status: 'verified';
  appliesTo: string[];
  rules: string[];
  citationTreatment: string[];
  referenceTreatment: string[];
  refuseWhen: string[];
}

const verified = (rule: Omit<Apa7VerifiedReportingRule, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): Apa7VerifiedReportingRule => ({
  ...rule,
  status: 'verified',
  refuseWhen: rule.refuseWhen ?? [
    'No se identificó el diseño, método o tipo de síntesis del estudio.',
    'Se pretende inventar una muestra, medida, procedimiento, análisis, resultado o registro no documentado.',
    'Se presenta una recomendación de reporte como prueba de que el estudio fue bien diseñado o ejecutado.',
  ],
});

export const reportingRules: Record<ReportingRuleId, Apa7VerifiedReportingRule> = {
  'jars-principles': verified({
    id: 'jars-principles', label: 'Aplicación de los principios JARS', manualSection: '3.1', manualPrintedPages: '72',
    appliesTo: ['Artículos de investigación cuantitativa, cualitativa o de métodos mixtos', 'Proyectos avanzados de investigación estudiantil'],
    rules: ['Usa los JARS para comunicar con claridad, precisión y transparencia la información mínima necesaria para comprender, evaluar y replicar la investigación.', 'Los JARS regulan cómo reportar un estudio; no prescriben cómo diseñarlo ni garantizan su calidad.', 'Incluye en el artículo la información necesaria para interpretar el estudio y remite a suplementos accesibles cuando el detalle de replicación no quepa.', 'Consulta también las instrucciones de la revista, disciplina, docente o institución; pueden exigir otro estándar específico.', 'Distingue hipótesis, análisis y conclusiones primarios, secundarios y exploratorios cuando corresponda.'],
    citationTreatment: ['Cita las obras que fundamentan el problema, método, instrumentos, análisis y comparaciones; JARS no sustituye esas citas.', 'Si se menciona JARS como estándar aplicado, cita el manual o el informe JARS realmente consultado.'],
    referenceTreatment: ['Incluye una entrada para cada obra metodológica, instrumento, conjunto de datos, software o protocolo citado.', 'La mera organización del manuscrito conforme a JARS no obliga a añadir una referencia si el estándar no se menciona; no inventes una referencia implícita.'],
  }),
  'jars-terminology': verified({
    id: 'jars-terminology', label: 'Terminología utilizada en los JARS', manualSection: '3.2', manualPrintedPages: '72-73',
    appliesTo: ['Selección del estándar de reporte y descripción del diseño'],
    rules: ['Identifica si la tradición es cuantitativa, cualitativa o de métodos mixtos antes de elegir el módulo.', 'Usa la terminología que describe con precisión el diseño y define los términos técnicos que puedan variar entre tradiciones.', 'Los lineamientos son flexibles respecto de la ubicación de la información, salvo los elementos cuya ubicación está expresamente fijada.', 'No conviertas una etiqueta metodológica en una afirmación de rigor sin evidencia del procedimiento realizado.'],
    citationTreatment: ['Cita una definición metodológica cuando su significado no sea común, sea controvertido o proceda de un enfoque específico.', 'No hace falta citar una etiqueta únicamente por seleccionarla de la taxonomía JARS, salvo que se explique el estándar.'],
    referenceTreatment: ['La referencia debe corresponder a la fuente metodológica o glosario efectivamente consultado, no a una fuente aproximada.'],
  }),
  'research-abstract': verified({
    id: 'research-abstract', label: 'Resumen de un artículo de investigación', manualSection: '3.3', manualPrintedPages: '73-75',
    appliesTo: ['Investigación cuantitativa, cualitativa y de métodos mixtos'],
    rules: ['Expresa el problema u objetivo central y, cuando corresponda, las preguntas o hipótesis.', 'Identifica participantes o fuentes de datos y las características esenciales del diseño, método y análisis.', 'Reporta los principales resultados o hallazgos y su significado sin afirmar más de lo que sostienen los datos.', 'Incluye información de registro, preregistro, datos o materiales abiertos cuando sea requerida y quepa en el formato.', 'Respeta el límite y la estructura exigidos por la revista o institución.'],
    citationTreatment: ['Evita introducir citas en el resumen salvo que sean imprescindibles y estén permitidas; toda cita incluida debe tener referencia.', 'No uses una cita para reemplazar la descripción del estudio propio.'],
    referenceTreatment: ['Una fuente citada excepcionalmente en el resumen debe aparecer en la lista general de referencias.', 'El resumen no lleva una lista de referencias separada.'],
  }),
  'research-introduction': verified({
    id: 'research-introduction', label: 'Introducción de un artículo de investigación', manualSection: '3.4', manualPrintedPages: '75-77',
    appliesTo: ['Investigación cuantitativa, cualitativa y de métodos mixtos'],
    rules: ['Expón el problema, su importancia y el contexto teórico o empírico relevante.', 'Revisa la literatura pertinente de manera crítica y conecta esa revisión con la necesidad del estudio.', 'Declara objetivos, preguntas e hipótesis y distingue cuáles son primarios, secundarios o exploratorios.', 'Explica cómo el diseño o enfoque elegido responde al problema y reconoce límites conocidos de la evidencia previa.', 'No presentes resultados del estudio como si fueran antecedentes.'],
    citationTreatment: ['Cita las afirmaciones no comunes, teorías, resultados previos, medidas y métodos atribuidos a otras obras.', 'Usa fuentes primarias cuando estén disponibles y evita encadenar citas secundarias como si se hubieran consultado los originales.'],
    referenceTreatment: ['Cada obra citada en la introducción debe corresponder a una entrada recuperable en la lista general.', 'No incluyas obras de contexto que no aparezcan citadas.'],
  }),
  'quantitative-basic-expectations': verified({
    id: 'quantitative-basic-expectations', label: 'Expectativas básicas de investigación cuantitativa', manualSection: '3.5', manualPrintedPages: '77-82',
    appliesTo: ['Estudios cuantitativos primarios'],
    rules: ['Identifica claramente variables, población, diseño y objetivos en el título, resumen e introducción cuando sean centrales.', 'Reporta con transparencia muestra, medidas, manipulación o intervención, procedimiento, estrategia analítica, resultados y limitaciones.', 'Distingue decisiones planeadas de decisiones tomadas después de observar los datos.', 'Declara registro, preregistro, disponibilidad de datos, materiales y código, así como cambios respecto del plan.', 'En artículos con varios estudios, conserva suficiente detalle por estudio y explica qué procedimientos son comunes.'],
    citationTreatment: ['Cita instrumentos, escalas, conjuntos de datos, protocolos, software y métodos ajenos con la precisión necesaria para identificarlos.', 'Los resultados propios no se citan como fuente externa; se remiten a la tabla, figura o sección correspondiente.'],
    referenceTreatment: ['Incluye referencias de instrumentos, protocolos, datos, software y métodos citados usando el tipo real de fuente.', 'Una URL de registro o repositorio puede ser además un enlace de acceso; no sustituye automáticamente la referencia de la obra asociada.'],
  }),
  'quantitative-method': verified({
    id: 'quantitative-method', label: 'Método cuantitativo', manualSection: '3.6', manualPrintedPages: '82-86',
    appliesTo: ['Sección Método de estudios cuantitativos'],
    rules: ['Describe criterios de inclusión y exclusión, características de participantes, población objetivo, muestreo, reclutamiento, lugares, fechas y compensación.', 'Explica cómo se determinó el tamaño muestral, incluyendo potencia, precisión o restricciones cuando correspondan.', 'Identifica medidas y covariables, sus propiedades psicométricas pertinentes y cómo fueron administradas, puntuadas o transformadas.', 'Describe diseño, asignación, aleatorización, enmascaramiento, manipulaciones, intervenciones, aparatos y procedimientos con detalle reproducible.', 'Reporta aprobación ética, consentimiento o asentimiento y medidas de protección aplicables.', 'Explica preparación y diagnóstico de datos, tratamiento de faltantes, exclusiones, estrategia analítica, software y versiones.', 'Distingue análisis confirmatorios de exploratorios y documenta preregistro y cambios.'],
    citationTreatment: ['Cita el desarrollo original o la fuente autorizada de una medida y la fuente de un método o procedimiento no creado para el estudio.', 'Una aprobación ética o un número de registro se reporta como identificador; no se inventa una cita bibliográfica para él.'],
    referenceTreatment: ['Referencia manuales de instrumentos, protocolos, paquetes de software, conjuntos de datos y métodos citados.', 'No atribuyas propiedades psicométricas de otra población al estudio actual sin citar la evidencia y explicar su pertinencia.'],
  }),
  'quantitative-results': verified({
    id: 'quantitative-results', label: 'Resultados cuantitativos', manualSection: '3.7', manualPrintedPages: '86-89',
    appliesTo: ['Sección Resultados de estudios cuantitativos'],
    rules: ['Reporta flujo de participantes, reclutamiento, pérdidas, exclusiones y datos faltantes.', 'Presenta estadísticas descriptivas, estimaciones, tamaños del efecto e intervalos de confianza apropiados, además de las pruebas inferenciales pertinentes.', 'Da suficiente información para evaluar el análisis: grados de libertad, valores exactos cuando procedan, dirección y magnitud de los efectos.', 'Reporta todos los análisis primarios y sus resultados, incluidos los no significativos, y etiqueta los secundarios y exploratorios.', 'Describe análisis auxiliares, robustez, sensibilidad, desviaciones del plan y acontecimientos adversos cuando correspondan.', 'Evita interpretar extensamente los resultados en esta sección si la estructura reserva esa tarea para la discusión.'],
    citationTreatment: ['Los datos propios se identifican mediante texto, tablas y figuras; no requieren una cita autor-fecha ficticia.', 'Cita fuentes externas solo cuando se incorporen datos, métodos, umbrales o comparaciones ajenos.'],
    referenceTreatment: ['Toda fuente externa utilizada para datos o criterios analíticos conserva su entrada; las tablas propias no generan referencia.'],
  }),
  'quantitative-discussion': verified({
    id: 'quantitative-discussion', label: 'Discusión cuantitativa', manualSection: '3.8', manualPrintedPages: '89-91',
    appliesTo: ['Sección Discusión de estudios cuantitativos'],
    rules: ['Resume el grado de apoyo a hipótesis y objetivos sin repetir toda la sección de resultados.', 'Interpreta magnitud, precisión y relevancia de los efectos, no solo significación estadística.', 'Compara resultados con literatura pertinente y explica coincidencias, diferencias y explicaciones alternativas.', 'Expone limitaciones, fuentes de sesgo, imprecisión, multiplicidad y límites de generalización.', 'Distingue claramente conclusiones confirmatorias de interpretaciones exploratorias y plantea implicaciones o investigaciones futuras con prudencia.'],
    citationTreatment: ['Cita los estudios con los que se comparan los resultados y las teorías usadas para interpretarlos.', 'No cites una fuente como respaldo de una conclusión que contradice o excede lo que esa fuente sostiene.'],
    referenceTreatment: ['Las obras nuevas introducidas en la discusión deben aparecer también en la lista general de referencias.'],
  }),
  'quantitative-experimental-nonexperimental-modules': verified({
    id: 'quantitative-experimental-nonexperimental-modules', label: 'Módulos para diseños experimentales y no experimentales', manualSection: '3.9', manualPrintedPages: '91-92',
    appliesTo: ['Experimentos, cuasiexperimentos y estudios observacionales/no experimentales'],
    rules: ['Además de los requisitos generales, selecciona el módulo que corresponda al diseño real.', 'En estudios experimentales reporta unidades de asignación, secuencia, ocultamiento, enmascaramiento, condiciones y fidelidad de la intervención.', 'En estudios no experimentales reporta estrategia de selección, temporalidad, definición de exposiciones y resultados, control de confusión y justificación causal prudente.', 'No describas como aleatorizado, experimental, longitudinal o causal un diseño que no cumple esas características.'],
    citationTreatment: ['Cita el protocolo, intervención o estándar especializado utilizado cuando sea externo.', 'La etiqueta del diseño no sustituye evidencia metodológica ni una referencia del protocolo.'],
    referenceTreatment: ['Referencia el protocolo, guía de reporte o intervención citada y enlaza el registro verificable cuando corresponda.'],
  }),
  'quantitative-special-designs': verified({
    id: 'quantitative-special-designs', label: 'Diseños cuantitativos especiales', manualSection: '3.10', manualPrintedPages: '92-93',
    appliesTo: ['Ensayos clínicos, estudios N-de-1, longitudinales, observacionales y de replicación'],
    rules: ['Aplica el módulo específico además de las expectativas cuantitativas generales.', 'En ensayos identifica registro, protocolo, flujo por grupo, intervención, comparador, desenlaces y daños.', 'En N-de-1 describe fases, repetición, unidades, medición continua y lógica de inferencia individual.', 'En longitudinales reporta olas, calendario, retención, dependencia temporal y cambios de medición.', 'En replicaciones identifica el estudio objetivo, tipo de replicación, similitudes, desviaciones y criterio previo de evaluación.', 'Si otro estándar disciplinar obligatorio es más específico, úsalo y explica su relación con JARS.'],
    citationTreatment: ['Cita el estudio replicado, protocolo, ensayo registrado y guía especializada realmente aplicada.', 'No presentes un trabajo como replicación sin identificar de forma inequívoca la obra objetivo.'],
    referenceTreatment: ['Incluye referencias completas de la obra replicada, protocolo y guía citada; un identificador de registro debe conservar su URL oficial.'],
  }),
  'quantitative-special-analyses': verified({
    id: 'quantitative-special-analyses', label: 'Enfoques analíticos cuantitativos especiales', manualSection: '3.11', manualPrintedPages: '93',
    appliesTo: ['Modelos de ecuaciones estructurales y análisis bayesianos; otros métodos con salidas particulares'],
    rules: ['Reporta supuestos, especificación del modelo, identificación, estimación, diagnóstico, ajuste y comparación con alternativas cuando sean pertinentes.', 'Para análisis bayesiano informa modelo, previas y su justificación, algoritmo, convergencia, sensibilidad y resúmenes posteriores.', 'No selecciones índices o resultados únicamente porque favorecen la conclusión.', 'Identifica software, paquete, versión y opciones que puedan afectar la reproducibilidad.'],
    citationTreatment: ['Cita el método, las previas informativas, el algoritmo y el software cuando procedan de fuentes externas.', 'No uses una cita metodológica como sustituto de reportar las opciones realmente usadas.'],
    referenceTreatment: ['Referencia documentación o publicación del software y las fuentes metodológicas citadas con versión verificable cuando aplique.'],
  }),
  'quantitative-meta-analysis': verified({
    id: 'quantitative-meta-analysis', label: 'Meta-análisis cuantitativo', manualSection: '3.12', manualPrintedPages: '93',
    appliesTo: ['Síntesis cuantitativas y meta-análisis'],
    rules: ['Define preguntas, protocolo, criterios de elegibilidad, fuentes, estrategia de búsqueda completa y fecha de la última búsqueda.', 'Explica selección, extracción, codificación, tratamiento de múltiples resultados y evaluación de calidad o riesgo de sesgo.', 'Identifica métrica de efecto, modelo, ponderación, dependencia, heterogeneidad, moderadores y análisis de sensibilidad.', 'Reporta diagrama o recuento de selección, características de estudios, estimaciones individuales y combinadas, incertidumbre y sesgo de publicación.', 'Distingue análisis planeados de los exploratorios y registra desviaciones del protocolo.'],
    citationTreatment: ['Cita los estudios incluidos conforme a la política elegida y deja inequívoco cuáles forman parte del meta-análisis.', 'Cita el protocolo, herramientas y métodos de síntesis utilizados.'],
    referenceTreatment: ['Incluye referencias completas de los estudios citados y de las fuentes metodológicas; no inventes referencias para registros sin metadatos suficientes.'],
  }),
  'qualitative-basic-expectations': verified({
    id: 'qualitative-basic-expectations', label: 'Expectativas básicas de investigación cualitativa', manualSection: '3.13', manualPrintedPages: '93-94',
    appliesTo: ['Investigación cualitativa primaria'],
    rules: ['Presenta el enfoque cualitativo, objetivos y contexto de forma coherente con la tradición de investigación.', 'Favorece transparencia y utilidad sin imponer una estructura cuantitativa incompatible.', 'Describe la perspectiva de los investigadores y cómo influye en preguntas, relaciones, recolección, análisis e interpretación.', 'Explica cómo las decisiones metodológicas sostienen la integridad del estudio y reconoce alternativas y límites.', 'Protege identidades y contexto de participantes al decidir cuánto detalle reportar.'],
    citationTreatment: ['Cita la tradición metodológica, marco interpretativo y literatura sustantiva realmente utilizada.', 'Las voces de participantes son datos del estudio y se presentan conforme al consentimiento; no se convierten en referencias personales inventadas.'],
    referenceTreatment: ['Referencia las fuentes metodológicas y teóricas citadas; los participantes normalmente no aparecen en la lista de referencias.'],
  }),
  'qualitative-method': verified({
    id: 'qualitative-method', label: 'Método cualitativo', manualSection: '3.14', manualPrintedPages: '94-103',
    appliesTo: ['Sección Método de estudios cualitativos'],
    rules: ['Describe enfoque o tradición, paradigma o marco interpretativo y su relación con el diseño.', 'Identifica investigadores, experiencia, posiciones y relaciones relevantes, incluida reflexividad sobre su influencia.', 'Describe participantes o fuentes, contexto, muestreo, reclutamiento, selección, criterios, tamaño y fundamento de suficiencia.', 'Explica recolección: forma de datos, preguntas, guías, duración, grabación, transcripción, notas, cambios y saturación u otro criterio si se usó.', 'Reporta ética, consentimiento, confidencialidad, compensación y decisiones para proteger identidades.', 'Detalla gestión y análisis: unidades, codificación, iteraciones, equipos, software, triangulación, auditoría y resolución de discrepancias cuando existan.', 'Demuestra integridad metodológica mediante adecuación, fidelidad, utilidad, coherencia y atención a variaciones o contradicciones; no uses una lista mecánica de validación ajena al enfoque.'],
    citationTreatment: ['Cita el enfoque, procedimiento analítico, guías, software o materiales externos que se adoptaron o adaptaron.', 'No atribuyas una decisión propia a una obra que no la prescribe.'],
    referenceTreatment: ['Referencia fuentes metodológicas, marcos, instrumentos y software citados; conserva versión y URL/DOI verificables cuando correspondan.'],
  }),
  'qualitative-findings': verified({
    id: 'qualitative-findings', label: 'Resultados o hallazgos cualitativos', manualSection: '3.15', manualPrintedPages: '103',
    appliesTo: ['Sección Resultados o Hallazgos de estudios cualitativos'],
    rules: ['Presenta hallazgos compatibles con el enfoque y vinculados de manera visible con los datos analizados.', 'Usa citas, extractos, descripciones, casos o representaciones suficientes para sustentar las afirmaciones analíticas.', 'Distingue voz de participantes, interpretación de los investigadores y aportes de fuentes externas.', 'Incluye variaciones, excepciones, tensiones y evidencia que complique la interpretación, no solo ejemplos favorables.', 'Protege confidencialidad y evita detalles que permitan reidentificación.'],
    citationTreatment: ['Los extractos de participantes del estudio se identifican con seudónimo o código conforme al diseño y no llevan entrada bibliográfica.', 'Cita como fuente externa cualquier texto, archivo, publicación o conjunto de datos ajeno incorporado al análisis.'],
    referenceTreatment: ['Las fuentes documentales recuperables analizadas se referencian según su tipo; entrevistas confidenciales del propio estudio normalmente no se listan.'],
  }),
  'qualitative-discussion': verified({
    id: 'qualitative-discussion', label: 'Discusión cualitativa', manualSection: '3.16', manualPrintedPages: '103-104',
    appliesTo: ['Sección Discusión de estudios cualitativos'],
    rules: ['Explica la contribución de los hallazgos al problema y al conocimiento existente.', 'Relaciona interpretaciones con contexto, enfoque y evidencia presentada.', 'Expone límites, perspectivas alternativas, condiciones de transferibilidad y consecuencias de la posición de los investigadores.', 'Evita generalizaciones estadísticas o causales que el diseño cualitativo no permite.', 'Describe implicaciones para teoría, práctica, política o investigación futura sin exceder los hallazgos.'],
    citationTreatment: ['Cita literatura teórica y empírica al comparar o extender interpretaciones.', 'No uses una cita externa para borrar desacuerdos o evidencia negativa encontrada en los datos.'],
    referenceTreatment: ['Toda obra incorporada a la interpretación debe aparecer en la lista general.'],
  }),
  'qualitative-meta-analysis': verified({
    id: 'qualitative-meta-analysis', label: 'Meta-análisis o metasíntesis cualitativa', manualSection: '3.17', manualPrintedPages: '104-105',
    appliesTo: ['Síntesis cualitativas, metasíntesis y revisiones interpretativas'],
    rules: ['Declara enfoque de síntesis, preguntas, protocolo si existe, criterios de elegibilidad, búsqueda, selección y corpus final.', 'Describe extracción, evaluación o apreciación de estudios, traducción entre conceptos, codificación y proceso de síntesis.', 'Reporta perspectiva y reflexividad del equipo, decisiones iterativas y tratamiento de diversidad, contradicciones y casos negativos.', 'Vincula las conclusiones de síntesis con evidencia rastreable de los estudios primarios.', 'No denomines meta-análisis cualitativo a una revisión narrativa sin procedimiento de síntesis explícito.'],
    citationTreatment: ['Identifica y cita inequívocamente los estudios incluidos y las fuentes metodológicas de la síntesis.', 'Distingue estudios incluidos de obras usadas solo como contexto.'],
    referenceTreatment: ['Incluye referencias completas de los estudios citados y del método de síntesis; una tabla de estudios no sustituye la lista general.'],
  }),
  'mixed-methods-reporting': verified({
    id: 'mixed-methods-reporting', label: 'Investigación de métodos mixtos', manualSection: '3.18', manualPrintedPages: '105-108',
    appliesTo: ['Estudios que recogen e integran datos cualitativos y cuantitativos'],
    rules: ['Aplica las expectativas cualitativas y cuantitativas pertinentes además de las específicas de métodos mixtos.', 'Justifica por qué se necesitan ambos tipos de datos y qué valor añade integrarlos.', 'Identifica y define el diseño mixto, su secuencia o simultaneidad, prioridad, puntos de integración y enfoques de cada componente.', 'Declara objetivos cualitativos, cuantitativos y mixtos en un orden coherente con el diseño.', 'Describe muestreo, recolección, análisis e integridad de cada componente y cómo se conectaron, combinaron o incorporaron.', 'Presenta resultados de cada componente y metainferencias integradas, incluidas convergencias, divergencias e inconsistencias.', 'No llames “métodos mixtos” a la mera presencia de números y texto si no existe integración metodológica.'],
    citationTreatment: ['Cita el diseño mixto, los enfoques de cada componente, instrumentos, datos, software y procedimientos externos utilizados.', 'Las tablas conjuntas o visualizaciones propias se llaman por número; el material externo que incorporen conserva su cita.'],
    referenceTreatment: ['Referencia todas las fuentes metodológicas y sustantivas citadas con la plantilla de su tipo real.', 'Una referencia de métodos mixtos no reemplaza las referencias específicas de instrumentos o métodos cualitativos y cuantitativos.'],
  }),
};

export function getReportingRule(id: ReportingRuleId): Apa7VerifiedReportingRule {
  return reportingRules[id];
}
