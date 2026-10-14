---
description: How to propose a change to Gresbase, from the branch to the merge, and how to write and preview this documentation.
---

## Pull requests are welcome {#welcome}

By sending one, you agree that your contribution is licensed under Apache 2.0, the license of the project. There is no CLA to sign.

- A small fix, like a typo, a bug with a clear cause or a missing translation, can go straight to a pull request.
- A large change, like a new feature, a new dependency or a change of behaviour, starts with an issue. Agree on the approach there before writing code.
- Pull requests go to the GitHub repository, [{{repo}}]({{repo}}).

## Before you start {#before-you-start}

Read `AGENTS.md` at the root of the repository. It sums up the stack, the security rules and the conventions, for people and for coding agents alike. The scope of each version is in `docs/spec.md`, and the look of the app in `docs/design.md`.

Work only on what the current version plans. Ideas for later versions go to the roadmap in `docs/spec.md`, not into the code.

## Branches and commits {#branches}

:::steps
### Branch off main {#branch}

One branch per change, created from `main`. The project's own tasks use names like `feat/NN-short-name`.

### Commit with Conventional Commits {#commits}

Messages in English, for example `feat(rows): keyset pagination`. Several small commits are better than one large one.

### Pass the local CI {#ci}

Run `task ci:quick` inside the development container. It has to be green before the merge.

### Merge into main {#merge}

Nobody pushes to `main` with the local CI in red. Never force-push and never rewrite the history of `main`.
:::

## Local CI {#local-ci}

GitHub Actions runs the same checks on every push and pull request. Run them locally first: they are faster to fix there.

| Command | When |
| --- | --- |
| `task ci:quick` | Before every merge into `main` |
| `task ci:full` | Before closing a block of work or a version |

Both run `scripts/ci.sh`, keep their logs in `tmp/ci/` and end with a summary table. To set up the container, see [Building from source](./building.md).

## Code style {#style}

- Code, identifiers, comments and commits in English. The project documents in `docs/` are in Spanish.
- Go: small packages, errors wrapped with `%w`, `context.Context` in everything that touches the network or the database, table-driven tests.
- TypeScript in `strict` mode, without `any`. Data hooks live in `web/src/lib/api`, not in the UI components.
- Every new feature brings its tests. Integration tests run against a real PostgreSQL with testcontainers, and end-to-end tests live in `web/e2e`.
- If a Go struct of the API changes, run `task gen` to regenerate the TypeScript types.
- If a dependency changes, run `task licenses`. Only licenses compatible with Apache 2.0 are accepted.
- New features work on PostgreSQL 12 to 19 from day one. If you change what works on each version, update `docs/compatibility.md`.

## Translations {#translations}

The interface is in English and Spanish. No visible text is written inside a component: everything goes through i18n.

The texts live in `web/src/locales/en.json` and `web/src/locales/es.json`. Add each new key to both files. A test fails if they don't have exactly the same keys.

Write the Spanish as Spanish, not as a word-for-word translation. Keep the tone of `docs/design.md`: direct, short and human, with verbs on the buttons.

## Write the documentation {#docs}

This documentation lives in `site/`. A small Node script builds it, with no framework in the browser.

### Preview it {#preview}

Node runs in a container. From the root of the repository:

```sh title="Terminal"
docker compose -f site/compose.yml up -d
```

Open `http://localhost:4321`. The page reloads when you save a file. If you change something in `site/build/`, restart the container with `docker compose -f site/compose.yml restart`.

### Files and front matter {#files}

- Each page is `site/content/<lang>/<slug>.md`, with the same file name in `en` and `es`.
- `site/content/nav.yml` sets the order, the sections and the title of each page in each language. That title is the page's h1, so don't write one in the Markdown.
- The front matter has only `description`: one sentence that says what the page solves. It shows as the lead.
- The body starts with `##` headings. `## Title {#my-id}` sets a custom anchor. Anchors must be unique in the page.

```yaml title="site/content/en/example.md"
---
description: One sentence that says what this page solves.
---
```

### Markdown elements {#elements}

Besides headings, lists, tables, bold, inline code and `<kbd>`, the build understands these blocks:

~~~text
:::steps
### First step
What to do.

### Second step
What comes next.
:::

:::note
Also :::tip, :::warning and :::danger. Keep them for real risks.
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

- Each `@tab` needs exactly one code block.
- `title="…"` after the language adds a file name above the code.
- Highlighted languages: `yaml`, `sh` and `sql`. The rest show as plain text.
- Internal links point to the Markdown file, such as `[Environment variables](./environment.md)` or `./page.md#anchor`.
- Words between double curly braces are replaced at build time: `image` (the Docker image), `port` (the quick start host port) and `repo` (the repository URL). Any other name fails the build.

### Check it {#check}

```sh title="Terminal"
docker compose -f site/compose.yml exec -T site npm run check
```

It fails on any problem:

- A broken link or anchor, or a page missing in one of the languages.
- A page missing from `nav.yml`, or a page in `nav.yml` without a file.
- A variable that the Go code reads and [Environment variables](./environment.md) doesn't document, in any language.
- A `GRESBASE_*` variable in the docs that the code doesn't read.
- A shortcut from `web/src/lib/shortcuts.ts` whose description is missing from [Keyboard shortcuts](./shortcuts.md).

`npm run build` and `npm run check` must be green before every commit that touches `site/`.

### Facts and design {#facts}

- Take every technical fact from the code: variables, defaults, ports, paths, errors and shortcuts. If you can't confirm one, mark it as pending verification, with `TODO(verificar: …)`, instead of guessing.
- Copy the names of buttons and menus exactly from the locale files, in each language.
- The landing must match `site/reference/landing-referencia.html`, and the docs `site/reference/docs-referencia.html`. Don't redesign them.
- Colors and shadows come only from `site/src/css/tokens.css`. Fonts are self-hosted, and the site makes no requests to other domains.

:::note
Only the maintainer publishes releases: a `v*` tag runs the release workflow, which publishes the binaries and the image.
:::
