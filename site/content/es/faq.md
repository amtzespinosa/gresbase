---
description: Respuestas cortas a lo que se pregunta antes y después de instalar Gresbase.
---

## ¿Gresbase envía telemetría? {#telemetry}

No. Gresbase no hace ninguna petición de red salvo a las bases con las que lo conectas.

## ¿Funciona sin internet? {#offline}

Sí. Las fuentes, los iconos y toda la interfaz van dentro de la imagen. No se carga nada de un CDN.

## ¿Qué versiones de PostgreSQL admite? {#postgres-versions}

De la 12 a la 19. De la 14 a la 18, con soporte completo. La 12 y la 13 funcionan con algunas funciones limitadas, y la tarjeta de conexión lo avisa. La 19 se prueba con sus versiones previas. Con la 11 o anteriores, Gresbase se niega y dice **Gresbase necesita Postgres 12 o superior.**

## ¿Puedo gestionar varias bases? {#several-databases}

Sí. El administrador puede guardar varias conexiones y cambiar entre ellas. Cada pestaña del navegador puede usar una distinta. Lo tienes en [Conexiones guardadas](./connections.md).

En [modo libre](./free-mode.md), cada persona entra con sus propias credenciales de PostgreSQL.

## ¿Puedo dejarlo en solo lectura? {#read-only}

Sí: para todas las conexiones con `GRESBASE_READ_ONLY=true`, o para una conexión guardada concreta. Gresbase bloquea las escrituras dos veces: en la sesión de PostgreSQL y en su propia API. Más en [Modo solo lectura](./read-only.md).

## ¿Dónde guarda sus datos? {#data}

En `/data` dentro del contenedor: `gresbase.json`, `secret.key` y la carpeta `snippets/`. Monta ahí un volumen para conservarlos. Tus bases siguen en PostgreSQL. Lo explican [El volumen de datos](./data-volume.md) y [Copias de seguridad](./backups.md).

## ¿Puedo usarlo sin Docker? {#without-docker}

Sí, compilando el binario desde el código. Es un único fichero con la interfaz dentro. Fuera de un contenedor, apunta `GRESBASE_DATA_DIR` a una carpeta con permiso de escritura: por defecto es `/data`. Más en [Compilar desde el código](./building.md).

## ¿Tengo que definir alguna variable? {#variables}

No. Sin `DATABASE_URL`, Gresbase arranca un asistente en el navegador. Lo tienes en [Asistente de configuración](./setup-wizard.md).

## ¿En qué idiomas está? {#languages}

En inglés y en español. Cada persona elige el suyo; `GRESBASE_LANG` fija el idioma por defecto.

## ¿Qué licencia tiene? {#license}

Apache 2.0. El nombre y el logo no entran en ella. Más en [Licencia](./license.md).
