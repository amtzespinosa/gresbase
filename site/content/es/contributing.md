---
description: Cómo proponer un cambio en Gresbase, de la rama al merge, y cómo escribir y previsualizar esta documentación.
---

## Las pull requests son bienvenidas {#welcome}

Al enviar una, aceptas que tu contribución quede bajo la licencia Apache 2.0, la del proyecto. No hay CLA que firmar.

- Un arreglo pequeño, como una errata, un fallo con causa clara o una traducción que falta, puede ir directo a una pull request.
- Un cambio grande, como una función nueva, una dependencia nueva o un cambio de comportamiento, empieza con un issue. Acuerda ahí el enfoque antes de escribir código.
- Las pull requests van al repositorio de GitHub, [{{repo}}]({{repo}}).

## Antes de empezar {#before-you-start}

Lee el `AGENTS.md` de la raíz del repositorio. Resume el stack, las reglas de seguridad y las convenciones, tanto para personas como para agentes de código. El alcance de cada versión está en `docs/spec.md` y el aspecto de la app en `docs/design.md`.

Trabaja solo en lo que planea la versión en curso. Las ideas para versiones futuras van a la hoja de ruta de `docs/spec.md`, no al código.

## Ramas y commits {#branches}

:::steps
### Crea una rama desde main {#branch}

Una rama por cambio, creada desde `main`. Las tareas del propio proyecto usan nombres como `feat/NN-nombre-corto`.

### Haz commits con Conventional Commits {#commits}

Mensajes en inglés, por ejemplo `feat(rows): keyset pagination`. Mejor varios commits pequeños que uno grande.

### Pasa la CI local {#ci}

Ejecuta `task ci:quick` dentro del contenedor de desarrollo. Tiene que salir en verde antes del merge.

### Haz el merge a main {#merge}

Nadie hace push a `main` con la CI local en rojo. Nunca `push --force` y nunca se reescribe la historia de `main`.
:::

## CI local {#local-ci}

GitHub Actions ejecuta las mismas comprobaciones en cada push y pull request. Pásalas antes en local: ahí se arreglan más rápido.

| Comando | Cuándo |
| --- | --- |
| `task ci:quick` | Antes de cada merge a `main` |
| `task ci:full` | Antes de cerrar un bloque de trabajo o una versión |

Los dos ejecutan `scripts/ci.sh`, guardan sus logs en `tmp/ci/` y terminan con una tabla de resumen. Para preparar el contenedor, mira [Compilar desde el código](./building.md).

## Estilo de código {#style}

- Código, identificadores, comentarios y commits en inglés. Los documentos del proyecto en `docs/` están en español.
- Go: paquetes pequeños, errores envueltos con `%w`, `context.Context` en todo lo que toque red o base de datos y tests en tabla.
- TypeScript en modo `strict`, sin `any`. Los hooks de datos viven en `web/src/lib/api`, no en los componentes de interfaz.
- Cada función nueva llega con sus tests. Los de integración corren contra un PostgreSQL real con testcontainers, y los de punta a punta están en `web/e2e`.
- Si cambia un struct de Go de la API, ejecuta `task gen` para regenerar los tipos de TypeScript.
- Si cambia una dependencia, ejecuta `task licenses`. Solo valen licencias compatibles con Apache 2.0.
- Las funciones nuevas funcionan en PostgreSQL 12 a 19 desde el primer día. Si cambias lo que funciona en cada versión, actualiza `docs/compatibility.md`.

## Traducciones {#translations}

La interfaz está en inglés y en español. Ningún texto visible se escribe dentro de un componente: todo pasa por i18n.

Los textos están en `web/src/locales/en.json` y `web/src/locales/es.json`. Añade cada clave nueva a los dos ficheros. Un test falla si no tienen exactamente las mismas claves.

Escribe el español como español, no como traducción palabra por palabra. Mantén el tono de `docs/design.md`: directo, breve y humano, con verbos en los botones.

## Escribir la documentación {#docs}

Esta documentación vive en `site/`. La genera un pequeño script de Node, sin ningún framework en el navegador.

### Previsualizarla {#preview}

Node corre en un contenedor. Desde la raíz del repositorio:

```sh title="Terminal"
docker compose -f site/compose.yml up -d
```

Abre `http://localhost:4321`. La página se recarga al guardar un fichero. Si cambias algo en `site/build/`, reinicia el contenedor con `docker compose -f site/compose.yml restart`.

### Ficheros y front matter {#files}

- Cada página es `site/content/<idioma>/<slug>.md`, con el mismo nombre de fichero en `en` y en `es`.
- `site/content/nav.yml` fija el orden, las secciones y el título de cada página en cada idioma. Ese título es el h1, así que no escribas uno en el Markdown.
- El front matter solo lleva `description`: una frase que dice qué resuelve la página. Se muestra como entradilla.
- El cuerpo empieza con encabezados `##`. `## Título {#mi-id}` fija un ancla propia. Las anclas no pueden repetirse en la página.

```yaml title="site/content/es/ejemplo.md"
---
description: Una frase que dice qué resuelve esta página.
---
```

### Elementos de Markdown {#elements}

Además de encabezados, listas, tablas, negrita, código en línea y `<kbd>`, el build entiende estos bloques:

~~~text
:::steps
### Primer paso
Qué hacer.

### Segundo paso
Qué viene después.
:::

:::note
También :::tip, :::warning y :::danger. Guárdalos para riesgos reales.
:::

:::tabs
@tab docker-compose.yml {#compose}
```yaml
services: {}
```
@tab docker run {#run}
```sh
docker run …
```
:::

```yaml title="docker-compose.yml"
services: {}
```
~~~

- Cada `@tab` necesita exactamente un bloque de código.
- `title="…"` detrás del lenguaje pone un nombre de fichero encima del código.
- Lenguajes con resaltado: `yaml`, `sh` y `sql`. El resto se ve como texto plano.
- Los enlaces internos apuntan al fichero Markdown, como `[Variables de entorno](./environment.md)` o `./pagina.md#ancla`.
- Las palabras entre dobles llaves se sustituyen al compilar: `image` (la imagen Docker), `port` (el puerto del inicio rápido) y `repo` (la URL del repositorio). Cualquier otro nombre rompe el build.

### Comprobarla {#check}

```sh title="Terminal"
docker compose -f site/compose.yml exec -T site npm run check
```

Falla ante cualquier problema:

- Un enlace o un ancla rotos, o una página que falta en uno de los idiomas.
- Una página que no está en `nav.yml`, o una página de `nav.yml` sin fichero.
- Una variable que lee el código de Go y que [Variables de entorno](./environment.md) no documenta, en cualquier idioma.
- Una variable `GRESBASE_*` en la documentación que el código no lee.
- Un atajo de `web/src/lib/shortcuts.ts` cuya descripción falta en [Atajos de teclado](./shortcuts.md).

`npm run build` y `npm run check` tienen que salir en verde antes de cada commit que toque `site/`.

### Datos y diseño {#facts}

- Saca cada dato técnico del código: variables, valores por defecto, puertos, rutas, errores y atajos. Si no puedes confirmarlo, márcalo con `TODO(verificar: …)`, en vez de suponer.
- Copia los nombres de botones y menús tal cual de los ficheros de idioma, en cada idioma.
- La landing tiene que coincidir con `site/reference/landing-referencia.html`, y la documentación con `site/reference/docs-referencia.html`. No se rediseñan.
- Los colores y las sombras salen solo de `site/src/css/tokens.css`. Las fuentes están autoalojadas y la web no pide nada a otros dominios.

:::note
Solo quien mantiene el proyecto publica versiones: un tag `v*` lanza el workflow de release, que publica los binarios y la imagen.
:::
