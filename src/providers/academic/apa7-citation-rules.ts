import { z } from 'zod';

export const citationRuleId = z.enum([
  'appropriate-citation-level',
  'plagiarism-attribution',
  'self-plagiarism',
  'reference-text-correspondence',
  'version-used',
  'primary-secondary-source',
  'interview-source',
  'classroom-intranet-source',
  'personal-communication',
  'indigenous-traditional-knowledge',
  'author-date-system',
  'parenthetical-narrative-citation',
  'multiple-works-citation',
  'specific-part-citation',
  'unknown-or-anonymous-author',
  'translated-reprinted-date',
  'repeated-narrative-year',
  'number-of-authors',
  'ambiguous-et-al',
  'same-author-same-date',
  'same-surname-authors',
  'group-author-abbreviation',
  'general-mention-site-periodical-software',
  'paraphrase',
  'long-paraphrase',
  'direct-quote-principles',
  'short-quote',
  'block-quote',
  'quote-without-page-numbers',
  'quote-accuracy',
  'quote-changes-no-explanation',
  'quote-changes-requiring-explanation',
  'quote-containing-citations',
  'quote-containing-quotation-marks',
  'permission-for-long-quotation',
  'epigraph',
  'research-participant-quotation',
]);

export type CitationRuleId = z.infer<typeof citationRuleId>;

export interface Apa7VerifiedCitationRule {
  id: CitationRuleId;
  label: string;
  manualSection: `8.${number}`;
  manualPrintedPages: string;
  status: 'verified';
  whenToUse: string;
  rules: string[];
  examples: string[];
  referenceTreatment: string;
  refuseWhen: string[];
}

const guards = [
  'No se verificó la fuente original ni que el fragmento coincida con ella.',
  'Falta autor, año o un localizador real cuando la regla los exige.',
  'Se inventó una página, sección, párrafo, marca de tiempo o dato bibliográfico.',
];

const verified = (rule: Omit<Apa7VerifiedCitationRule, 'status' | 'refuseWhen'> & { refuseWhen?: string[] }): Apa7VerifiedCitationRule => ({
  ...rule,
  status: 'verified',
  refuseWhen: rule.refuseWhen ?? guards,
});

export const citationRules: Record<CitationRuleId, Apa7VerifiedCitationRule> = {
  'appropriate-citation-level': verified({
    id: 'appropriate-citation-level', label: 'Nivel apropiado de citación', manualSection: '8.1', manualPrintedPages: '259-260',
    whenToUse: 'Para decidir qué afirmaciones necesitan atribución y cuántas fuentes son suficientes.',
    rules: ['Cita ideas, teorías, investigaciones, definiciones, datos y cifras que influyeron directamente en el trabajo.', 'Cita solo obras leídas y las ideas realmente incorporadas.', 'Prefiere fuentes primarias y usa fuentes secundarias con moderación.', 'Los hechos de conocimiento común no requieren cita.', 'La cantidad de fuentes depende del propósito: normalmente una o dos representativas por punto; una revisión suele necesitar cobertura más exhaustiva.', 'Evita tanto la falta como la repetición mecánica de citas cuando fuente y tema siguen claros.', 'Paráfrasis, citas directas y material adaptado o reproducido requieren atribución; algunos usos también requieren permiso.'],
    examples: ['Afirmación derivada de una investigación → cita autor-fecha.', 'Hecho de conocimiento común → no necesita cita.'],
    referenceTreatment: 'Toda obra recuperable citada debe aparecer en referencias, salvo una excepción APA explícita.',
    refuseWhen: ['No se puede distinguir una idea propia de una idea derivada de otra fuente.', 'Se pretende citar una obra que no fue leída o consultada.', 'Se afirma que existe una cantidad universal de citas adecuada para todo trabajo.'],
  }),
  'plagiarism-attribution': verified({
    id: 'plagiarism-attribution', label: 'Atribución para evitar plagio', manualSection: '8.2', manualPrintedPages: '260-262',
    whenToUse: 'Cuando se incorporan palabras, ideas, imágenes, datos o materiales creados por otra persona.',
    rules: ['Presentar palabras, ideas o imágenes ajenas como propias es plagio, sea deliberado o no.', 'Atribuye paráfrasis, citas directas, datos, tablas, figuras, imágenes y material protegido reproducido o adaptado.', 'La atribución también alcanza teorías, diseños o razonamientos que originaron el trabajo.', 'No inventes citas ni referencias y no contrates a otra persona para presentar su trabajo como propio.', 'Errores bibliográficos menores por descuido no equivalen automáticamente a plagio, pero deben corregirse.', 'Una revisión APA puede detectar problemas visibles de atribución, pero no determinar por sí sola la existencia o intención de plagio.'],
    examples: ['Idea parafraseada → cita de la fuente.', 'Tabla adaptada → cita, referencia y atribución de derechos cuando corresponda.'],
    referenceTreatment: 'Incluye la fuente recuperable realmente utilizada; una comunicación irrecuperable se cita solo en el texto.',
    refuseWhen: ['Se pide declarar definitivamente que una persona plagió basándose solo en formato APA.', 'Se proponen fuentes ficticias o no localizables.', 'No se ha identificado qué material pertenece a cada fuente.'],
  }),
  'self-plagiarism': verified({
    id: 'self-plagiarism', label: 'Autoplagio y reutilización de trabajo propio', manualSection: '8.3', manualPrintedPages: '262-263',
    whenToUse: 'Cuando se reutilizan textos, datos o trabajos propios publicados o entregados anteriormente.',
    rules: ['Presentar una obra propia ya publicada como nueva es autoplagio.', 'Reutilizar un trabajo de otra clase puede infringir la política académica; consulta al docente y la política institucional.', 'Una tesis o trabajo previo puede incorporarse cuando las reglas lo permiten y se reconoce la procedencia.', 'La repetición limitada de formulaciones metodológicas puede ser aceptable; una repetición extensa exige citar la fuente propia.', 'Concentra el material duplicado en pocos párrafos, introdúcelo como discutido previamente y cita cada párrafo.', 'Para material propio duplicado no uses comillas ni bloque; la nueva obra debe aportar una contribución original.', 'Al reanalizar datos propios publicados, identifica el proyecto anterior y equilibra la explicación necesaria con la cita a la obra previa.'],
    examples: ['Como se explicó previamente… (Autor, Año).'],
    referenceTreatment: 'La obra propia anterior citada aparece en referencias, salvo ocultamiento temporal autorizado por revisión ciega.',
    refuseWhen: ['No se conoce la política del curso o la autorización del docente para reutilizar una entrega.', 'Se pretende presentar íntegramente un trabajo anterior como nuevo.', 'No se puede identificar ni citar la publicación o entrega previa pertinente.'],
  }),
  'reference-text-correspondence': verified({
    id: 'reference-text-correspondence', label: 'Correspondencia entre texto y referencias', manualSection: '8.4', manualPrintedPages: '263-264',
    whenToUse: 'Al revisar que las citas y la lista de referencias coincidan.',
    rules: ['Cada obra citada debe figurar en referencias y cada referencia debe citarse en el texto.', 'Autor y año deben coincidir ortográficamente entre ambos lugares.', 'Aunque la referencia tenga fecha completa, la cita usa solo el año.', 'Excepciones: comunicaciones personales; menciones generales de sitios, publicaciones o software común; ciertos epígrafes; participantes de investigación; y obras incluidas en un metaanálisis marcadas según su regla.'],
    examples: ['(Autor, 2024) ↔ Autor. (2024). Título…'],
    referenceTreatment: 'Auditoría bidireccional con las excepciones declaradas; no elimines ni añadas entradas automáticamente sin clasificarlas.',
    refuseWhen: ['Autor o año no coinciden y no puede determinarse cuál es correcto.', 'Una entrada no citada podría ser una excepción de metaanálisis no verificada.', 'Se intenta forzar una referencia para una excepción que expresamente no la lleva.'],
  }),
  'version-used': verified({
    id: 'version-used', label: 'Versión publicada o versión de archivo', manualSection: '8.5', manualPrintedPages: '264',
    whenToUse: 'Cuando existen varias versiones de la misma obra.',
    rules: ['Cita la versión que realmente utilizaste.', 'Prefiere la versión final publicada cuando fue la consultada.', 'Una versión anticipada, en prensa, manuscrito aceptado, preprint, borrador o publicación informal puede citarse cuando esa fue la versión usada.', 'Antes de entregar, busca una versión más actualizada y actualiza la referencia si corresponde.', 'No conviertas retrospectivamente una versión consultada en otra sin comprobar que el contenido utilizado coincide.'],
    examples: ['Preprint consultado → referencia del preprint; artículo final consultado → referencia del artículo final.'],
    referenceTreatment: 'La referencia describe exactamente el estado y lugar de la versión consultada.',
    refuseWhen: ['No se sabe qué versión se consultó.', 'Se mezclaron metadatos de un preprint y de la versión final.', 'Se supone que dos versiones son idénticas sin comprobarlo.'],
  }),
  'primary-secondary-source': verified({
    id: 'primary-secondary-source', label: 'Fuentes primarias y secundarias', manualSection: '8.6', manualPrintedPages: '264',
    whenToUse: 'Cuando una obra consultada relata o cita contenido de una obra original no consultada.',
    rules: ['Consulta y cita la fuente primaria siempre que sea posible.', 'Usa una fuente secundaria con moderación cuando la original no esté disponible, no se imprima o esté en un idioma inaccesible.', 'En el texto identifica la fuente primaria y escribe “como se cita en” antes de la secundaria.', 'Incluye el año de la primaria si se conoce; si no, omítelo.', 'En referencias incluye solo la fuente secundaria realmente consultada.'],
    examples: ['(Autor original, 1982, como se cita en Autor consultado, 2014)', 'Autor original (como se cita en Autor consultado, 2003)'],
    referenceTreatment: 'Solo la fuente secundaria consultada aparece en referencias.',
    refuseWhen: ['Se intenta crear una referencia para la fuente primaria no consultada.', 'No se identificó la fuente secundaria realmente utilizada.', 'Se afirma haber leído la fuente primaria sin evidencia.'],
  }),
  'interview-source': verified({
    id: 'interview-source', label: 'Entrevistas publicadas, personales y de investigación', manualSection: '8.7', manualPrintedPages: '265',
    whenToUse: 'Cuando la información procede de una entrevista.',
    rules: ['Una entrevista publicada usa el formato del medio que la contiene; la persona entrevistada no necesariamente es el autor de la referencia.', 'Una entrevista personal irrecuperable se cita como comunicación personal.', 'Una entrevista realizada a participantes como parte de la investigación propia no requiere cita APA ni referencia; se presenta según las reglas de participantes.', 'El nombre del entrevistado puede integrarse narrativamente aunque otra persona o entidad ocupe la autoría de la obra publicada.'],
    examples: ['Entrevista en pódcast → caso de episodio de pódcast.', '(A. Apellido, comunicación personal, fecha exacta).'],
    referenceTreatment: 'Publicada: referencia del medio; personal: sin referencia; participante propio: sin cita ni referencia APA.',
    refuseWhen: ['No se clasificó la entrevista como publicada, personal o parte de la investigación.', 'Se atribuye automáticamente la autoría de una entrevista publicada al entrevistado.', 'Se intenta referenciar una entrevista personal irrecuperable.'],
  }),
  'classroom-intranet-source': verified({
    id: 'classroom-intranet-source', label: 'Fuente de aula virtual o intranet', manualSection: '8.8', manualPrintedPages: '265-266',
    whenToUse: 'Cuando una fuente solo es recuperable por estudiantes de un curso o miembros de una organización.',
    rules: ['Si el público destinatario puede acceder, cita y referencia el material con el formato de su tipo de fuente.', 'Para Blackboard u otro LMS, la fuente incluye el nombre del LMS y la URL de inicio de sesión o de su página principal.', 'Una presentación o clase grabada del LMS puede usar el caso de diapositivas/notas correspondiente.', 'Un informe de intranet usa el formato de informe.', 'Si el público no podrá acceder, trata el material como comunicación personal.'],
    examples: ['Autor. (Fecha). Título [Diapositivas]. Blackboard. URL de inicio de sesión.'],
    referenceTreatment: 'Lleva referencia solo si el público del trabajo puede recuperar el material.',
    refuseWhen: ['No se conoce quién leerá el trabajo ni si tendrá acceso.', 'Se publica una URL profunda con credenciales, token o información de sesión.', 'Se inventan autor, fecha o título porque el archivo del LMS carece de metadatos.'],
  }),
  'personal-communication': verified({
    id: 'personal-communication', label: 'Comunicación personal', manualSection: '8.9', manualPrintedPages: '266-267',
    whenToUse: 'Cuando la fuente no puede recuperarse: correo, chat, mensaje, entrevista personal, llamada, discurso en vivo o clase no grabada.',
    rules: ['Úsala solo si no existe una fuente recuperable preferible.', 'Incluye iniciales y apellido, las palabras “comunicación personal” y una fecha tan exacta como sea posible.', 'Puede ser narrativa o parentética.', 'No la uses para entrevistas con participantes de la investigación propia.', 'Si la comunicación está archivada y recuperable, cita el material de archivo correspondiente.'],
    examples: ['E.-M. Paradis (comunicación personal, 8 de agosto de 2019)', '(T. Nguyen, comunicación personal, 24 de febrero de 2020)'],
    referenceTreatment: 'No aparece en la lista de referencias.',
    refuseWhen: ['Existe una versión publicada, grabada o archivada recuperable.', 'Falta la identidad del comunicador o una fecha razonablemente precisa.', 'La información procede de participantes de la investigación propia.'],
  }),
  'indigenous-traditional-knowledge': verified({
    id: 'indigenous-traditional-knowledge', label: 'Conocimientos Tradicionales y Tradiciones Orales Indígenas', manualSection: '8.9', manualPrintedPages: '266-267',
    whenToUse: 'Cuando se presentan conocimientos o tradiciones de Pueblos Indígenas, registrados o no registrados.',
    rules: ['Si están registrados y son recuperables, usa la cita y referencia del tipo de fuente.', 'Si no están registrados, describe en el texto el contenido y su origen con contexto suficiente; no hay referencia.', 'Si se aprendieron directamente de una persona Indígena que no era participante, adapta la comunicación personal con nombre completo, nación o grupo, ubicación pertinente y fecha o rango.', 'Obtén consentimiento y confirma exactitud e idoneidad.', 'Si el propio autor Indígena comparte su conocimiento no registrado, contextualízalo en el texto sin cita personal ni referencia.', 'Una historia oral de participantes propios sigue las reglas de participantes.'],
    examples: ['Nombre completo (Nación o grupo, ubicación, comunicación personal, fecha) explicó…'],
    referenceTreatment: 'Registrado: referencia recuperable; no registrado: sin referencia; comunicación directa: solo en el texto.',
    refuseWhen: ['No se verificó si el conocimiento está registrado y es recuperable.', 'Faltan consentimiento, nación/grupo o contexto necesarios para una comunicación directa.', 'Se pretende imponer automáticamente una referencia occidental a conocimiento no registrado.'],
  }),
  'author-date-system': verified({
    id: 'author-date-system', label: 'Sistema autor-fecha', manualSection: '8.10', manualPrintedPages: '267-268',
    whenToUse: 'Para la forma general de las citas en el texto.',
    rules: ['Usa apellido del autor o nombre del grupo y año que coincidan con la referencia.', 'No incluyas sufijos personales como Jr. en la cita.', 'La cita usa solo el año aunque la referencia tenga fecha completa.', 'Sin fecha usa s. f.; una obra aceptada pero no publicada usa en prensa.', 'Un borrador usa el año en que fue escrito, no “en preparación” como fecha.', 'Cada cita debe conducir sin ambigüedad a una entrada o excepción identificada.'],
    examples: ['(Autor, 2024)', 'Autor (2024)', '(Autor, s. f.)', '(Autor, en prensa)'],
    referenceTreatment: 'Autor y fecha deben coincidir con la entrada completa correspondiente.',
  }),
  'parenthetical-narrative-citation': verified({
    id: 'parenthetical-narrative-citation', label: 'Citación parentética y narrativa', manualSection: '8.11', manualPrintedPages: '268-269',
    whenToUse: 'Al elegir si autor y fecha aparecen dentro de paréntesis o integrados en la prosa.',
    rules: ['Parentética: autor y fecha van entre paréntesis separados por coma; la puntuación final va después.', 'Narrativa: el autor se integra en la oración y el año va inmediatamente después entre paréntesis.', 'Si autor y fecha ya forman parte natural de la narración, no dupliques paréntesis.', 'Cuando una cita comparte paréntesis con otra explicación, sepárala correctamente y evita paréntesis anidados.'],
    examples: ['(Autor, 2024)', 'Autor (2024) demostró…'],
    referenceTreatment: 'Ambas formas remiten a la misma referencia.',
  }),
  'multiple-works-citation': verified({
    id: 'multiple-works-citation', label: 'Varias obras en una misma cita', manualSection: '8.12', manualPrintedPages: '269',
    whenToUse: 'Cuando una afirmación está respaldada por más de una obra.',
    rules: ['En una cita parentética ordena obras distintas alfabéticamente como en referencias y sepáralas con punto y coma.', 'Para el mismo autor o autores, escribe el nombre una vez y ordena fechas: s. f. primero, años cronológicos y en prensa al final.', 'Separa sus fechas con comas.', 'Si deseas destacar obras principales, cita primero estas y agrega “véase también” antes de las restantes.', 'Incluye solo las obras necesarias para sostener la afirmación.'],
    examples: ['(Autor A, 2020; Autor B, 2019)', '(Autor, s. f., 2018, 2020, en prensa)'],
    referenceTreatment: 'Cada obra citada tiene su propia entrada, salvo excepciones APA.',
  }),
  'specific-part-citation': verified({
    id: 'specific-part-citation', label: 'Parte específica de una fuente', manualSection: '8.13', manualPrintedPages: '270',
    whenToUse: 'Cuando se señala un pasaje, tabla, figura, capítulo, diapositiva o momento concreto.',
    rules: ['Añade el localizador real después de autor y año.', 'Puede ser página, páginas, párrafo, sección, tabla, figura, suplemento, nota, capítulo, prólogo, diapositiva o marca de tiempo.', 'Para obras clásicas o religiosas usa divisiones canónicas.', 'La lista de referencias contiene la obra completa, no una entrada separada para la parte.'],
    examples: ['(Autor, Año, p. 25)', '(Autor, Año, párr. 4)', '(Autor, Año, diapositiva 7)', '(Autor, Año, 1:02:15)'],
    referenceTreatment: 'Referencia la obra completa utilizada.',
  }),
  'unknown-or-anonymous-author': verified({
    id: 'unknown-or-anonymous-author', label: 'Autor desconocido o anónimo', manualSection: '8.14', manualPrintedPages: '270-271',
    whenToUse: 'Cuando la obra no identifica autor o declara expresamente autoría anónima.',
    rules: ['Si no hay autor, usa el título y el año.', 'Si el título está en cursiva en la referencia, úsalo en cursiva en la cita; en caso contrario, usa comillas dobles.', 'Abrevia un título largo conservando las palabras iniciales necesarias para identificarlo.', 'Usa “Anónimo” solo cuando la fuente firma explícitamente así.'],
    examples: ['(Título de la obra, Año)', '(“Título del artículo”, Año)', '(Anónimo, Año)'],
    referenceTreatment: 'Sin autor: el título ocupa la posición de autor; “Anónimo” solo si así se acredita.',
    refuseWhen: ['No se comprobó la página, portada o créditos para determinar autoría.', 'Se reemplaza un autor desconocido por “Anónimo” sin que la obra lo diga.', 'El título abreviado ya no permite vincular la cita con la referencia.'],
  }),
  'translated-reprinted-date': verified({
    id: 'translated-reprinted-date', label: 'Fechas de traducción, reimpresión, reedición o republicación', manualSection: '8.15', manualPrintedPages: '271',
    whenToUse: 'Cuando se consulta una traducción, reimpresión, republicación o reedición de una obra anterior.',
    rules: ['Incluye el año original y el año de la versión consultada separados por barra.', 'Coloca primero el año más antiguo.', 'No uses dos años si la relación entre versiones no está documentada.'],
    examples: ['(Autor, 1920/2020)', 'Autor (1920/2020)'],
    referenceTreatment: 'La referencia describe la versión consultada y documenta la publicación original según el tipo de fuente.',
  }),
  'repeated-narrative-year': verified({
    id: 'repeated-narrative-year', label: 'Omisión del año en citas narrativas repetidas', manualSection: '8.16', manualPrintedPages: '271-272',
    whenToUse: 'Cuando se repite narrativamente una misma obra dentro del mismo párrafo.',
    rules: ['Por regla general repite autor y año; no uses ibid.', 'Después de la primera cita narrativa del párrafo, puede omitirse el año en menciones narrativas posteriores si no hay ambigüedad.', 'En un párrafo nuevo, incluye otra vez el año en la primera mención.', 'Toda cita parentética conserva el año.', 'Si se citan varias obras del mismo autor, conserva el año en cada cita.'],
    examples: ['Autor (2020) explicó… Más adelante, Autor añadió…'],
    referenceTreatment: 'La omisión narrativa del año no altera la referencia.',
  }),
  'number-of-authors': verified({
    id: 'number-of-authors', label: 'Número de autores en la cita', manualSection: '8.17', manualPrintedPages: '272-273',
    whenToUse: 'Para abreviar correctamente citas según el número de autores.',
    rules: ['Un autor: usa su apellido en cada cita.', 'Dos autores: usa ambos apellidos en cada cita.', 'Tres o más: usa primer apellido más et al. desde la primera cita, salvo ambigüedad.', 'En parentética usa & entre dos autores; en narrativa en español usa “y”.', 'En tablas y figuras se usa & también en forma narrativa.', 'Estas reglas incluyen obras con autores grupales dentro de la lista de autores.'],
    examples: ['Autor y Autor (Año)', '(Autor & Autor, Año)', 'Autor et al. (Año)'],
    referenceTreatment: 'La lista de referencias conserva los autores según las reglas completas de autoría; et al. es una abreviación del texto.',
  }),
  'ambiguous-et-al': verified({
    id: 'ambiguous-et-al', label: 'Evitar ambigüedad con et al.', manualSection: '8.18', manualPrintedPages: '273',
    whenToUse: 'Cuando dos obras de tres o más autores se abreviarían de la misma forma y año.',
    rules: ['Escribe tantos apellidos como sean necesarios para distinguir las obras y luego et al.', 'Et al. representa pluralidad; no puede sustituir a una sola persona.', 'Si solo el último autor difiere, escribe todos los autores de cada obra.'],
    examples: ['Autor A, Autor B, et al. (2020) frente a Autor A, Autor C, et al. (2020).'],
    referenceTreatment: 'Cada obra conserva su entrada completa y distinta.',
  }),
  'same-author-same-date': verified({
    id: 'same-author-same-date', label: 'Mismo autor y misma fecha', manualSection: '8.19', manualPrintedPages: '273',
    whenToUse: 'Cuando las mismas personas o entidad tienen más de una obra del mismo año.',
    rules: ['Añade letras minúsculas al año: a, b, c.', 'Usa las mismas letras tanto en citas como en referencias.', 'Aunque la referencia tenga mes o día, la cita usa año más letra.', 'Para obras sin fecha usa s. f.-a, s. f.-b.'],
    examples: ['(Autor, 2020a, 2020b)', '(Autor, s. f.-a)'],
    referenceTreatment: 'Ordena las obras según las reglas APA y asigna letras coherentes a cada entrada.',
  }),
  'same-surname-authors': verified({
    id: 'same-surname-authors', label: 'Autores con el mismo apellido', manualSection: '8.20', manualPrintedPages: '273-274',
    whenToUse: 'Cuando primeros autores diferentes comparten apellido.',
    rules: ['Incluye las iniciales de los primeros autores en todas las citas, incluso si los años difieren.', 'Si apellido e iniciales coinciden, usa el formato autor-fecha normal.', 'Si una persona cambió de nombre, añade iniciales solo cuando hagan falta y, excepcionalmente, aclara en el texto que ambos nombres corresponden a la misma persona.', 'Varios coautores con el mismo apellido dentro de una misma referencia no requieren iniciales en la cita.'],
    examples: ['(J. M. Taylor, 2015; T. Taylor, 2014)'],
    referenceTreatment: 'Las entradas completas permiten distinguir a las personas; las iniciales añadidas en el texto resuelven la ambigüedad.',
  }),
  'group-author-abbreviation': verified({
    id: 'group-author-abbreviation', label: 'Abreviar autores grupales', manualSection: '8.21', manualPrintedPages: '274',
    whenToUse: 'Cuando una entidad autora tiene una abreviatura conocida que evita repeticiones y aparecerá al menos tres veces.',
    rules: ['Primera cita narrativa: nombre completo, abreviatura antes del año entre paréntesis.', 'Primera cita parentética: nombre completo y abreviatura entre corchetes, seguida de coma y año.', 'Las citas posteriores pueden usar la abreviatura.', 'La referencia conserva siempre el nombre completo del grupo.', 'Si dos grupos comparten la misma abreviatura, escribe ambos nombres completos cada vez.'],
    examples: ['American Psychological Association (APA, 2017)', '(American Psychological Association [APA], 2017)', '(APA, 2017)'],
    referenceTreatment: 'El nombre del autor grupal se escribe completo tal como aparece en la fuente.',
  }),
  'general-mention-site-periodical-software': verified({
    id: 'general-mention-site-periodical-software', label: 'Mención general de sitio, publicación o software común', manualSection: '8.22', manualPrintedPages: '274-275',
    whenToUse: 'Cuando solo se menciona un sitio completo, una publicación periódica en general o software/aplicación común, sin atribuir información específica.',
    rules: ['Para un sitio completo, menciona su nombre y URL en el texto.', 'Para una publicación periódica en general, menciona el título en cursiva.', 'Para software común, menciona nombre y versión si se conoce.', 'Los programas especializados sí llevan referencia.'],
    examples: ['Usamos Qualtrics (https://www.qualtrics.com).', 'Analizamos los datos con R (versión verificada).'],
    referenceTreatment: 'No lleva cita autor-fecha ni entrada en referencias si es una mención general; el software especializado usa el caso de referencia correspondiente.',
  }),
  paraphrase: verified({
    id: 'paraphrase', label: 'Principios del parafraseo', manualSection: '8.23', manualPrintedPages: '275',
    whenToUse: 'Cuando se expresa con palabras propias una idea ajena o una idea propia publicada anteriormente.',
    rules: ['Cita la obra con formato narrativo o parentético.', 'Se recomienda parafrasear y sintetizar más que acumular citas directas.', 'El localizador no es obligatorio, pero puede añadirse para ayudar a localizar un pasaje de una obra larga o compleja.', 'Si una fuente secundaria menciona la fuente primaria, consulta y cita la primaria cuando sea posible.'],
    examples: ['Autor (Año) explicó la idea.', 'La evidencia respalda la conclusión (Autor, Año).'],
    referenceTreatment: 'La obra consultada debe aparecer en referencias.',
  }),
  'long-paraphrase': verified({
    id: 'long-paraphrase', label: 'Paráfrasis larga', manualSection: '8.24', manualPrintedPages: '275-276',
    whenToUse: 'Cuando una misma paráfrasis continúa durante varias oraciones.',
    rules: ['Cita la obra en la primera mención.', 'No repitas la cita mientras el contexto deje claro que continúa la misma fuente.', 'En un párrafo nuevo, vuelve a citar.', 'Si cambia la fuente o se integran varias, repite las citas necesarias para evitar ambigüedad.', 'En narrativa, el año puede omitirse en menciones posteriores del mismo párrafo cuando no haya ambigüedad.'],
    examples: ['Autor (Año) sostuvo que… [continúa la paráfrasis claramente en el mismo párrafo].'],
    referenceTreatment: 'Cada obra parafraseada debe aparecer en referencias.',
  }),
  'direct-quote-principles': verified({
    id: 'direct-quote-principles', label: 'Principios de las citas directas', manualSection: '8.25', manualPrintedPages: '276-277',
    whenToUse: 'Cuando se reproducen literalmente palabras de otra obra o de una obra propia publicada anteriormente.',
    rules: ['Prefiere la paráfrasis salvo que importe una definición exacta, una redacción memorable o el análisis de las palabras.', 'Incluye siempre autor, año y localizador.', 'Usa p. para una página, pp. para intervalos o páginas múltiples.', 'No añadas puntos suspensivos al inicio o final salvo que existan en la fuente original.'],
    examples: ['“Texto exacto” (Autor, Año, p. 25).', 'Autor (Año) afirmó que “texto exacto” (pp. 34-36).'],
    referenceTreatment: 'La fuente citada debe aparecer en referencias.',
  }),
  'short-quote': verified({
    id: 'short-quote', label: 'Cita corta', manualSection: '8.26', manualPrintedPages: '277',
    whenToUse: 'Cuando la cita directa contiene menos de 40 palabras.',
    rules: ['Integra el texto entre comillas dobles.', 'En formato parentético, coloca autor, año y localizador inmediatamente después de la cita o al final de la oración.', 'En formato narrativo, autor y año aparecen en la oración y el localizador después de la cita.', 'Si la cita cierra la oración, la puntuación final va después del paréntesis de la cita.', 'Puntos y comas van dentro de las comillas; otros signos solo si pertenecen al material citado.'],
    examples: ['“Texto exacto” (Autor, Año, p. 10).', 'Autor (Año) indicó que “texto exacto” (p. 10).'],
    referenceTreatment: 'La obra citada debe aparecer en referencias.',
  }),
  'block-quote': verified({
    id: 'block-quote', label: 'Cita en bloque', manualSection: '8.27', manualPrintedPages: '277-279',
    whenToUse: 'Cuando la cita directa contiene 40 palabras o más.',
    rules: ['Comienza en una línea nueva y no uses comillas delimitadoras.', 'Aplica sangría izquierda de 0.5 pulgadas (1.27 cm) a todo el bloque y doble espacio.', 'Los párrafos adicionales llevan 0.5 pulgadas adicionales en la primera línea.', 'La cita parentética va después de la puntuación final, sin otro punto después.', 'Si autor y año están en la narración, coloca solo el localizador tras la puntuación final.'],
    examples: ['[Bloque de 40+ palabras]. (Autor, Año, p. 10)', 'Autor (Año) explicó:\n    [Bloque de 40+ palabras]. (p. 10)'],
    referenceTreatment: 'La obra citada debe aparecer en referencias.',
  }),
  'quote-without-page-numbers': verified({
    id: 'quote-without-page-numbers', label: 'Cita directa sin números de página', manualSection: '8.28', manualPrintedPages: '279-280',
    whenToUse: 'Cuando la fuente citada literalmente no ofrece páginas estables.',
    rules: ['Usa el localizador que más ayude: encabezado/sección, encabezado abreviado entre comillas, número de párrafo o sección más párrafo.', 'En audiovisuales usa la marca de tiempo donde comienza la cita.', 'En obras religiosas o clásicas usa libro, capítulo, verso, línea o canto canónicos.', 'En teatro usa acto, escena y líneas.', 'No uses ubicaciones Kindle; usa una página disponible o un localizador alternativo.'],
    examples: ['(Autor, Año, sección Métodos, párr. 4)', '(Autor, Año, 1:12:03)', '(Shakespeare, 1623/1995, 1.3.36-37)'],
    referenceTreatment: 'La referencia describe la obra completa o página usada, no solo la sección citada.',
  }),
  'quote-accuracy': verified({
    id: 'quote-accuracy', label: 'Precisión de las citas', manualSection: '8.29', manualPrintedPages: '280',
    whenToUse: 'Para comprobar que una cita directa reproduce fielmente la fuente.',
    rules: ['Conserva redacción, ortografía y puntuación internas, incluso si son incorrectas.', 'Si un error podría confundir, escribe [sic] en cursiva y entre corchetes inmediatamente después.', 'Compara siempre la transcripción con la fuente original.'],
    examples: ['La fuente decía “cuidar de su [sic] mascotas” (Autor, Año, p. 52).'],
    referenceTreatment: 'La obra citada debe aparecer en referencias.',
  }),
  'quote-changes-no-explanation': verified({
    id: 'quote-changes-no-explanation', label: 'Cambios que no requieren explicación', manualSection: '8.30', manualPrintedPages: '280-281',
    whenToUse: 'Cuando un ajuste mínimo no altera el significado de la cita.',
    rules: ['Puede cambiarse la mayúscula/minúscula inicial para ajustarse a la sintaxis.', 'Puede ajustarse la puntuación final si no cambia el significado.', 'Pueden intercambiarse comillas simples y dobles.', 'Pueden omitirse llamadas a notas al pie o finales.', 'Cualquier otro cambio debe señalarse.'],
    examples: ['Ajuste de mayúscula inicial sin indicación adicional.'],
    referenceTreatment: 'La obra citada debe aparecer en referencias.',
  }),
  'quote-changes-requiring-explanation': verified({
    id: 'quote-changes-requiring-explanation', label: 'Cambios que requieren explicación', manualSection: '8.31', manualPrintedPages: '281-282',
    whenToUse: 'Cuando se omite, inserta o enfatiza material dentro de una cita directa.',
    rules: ['Marca omisiones internas con tres puntos suspensivos separados por espacios.', 'No uses puntos suspensivos al inicio o final salvo que la fuente los contenga.', 'Usa cuatro puntos cuando la omisión abarca el final de una oración.', 'Usa corchetes, no paréntesis, para material insertado.', 'Para énfasis añadido, usa cursiva y agrega [énfasis añadido] inmediatamente después.'],
    examples: ['“Texto . . . texto” (Autor, Año, p. 1).', '“Aquellos [adultos]…” (Autor, Año, p. 1).', '“Palabra” [énfasis añadido] (Autor, Año, p. 1).'],
    referenceTreatment: 'La obra citada debe aparecer en referencias.',
  }),
  'quote-containing-citations': verified({
    id: 'quote-containing-citations', label: 'Cita que contiene referencias a otras obras', manualSection: '8.32', manualPrintedPages: '282-283',
    whenToUse: 'Cuando el fragmento citado contiene sus propias citas o referencias.',
    rules: ['Conserva dentro de la cita las referencias que aparecen en el material original.', 'No añadas esas obras a tus referencias salvo que también las hayas consultado y citado como fuentes primarias.', 'Si las referencias están al final del fragmento, pueden omitirse al cerrar antes la cita y citar solo la fuente realmente consultada.', 'Las llamadas a notas pueden omitirse sin explicación.'],
    examples: ['“Texto con cita interna (Autor interno, Año)” (Autor consultado, Año, p. 1).'],
    referenceTreatment: 'Incluye la fuente consultada; no incluyas automáticamente las fuentes internas.',
  }),
  'quote-containing-quotation-marks': verified({
    id: 'quote-containing-quotation-marks', label: 'Cita con material ya entrecomillado', manualSection: '8.33', manualPrintedPages: '283',
    whenToUse: 'Cuando la fuente ya contiene comillas con una función que debe conservarse.',
    rules: ['En una cita corta, cambia las comillas dobles internas por comillas simples.', 'En una cita en bloque, conserva las comillas dobles del material interno.', 'Si la fuente citada reproduce otra obra, consulta y cita la original cuando sea posible; de lo contrario aplica fuente secundaria.'],
    examples: ['“Texto que incluye ‘expresión citada’ dentro” (Autor, Año, p. 1).'],
    referenceTreatment: 'Incluye la fuente realmente consultada; aplica fuente secundaria si no se obtuvo la original.',
  }),
  'permission-for-long-quotation': verified({
    id: 'permission-for-long-quotation', label: 'Permiso para reimprimir o adaptar citas largas', manualSection: '8.34', manualPrintedPages: '283',
    whenToUse: 'Cuando se reproducen citas extensas o partes sustanciales de obras breves protegidas.',
    rules: ['Una cita extensa, normalmente de más de 800 palabras, puede requerir permiso escrito del titular.', 'Una obra breve como poema o canción puede requerir permiso con muchas menos palabras.', 'La cita APA y la autorización de derechos son obligaciones distintas.'],
    examples: ['Verificar licencia o permiso antes de reproducir un fragmento extenso.'],
    referenceTreatment: 'Además de la referencia, documenta la atribución o permiso exigido por derechos de autor.',
    refuseWhen: ['No se conoce la extensión total reproducida.', 'No se verificaron licencia, excepción aplicable o autorización del titular.', 'Se asume que citar equivale a tener permiso.'],
  }),
  epigraph: verified({
    id: 'epigraph', label: 'Epígrafe', manualSection: '8.35', manualPrintedPages: '283-284',
    whenToUse: 'Cuando una cita introduce una obra o sección antes de la primera línea del texto.',
    rules: ['Aplica sangría izquierda de 0.5 pulgadas, como cita en bloque, y no uses comillas.', 'Normalmente no se añade a referencias salvo que se cite en otra parte o sea importante para el tema.', 'Si no lleva referencia, atribuye después de la cita con raya, nombre completo y título de la obra en cursiva, alineado a la derecha.', 'Una fuente académica o una cita usada con permiso sí lleva referencia y cita parentética completa después de la puntuación final.'],
    examples: ['[Epígrafe]\n—Nombre completo, Título de la obra'],
    referenceTreatment: 'Por defecto no se agrega; sí se agrega para fuentes académicas, citas con permiso o fuentes usadas en otra parte.',
  }),
  'research-participant-quotation': verified({
    id: 'research-participant-quotation', label: 'Cita de participante de investigación', manualSection: '8.36', manualPrintedPages: '284',
    whenToUse: 'Cuando se citan palabras obtenidas de participantes como parte de la investigación propia.',
    rules: ['Usa comillas para menos de 40 palabras y bloque para 40 o más.', 'Aclara en el texto que las palabras pertenecen a participantes.', 'No las trates como comunicaciones personales.', 'Respeta consentimiento, confidencialidad y anonimato; usa seudónimos u oculta datos cuando corresponda.'],
    examples: ['La participante “Julia” describió la experiencia como “…”'],
    referenceTreatment: 'No se incluye en referencias porque forma parte de la investigación original.',
    refuseWhen: ['No está claro que sea un participante de la investigación propia.', 'La atribución vulneraría consentimiento, confidencialidad o anonimato.', 'Se intenta crear una referencia bibliográfica o tratarlo como comunicación personal.'],
  }),
};

export function getCitationRule(id: CitationRuleId): Apa7VerifiedCitationRule {
  return citationRules[id];
}
