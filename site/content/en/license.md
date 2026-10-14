---
description: What license covers Gresbase, what it doesn't cover, and where to find the notices of the software it bundles.
---

## Apache License 2.0 {#apache}

The source code of Gresbase is licensed under the Apache License, Version 2.0. Copyright 2026 Alex M. Espinosa.

- Full text: [LICENSE](https://github.com/amtzespinosa/gresbase/blob/main/LICENSE).
- Notice: [NOTICE](https://github.com/amtzespinosa/gresbase/blob/main/NOTICE).

If you redistribute Gresbase, the license asks you to keep both files with it.

## Name and logo {#trademarks}

The license covers the code only. It grants no rights to the name "Gresbase" or the mammoth logo, which remain the property of Alex M. Espinosa. [TRADEMARKS.md](https://github.com/amtzespinosa/gresbase/blob/main/TRADEMARKS.md) sets the rules:

- Forks and redistributions must use another name and another logo. They must not suggest that they are Gresbase or that its author endorses them.
- Saying that your project is "based on Gresbase" or "compatible with Gresbase" is fine, as long as it's accurate and not confusing. So is writing about Gresbase or linking to it.
- Unmodified builds of the repository may keep the name and the logo.

For anything else, ask first.

## Third-party software {#third-party}

The binary bundles software from other projects under their own licenses: MIT, BSD, ISC, Apache 2.0 and others. That covers the Go modules linked into the binary and the production dependencies of the web interface.

Development and test dependencies are not distributed, so they are not on the list.

The notices and the full license texts are in several places:

| Where | What |
| --- | --- |
| [docs/third-party-licenses.md](https://github.com/amtzespinosa/gresbase/blob/main/docs/third-party-licenses.md) | Summary by license and the list of packages |
| `web/public/licenses/THIRD_PARTY_NOTICES.txt` | Full texts. It is embedded in the binary |
| `/licenses/THIRD_PARTY_NOTICES.txt` in the app | The same file, linked from **Settings** → **About** → **Third-party licenses** |
| `/licenses/` in the Docker image | `LICENSE`, `NOTICE`, `TRADEMARKS.md` and `THIRD_PARTY_NOTICES.txt` |

`task licenses` regenerates the list and the notices. `task lint` fails if they are out of date or if a license is not compatible with Apache 2.0.

## Fonts {#fonts}

The app and this site use Geist and Geist Mono, self-hosted. Both are under the SIL Open Font License 1.1, Copyright 2024 The Geist Project Authors.

The license texts for the site are in `site/src/fonts/OFL-geist.txt` and `site/src/fonts/OFL-geist-mono.txt`. In the app, the fonts are listed with the rest of the third-party software.
