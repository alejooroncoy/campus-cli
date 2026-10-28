# Mi Mundo UPN

El proveedor `upn` consulta el portal estudiantil UPN con la sesión Microsoft ya guardada. Sus rutas y datos están separados de Blackboard y Banner UPC. No acepta una URL, un método HTTP o un código de estudiante proporcionado por el agente.

## Terminal

Si ya existe una sesión UPN válida, se reutiliza. Para iniciar una sesión UPN explícitamente:

```bash
campus login --university upn-pe
campus upn profile
campus upn courses
campus upn schedule --week-start 2026-10-19
campus upn period-schedule
campus upn grades CODIGO_DEL_CURSO
campus upn attendance CODIGO_DEL_CURSO
campus upn course-schedule CODIGO_DEL_CURSO
campus upn history
campus upn programs
campus upn record
campus upn calendar
campus upn services
campus upn documents
campus upn procedures
campus upn procedure-details
campus upn requests
campus upn requests --closed
campus upn letters
campus upn enrollment-document
campus upn notices
```

Los comandos producen JSON. `record --program ID` permite elegir uno de los programas devueltos por `programs`. Los códigos de curso deben provenir de `courses`.

`campus login` mantiene UPC como universidad predeterminada. Ejecutar un comando UPN con una sesión UPC devuelve un error; no cambia la cuenta ni envía sus credenciales a UPN. La sesión local se obtiene del login habitual, no de la base de datos del servicio hospedado.

## MCP

| Herramienta | Consulta |
|---|---|
| `upn_get_profile` | Perfil académico, `cycle`, carrera y procedencia del ciclo |
| `upn_list_courses` | Matrícula actual con códigos, secciones, docentes, créditos y horarios disponibles |
| `upn_get_weekly_schedule` | Semana de clases; `weekStart` opcional, semana actual según America/Lima |
| `upn_get_period_schedule` | Horarios del período agrupados por módulo |
| `upn_get_course_schedule` | Horario de un curso matriculado |
| `upn_get_grades` | Notas originales y ponderaciones de un curso |
| `upn_get_attendance` | Sesiones, estados y límites de faltas |
| `upn_get_academic_history` | Registros de cursos, notas y créditos por período |
| `upn_list_programs` | Programas inscritos |
| `upn_get_academic_record` | Créditos y promedio del programa inscrito |
| `upn_get_academic_calendar` | Actividades y fechas del calendario académico |
| `upn_list_services` | Catálogo de servicios correspondiente al perfil |
| `upn_list_documents` | Metadatos y enlaces de documentos normativos |
| `upn_list_procedures` | Catálogo general y tarjetas de trámites del perfil |
| `upn_get_procedure_details` | Condiciones publicadas, precio y plazo de constancia de estudios |
| `upn_list_procedure_requests` | Solicitudes existentes activas o cerradas |
| `upn_list_letters` | Cartas de presentación existentes |
| `upn_get_enrollment_document` | Disponibilidad del consolidado y enlace al portal, sin URL firmada |
| `upn_list_notices` | Avisos y notificaciones sin marcarlos como leídos |

Las respuestas identifican `source: mi_mundo_upn`, `universityId: upn-pe`, fecha de consulta, datos y notas de interpretación. Todas las operaciones son de lectura.

## Identidad y sesión

- La identidad del portal debe coincidir con el código de estudiante obtenido de la sesión Blackboard UPN de la misma cuenta.
- OAuth authorization code con PKCE reutiliza solo cookies del proveedor Microsoft. Se comprueban retorno, `state`, firma del ID token, emisor, destinatario, `nonce`, vigencia e identidad UPN.
- Los tokens solo se mantienen en memoria. Las consultas rechazan redirecciones y usan rutas fijas de `estudiantebe.upn.edu.pe` y `tramitesbe.upn.edu.pe`.
- Un curso o programa debe pertenecer a la matrícula/programas del estudiante antes de consultar su detalle.
- El perfil expuesto excluye documento, dirección, teléfono y correo personal. Las tarjetas de cursos excluyen direcciones de correo y códigos internos de docentes.

En el servicio hospedado, el relay selecciona la conexión UPN de la cuenta autenticada y transmite el grant opaco al worker existente. Solo el worker posee la clave de descifrado. El nuevo endpoint privado `/upn/query` exige el token del servicio y la vinculación criptográfica conexión/universidad. No reemplaza las sesiones Blackboard/Banner ni revoca su SSO por un error del portal UPN. El acceso del portal se comparte entre consultas simultáneas de la misma conexión y se limita a cuatro solicitudes concurrentes por estudiante.

El relay ofrece las herramientas UPN según la universidad de la conexión guardada, aun cuando el perfil Campus esté desactualizado. Conserva el control de consultas de prueba/pago existente. No hay cambios en Campus Profes ni en su puente Banner.

## Interpretación

- `cycle` es el campo `ciclo` declarado por Mi Mundo UPN. No se calcula a partir de nombres de cursos, créditos o años.
- El perfil y la lista de programas no acreditan ni descartan cambios anteriores de carrera. El resultado lo declara explícitamente.
- La lista de matrícula es actual. Aunque el upstream acepte `CodPeriodo`, la prueba mostró que devuelve la matrícula actual al pedir otro período; el proveedor no ofrece ese filtro. Para períodos anteriores se usa el historial.
- Se preservan strings como `00` y el estado de publicación es `unknown`. Una fila de promedio no prueba cierre definitivo; no se convierte un dato pendiente en cero ni se inventa un estado publicado.
- Los pesos incluyen filas de resumen; no se suman todas como evaluaciones independientes.
- Los horarios publicados pueden ser recurrentes; no confirman cancelaciones ni feriados. Los campos de aula pueden variar entre consultas.
- El calendario académico no acredita la publicación ni la fecha límite de una tarea Blackboard.

## Validación de esta implementación

Se probaron las once consultas académicas y las ocho consultas adicionales con la misma sesión UPN guardada, incluyendo ambas listas de solicitudes, y se verificaron firma e identidad. Los fixtures automatizados son sintéticos y no contienen datos de estudiantes reales.

Pruebas del proveedor: identidad, firma, retorno OAuth, cambio de cuenta, separación UPC/UPN, acceso por matrícula/programa, valores `00`, fecha local de la semana, límites de concurrencia, deduplicación de SSO, esquema MCP y protección del endpoint privado. También pasaron las pruebas seleccionadas de Banner/UPC, relay y worker existentes.

La validación dirigida pasó: 23 pruebas del proveedor público y separación UPC/UPN, y 73 del backend, relay, worker y regresión UPC. La prueba manual del CLI con una sesión UPC rechazó la consulta UPN antes de abrir el perfil de navegador o contactar al portal.

La comprobación ampliada detectó diez fallos anteriores: cuatro en `pace.test.ts`, que sustituye el origen protegido de Blackboard por un servidor de prueba, y seis en el archivo preexistente `uclass-service.test.ts`, que importa funciones ausentes. Estos fallos no se corrigen como parte del proveedor UPN.

La implementación está en el código local y el paquete integrado del backend. No se ha publicado una nueva versión npm. La actualización hospedada se desplegó sobre instantáneas del relay y worker en ejecución, conservando sus 179 archivos previos del core sin alteraciones; las pruebas MCP de cada instantánea validan las 19 herramientas UPN y la separación UPC. La API académica UPN carece de un contrato público completo; el [recon](../recon/mi-mundo-upn-2026-10-24.md) documenta los endpoints y límites observados.

## Alcance administrativo validado

El catálogo enlaza biblioteca, pagos, matrícula, WeTALK y otros servicios; su presencia no acredita acceso a esos portales. La consulta de documentos devuelve reglamentos publicados: no lee el PDF. La visibilidad de titulación/bachiller y sus botones no acredita elegibilidad personal ni que se haya obtenido un grado.

Constancia de estudios: se leen condiciones, exclusiones, precio y plazo publicados para un programa inscrito. No se llama al POST de solicitudes que el portal usa para generar una vista previa. Tampoco se descargan documentos de solicitudes: esa ruta podría cambiar su estado. Las listas vacías solo acreditan ausencia de resultados en la consulta de ese momento.

El servicio de solicitudes también devuelve la envoltura exacta `flag:false, error:null, message:"No se encontrarón resultados", data:[]` para ausencia de registros. Se acepta únicamente en esa ruta; los demás errores semánticos siguen fallando. No hay un ejemplo positivo de solicitud o carta personal: los metadatos de esos casos se limitan a campos conservadores del cliente público; detalle y descarga siguen sin validar.

El [recon administrativo](../recon/mi-mundo-upn-services-2026-10-24.md) describe las evidencias y límites adicionales.

El 24 de octubre de 2026 quedaron desplegados el worker `1ca27426-c2a2-47c2-879b-cf56be649594` y relay `92605d27-3434-42c9-b9eb-92f0cb4f25a4`, ambos con health 200. Las 19 operaciones respondieron correctamente en el worker real (20 lecturas contando los filtros activo/cerrado); un primer detalle de constancia falló y después respondió correctamente. La lectura real del broker completó perfil, cursos, servicios, trámites y solicitudes. Fue necesaria la renovación habitual de Blackboard vencido mediante SSO; no hubo intervención del estudiante. Los archivos privados temporales de autenticación y respuestas se eliminaron tras conservar evidencia agregada sin credenciales.
