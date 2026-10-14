---
description: Abre Gresbase a otras máquinas sin riesgos, desde un solo equipo hasta un dominio con HTTPS, y entiende dónde está la barrera de seguridad real.
---

## Empieza en 127.0.0.1 {#localhost}

Dentro del contenedor, Gresbase escucha en el puerto `8080` (`GRESBASE_PORT`). El inicio rápido publica ese puerto solo en la dirección de loopback:

```yaml title="docker-compose.yml"
    ports:
      - "127.0.0.1:{{port}}:8080"
```

Así solo entra tu propia máquina. Es la opción segura mientras no haya login.

:::danger
No expongas nunca Gresbase fuera de tu máquina sin login. Define `GRESBASE_USER` y `GRESBASE_PASSWORD`, o crea el administrador en el asistente. Consulta [Inicio de sesión y cuentas](./authentication.md).
:::

Sin cuenta, Gresbase ya rechaza cualquier `Host` que no sea local o no esté en `GRESBASE_ALLOWED_HOSTS`. Esa comprobación protege de despistes y de DNS rebinding. No sustituye a una contraseña.

## Detrás de un proxy inverso con HTTPS {#reverse-proxy}

Para entrar desde otras máquinas, pon delante un proxy inverso con HTTPS.

- Deja el puerto en `127.0.0.1`, o no lo publiques y deja que el proxy llegue al contenedor por la red de Docker.
- Reenvía al puerto `8080` del contenedor.
- Envía `X-Forwarded-Proto: https`. Así Gresbase marca la cookie de sesión como `Secure`.
- Activa el login.

Con el login activo, Gresbase acepta cualquier `Host`, así que el proxy puede conservarlo o cambiarlo.

:::tabs
@tab Caddy {#caddy}
```text title="Caddyfile"
gresbase.ejemplo.com {
	reverse_proxy gresbase:8080
}
```
@tab Nginx {#nginx}
```text title="nginx.conf"
server {
    listen 443 ssl;
    server_name gresbase.ejemplo.com;

    ssl_certificate     /etc/ssl/gresbase.crt;
    ssl_certificate_key /etc/ssl/gresbase.key;

    # Las importaciones CSV aceptan ficheros de hasta 100 MiB.
    client_max_body_size 101m;

    location / {
        proxy_pass http://gresbase:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```
@tab Traefik {#traefik}
```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    labels:
      traefik.enable: "true"
      traefik.http.routers.gresbase.rule: Host(`gresbase.ejemplo.com`)
      traefik.http.routers.gresbase.entrypoints: websecure
      traefik.http.routers.gresbase.tls: "true"
      traefik.http.services.gresbase.loadbalancer.server.port: "8080"
```
:::

Caddy y Traefik envían `X-Forwarded-Proto` por su cuenta. Nginx necesita la línea `proxy_set_header` y una cosa más:

- **Arráncalo después de Gresbase.** Nginx resuelve `gresbase` al arrancar y se para con `host not found in upstream "gresbase"` si el contenedor aún no está. En el mismo fichero de Compose, pon `depends_on: [gresbase]` en el servicio de Nginx.

Gresbase usa peticiones HTTP normales, sin WebSockets. Estas tres configuraciones se han probado de principio a fin con Caddy 2, Nginx (stable) y Traefik v3: al iniciar sesión la cookie lleva `Secure`, una exportación CSV de 144 MB empieza a llegar desde el primer byte y una consulta de 75 segundos recibe su respuesta. Caddy y Traefik no necesitan nada más para eso.

### Consultas largas detrás de un proxy {#long-requests}

Muchos proxies cortan una petición que tarda en recibir respuesta. Nginx espera 60 s por defecto (`proxy_read_timeout`) y responde `504 Gateway Time-out`. Cloudflare espera 100 s a que empiece la respuesta y responde `524`.

Gresbase mantiene vivas por su cuenta las peticiones largas. Cuando una consulta SQL, una importación CSV o un cambio de estructura no tiene respuesta a los 10 segundos, Gresbase empieza la respuesta y envía un espacio cada 10 segundos hasta tener el resultado. El proxy ve llegar datos y no corta la petición, así que no hace falta subir ningún timeout. Una consulta puede durar lo que permita su propio timeout, hasta una hora.

Probado con Nginx (stable) y su configuración por defecto: una consulta de 75 segundos recibe su respuesta, y el primer byte llega a los 10 segundos. Eso queda muy por debajo de los 100 segundos de Cloudflare, que solo cuentan hasta que empieza la respuesta.

:::note
Una vez empezada la respuesta, su código HTTP es siempre `200`. Si después la consulta falla, el error llega en el cuerpo y Gresbase lo muestra como siempre. Una herramienta que llame a la API directamente debe leer el cuerpo, no solo el código. Recargar la página sigue perdiendo una consulta en curso, igual que sin proxy.
:::

:::note
El límite cuenta los intentos fallidos por IP de cliente, tomada de la conexión TCP. Detrás de un proxy, pon la dirección del proxy en `GRESBASE_TRUSTED_PROXIES` para que cada cliente tenga su propio límite; si no, todos comparten la IP del proxy y los mismos 5 intentos fallidos por minuto. Consulta [Demasiados intentos](./authentication.md#rate-limit).
:::

## Servirlo en una subruta {#base-path}

Para servir Gresbase en `https://ejemplo.com/gresbase/`, define `GRESBASE_BASE_PATH`:

```yaml title="docker-compose.yml"
    environment:
      GRESBASE_BASE_PATH: /gresbase
```

- Empieza por `/` y tiene uno o más tramos, como `/gresbase` o `/herramientas/db`.
- Cada tramo usa letras, dígitos, `.`, `_`, `~` o `-`. La `/` final se ignora.
- Con cualquier otro valor, Gresbase no arranca y muestra `must be a path like /gresbase`.

Gresbase quita el prefijo él mismo, así que el proxy debe reenviar la ruta completa. En Caddy, usa `handle`, no `handle_path`:

```text title="Caddyfile"
ejemplo.com {
	handle /gresbase* {
		reverse_proxy gresbase:8080
	}
}
```

Una petición a `/gresbase` redirige a `/gresbase/`. Las rutas fuera del prefijo reciben un `404`.

## Sin login en un dominio {#allowed-hosts}

Si sirves Gresbase sin login con un nombre que no es `localhost`, añade ese nombre a `GRESBASE_ALLOWED_HOSTS`. Si no, todas las peticiones reciben la página **Acceso bloqueado**.

Hazlo solo en una red de confianza. Quien llegue a ese nombre tiene acceso completo.

## Protecciones incluidas {#built-in}

- **CSRF.** Toda petición a la API que no sea `GET`, `HEAD` u `OPTIONS` debe llevar la cabecera `X-Gresbase: 1`. Un navegador no puede añadirla desde otro sitio sin un preflight de CORS, y Gresbase nunca lo permite. Además, la cookie es `SameSite=Strict`.
- **Cabeceras de seguridad.** Todas las respuestas llevan una `Content-Security-Policy` estricta, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`. Gresbase no se puede incrustar en un frame.
- **Token de configuración.** Mientras Gresbase no esté configurado, el asistente responde a cualquier `Host`. Las peticiones desde otras máquinas deben enviar el token de configuración, que sale en el log (como enlace con el token detrás de `#`, que nunca llega al servidor ni a un proxy), lo imprime `gresbase setup-token` dentro del contenedor o defines con `GRESBASE_SETUP_TOKEN` (16 caracteres o más). Una petición a través de un puerto publicado por Docker nunca cuenta como local: desde otra máquina puede llegar desde la misma dirección de Docker. Consulta [Asistente de configuración](./setup-wizard.md).
- **Credenciales.** Las contraseñas nunca aparecen en logs, errores ni respuestas de la API. Los secretos de `gresbase.json` van cifrados con AES-GCM.

## La barrera real: el rol de Postgres {#postgres-role}

Gresbase puede hacer todo lo que pueda hacer el rol de PostgreSQL con el que se conecta. Ese rol es el límite de verdad.

- Conéctate con un rol que tenga solo los permisos que necesitas.
- Para un Gresbase de solo lectura, usa un rol que solo pueda hacer `SELECT`, además del [modo solo lectura](./read-only.md).

```sql
CREATE ROLE gresbase_ro LOGIN PASSWORD 'cambia-esto';
GRANT CONNECT ON DATABASE app TO gresbase_ro;
GRANT USAGE ON SCHEMA public TO gresbase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gresbase_ro;
```

:::warning
El editor SQL avisa antes de sentencias destructivas como `DROP` o un `DELETE` sin `WHERE`. Es una ayuda contra despistes, no una barrera de seguridad, y se puede esquivar.
:::

Más sobre roles en [Conectar con PostgreSQL](./connecting.md).

## Sin telemetría {#no-telemetry}

Gresbase no envía telemetría. No hace peticiones de red salvo a las bases de datos que configures. Las fuentes y los scripts van dentro de la imagen, así que funciona sin acceso a internet.
