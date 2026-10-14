---
description: Qué es Gresbase, para quién es, qué deja fuera y qué necesitas para usarlo.
---

## Qué es Gresbase {#que-es}

Gresbase es un gestor web para PostgreSQL. Es una sola imagen de Docker que añades a tu `docker-compose.yml`, al lado de tu base de datos.

Sustituye a herramientas como Adminer o pgAdmin en tus propios proyectos. Desde el navegador exploras y editas tablas, cambias su estructura, importas y exportas datos y ejecutas SQL.

- **Una imagen y ninguna variable obligatoria.** Lo configuras con variables de entorno o con el [asistente de configuración](./setup-wizard.md).
- **Seguro por defecto.** Lo que editas queda como cambios pendientes hasta que lo revisas y guardas, y puedes deshacer.
- **Pensado para el teclado.** Atajos en todas partes y una paleta de comandos con <kbd>Ctrl</kbd> <kbd>K</kbd> (<kbd>⌘</kbd> <kbd>K</kbd> en macOS).
- **En inglés y en español**, con tema claro y oscuro.
- **Sin telemetría.** La app solo habla con las bases que configuras. Funciona sin internet: las fuentes y los scripts van dentro de la imagen.

## Para quién es {#para-quien}

Para quien desarrolla con PostgreSQL en Docker, solo o en un equipo pequeño, y quiere una interfaz limpia y rápida para sus datos. Lo dejas en tu máquina o lo pones detrás de tu propio proxy con HTTPS y una cuenta.

## Qué no hace {#que-no-hace}

Gresbase cubre el trabajo diario con datos y tablas. Hay cosas previstas para versiones futuras que todavía no están:

- Gestionar desde la interfaz roles, extensiones, funciones, triggers, políticas RLS o enums de PostgreSQL. Ese SQL lo puedes ejecutar igualmente en el [editor SQL](./sql-editor.md).
- Hacer copias de tus bases de datos. Gresbase solo guarda su propia configuración en `/data`; las copias de tus datos son cosa tuya (mira [Copias de seguridad](./backups.md)).
- Equipos: hay una sola cuenta de administrador, sin roles por usuario, invitaciones ni SSO. En su lugar, el [modo libre](./free-mode.md) deja que cada persona entre con su propio usuario de PostgreSQL.
- Esquema visual, métricas o un `EXPLAIN` visual.
- Otros motores. Gresbase es solo para PostgreSQL.

:::note
La barrera de seguridad real es el rol de PostgreSQL con el que conecta Gresbase. Dale solo los permisos que necesita. Lo tienes en [Conectar con PostgreSQL](./connecting.md).
:::

## Requisitos {#requisitos}

- **Docker**, con Compose si sigues el [inicio rápido](./quick-start.md). También vale [`docker run`](./docker-run.md).
- **Un servidor PostgreSQL** al que llegue el contenedor y un usuario para conectarte.

### Versiones de PostgreSQL {#versiones-postgres}

| Versión | Soporte |
| --- | --- |
| 14, 15, 16, 17, 18 | Completo |
| 19 | Completo. Mientras esté en beta, la tarjeta de conexión avisa de que es una versión preliminar. |
| 12, 13 | Heredado: todo funciona, algunas funciones dependen de la versión y la tarjeta de conexión te avisa. |
| 11 y anteriores | Sin soporte. Gresbase no se conecta y explica por qué. |

Las funciones que solo existen en versiones nuevas de PostgreSQL se activan solas cuando el servidor las tiene. Por ejemplo, `MERGE` necesita PostgreSQL 15.
