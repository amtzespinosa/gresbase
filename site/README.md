# Web de Gresbase

Landing y documentación bilingüe (EN en `/`, ES en `/es/`) generadas por un script propio en Node, sin
frameworks en el navegador. El aspecto lo fijan dos referencias aprobadas:
[`reference/landing-referencia.html`](reference/landing-referencia.html) y
[`reference/docs-referencia.html`](reference/docs-referencia.html).

## Reglas

- **Sin frameworks en el runtime.** HTML generado en build con plantillas JS, CSS escrito a mano y JS
  vanilla. Dependencias solo de build y mínimas (`markdown-it` y `yaml`; Playwright, opcional, para
  capturas y auditoría).
- **Landing y docs iguales a sus referencias.** Un cambio de plantilla o CSS se comprueba con
  `npm run compare`.
- **Colores y sombras solo desde `src/css/tokens.css`.** Fuentes autoalojadas en `src/fonts/`; la web no
  hace peticiones a otros dominios.
- **Todo texto visible en EN y ES.** Cada página de `content/en/` tiene su gemela en `content/es/`.
- **Datos técnicos solo desde el código:** variables (`internal/config/`), atajos
  (`web/src/lib/shortcuts.ts`), textos de la interfaz (`web/src/locales/`) y errores (`internal/api`). Lo
  que no se pueda verificar se marca `TODO(verificar: …)`.
- **Funciona sin JS** y respeta `prefers-reduced-motion`; foco visible y controles usables con teclado.

## Previsualizar

Node solo corre en contenedores. Desde la raíz del repo:

```
docker compose -f site/compose.yml up -d     # http://localhost:4321, con recarga
docker compose -f site/compose.yml run --rm site npm run build
```

`npm run preview` sirve `dist/` tal cual, con las cabeceras de `_headers` aplicadas (CSP incluida).

## Escribir una página

1. Añade la página a `content/nav.yml`, con su título en cada idioma (es también el h1).
2. Crea `content/en/<slug>.md` y `content/es/<slug>.md`, con el mismo nombre. El front matter solo lleva
   `description`, la entradilla.
3. Usa los elementos de la referencia: `:::steps`, `:::tabs` con `@tab`, ```` ```lang title="…" ````,
   `:::note`/`tip`/`warning`/`danger`, tablas, `<kbd>`, enlaces `./otra-pagina.md#ancla`, capturas
   `![Texto alternativo](tables.webp)` y las variables `{{image}}` y `{{port}}`. Detalle en
   [`build/markdown.mjs`](build/markdown.mjs).
4. `npm run check` tiene que pasar.

## Comprobaciones

| Comando | Dónde | Qué hace |
| --- | --- | --- |
| `npm run check` | `site` o `workspace` | Traducciones, `nav.yml`, enlaces y anclas, capturas que faltan o sobran, textos alternativos, variables de entorno y atajos frente al código |
| `npm run compare` | `workspace` | Landing (8 casos) y documentación (12 casos) frente a las referencias, píxel a píxel |
| `npm run audit` | `workspace` | axe en la landing y cinco páginas de docs, peticiones a otros dominios, errores de consola y CSP en todas las páginas, teclado, y Lighthouse ≥ 95 |
| `npm run screenshots` | `workspace` | Regenera las capturas de `src/img/docs/` con la app real y una base de demostración |

`workspace` es el contenedor de desarrollo del repo (`dev.compose.yml`): tiene los navegadores de
Playwright y el Docker interno donde vive `gresbase:local`.

```
docker compose -f dev.compose.yml exec -T -u root workspace bash -lc "cd site && npm ci"   # la primera vez
docker compose -f dev.compose.yml exec -T workspace bash -lc "cd site && npm run audit"
```

Las capturas usan la imagen local: si cambia la app, `task image:local` y luego `npm run screenshots`.

## Publicar en Cloudflare Pages

La web se publica en Cloudflare Pages, sin dominio propio, en **https://gresbase.pages.dev** (proyecto
`gresbase`), con despliegue automático desde GitHub. La configuración se pone en el panel; no hay `wrangler.toml`, que
haría de él la única fuente y dejaría el panel en solo lectura.

| Ajuste | Valor |
| --- | --- |
| Framework preset | `None` |
| Root directory | `site` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |

| Variable de entorno (Production) | Valor |
| --- | --- |
| `SITE_URL` | `https://gresbase.pages.dev` |
| `NODE_VERSION` | `22` (Pages también lee `site/.nvmrc`; así queda explícito) |
| `SITE_REPO_PUBLIC` | `true` (muestra «Editar en GitHub») |

### Crear el proyecto

1. En el panel de Cloudflare: **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git**.
2. Conecta la cuenta de GitHub e instala la app de Cloudflare Pages con acceso al repositorio
   `amtzespinosa/gresbase`.
3. Elige el repositorio y pulsa **Begin setup**.
4. **Project name:** `gresbase`. Es lo que da la dirección `gresbase.pages.dev`; si el nombre estuviera
   ocupado, Cloudflare añadiría un sufijo y habría que usar esa dirección en `SITE_URL`.
5. **Production branch** y **Build settings** como en la primera tabla (la carpeta raíz está en
   *Advanced*).
6. **Environment variables** (en *Advanced*) como en la segunda tabla.
7. **Save and Deploy.** El primer build publica `main` en https://gresbase.pages.dev.

Después, cada push a `main` vuelve a publicar la web. Las demás ramas y las PR generan vistas previas en
`https://<rama>.gresbase.pages.dev`; sus canónicas y su sitemap apuntan a `SITE_URL`, es decir, a
producción. Si no quieres vistas previas, desactívalas en *Settings* → *Builds* → *Branch control*.

Sin `SITE_URL`, el build usa `http://localhost:4321` (`site.config.mjs`).

### Qué deja el build

- `_headers`: caché inmutable de un año para CSS, JS, fuentes, capturas e índices de búsqueda (todos con
  hash en el nombre), caché de 5 minutos para el HTML y cabeceras de seguridad: CSP sin orígenes externos
  (el script del tema en línea entra por su hash), `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` y `Permissions-Policy`.
- `_redirects` (desde `public/`): `/docs` → `/docs/introduction/` y `/es/docs` → `/es/docs/introduction/`.
- `404.html` bilingüe, `sitemap.xml` con `hreflang`, `robots.txt` y canónicas, todo desde `SITE_URL`.

### Comprobar una publicación

Abre https://gresbase.pages.dev y comprueba `/`, `/es/`, `/docs/` (redirige), una página que no existe
(404) y las cabeceras (`curl -I https://gresbase.pages.dev/`).
