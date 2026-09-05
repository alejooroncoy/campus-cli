import { z } from 'zod';

export const biasFreeLanguageRuleId = z.enum([
  'appropriate-specificity',
  'sensitivity-to-labels',
  'age',
  'disability',
  'gender',
  'research-participation',
  'racial-ethnic-identity',
  'sexual-orientation',
  'socioeconomic-status',
  'intersectionality',
]);

export type BiasFreeLanguageRuleId = z.infer<typeof biasFreeLanguageRuleId>;

export interface Apa7VerifiedBiasFreeLanguageRule {
  id: BiasFreeLanguageRuleId;
  label: string;
  manualSection: `5.${number}`;
  manualPrintedPages: string;
  status: 'verified';
  rules: string[];
  citationTreatment: string[];
  referenceTreatment: string[];
  refuseWhen: string[];
}

const verified = (rule: Omit<Apa7VerifiedBiasFreeLanguageRule, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): Apa7VerifiedBiasFreeLanguageRule => ({
  ...rule,
  status: 'verified',
  refuseWhen: rule.refuseWhen ?? [
    'No se conoce cómo las personas o comunidades se identifican y la etiqueta no puede verificarse.',
    'Se intenta inferir identidad, edad, discapacidad, género, orientación, raza, etnia o clase a partir de nombre, apariencia o estereotipo.',
    'La característica no es relevante para la pregunta y añadirla expondría o estigmatizaría a las personas.',
  ],
});

export const biasFreeLanguageRules: Record<BiasFreeLanguageRuleId, Apa7VerifiedBiasFreeLanguageRule> = {
  'appropriate-specificity': verified({
    id: 'appropriate-specificity', label: 'Nivel apropiado de especificidad', manualSection: '5.1', manualPrintedPages: '132-133',
    rules: ['Describe edad, discapacidad, género, participación, identidad racial o étnica, orientación sexual y nivel socioeconómico con el grado de detalle que sea relevante y disponible.', 'Prefiere grupos o rangos concretos frente a categorías amplias que ocultan diferencias.', 'Explica cómo se midió o determinó una categoría y reconoce categorías múltiples o abiertas cuando existan.', 'No agregues detalle sensible solo para aparentar precisión ni generalices más allá de la muestra.'],
    citationTreatment: ['Las características observadas o declaradas por la muestra se reportan como datos del estudio, no con una cita autor-fecha inventada.', 'Cita la fuente de una definición, clasificación, medida o comparación externa.'],
    referenceTreatment: ['Incluye la entrada de toda taxonomía, instrumento o fuente externa citada; los participantes del propio estudio normalmente no se listan como referencias.'],
  }),
  'sensitivity-to-labels': verified({
    id: 'sensitivity-to-labels', label: 'Sensibilidad respecto de las etiquetas', manualSection: '5.2', manualPrintedPages: '133-135',
    rules: ['Usa, cuando sea posible, los nombres que las personas o comunidades emplean para sí mismas.', 'Reconoce que las preferencias varían entre individuos y cambian con el tiempo; verifica la terminología actual y el contexto local.', 'Evita reducir a una persona a una característica usando adjetivos como sustantivos colectivos.', 'Respeta tanto lenguaje centrado en la persona como lenguaje centrado en la identidad cuando una comunidad o persona exprese esa preferencia.', 'Explica las etiquetas creadas por el estudio y evita etiquetas comparativas que presenten un grupo como norma.'],
    citationTreatment: ['No se necesita una cita solo para respetar la autoidentificación de participantes.', 'Cita una guía o fuente comunitaria cuando se invoque como fundamento de una decisión terminológica o definición.'],
    referenceTreatment: ['Referencia únicamente la guía, estudio o vocabulario recuperable que se haya citado; no conviertas identidades personales en entradas bibliográficas.'],
  }),
  age: verified({
    id: 'age', label: 'Edad', manualSection: '5.3', manualPrintedPages: '135-136',
    rules: ['Reporta rangos de edad específicos y, cuando sea útil, media y desviación u otra distribución pertinente.', 'Usa términos como bebés, niños, adolescentes, adultos o adultos mayores solo con límites definidos o comprensibles en el contexto.', 'Usa niñas y niños para menores, y mujeres y hombres para adultos; evita términos condescendientes o vagos.', 'Evita lenguaje que presente el envejecimiento como deterioro inevitable o que homogeneice a las personas mayores.', 'No sustituyas edad cronológica por una suposición basada en etapa educativa, rol o apariencia.'],
    citationTreatment: ['La edad de participantes se reporta como dato; cita normas, categorías o afirmaciones externas sobre desarrollo y envejecimiento.'],
    referenceTreatment: ['Referencia la fuente de rangos normativos, instrumentos o afirmaciones citadas; no generes referencias para los datos demográficos propios.'],
  }),
  disability: verified({
    id: 'disability', label: 'Discapacidad', manualSection: '5.4', manualPrintedPages: '136-138',
    rules: ['Consulta o respeta la preferencia entre lenguaje centrado en la persona y centrado en la identidad.', 'Usa términos neutrales y precisos; evita expresiones de lástima, sufrimiento, carga, confinamiento o normalidad presumida.', 'No equipares una discapacidad con enfermedad ni supongas que todas las personas con el mismo diagnóstico comparten experiencia o identidad.', 'Capitaliza nombres de comunidades cuando esa sea su convención, como puede ocurrir con la comunidad Sorda.', 'Distingue diagnóstico, limitación funcional, barrera ambiental e identidad cuando sean relevantes.'],
    citationTreatment: ['Cita criterios diagnósticos, instrumentos, modelos o afirmaciones sobre prevalencia y efectos.', 'La preferencia terminológica declarada por una persona no requiere una cita bibliográfica.'],
    referenceTreatment: ['Referencia manuales diagnósticos, escalas y fuentes empíricas citadas; no listes historias clínicas o participantes confidenciales.'],
  }),
  gender: verified({
    id: 'gender', label: 'Sexo, género e identidad de género', manualSection: '5.5', manualPrintedPages: '138-141',
    rules: ['Distingue sexo asignado o características sexuales, género, identidad de género y expresión de género; no los uses como sinónimos.', 'Usa los nombres y pronombres que cada persona utiliza y no infieras identidad a partir de apariencia, nombre o sexo asignado.', 'Incluye opciones no binarias y de autodescripción cuando el diseño lo permita; no presupongas que solo existen dos géneros.', 'Usa transgénero y cisgénero como adjetivos cuando sean relevantes, no como sustantivos que reduzcan a la persona.', 'Evita “sexo opuesto” o “género opuesto”; usa “otro género”, “géneros diferentes” o una descripción exacta.', 'Distingue identidad de género de orientación sexual.'],
    citationTreatment: ['Cita la fuente de definiciones, escalas, estadísticas o marcos sobre sexo y género.', 'La autoidentificación y los pronombres de participantes se reportan como datos o preferencias, no como comunicación personal en referencias.'],
    referenceTreatment: ['Referencia las fuentes conceptuales o instrumentos citados; no incluyas identidades individuales de la muestra en la lista.'],
    refuseWhen: ['No se verificaron nombre o pronombres y se pretende asignarlos.', 'Se fusionan sexo, género y orientación sexual como una sola variable.', 'Se expone una identidad sensible sin relevancia, consentimiento o protección suficiente.'],
  }),
  'research-participation': verified({
    id: 'research-participation', label: 'Participación en la investigación', manualSection: '5.6', manualPrintedPages: '141-142',
    rules: ['Usa “participantes” para personas que toman parte en una investigación y un término más específico cuando describa mejor su papel.', 'Paciente, cliente, estudiante u otro rol es apropiado solo cuando ese contexto sea real y relevante.', 'Reserva “sujeto” para usos técnicos justificados o para sujetos no humanos según la disciplina; no lo uses para despersonalizar.', 'Evita culpabilizar con expresiones como “no cumplió” cuando puede describirse objetivamente qué procedimiento no se completó.', 'Distingue participantes, muestra, encuestados, informantes, colaboradores y población objetivo.'],
    citationTreatment: ['Los participantes del propio estudio no reciben citas autor-fecha por sus datos o extractos.', 'Una entrevista publicada o un conjunto de datos externo sí se cita según su fuente; una comunicación privada ajena al estudio sigue la regla de comunicación personal.'],
    referenceTreatment: ['No incluyas participantes confidenciales en referencias.', 'Referencia instrumentos, conjuntos de datos o publicaciones externas usados para describir o comparar la muestra.'],
  }),
  'racial-ethnic-identity': verified({
    id: 'racial-ethnic-identity', label: 'Identidad racial y étnica', manualSection: '5.7', manualPrintedPages: '142-145',
    rules: ['Usa las denominaciones específicas y de autoidentificación pertinentes al contexto cultural y nacional.', 'No trates raza y etnia como categorías biológicas fijas ni las uses como sinónimos sin justificar la operacionalización.', 'Capitaliza los nombres de grupos raciales y étnicos conforme a la convención editorial aplicable.', 'Evita “caucásico” como sustituto impreciso de blanco y evita usar “minoría” como sustantivo que homogeneiza grupos.', 'No presentes a un grupo dominante como norma ni agrupes comunidades distintas sin justificarlo.', 'Reporta cómo se recogieron las categorías, si podían elegirse varias y quién las asignó.'],
    citationTreatment: ['Cita clasificaciones oficiales, marcos históricos o afirmaciones empíricas sobre raza y etnia.', 'La autoidentificación de la muestra es un dato del estudio y no genera una cita externa.'],
    referenceTreatment: ['Referencia el censo, guía, taxonomía o estudio citado y señala su jurisdicción o población; no trasplantes categorías de otro país sin explicación.'],
    refuseWhen: ['Se pretende inferir raza o etnia por apellido, fotografía, idioma o nacionalidad.', 'La categoría procede de otro país o sistema y se aplica sin justificar su equivalencia.', 'La agrupación borraría diferencias relevantes o produciría riesgo de reidentificación.'],
  }),
  'sexual-orientation': verified({
    id: 'sexual-orientation', label: 'Orientación sexual', manualSection: '5.8', manualPrintedPages: '145-147',
    rules: ['Distingue orientación sexual, conducta sexual, atracción e identidad; no presupongas que coinciden.', 'Usa los términos elegidos por las personas, como lesbiana, gay, bisexual, asexual, pansexual u otra autoidentificación pertinente.', 'Evita “preferencia sexual” cuando sugiera que la orientación es una elección y evita “homosexual” cuando resulte patologizante o distante.', 'No uses orientación sexual para inferir género, identidad de género, estado civil o conducta.', 'Agrupa orientaciones distintas solo cuando el análisis lo justifique y explica la agrupación.'],
    citationTreatment: ['Cita definiciones, escalas y afirmaciones externas sobre orientación; la autoidentificación de participantes se reporta como dato.'],
    referenceTreatment: ['Referencia instrumentos y fuentes citadas, no a participantes individuales.'],
  }),
  'socioeconomic-status': verified({
    id: 'socioeconomic-status', label: 'Nivel socioeconómico', manualSection: '5.9', manualPrintedPages: '147-148',
    rules: ['Define qué componentes representa el nivel socioeconómico: ingresos, educación, ocupación, riqueza, vivienda, percepción de clase u otros.', 'Reporta cómo se midió, en qué unidad, periodo, moneda o contexto y qué categorías se utilizaron.', 'Evita términos vagos o peyorativos como “los pobres”; describe condiciones o recursos concretos.', 'No uses educación, empleo o código postal como sustituto universal de nivel socioeconómico sin justificarlo.', 'Reconoce que el significado de ingresos y clase depende del lugar, tamaño del hogar y momento histórico.'],
    citationTreatment: ['Cita el índice, umbral, clasificación o fuente externa usada para construir el nivel socioeconómico.', 'Los ingresos declarados por la muestra son datos propios y no llevan cita bibliográfica.'],
    referenceTreatment: ['Referencia instrumentos, estadísticas oficiales y clasificaciones citadas con su fecha y jurisdicción.'],
  }),
  intersectionality: verified({
    id: 'intersectionality', label: 'Interseccionalidad', manualSection: '5.10', manualPrintedPages: '148-150',
    rules: ['Considera cómo identidades y posiciones sociales múltiples interactúan en un contexto, en vez de tratarlas como rasgos aislados y simplemente aditivos.', 'Evita asumir que una sola característica explica la experiencia completa de un grupo.', 'Describe qué intersecciones son relevantes para la pregunta, cómo se analizaron y qué tamaños o límites tienen los subgrupos.', 'No crees cruces de categorías tan pequeños que permitan reidentificar personas o sostengan conclusiones inestables.', 'Reconoce variación dentro de los grupos y relaciones de poder o contexto cuando sean pertinentes.'],
    citationTreatment: ['Cita el marco teórico y la evidencia externa que sustenten una interpretación interseccional.', 'Las combinaciones demográficas observadas en la muestra se reportan como datos y no como citas externas.'],
    referenceTreatment: ['Referencia las obras teóricas, métodos y fuentes de clasificación citadas; no añadas una referencia genérica para sustituir el análisis realizado.'],
  }),
};

export function getBiasFreeLanguageRule(id: BiasFreeLanguageRuleId): Apa7VerifiedBiasFreeLanguageRule {
  return biasFreeLanguageRules[id];
}
