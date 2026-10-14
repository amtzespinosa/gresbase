---
description: Escribe la URL de conexión, elige el modo SSL, llega a tu base desde el contenedor y dale a Gresbase un usuario con los permisos justos.
---

## La URL de conexión {#url}

`DATABASE_URL` es una URL de PostgreSQL. Tiene que empezar por `postgres://` o `postgresql://`:

```sh
postgres://USUARIO:CONTRASEÑA@SERVIDOR:5432/BASE?sslmode=require
```

- Si no pones puerto, se usa `5432`.
- Codifica los caracteres especiales del usuario o la contraseña: `@` es `%40`, `:` es `%3A`, `/` es `%2F`.
- La forma `clave=valor` (`host=db user=app …`) no se acepta. Usa la URL.

Si la URL no es válida, Gresbase no arranca y escribe `DATABASE_URL: must be a postgres:// or postgresql:// URL`. El valor nunca sale en el log, porque lleva la contraseña.

Sin `DATABASE_URL`, las conexiones se añaden en el [asistente de configuración](./setup-wizard.md) o en las [conexiones guardadas](./connections.md). Esos formularios piden las mismas piezas por separado. También puedes pegar una URL en **URL de conexión** para rellenarlos.

## Qué pasa al arrancar {#startup}

Con `DATABASE_URL` definida, Gresbase se conecta antes de empezar a servir:

- Reintenta durante 30 segundos como mucho, por si la base aún está arrancando.
- Unas credenciales malas, una base que no existe, un fallo de SSL o un PostgreSQL anterior al 12 lo paran en el acto.
- Si no consigue conectar, el contenedor termina con una línea como `cannot connect to PostgreSQL (dns): … hint: …`.

Gresbase necesita PostgreSQL 12 o posterior. Cada conexión aparece en `pg_stat_activity` con `application_name` igual a `gresbase`.

## SSL {#ssl}

Añade `sslmode` a la URL. Gresbase se lo pasa al driver de PostgreSQL (pgx), que se comporta como libpq:

| `sslmode` | Qué hace |
| --- | --- |
| `disable` | Sin cifrado. Vale dentro de una red privada de Docker. |
| `allow` | Prueba primero sin SSL y luego con SSL. |
| `prefer` | Prueba primero con SSL y luego sin él. Es el valor por defecto. |
| `require` | Cifra siempre, pero no comprueba el certificado salvo que definas `sslrootcert`. |
| `verify-ca` | Cifra y comprueba que el certificado lo firma una CA de confianza. |
| `verify-full` | Igual que `verify-ca` y además comprueba el nombre del servidor. |

Los formularios de conexión ofrecen `disable`, `prefer`, `require`, `verify-ca` y `verify-full`, con `prefer` por defecto.

Para comprobar certificados, añade estos parámetros a `DATABASE_URL`:

- `sslrootcert=/certs/ca.pem`: la CA que firmó el certificado del servidor. `sslrootcert=system` usa las CA del sistema y fuerza `verify-full`.
- `sslcert=/certs/cliente.pem` y `sslkey=/certs/cliente.key`: un certificado de cliente, si el servidor lo pide.

Las rutas son de dentro del contenedor, así que monta los ficheros:

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:secreto@db.example.com:5432/app?sslmode=verify-full&sslrootcert=/certs/ca.pem
    volumes:
      - ./certs:/certs:ro
      - gresbase-data:/data
```

Los formularios de conexión no tienen campo para certificados: ahí, `verify-ca` y `verify-full` comprueban contra las CA del sistema.

## Dónde está la base {#network}

### En el mismo Compose {#same-compose}

Usa el nombre del servicio como servidor. Los dos servicios comparten la red por defecto:

```yaml title="docker-compose.yml"
services:
  db:
    image: postgres:17
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:app@db:5432/app?sslmode=disable
```

### En otro proyecto de Compose {#other-compose}

Únete a la red de ese proyecto y usa su nombre de servicio. La red la encuentras con `docker network ls`:

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    environment:
      DATABASE_URL: postgres://app:secreto@db:5432/app
    networks:
      - miapp_default

networks:
  miapp_default:
    external: true
```

### En la propia máquina {#host}

Dentro del contenedor, `localhost` es el contenedor, no tu equipo.

- Docker Desktop (Windows, macOS): usa `host.docker.internal` como servidor.
- Linux: añade tú `host.docker.internal`, como abajo. PostgreSQL también tiene que escuchar en esa interfaz (`listen_addresses`) y admitir al cliente en `pg_hba.conf`.

```yaml title="docker-compose.yml"
services:
  gresbase:
    image: {{image}}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      DATABASE_URL: postgres://app:secreto@host.docker.internal:5432/app
```

## Un usuario con lo justo {#least-privilege}

Gresbase puede hacer todo lo que pueda hacer su usuario de PostgreSQL. No le des un superusuario. Crea uno para él con los permisos que vayas a usar:

```sql
CREATE ROLE gresbase LOGIN PASSWORD 'cambiame';
GRANT CONNECT ON DATABASE app TO gresbase;
GRANT USAGE ON SCHEMA public TO gresbase;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gresbase;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gresbase;
```

`GRANT … ON ALL TABLES` solo cubre las tablas que ya existen. Para las que crees después, usa `ALTER DEFAULT PRIVILEGES`. Para editar la estructura (crear tablas, añadir columnas, índices), el usuario tiene que ser dueño de las tablas o tener permiso para cambiarlas.

## Un usuario de solo lectura {#read-only-user}

Para mirar sin tocar, concede solo `SELECT`:

```sql
CREATE ROLE gresbase_ro LOGIN PASSWORD 'cambiame';
GRANT CONNECT ON DATABASE app TO gresbase_ro;
GRANT USAGE ON SCHEMA public TO gresbase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gresbase_ro;
ALTER ROLE gresbase_ro SET default_transaction_read_only = on;
```

La última línea es opcional. Gresbase lee `default_transaction_read_only` al conectar. Si vale `on`, Gresbase se comporta como en [modo solo lectura](./read-only.md), editor SQL incluido, así que desde él no se puede desactivar. Lo que protege de verdad los datos siguen siendo los permisos: cualquier otro cliente con ese usuario puede desactivar el ajuste en su propia sesión.

## Cuando la conexión falla {#errors}

**Probar conexión**, el asistente y el acceso en modo libre te dicen por qué falló. La API responde `connection_failed` con uno de estos motivos:

| Motivo | Qué ves | Qué revisar |
| --- | --- | --- |
| `dns` | El nombre del servidor no se resuelve. Revísalo y comprueba que Gresbase llega a esa red. | El nombre del servidor y que los dos contenedores compartan red. |
| `connection_refused` | No hay nada escuchando en ese servidor y puerto. Comprueba que PostgreSQL está en marcha. | Que PostgreSQL esté levantado y el puerto sea el correcto. |
| `authentication` | PostgreSQL rechazó el usuario o la contraseña. | El usuario, la contraseña y `pg_hba.conf`. |
| `ssl` | Falló la negociación SSL. Prueba otro modo de SSL. | `sslmode` y los certificados. |
| `database_not_found` | Esa base de datos no existe. | El nombre de la base. |
| `timeout` | El servidor no respondió a tiempo. Revisa el servidor, la red y los cortafuegos. | Cortafuegos y rutas. La prueba espera 10 segundos como mucho. |
| `host_not_allowed` | No se pudo conectar a PostgreSQL. Revisa los datos y los logs de Gresbase. | El servidor no está en `GRESBASE_ALLOWED_DB_HOSTS`. |
| `other` | No se pudo conectar a PostgreSQL. Revisa los datos y los logs de Gresbase. | El log de Gresbase tiene el error completo. |

Con `DATABASE_URL`, los mismos motivos salen en el log al arrancar, con una pista. Más casos en [Solución de problemas](./troubleshooting.md).
