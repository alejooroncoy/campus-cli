# Auth.md

## Autenticación de Campus Blackboard MCP

El endpoint remoto de Campus Blackboard MCP es `https://mcp.campuscli.com/mcp`.
Cada estudiante se autentica con su propia cuenta Campus y, cuando corresponde,
inicia sesión directamente en su universidad. Campus nunca solicita ni recibe la
contraseña de Blackboard o Microsoft.

## Para clientes MCP

El servidor utiliza OAuth 2.1 con Authorization Code y PKCE S256. El registro
dinámico de clientes, la autorización y el token endpoint se descubren desde:

- `https://mcp.campuscli.com/.well-known/oauth-authorization-server`
- `https://campuscli.com/.well-known/oauth-protected-resource`

Solicita únicamente los scopes necesarios:

- `campus.identity`: identifica la cuenta Campus que autorizó el cliente.
- `campus.read`: consulta de cursos, tareas, notas y materiales disponibles para
  esa cuenta.

Las consultas disponibles son de solo lectura de forma predeterminada. Campus
también puede preparar y enviar una entrega a Blackboard mediante
`blackboard_submit_attempt`; esa acción nunca se ejecuta automáticamente: el
estudiante debe revisar el contenido y confirmar explícitamente el envío final.
La autorización pertenece al estudiante y puede revocarse desde Campus. Para
instrucciones de conexión y clientes compatibles, consulta la
[documentación de Blackboard MCP](https://campuscli.com/blackboard-mcp/).
