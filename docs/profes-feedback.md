# Comentarios de usuarios en Profes

La sección «Campus, en sus palabras» distingue los comentarios sobre Campus de las calificaciones de profesores.

- El extracto de WhatsApp se comprobó en Kapso mediante consultas de lectura y en su contexto: el usuario agradece la atención y dice que recomendará Campus a sus compañeros. Se conserva el texto original, sin publicar nombre, teléfono, identificadores ni detalles académicos. El mensaje es de agosto de 2026. Se muestra una sola cita de esa conversación.
- La segunda cita utiliza la primera reseña del feed público `/api/app/blackboard-reviews/?page=1`, sin filtrar por estrellas. El feed existente exige experiencia y consentimiento de publicación. Se valida la respuesta y se inserta con `textContent`; no se publican nombres en esta sección. El enlace lleva a la reseña original.
- No hay captura estática de la reseña pública: las ediciones y los retiros se reflejan con la siguiente carga y la caché habitual del feed. Si no hay reseñas o falla la petición, esa segunda cita permanece oculta.
- No se inventan estrellas, promedios, autores ni resultados académicos. No se añaden calificaciones de producto al JSON-LD de profesores.

La consulta de Kapso no envía mensajes ni modifica conversaciones. La trazabilidad del mensaje seleccionado queda fuera del repositorio público en el archivo local de auditoría del entorno de trabajo.
