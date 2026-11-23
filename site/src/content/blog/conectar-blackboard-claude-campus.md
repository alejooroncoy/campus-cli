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
quickAction:
  label: "Conectar Campus a Claude"
  href: "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Campus&connectorUrl=https%3A%2F%2Fmcp.campuscli.com%2Fmcp"
  note: "Abre Claude con el nombre y la URL de Campus ya escritos. Pulsa Continue y luego Add, y después inicia sesión con tu cuenta Campus."
howTo:
  name: "Cómo conectar Campus a Claude"
  totalTime: "PT3M"
  steps:
    - name: "Abre Add custom connector"
      text: "Abre https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Campus&connectorUrl=https%3A%2F%2Fmcp.campuscli.com%2Fmcp y Claude muestra el formulario con Campus ya completado. También puedes entrar a Plugins, pulsar Add y elegir Add custom connector."
    - name: "Escribe el nombre y la URL"
      text: "Nombre: Campus. URL: https://mcp.campuscli.com/mcp. Pulsa Continue y luego Add. No necesitas Client ID ni Client secret."
    - name: "Inicia sesión con tu cuenta Campus"
      text: "Después de Add, Claude abre el inicio de sesión de Campus. Entra con la misma cuenta que usas en la app de Campus y autoriza el acceso. La primera vez, elige tu universidad (por ejemplo UPC o Universidad de Lima) y conecta su Aula Virtual."
    - name: "Activa Campus en un chat y pregunta"
      text: "En un chat pulsa +, entra a Plugins, activa Campus y pregunta por tus tareas de la semana."
faq:
  - q: "¿Cuál es la URL de Campus para Claude?"
    a: "https://mcp.campuscli.com/mcp, con https y la ruta /mcp al final. Como nombre puedes escribir Campus."
  - q: "¿Con qué cuenta inicio sesión?"
    a: "Con dos cuentas distintas: tu cuenta de Claude, para abrir el formulario y agregar el conector, y tu cuenta Campus, que Claude te pide justo después de pulsar Add. Usa la misma cuenta Campus que en la app web; si no tienes una, créala antes en campuscli.com/app."
  - q: "¿Sirve si estudio en la Universidad de Lima?"
    a: "Sí. La primera vez que entras a Campus eliges tu universidad, y la Universidad de Lima ya aparece en la lista. Los pasos en Claude son los mismos; solo cambia el inicio de sesión de tu Aula Virtual."
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

Necesitas dos cuentas: la de **Claude** (la gratuita sirve) y la de **Campus** (si no tienes, [créala aquí](/app/)), además de tu acceso al Blackboard de tu universidad. Las capturas son de Claude en inglés; si lo usas en español, los botones dicen lo mismo traducido.

## 1. Abre «Add custom connector»

Pulsa **Conectar Campus a Claude** (el botón de arriba, o [este enlace](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Campus&connectorUrl=https%3A%2F%2Fmcp.campuscli.com%2Fmcp)) y Claude te muestra el formulario con el nombre y la URL de Campus ya escritos. Si no has entrado a Claude, primero te pide iniciar sesión con tu cuenta de Claude. Si prefieres llegar a mano: en [claude.ai](https://claude.ai) entra a **Plugins** en la barra lateral, pulsa **Add** y elige **Add custom connector** (*Añadir conector personalizado*).

![Menú Add de la página Plugins de Claude con la opción Add custom connector](/assets/blog/claude/01-menu.webp)

## 2. Revisa el nombre y la URL

Si usaste el botón, ya están escritos. Si no, escribe:

- **Name:** `Campus`
- **MCP server URL:** `https://mcp.campuscli.com/mcp` (la ruta `/mcp` es obligatoria)

![Formulario Add custom connector con el nombre Campus y la URL https://mcp.campuscli.com/mcp](/assets/blog/claude/02-formulario.webp)

Si usaste el enlace, Claude añade un aviso de que los datos vienen de un enlace externo: es normal, solo revisa que la URL sea exactamente esa. Pulsa **Continue** y luego **Add**. No llenes **Client ID** ni **Client secret**: Campus no los necesita. El aviso de «connectors from developers you trust» sale con cualquier conector personalizado; lo importante es que el dominio sea `mcp.campuscli.com`.

## 3. Inicia sesión con tu cuenta Campus

Al pulsar **Add**, Claude abre la página de inicio de sesión de Campus. Entra con la **misma cuenta que usas en la app de Campus** y acepta que Claude se conecte a ella. Así Claude usa tu cuenta, tu plan y tus consultas.

Si es tu primera vez en Campus, te pide **elegir tu universidad**: búscala en la lista (por ejemplo **UPC** o **Universidad de Lima**). Después conectas su Aula Virtual: en la UPC, con el acceso de Microsoft; en la Universidad de Lima, con el inicio de sesión de su Blackboard. Tu contraseña universitaria solo se escribe en la página de tu universidad, nunca en Claude.

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
- **Campus aparece como desconectado:** abre **Plugins**, busca Campus y pulsa **Reconnect** para volver a iniciar sesión con tu cuenta Campus.
- **Conecta pero no ve tus cursos:** revisa que elegiste la universidad correcta o que la sesión de tu Aula Virtual no haya vencido; vuelve a vincular Blackboard cuando Campus lo pida.
- **Campus no aparece en el chat:** actívalo desde **+ → Plugins**; cada chat puede tenerlo apagado.

¿Prefieres instalarlo en tu computadora en vez de usar el conector? Sigue la guía de [Claude Desktop](/blackboard-mcp/claude-desktop/). Y si usas Gemini, tienes [su guía aquí](/blog/conectar-blackboard-gemini-campus/).
