# Páginas de entrada para estudiantes UPC

Esta revisión aclara la función de las páginas públicas y refuerza los enlaces hacia Blackboard UPC. Conserva las URLs existentes y sus canonical.

| Página | Necesidad que atiende |
|---|---|
| / | Conocer Campus: profesores, notas y Blackboard con IA |
| /profes/ | Buscar opiniones de profesores UPC por profesor o curso |
| /blackboard-upc/ | Encontrar el acceso oficial y entender cómo consultar tareas y notas con Campus |
| /blackboard-chatgpt/ | Conectar una IA por internet, sin instalar el CLI |
| /blackboard-mcp/ | Elegir la configuración y la guía de un cliente MCP |
| /blackboard-cli/ | Instalar y usar el cliente de terminal |
| /blog/ | Elegir una guía sobre matrícula o tareas durante el ciclo |

Los títulos y las descripciones de portada, profesores, Blackboard UPC y blog describen esas necesidades. Sus versiones para compartir usan los mismos textos. La pregunta sobre el acceso oficial figura tanto en el contenido visible como en el JSON-LD de Blackboard UPC.

La portada enlaza desde sus tarjetas a profesores y Blackboard UPC. El menú y el pie de página incorporan Blackboard UPC; el blog ofrece accesos por necesidad. Las páginas de MCP, ChatGPT y las guías relacionadas también enlazan a la explicación general.

## Medición después de publicar

En Search Console, comparar períodos equivalentes de 28 días, filtrando Perú y revisando consulta y página. Separar las búsquedas de acceso al Aula Virtual de las búsquedas sobre conexión con IA o elección de profesores. Revisar indexación con la inspección de URL después del despliegue.

Los eventos existentes de página y clic distinguen las siguientes categorías:

| Categoría | Rutas |
|---|---|
| blackboard_upc | /blackboard-upc/ |
| chatgpt | /blackboard-chatgpt/ |
| terminal | /blackboard-cli/ |
| mcp | /blackboard-mcp/ y sus guías por cliente |
| professors | /profes/ |
| cli | /campus-cli/; conserva su categoría anterior |

Antes de esta revisión, Blackboard UPC, ChatGPT, la terminal y las guías individuales de MCP se agrupaban como `other`. Comparar con esa limitación los datos anteriores al despliegue. Los eventos siguen usando categorías cerradas y no envían URLs, parámetros de búsqueda ni contenido académico.

Los clics hacia `connect` con intención `connect` permiten comprobar el paso a la conexión de IA. Los eventos existentes de cuenta, preguntas y respuestas permiten observar el uso posterior; Search Console sigue siendo la fuente para clics orgánicos. Esta revisión no añade atribución de canal ni permite asignar una búsqueda concreta de Google a una persona.

La indexación y el aumento de clics se comprueban tras la publicación y el rastreo de Google. El cambio de etiquetas por sí solo no confirma esos resultados.
