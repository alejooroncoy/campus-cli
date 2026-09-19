# Imagen para los verificadores de directorios MCP (Glama y similares), que
# arrancan el servidor y le piden `tools/list` para comprobar que responde.
#
# No sirve para usar Campus de verdad: el login abre un navegador real contra
# el SSO de la universidad y eso ocurre en la máquina del estudiante, no aquí.
# Por eso el navegador de Playwright no se descarga — sin sesión, el servidor
# arranca y declara sus herramientas igual, que es lo único que se verifica.
FROM node:22-slim

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    POSTHOG_DISABLED=1 \
    NODE_ENV=production

RUN npm install -g campus-cli@2.2.1 \
    && npm cache clean --force

# stdio: el verificador habla por la entrada y salida estándar del proceso.
ENTRYPOINT ["campus", "mcp"]
