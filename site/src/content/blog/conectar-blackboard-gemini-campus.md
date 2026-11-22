---
title: "Gemini para UPC: requisitos para conectar Blackboard"
seoTitle: "Gemini para UPC: requisitos y conexión con Blackboard"
ogTitle: "Gemini y Blackboard UPC: comprueba los requisitos de conexión"
description: "Conecta Blackboard UPC a Gemini con Campus desde Connectors → + Custom en gemini.google.com. Requisitos, pasos actualizados y solución de problemas."
published: "2026-09-13"
updated: "2026-11-22"
tag: "Tutorial · Gemini"
section: tutorial
readingMinutes: 2
howTo:
  name: "Cómo conectar Campus a Gemini"
  totalTime: "PT5M"
  steps:
    - name: "Abre Connectors en Gemini"
      text: "En gemini.google.com abre Connectors y pulsa + Custom, arriba a la derecha. Usa una cuenta personal de Google; en nuestras pruebas desde Perú funcionó con Gemini Pro."
    - name: "Pega la URL MCP de Campus"
      text: "Escribe https://mcp.campuscli.com/mcp en MCP Server URL. La ruta /mcp al final es obligatoria."
    - name: "Deja vacíos los campos opcionales"
      text: "En Additional settings aparecen Client ID y Client secret: déjalos vacíos. Campus admite el registro dinámico OAuth de Gemini. Pulsa Next."
    - name: "Revisa la advertencia de Google"
      text: "Gemini avisa que Campus es una aplicación personalizada que Google no ha revisado. Continúa únicamente si reconoces la URL oficial de Campus y deseas conectar tu cuenta."
    - name: "Autoriza Campus y conecta Blackboard"
      text: "Completa el inicio de sesión de Campus. Si tu Aula Virtual todavía no está vinculada, sigue el acceso institucional de Microsoft y UPC; la contraseña se introduce en la página de la institución."
    - name: "Comprueba la conexión en Gemini"
      text: "Abre un chat de Gemini, selecciona @Campus y pregunta qué cursos tienes. Si aparece @Campus Relay, también funciona: no necesitas eliminarlo ni reconectarlo. Si Gemini devuelve tus cursos de Blackboard, la conexión está lista."
faq:
  - q: "¿Puedo conectar Gemini con Blackboard UPC desde Perú?"
    a: "La guía oficial de Google todavía menciona mayores de 18 años en Estados Unidos, cuenta personal, historial activado y Gemini en inglés. En nuestras pruebas desde Perú (noviembre de 2026) funcionó con una cuenta personal de Google con Gemini Pro. Si en Connectors no ves el botón + Custom, tu cuenta aún no tiene la función. Las cuentas de la universidad no la tienen."
  - q: "¿Cuál es la URL de Campus para Gemini?"
    a: "La URL correcta es https://mcp.campuscli.com/mcp. Debe incluir https y la ruta /mcp al final."
  - q: "¿Necesito un Client ID y un Client secret?"
    a: "No. Aparecen en Additional settings como campos opcionales: déjalos vacíos. Campus admite el registro dinámico OAuth que utiliza Gemini. Nunca pegues allí tu contraseña."
  - q: "¿Por qué Gemini dice que Campus no fue revisado por Google?"
    a: "Porque Campus se agrega como una aplicación MCP personalizada y no como una integración incluida en el catálogo de Google. La advertencia es general para servidores personalizados; comprueba que el dominio sea mcp.campuscli.com antes de continuar."
  - q: "¿Gemini puede entregar una tarea por mí?"
    a: "Campus puede preparar una entrega compatible, pero nunca debe enviarla sin mostrarte qué se entregará y pedir tu confirmación. Los cuestionarios con preguntas interactivas se completan directamente en Blackboard."
  - q: "¿Dónde funciona una aplicación personalizada de Gemini?"
    a: "Google indica que estas conexiones se configuran desde Gemini en la web y pueden utilizarse en el chat de Gemini, tanto en la web como en la app móvil. Su disponibilidad puede depender de la cuenta, el idioma y el despliegue de la función."
  - q: "¿Puedo probar Campus en Gemini sin pagar?"
    a: "Campus Free incluye 25 consultas de bienvenida en la web y 15 de prueba en el conector MCP. Campus Plus incluye 100 consultas diarias en la web y consultas ilimitadas mediante MCP con un asistente compatible. Consulta los planes vigentes antes de elegir Plus."
summary:
  - "En gemini.google.com abre **Connectors** y pulsa **+ Custom**."
  - "Pega **https://mcp.campuscli.com/mcp** y deja vacíos Client ID y Client secret."
  - "Autoriza Campus y pregúntale con **@Campus**: «¿Qué tareas tengo esta semana?»."
---
Conecta tu Blackboard UPC a Gemini en 4 pasos. Toma menos de 5 minutos.

> **Lo que necesitas:** una cuenta **personal** de Google con **Gemini Pro** (muchos universitarios ya lo tienen). Si en Connectors ves el botón **+ Custom**, tu cuenta ya puede.

## 1. Abre Connectors y pulsa + Custom

Entra a [Connectors en Gemini](https://gemini.google.com/customize/connectors?pageId=none&hl=en) desde la computadora y pulsa **+ Custom**, arriba a la derecha.

![Pantalla Connectors de Gemini con el botón + Custom marcado](/assets/blog/gemini/paso-1-connectors.webp)

## 2. Pega la URL de Campus

Copia esta URL en **MCP Server URL** y pulsa **Next**:

`https://mcp.campuscli.com/mcp`

Client ID y Client secret se quedan **vacíos**. Nunca pongas ahí una contraseña.

![Formulario Connect to an MCP server con la URL de Campus y los campos opcionales vacíos](/assets/blog/gemini/paso-2-url.webp)

## 3. Autoriza Campus

Inicia sesión en Campus y, si te lo pide, conecta tu Aula Virtual (la contraseña de la UPC solo se escribe en la página de la UPC). Al terminar, Campus aparece en **Custom apps**.

![Campus listado en Custom apps dentro de Connectors](/assets/blog/gemini/paso-3-custom-apps.webp)

## 4. Pregúntale con @Campus

En un chat nuevo escribe **@**, elige **Campus** y pregunta lo que necesites.

![Chat de Gemini escribiendo @Campus y eligiendo Campus en la lista](/assets/blog/gemini/paso-4-arroba-campus.webp)

Prueba con:

- «¿Qué tareas tengo esta semana?»
- «¿Qué entra en el final de Finanzas?»
- «Busca la rúbrica del proyecto final.»

Campus nunca entrega una tarea sin mostrarte antes qué se va a enviar y pedirte confirmación.

## ¿Algo falló?

- **«Not a valid MCP server»:** a la URL le falta `/mcp` al final.
- **No ves + Custom:** tu cuenta todavía no tiene la función. Conecta Campus a [Claude o ChatGPT](/app/copilot/), que funcionan igual.
- **Conecta pero no encuentra tus cursos:** vuelve a conectar tu Aula Virtual cuando Campus te lo pida.

¿Quieres ver todo lo que puede hacer? Revisa la [guía de Blackboard MCP](https://campuscli.com/blackboard-mcp/).
