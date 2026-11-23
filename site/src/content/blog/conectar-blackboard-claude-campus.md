---
title: "Claude MCP: cómo conectar Blackboard UPC con Campus"
seoTitle: "Claude MCP: conecta Blackboard UPC con Campus"
ogTitle: "Conecta Blackboard UPC con Claude mediante Campus MCP"
description: "Conecta Blackboard UPC con Claude mediante el conector de Campus y consulta cursos, tareas, fechas, notas y materiales desde un chat de Claude."
published: "2026-11-22"
updated: "2026-11-22"
tag: "Tutorial · Claude"
section: tutorial
readingMinutes: 3
howTo:
  name: "Cómo conectar Campus a Claude"
  totalTime: "PT3M"
  steps:
    - name: "Abre Add custom connector"
      text: "Abre https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Campus&connectorUrl=https%3A%2F%2Fmcp.campuscli.com%2Fmcp y Claude muestra el formulario con Campus ya completado. También puedes entrar a Plugins, pulsar Add y elegir Add custom connector."
    - name: "Escribe el nombre y la URL"
      text: "Nombre: Campus. URL: https://mcp.campuscli.com/mcp. Pulsa Continue y luego Add. No necesitas Client ID ni Client secret."
    - name: "Autoriza Campus y tu Aula Virtual"
      text: "Inicia sesión en tu cuenta Campus. Si tu Blackboard todavía no está vinculado, sigue el acceso institucional de Microsoft y UPC."
    - name: "Activa Campus en un chat y pregunta"
      text: "En un chat pulsa +, entra a Plugins, activa Campus y pregunta por tus tareas de la semana."
faq:
  - q: "¿Cuál es la URL de Campus para Claude?"
    a: "https://mcp.campuscli.com/mcp, con https y la ruta /mcp al final. Como nombre puedes escribir Campus."
  - q: "¿Necesito pagar Claude Pro?"
    a: "No. El plan gratuito de Claude admite un conector personalizado. Si ya tienes otro, quítalo para agregar Campus."
  - q: "¿Funciona en la app de Claude del celular?"
    a: "Sí. Agrega el conector una vez desde claude.ai o Claude Desktop y úsalo con la misma cuenta en el celular."
  - q: "¿Claude puede entregar una tarea por mí?"
    a: "Campus nunca envía una entrega sin mostrarte qué se enviará y pedir tu confirmación. Los cuestionarios interactivos se resuelven en Blackboard."
summary:
  - "Agrega **https://mcp.campuscli.com/mcp** como conector personalizado en Claude; no instalas nada."
  - "Funciona con el **plan gratuito de Claude**, en la web, el escritorio y el celular."
  - "**Campus Free** incluye 25 consultas de bienvenida en la web y 15 de prueba en el conector; **Campus Plus** da consultas ilimitadas mediante MCP."
---
Con el conector de Campus, Claude lee tus cursos, tareas, notas y materiales de Blackboard UPC cuando se lo pides. Lo configuras una vez, en unos tres minutos, y sin instalar nada.

Necesitas una cuenta de Claude (la gratuita sirve), tu acceso a Blackboard UPC y tu [cuenta Campus](/app/). Las capturas son de Claude en inglés; si lo usas en español, los botones dicen lo mismo traducido.

## 1. Abre «Add custom connector»

Abre [este enlace](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Campus&connectorUrl=https%3A%2F%2Fmcp.campuscli.com%2Fmcp) y Claude te muestra el formulario con el nombre y la URL de Campus ya escritos. También puedes llegar a mano: en [claude.ai](https://claude.ai) entra a **Plugins** en la barra lateral, pulsa **Add** y elige **Add custom connector** (*Añadir conector personalizado*).

![Menú Add de la página Plugins de Claude con la opción Add custom connector](/assets/blog/claude/01-menu.webp)

## 2. Escribe el nombre y la URL

- **Name:** `Campus`
- **MCP server URL:** `https://mcp.campuscli.com/mcp` (la ruta `/mcp` es obligatoria)

![Formulario Add custom connector con el nombre Campus y la URL https://mcp.campuscli.com/mcp](/assets/blog/claude/02-formulario.webp)

Si usaste el enlace, Claude añade un aviso de que los datos vienen de un enlace externo: es normal, solo revisa que la URL sea exactamente esa. Pulsa **Continue** y luego **Add**. No llenes **Client ID** ni **Client secret**: Campus no los necesita. El aviso de «connectors from developers you trust» sale con cualquier conector personalizado; lo importante es que el dominio sea `mcp.campuscli.com`.

## 3. Autoriza Campus y tu Aula Virtual

Claude abre el inicio de sesión de Campus. Entra con tu cuenta y, si tu Blackboard aún no está vinculado, sigue el acceso de Microsoft UPC. Tu contraseña universitaria solo se escribe en la página de la UPC, nunca en Claude.

## 4. Actívalo en un chat

En un chat nuevo pulsa **+**, entra a **Plugins** y comprueba que **Campus** esté encendido.

![Menú + de un chat de Claude con el plugin Campus activado](/assets/blog/claude/03-activar.webp)

## 5. Pregunta

Prueba con algo concreto:

> Usa Campus: ¿qué tareas tengo pendientes esta semana? Ordénalas por fecha.

La primera vez, Claude te pide permiso para usar cada herramienta de Campus. **Allow once** la aprueba solo esa vez; **Always allow** no vuelve a preguntar.

![Claude pidiendo permiso para usar la herramienta de tareas de Campus, con los botones Decline, Always allow y Allow once](/assets/blog/claude/04-permiso.webp)

Y listo: Claude responde con tu semana de Blackboard.

![Claude mostrando la semana del estudiante preparada por Campus, con cursos y entregas](/assets/blog/claude/05-respuesta.webp)

Otras preguntas que funcionan bien: «¿qué nota tengo en Finanzas?», «busca la rúbrica del proyecto final» o «¿qué anuncios cambiaron alguna fecha?».

## Si algo falla

- **Claude no encuentra el servidor:** revisa que la URL termine en `/mcp` y no tenga espacios.
- **No te deja agregar otro conector:** en el plan gratuito solo cabe uno; quita el anterior.
- **Conecta pero no ve tus cursos:** tu sesión de UPC venció; vuelve a vincular Blackboard cuando Campus lo pida.
- **Campus no aparece en el chat:** actívalo desde **+ → Plugins**; cada chat puede tenerlo apagado.

¿Prefieres instalarlo en tu computadora en vez de usar el conector? Sigue la guía de [Claude Desktop](/blackboard-mcp/claude-desktop/). Y si usas Gemini, tienes [su guía aquí](/blog/conectar-blackboard-gemini-campus/).
