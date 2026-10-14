# Licencias de terceros

Generado por `task licenses` (`scripts/licenses.mjs`); no lo edites a mano. `task lint` comprueba que
está al día y que todas las licencias están en la lista de compatibles con Apache 2.0.

Gresbase se distribuye bajo **Apache License 2.0** (`LICENSE`, `NOTICE`). Esta lista cubre lo que va
dentro del binario: los módulos de Go enlazados en `cmd/gresbase` (más la biblioteca estándar de Go) y
las dependencias de producción de `web/`, incluidas las fuentes Geist y Geist Mono (SIL OFL 1.1), que se
empaquetan en la interfaz embebida. Las dependencias de desarrollo y de test (testcontainers, Vitest,
Playwright…) no se distribuyen.

Los textos completos de cada licencia están en `web/public/licenses/THIRD_PARTY_NOTICES.txt`, que viaja
embebido en el binario (`/licenses/THIRD_PARTY_NOTICES.txt` en la propia app y en Ajustes → Acerca de),
en `/licenses/` dentro de la imagen y en los archivos de release.

## Resumen

| Licencia | Paquetes |
| --- | --- |
| MIT | 129 |
| BSD-3-Clause | 6 |
| OFL-1.1 | 2 |
| 0BSD | 1 |
| CC0-1.0 | 1 |
| ISC | 1 |
| Python-2.0 | 1 |
| Unlicense | 1 |

Licencias menos habituales: `Python-2.0` (`argparse`, licencia PSF, permisiva), `CC0-1.0` y `Unlicense`
(dominio público), `0BSD` (`tslib`). Las fuentes van con SIL OFL 1.1, que permite empaquetarlas con
software bajo cualquier licencia siempre que no se vendan por separado y conserven su licencia.

Todas las licencias son compatibles con Apache 2.0.

## Go (10)

| Paquete | Versión | Licencia |
| --- | --- | --- |
| `Go standard library` | — | BSD-3-Clause |
| `github.com/go-chi/chi/v5` | v5.3.2 | MIT |
| `github.com/jackc/pgpassfile` | v1.0.0 | MIT |
| `github.com/jackc/pgservicefile` | v0.0.0-20240606120523-5a60cdf6a761 | MIT |
| `github.com/jackc/pgx/v5` | v5.11.0 | MIT |
| `github.com/jackc/puddle/v2` | v2.2.2 | MIT |
| `golang.org/x/crypto` | v0.54.0 | BSD-3-Clause |
| `golang.org/x/sync` | v0.22.0 | BSD-3-Clause |
| `golang.org/x/sys` | v0.47.0 | BSD-3-Clause |
| `golang.org/x/text` | v0.40.0 | BSD-3-Clause |

## Web (132)

| Paquete | Versión | Licencia |
| --- | --- | --- |
| `@babel/runtime` | 7.29.10 | MIT |
| `@codemirror/autocomplete` | 6.20.3 | MIT |
| `@codemirror/commands` | 6.11.1 | MIT |
| `@codemirror/lang-json` | 6.0.2 | MIT |
| `@codemirror/lang-sql` | 6.10.0 | MIT |
| `@codemirror/language` | 6.13.1 | MIT |
| `@codemirror/lint` | 6.9.7 | MIT |
| `@codemirror/search` | 6.7.2 | MIT |
| `@codemirror/state` | 6.7.6 | MIT |
| `@codemirror/streamparser` | 6.0.0 | MIT |
| `@codemirror/view` | 6.43.14 | MIT |
| `@floating-ui/core` | 1.8.0 | MIT |
| `@floating-ui/dom` | 1.8.0 | MIT |
| `@floating-ui/react-dom` | 2.1.9 | MIT |
| `@floating-ui/utils` | 0.2.12 | MIT |
| `@fontsource-variable/geist` | 5.3.0 | OFL-1.1 |
| `@fontsource-variable/geist-mono` | 5.3.0 | OFL-1.1 |
| `@lezer/common` | 1.5.3 | MIT |
| `@lezer/highlight` | 1.2.5 | MIT |
| `@lezer/json` | 1.0.3 | MIT |
| `@lezer/lr` | 1.4.11 | MIT |
| `@marijn/find-cluster-break` | 1.0.4 | MIT |
| `@radix-ui/number` | 1.1.3 | MIT |
| `@radix-ui/primitive` | 1.1.7 | MIT |
| `@radix-ui/react-accessible-icon` | 1.1.16 | MIT |
| `@radix-ui/react-accordion` | 1.2.21 | MIT |
| `@radix-ui/react-alert-dialog` | 1.1.24 | MIT |
| `@radix-ui/react-arrow` | 1.1.16 | MIT |
| `@radix-ui/react-aspect-ratio` | 1.1.16 | MIT |
| `@radix-ui/react-avatar` | 1.2.7 | MIT |
| `@radix-ui/react-checkbox` | 1.3.12 | MIT |
| `@radix-ui/react-collapsible` | 1.1.21 | MIT |
| `@radix-ui/react-collection` | 1.1.16 | MIT |
| `@radix-ui/react-compose-refs` | 1.1.5 | MIT |
| `@radix-ui/react-context` | 1.2.2 | MIT |
| `@radix-ui/react-context-menu` | 2.3.8 | MIT |
| `@radix-ui/react-dialog` | 1.2.0 | MIT |
| `@radix-ui/react-direction` | 1.1.5 | MIT |
| `@radix-ui/react-dismissable-layer` | 1.1.20 | MIT |
| `@radix-ui/react-dropdown-menu` | 2.1.25 | MIT |
| `@radix-ui/react-focus-guards` | 1.1.6 | MIT |
| `@radix-ui/react-focus-scope` | 1.2.0 | MIT |
| `@radix-ui/react-form` | 0.2.0 | MIT |
| `@radix-ui/react-hover-card` | 1.1.24 | MIT |
| `@radix-ui/react-id` | 1.1.4 | MIT |
| `@radix-ui/react-label` | 2.1.16 | MIT |
| `@radix-ui/react-menu` | 2.1.25 | MIT |
| `@radix-ui/react-menubar` | 1.1.25 | MIT |
| `@radix-ui/react-navigation-menu` | 1.3.0 | MIT |
| `@radix-ui/react-one-time-password-field` | 0.1.17 | MIT |
| `@radix-ui/react-password-toggle-field` | 0.1.12 | MIT |
| `@radix-ui/react-popover` | 1.2.0 | MIT |
| `@radix-ui/react-popper` | 1.3.8 | MIT |
| `@radix-ui/react-portal` | 1.1.18 | MIT |
| `@radix-ui/react-presence` | 1.1.11 | MIT |
| `@radix-ui/react-primitive` | 2.1.11 | MIT |
| `@radix-ui/react-progress` | 1.1.17 | MIT |
| `@radix-ui/react-radio-group` | 1.4.8 | MIT |
| `@radix-ui/react-roving-focus` | 1.1.20 | MIT |
| `@radix-ui/react-scroll-area` | 1.3.0 | MIT |
| `@radix-ui/react-select` | 2.3.8 | MIT |
| `@radix-ui/react-separator` | 1.1.16 | MIT |
| `@radix-ui/react-slider` | 1.5.0 | MIT |
| `@radix-ui/react-slot` | 1.4.0 | MIT |
| `@radix-ui/react-switch` | 1.3.8 | MIT |
| `@radix-ui/react-tabs` | 1.1.22 | MIT |
| `@radix-ui/react-toast` | 1.2.24 | MIT |
| `@radix-ui/react-toggle` | 1.1.19 | MIT |
| `@radix-ui/react-toggle-group` | 1.1.20 | MIT |
| `@radix-ui/react-toolbar` | 1.1.20 | MIT |
| `@radix-ui/react-tooltip` | 1.3.0 | MIT |
| `@radix-ui/react-use-callback-ref` | 1.1.4 | MIT |
| `@radix-ui/react-use-controllable-state` | 1.2.6 | MIT |
| `@radix-ui/react-use-effect-event` | 0.0.5 | MIT |
| `@radix-ui/react-use-escape-keydown` | 1.1.5 | MIT |
| `@radix-ui/react-use-is-hydrated` | 0.1.3 | MIT |
| `@radix-ui/react-use-layout-effect` | 1.1.4 | MIT |
| `@radix-ui/react-use-previous` | 1.1.4 | MIT |
| `@radix-ui/react-use-rect` | 1.1.4 | MIT |
| `@radix-ui/react-use-size` | 1.1.5 | MIT |
| `@radix-ui/react-visually-hidden` | 1.2.12 | MIT |
| `@radix-ui/rect` | 1.1.3 | MIT |
| `@tanstack/history` | 1.162.4 | MIT |
| `@tanstack/query-core` | 5.104.1 | MIT |
| `@tanstack/react-query` | 5.104.1 | MIT |
| `@tanstack/react-router` | 1.170.41 | MIT |
| `@tanstack/react-store` | 0.11.2 | MIT |
| `@tanstack/react-table` | 8.21.3 | MIT |
| `@tanstack/react-virtual` | 3.14.13 | MIT |
| `@tanstack/router-core` | 1.171.34 | MIT |
| `@tanstack/store` | 0.11.2 | MIT |
| `@tanstack/table-core` | 8.21.3 | MIT |
| `@tanstack/virtual-core` | 3.17.11 | MIT |
| `argparse` | 2.0.1 | Python-2.0 |
| `aria-hidden` | 1.2.6 | MIT |
| `cmdk` | 1.1.1 | MIT |
| `codemirror` | 6.0.2 | MIT |
| `commander` | 2.20.3 | MIT |
| `cookie-es` | 3.1.1 | MIT |
| `crelt` | 1.0.7 | MIT |
| `detect-node-es` | 1.1.0 | MIT |
| `discontinuous-range` | 1.0.0 | MIT |
| `get-nonce` | 1.0.1 | MIT |
| `html-parse-stringify` | 4.0.1 | MIT |
| `i18next` | 26.4.2 | MIT |
| `isbot` | 5.2.2 | Unlicense |
| `lucide-react` | 1.53.0 | ISC |
| `moo` | 0.5.3 | BSD-3-Clause |
| `nearley` | 2.20.1 | MIT |
| `papaparse` | 5.7.0 | MIT |
| `radix-ui` | 1.7.0 | MIT |
| `railroad-diagrams` | 1.0.0 | CC0-1.0 |
| `randexp` | 0.4.6 | MIT |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |
| `react-i18next` | 17.0.16 | MIT |
| `react-remove-scroll` | 2.7.2 | MIT |
| `react-remove-scroll-bar` | 2.3.8 | MIT |
| `react-style-singleton` | 2.2.3 | MIT |
| `ret` | 0.1.15 | MIT |
| `scheduler` | 0.28.0 | MIT |
| `seroval` | 1.6.8 | MIT |
| `seroval-plugins` | 1.6.8 | MIT |
| `sql-formatter` | 15.9.0 | MIT |
| `style-mod` | 4.1.4 | MIT |
| `tslib` | 2.8.1 | 0BSD |
| `use-callback-ref` | 1.3.3 | MIT |
| `use-sidecar` | 1.1.3 | MIT |
| `use-sync-external-store` | 1.7.0 | MIT |
| `w3c-keyname` | 2.2.8 | MIT |
| `zod` | 4.6.5 | MIT |
| `zustand` | 5.0.15 | MIT |
