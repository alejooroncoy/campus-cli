# Publicación de campuscli.com

La fuente de producción es `alejooroncoy/campus-cli`, rama `main`. Vercel compila
esa rama, pero la asignación automática de dominios permanece desactivada.
Así, una subida de CLI desde un checkout antiguo no reemplaza el dominio.

`Publish site from checked main` se ejecuta al terminar correctamente CI en
un push a `main`. Usa exclusivamente el entorno GitHub `Production`, limitado
a esa rama. Su credencial Vercel está limitada al proyecto del sitio y no se
expone a los PR ni se incorpora al frontend.

Antes de publicar, el flujo verifica el SHA actual de `main`, CI de ese SHA,
proyecto y repositorio, procedencia Git y build de producción terminado. También
comprueba que producción sea un ancestro del candidato; rechaza retrocesos,
historiales divergentes y publicaciones concurrentes. Solo cambia la asignación
de `campuscli.com`, sin ejecutar `promote` ni reactivar autoasignaciones.

Después comprueba el dominio y el manifiesto público `/build-info.json`.
Los builds de producción requieren metadatos de GitHub y rechazan una versión
que ya no sea el último commit de `main`. Local y preview siguen disponibles.

## Procedimiento normal

1. Preparar una rama y un PR con los cambios.
2. Esperar CI y hacer merge a `main`.
3. Esperar CI de `main` y el workflow de publicación.
4. Comparar `/build-info.json` con el SHA esperado y revisar el flujo modificado.

Para reintentar sin subir archivos locales:

```sh
gh workflow run site-production.yml --repo alejooroncoy/campus-cli --ref main
```

No usar subidas manuales de producción, `promote`, `rollback` ni cambios de alias.
Un rollback intencional se publica como un nuevo commit de reversión en `main`.
No desactivar las protecciones para corregir un fallo: conservar la versión
actual y arreglar la causa en un PR.

## Configuración y mantenimiento

- Vercel: Production Branch `main`, Git conectado, variables de sistema activadas,
  `autoAssignCustomDomains=false`.
- GitHub: entorno `Production` con política de despliegue de la rama `main`.
- Secreto de entorno `VERCEL_SITE_PUBLISH_TOKEN`: token Vercel limitado al proyecto
  `prj_CkhlyuZVXCUt84OO6fMZ1EIaQNH0`. Rotarlo antes de su vencimiento; si expira,
  la publicación falla y el sitio actual sigue disponible.
- Política y dominio permitidos: `site/scripts/production-policy.mjs`.
- Pruebas: `node --test site/scripts/production-release.test.mjs`.

Un propietario con acceso administrativo puede cambiar estas protecciones de
forma explícita. El flujo normal no ofrece una opción para publicar versiones
viejas ni contenido local.
