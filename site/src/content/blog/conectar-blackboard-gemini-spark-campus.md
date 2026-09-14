---
title: "Gemini Spark MCP: cómo conectar Blackboard UPC con Campus"
seoTitle: "Gemini Spark MCP: conecta Blackboard UPC con Campus"
ogTitle: "Conecta Blackboard UPC con Gemini Spark mediante Campus MCP"
description: "Conecta Blackboard UPC con Gemini Spark mediante Campus MCP y consulta cursos, tareas, fechas, notas y materiales desde una tarea de Gemini."
published: "2026-09-13"
updated: "2026-09-13"
tag: "Tutorial · Gemini Spark"
section: tutorial
readingMinutes: 7
howTo:
  name: "Cómo conectar Campus a Gemini Spark"
  totalTime: "PT5M"
  steps:
    - name: "Abre las aplicaciones conectadas"
      text: "En Gemini, entra a Spark, abre Connected apps y busca la sección Custom apps for Spark."
    - name: "Pega la URL MCP de Campus"
      text: "Escribe https://mcp.campuscli.com/mcp en Add a custom app link to get started. La ruta /mcp al final es obligatoria."
    - name: "Continúa con el registro automático"
      text: "Pulsa Next. Campus admite el registro dinámico OAuth de Gemini, así que no debes introducir manualmente un Client ID ni un Client secret."
    - name: "Revisa la advertencia de Google"
      text: "Gemini avisa que Campus es una aplicación personalizada que Google no ha revisado. Continúa únicamente si reconoces la URL oficial de Campus y deseas conectar tu cuenta."
    - name: "Autoriza Campus y conecta Blackboard"
      text: "Completa el inicio de sesión de Campus. Si tu Aula Virtual todavía no está vinculada, sigue el acceso institucional de Microsoft y UPC; la contraseña se introduce en la página de la institución."
    - name: "Comprueba la conexión en Spark"
      text: "Inicia una tarea de Spark y pregunta qué cursos tienes. Si Gemini devuelve tus cursos de Blackboard, la conexión está lista."
faq:
  - q: "¿Cuál es la URL de Campus para Gemini Spark?"
    a: "La URL correcta es https://mcp.campuscli.com/mcp. Debe incluir https y la ruta /mcp al final."
  - q: "¿Necesito un Client ID y un Client secret?"
    a: "No. Campus admite el registro dinámico OAuth que utiliza Gemini Spark. Si aparecen esos campos, cierra el intento y vuelve a empezar con la URL exacta; no inventes credenciales ni pegues contraseñas allí."
  - q: "¿Por qué Gemini dice que Campus no fue revisado por Google?"
    a: "Porque Campus se agrega como una aplicación MCP personalizada y no como una integración incluida en el catálogo de Google. La advertencia es general para servidores personalizados; comprueba que el dominio sea mcp.campuscli.com antes de continuar."
  - q: "¿Gemini puede entregar una tarea por mí?"
    a: "Campus puede preparar una entrega compatible, pero nunca debe enviarla sin mostrarte qué se entregará y pedir tu confirmación. Los cuestionarios con preguntas interactivas se completan directamente en Blackboard."
  - q: "¿Dónde funciona una aplicación personalizada de Gemini?"
    a: "Google indica que estas conexiones se configuran desde Gemini en la web y se utilizan dentro de tareas de Gemini Spark. Su disponibilidad puede depender de la cuenta, el idioma y el despliegue de la función."
  - q: "¿Puedo probar Campus en Gemini Spark sin pagar?"
    a: "Sí. Puedes conectar Campus y realizar 5 consultas gratis. Cuando las termines, necesitas activar Campus Plus por S/5 para continuar usando el servidor alojado."
summary:
  - "La URL que debes pegar es **https://mcp.campuscli.com/mcp**; escribir solo el dominio no conecta el servidor MCP."
  - "Puedes empezar con **5 consultas gratuitas**; después necesitas Campus Plus por S/5 para continuar usando la conexión alojada."
  - "Campus admite el **registro automático OAuth** de Gemini: no necesitas crear ni copiar un Client ID o Client secret."
  - "Después de autorizar tu cuenta puedes preguntar por **cursos, tareas, fechas, notas, anuncios y materiales** de Blackboard UPC desde una tarea de Spark."
  - "La advertencia de Google es normal para una app personalizada: verifica el dominio y recuerda que **ninguna entrega se envía sin tu confirmación**."
---
Gemini Spark ya puede conectarse con Blackboard UPC mediante el servidor MCP de Campus. Eso significa que puedes consultar tu Aula Virtual desde una tarea de Gemini sin descargar archivos, abrir cada curso ni copiar fechas a mano. Campus funciona como la conexión MCP que permite a Gemini descubrir y usar sus herramientas académicas.

En esta guía vas a conectar la cuenta, comprobar que funciona y ver qué preguntas conviene hacer después. La configuración toma unos cinco minutos si ya tienes acceso a Gemini Spark y tu sesión institucional está vigente.

## Antes de empezar

Necesitas tres cosas:

- Una cuenta de Google que tenga acceso a **Gemini Spark**.
- Acceso activo a tu cuenta de **Blackboard UPC**.
- La URL oficial del servidor MCP de Campus: `https://mcp.campuscli.com/mcp`.

No necesitas Campus Plus para empezar: cada cuenta puede conectar el servidor alojado y realizar **5 consultas gratis**. Cuando las termines, deberás [activar Campus Plus por S/5](https://campuscli.com/campus-cli/#acceso-anticipado) para continuar usando Campus desde Gemini Spark.

Google mantiene Gemini Spark y sus aplicaciones personalizadas como una función de disponibilidad limitada. Si no ves «Spark» o «Custom apps for Spark» en tu cuenta, todavía no puedes completar esta configuración desde ella. La [guía oficial de Google para aplicaciones personalizadas](https://support.google.com/gemini/answer/17209137) contiene los requisitos y restricciones vigentes.

## Paso 1: abre Connected apps en Gemini Spark

Entra a [Gemini](https://gemini.google.com/) desde una computadora y selecciona **Spark**. En el menú lateral abre **Connected apps**. Desplázate hasta encontrar la sección **Custom apps for Spark**.

Ahí verás el campo **Add a custom app link to get started**. Gemini pide la dirección del servidor que debe descubrir; todavía no solicita tu usuario ni tu contraseña de Blackboard.

## Paso 2: pega la URL MCP de Campus

Escribe exactamente:

`https://mcp.campuscli.com/mcp`

La parte `/mcp` es obligatoria. `https://mcp.campuscli.com/` es el dominio del servicio, pero no es el endpoint del protocolo; si omites la ruta, Gemini mostrará que la URL no parece corresponder a un servidor MCP válido.

Pulsa **Next**. Gemini comprobará el servidor, encontrará la configuración OAuth y registrará automáticamente su cliente. Campus soporta este registro dinámico, por lo que no debes rellenar manualmente **Client ID** ni **Client secret**.

Si esos campos aparecen, no pongas allí tu contraseña de Google, Microsoft, UPC ni Blackboard. Cierra el cuadro y vuelve a iniciar el proceso con la URL exacta. Un Client secret es una credencial técnica de una aplicación, no una contraseña personal.

## Paso 3: entiende la advertencia antes de continuar

Gemini muestra un aviso indicando que, al añadir el enlace, permites que envíe información a una aplicación personalizada que Google no ha revisado. El aviso aparece porque Campus se conecta como un servidor MCP personalizado, no porque Google haya detectado un error concreto en el dominio.

Antes de aceptar, revisa dos cosas:

1. La dirección debe empezar por `https://mcp.campuscli.com/`.
2. Debes reconocer que estás conectando Campus para consultar tu información académica desde Gemini.

Google explica que los servidores MCP personalizados están fuera de su control y que el usuario debe confiar en el proveedor antes de conectarlos. También señala que Gemini puede compartir con una aplicación conectada partes relevantes de la conversación y recibir de ella la información necesaria para responder. Puedes ampliar ese comportamiento en el [Centro de Privacidad de las Apps de Gemini](https://support.google.com/gemini/answer/13594961).

## Paso 4: autoriza Campus y conecta tu Aula Virtual

Al continuar, Gemini inicia el flujo de autorización de Campus. Inicia sesión en tu cuenta Campus y concede el acceso solicitado. Si tu Blackboard UPC todavía no está conectado o la sesión venció, Campus te guiará al inicio de sesión institucional.

La contraseña universitaria se escribe en las páginas oficiales de Microsoft o UPC. No debe introducirse en el formulario de configuración de Gemini ni enviarse dentro de una conversación.

Después de completar la autorización, el navegador vuelve a Gemini y la aplicación queda disponible para las tareas de Spark. Si alguna pantalla queda abierta tras terminar, regresa a **Connected apps** y comprueba que Campus figure entre tus aplicaciones personalizadas.

## Paso 5: comprueba que la conexión funciona

Abre una tarea nueva en Spark y empieza con una consulta pequeña:

> Usa Campus para decirme qué cursos tengo activos en Blackboard.

Gemini debería pedir autorización para usar Campus si la tarea todavía no la tiene y, después, mostrar los cursos que devuelve Blackboard. Esta prueba separa la conexión técnica de cualquier consulta más compleja: si los cursos aparecen, el servidor, la cuenta Campus y la sesión universitaria están funcionando.

Después puedes probar:

- «¿Qué tareas tengo pendientes esta semana? Ordénalas por fecha y dime de qué curso son».
- «Revisa mis anuncios recientes y destaca únicamente los que cambian una fecha o una entrega».
- «¿Qué nota tengo en el curso de Finanzas? Incluye el puntaje máximo de cada actividad».
- «Busca el enunciado y la rúbrica del proyecto final de Ingeniería de Software».
- «¿Qué clases tengo mañana y en qué aula?».

No necesitas memorizar los nombres técnicos de las herramientas. Describe el resultado que buscas; Gemini decide cuándo consultar cursos, tareas, calificaciones, anuncios, contenido o el horario mediante Campus.

## Qué puedes hacer desde Gemini Spark con Campus

La conexión sirve principalmente para evitar el trabajo de recopilar información dispersa. Desde una sola tarea puedes:

- Ver tus cursos activos y distinguirlos por período.
- Reunir tareas publicadas con sus fechas de entrega y estado.
- Consultar calificaciones junto con el nombre de la actividad y su puntaje máximo.
- Leer anuncios recientes de uno o varios cursos.
- Recorrer carpetas del contenido y localizar presentaciones, guías, rúbricas o plantillas.
- Descargar materiales cuando una revisión necesita leer el archivo completo.
- Consultar el horario semanal registrado en UPC.

La respuesta sigue dependiendo de lo que cada profesor haya publicado. Si todavía no existe una tarea en Blackboard, Campus no inventa su alcance ni su fecha. Para preguntas sobre evaluaciones o avances, conviene pedir que contraste el sílabo, la presentación del curso y las actividades actualmente publicadas.

## Entregas y acciones que requieren cuidado

Consultar información es distinto de modificarla. Puedes pedirle a Gemini que encuentre un enunciado, compare una rúbrica o prepare una respuesta sin enviar nada. Si solicitas una entrega final, Campus debe mostrarte qué texto o archivos se enviarán y pedir tu confirmación antes de entregarlos.

Además, Blackboard representa tareas y cuestionarios de forma parecida. Campus puede trabajar con entregas de archivo, texto o enlace, pero los exámenes con preguntas interactivas deben resolverse desde la interfaz de Blackboard. Si una actividad ya venció y el profesor no permite entregas tardías, Campus respetará la misma restricción que muestra el Aula Virtual.

## Solución de problemas

### «This URL does not appear to be a valid MCP server»

Comprueba que pegaste `https://mcp.campuscli.com/mcp`, incluyendo `/mcp`. Borra espacios al inicio o al final y vuelve a intentar.

### «Automatic registration with this server failed»

Cierra ese intento y empieza de nuevo antes de introducir credenciales manuales. Campus soporta el registro dinámico de Gemini; un cuadro antiguo puede conservar el resultado de una comprobación anterior. Si persiste, anota la hora del intento para que soporte pueda localizarlo en los registros sin pedirte contraseñas.

### Gemini conecta, pero no encuentra mis cursos

La conexión con Google y la sesión de Blackboard son dos autorizaciones distintas. Vuelve a iniciar la conexión de tu Aula Virtual cuando Campus lo solicite. Si la sesión institucional expiró, completa otra vez el acceso de Microsoft UPC.

### La aplicación no aparece fuera de Spark

Las aplicaciones MCP personalizadas están pensadas para tareas de Gemini Spark. Según la documentación actual de Google, se configuran desde Gemini en la web y su disponibilidad depende de la cuenta. Usa una tarea de Spark para probarla, no una conversación general de Gemini.

## Una conexión, preguntas en lenguaje natural

El objetivo no es trasladar Blackboard a otra pantalla. Es dejar de navegar curso por curso cada vez que necesitas responder algo sencillo. Con Campus conectado a Gemini Spark, puedes formular la pregunta completa —qué vence, qué pesa más, dónde está la rúbrica o qué cambió— y recibir una respuesta construida con la información vigente de tu Aula Virtual.

Si quieres conocer todas las funciones, límites y medidas de seguridad del conector, revisa la [guía de Blackboard MCP de Campus](https://campuscli.com/blackboard-mcp/). Para organizar primero qué información debes revisar cada semana, continúa con [cómo organizar tu semana en Blackboard sin perder fechas](https://campuscli.com/blog/organizar-tu-semana-blackboard/).
