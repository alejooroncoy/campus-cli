---
title: "Por qué construí Campus Profes: elegir profesor no debería ser una lotería"
seoTitle: "Campus Profes: elige a tu profesor por WhatsApp"
ogTitle: "Lancé Campus Profes: elige a tu profesor antes de matricularte"
description: "Lancé Campus Profes, un bot de WhatsApp para consultar calificaciones, comentarios y horarios de profesores antes de matricularte. Por qué lo construí."
published: "2026-08-10"
updated: "2026-09-07"
tag: "Lanzamiento · Fundador"
section: fundador
readingMinutes: 5
author: "Alejandro Oroncoy"
faq:
  - q: "¿Campus Profes es lo mismo que Campus para Blackboard?"
    a: "Las opiniones de profesores son una función de Campus. El asistente web y el conector MCP comparten cuenta y plan."
  - q: "¿Cuánto cuesta Campus Profes?"
    a: "Campus ofrece acceso fundador de S/5 el primer mes para los primeros 25 miembros. El precio regular anunciado es S/19.90 al mes."
  - q: "¿De dónde salen las calificaciones de los profesores?"
    a: "De alumnos que ya llevaron el curso y califican después de terminarlo. No es un formulario anónimo abierto a cualquiera ni información inventada."
summary:
  - "Acabo de lanzar **Campus Profes**, un bot de WhatsApp para consultar calificaciones, comentarios y horarios de profesores antes de matricularte."
  - "Nace del mismo problema de siempre en época de matrícula: elegir profesor a ciegas, preguntando en tres grupos de WhatsApp distintos y confiando en la primera respuesta que llega."
  - "Sirve para comparar secciones del mismo curso antes de matricular, armar tu horario sin cruces comparando quién enseña mejor en cada bloque, y dejar tu propia calificación para el que pregunte después."
  - "Las opiniones de profesores vuelven a **Campus**: solicita acceso fundador y consulta por WhatsApp antes de matricularte."
---
Cada ciclo pasa lo mismo en época de matrícula. Entras a elegir horario, ves cuatro o cinco secciones del mismo curso, cada una con un profesor distinto, y no tienes ninguna forma de saber, desde el sistema de matrícula, cuál es cuál. Así que abres WhatsApp y preguntas en dos o tres grupos a la vez: "¿alguien sabe cómo es el profesor de Gerencia de Proyectos?". Decides con la primera respuesta que te llega, venga de quien venga, y a veces ni siquiera es de alguien que lo llevó de verdad. Ese momento, repetido ciclo tras ciclo, es la razón por la que construí Campus Profes.

## El problema no es elegir curso, es elegir profesor

El sistema de matrícula te muestra horario, aula y vacantes. Lo que no te muestra es la única variable que más te va a afectar el ciclo: cómo enseña, cómo califica y cómo trata a sus alumnos el profesor de cada sección. Esa información existe, la tienen los que ya llevaron el curso, pero vive repartida en la memoria de cada quien y en grupos de WhatsApp que cambian cada ciclo. No hay un lugar donde preguntar y confiar en la respuesta.

El costo de elegir mal no es solo una mala experiencia. Es un ciclo entero con más carga de la necesaria en un curso que, con otro profesor, te hubiera costado la mitad del esfuerzo por el mismo resultado.

## La misma idea de Campus, aplicada a otro problema

Ya conté en otro artículo por qué empecé a construir blackboard-cli, lo que hoy es Campus: porque el Aula Virtual está pensada para que la navegues, no para que le preguntes directamente lo que necesitas. Con las notas y las tareas, el problema era de navegación. Con elegir profesor, el problema es distinto pero el patrón es el mismo: la información que necesitas para decidir bien ya existe, solo que dispersa y sin ningún lugar confiable donde consultarla antes de matricular.

Con Campus para Blackboard, la respuesta fue conectar el Aula Virtual a un asistente de IA. Con este problema, la respuesta tenía que ser otra, porque no es información que viva en ningún sistema institucional: vive en la experiencia de otros alumnos. Así que en vez de construir una app nueva que nadie iba a abrir para consultar dos veces al ciclo, llevé Campus Profes al lugar donde esa pregunta ya se hace todos los ciclos: un chat de WhatsApp.

## Qué puedes preguntarle a Campus Profes

- **Antes de matricular**, le escribes el nombre del profesor o el curso y te responde con la calificación, cuántas reseñas la respaldan y un resumen de los comentarios reales de otros alumnos.
- **Comparar secciones del mismo curso**, cuando dos o tres profesores dictan el mismo curso a distinta hora y necesitas decidir entre ellos, no solo entre horarios.
- **Armar tu horario sin cruces**, viendo qué secciones tiene libres cada profesor, para elegir por quién enseña mejor en cada bloque disponible y no solo por lo primero que no choque.
- **Consultar en el momento de matrícula**, que en la UPC son minutos contrarreloj, sin salir del chat a buscar en tres grupos distintos.
- **Dejar tu propia calificación** cuando termines el curso, para que la próxima persona que pregunte tenga tu experiencia disponible en vez de tener que preguntar de nuevo desde cero.

## Por qué sigue creciendo con la participación de los alumnos

Campus Profes ya ayudó a más de 350 estudiantes a decidir antes de su matrícula. Ahora se puede consultar junto con tus cursos y notas en Campus. Pero a diferencia de Blackboard, esto no funciona solo con que yo escriba código: la calidad de cada respuesta depende de que más alumnos califiquen a sus profesores después de llevarlos. Si lo pruebas, cuando termines un curso vuelve y deja tu calificación. Es lo que hace que la próxima persona que pregunte reciba una respuesta real y no un silencio.

## Cómo empezar

Las opiniones de profesores y la conexión con tu IA se usan desde la misma cuenta Campus. Puedes solicitar el acceso fundador en [la página de Campus Profes](https://campuscli.com/profes/) y recibir acompañamiento para empezar a consultar por WhatsApp antes de tu matrícula. El acceso fundador cuesta S/5 el primer mes para los primeros 25 miembros; el precio regular anunciado es S/19.90 al mes.
