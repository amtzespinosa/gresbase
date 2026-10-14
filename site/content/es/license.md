---
description: Qué licencia cubre Gresbase, qué queda fuera y dónde están los avisos del software de terceros que incluye.
---

## Apache License 2.0 {#apache}

El código de Gresbase se distribuye bajo la Apache License, Version 2.0. Copyright 2026 Alex M. Espinosa.

- Texto completo: [LICENSE](https://github.com/amtzespinosa/gresbase/blob/main/LICENSE).
- Aviso: [NOTICE](https://github.com/amtzespinosa/gresbase/blob/main/NOTICE).

Si redistribuyes Gresbase, la licencia te pide que incluyas los dos ficheros.

## Nombre y logo {#trademarks}

La licencia cubre solo el código. No da ningún derecho sobre el nombre «Gresbase» ni sobre el logo del mamut, que siguen siendo de Alex M. Espinosa. [TRADEMARKS.md](https://github.com/amtzespinosa/gresbase/blob/main/TRADEMARKS.md) fija las reglas:

- Los forks y las redistribuciones tienen que usar otro nombre y otro logo. No pueden dar a entender que son Gresbase ni que su autor los respalda.
- Puedes decir que tu proyecto está «basado en Gresbase» o es «compatible con Gresbase», si es cierto y no confunde. También escribir sobre Gresbase o enlazarlo.
- Las compilaciones sin modificar del repositorio pueden conservar el nombre y el logo.

Para cualquier otra cosa, pregunta antes.

## Software de terceros {#third-party}

El binario incluye software de otros proyectos con sus propias licencias: MIT, BSD, ISC, Apache 2.0 y otras. Son los módulos de Go enlazados en el binario y las dependencias de producción de la interfaz web.

Las dependencias de desarrollo y de test no se distribuyen, así que no aparecen en la lista.

Los avisos y los textos completos de las licencias están en varios sitios:

| Dónde | Qué |
| --- | --- |
| [docs/third-party-licenses.md](https://github.com/amtzespinosa/gresbase/blob/main/docs/third-party-licenses.md) | Resumen por licencia y lista de paquetes |
| `web/public/licenses/THIRD_PARTY_NOTICES.txt` | Textos completos. Va incrustado en el binario |
| `/licenses/THIRD_PARTY_NOTICES.txt` en la app | El mismo fichero, enlazado desde **Ajustes** → **Acerca de** → **Licencias de terceros** |
| `/licenses/` en la imagen Docker | `LICENSE`, `NOTICE`, `TRADEMARKS.md` y `THIRD_PARTY_NOTICES.txt` |

`task licenses` regenera la lista y los avisos. `task lint` falla si no están al día o si una licencia no es compatible con Apache 2.0.

## Fuentes {#fonts}

La app y esta web usan Geist y Geist Mono, autoalojadas. Las dos tienen la SIL Open Font License 1.1, Copyright 2024 The Geist Project Authors.

Los textos de la licencia para la web están en `site/src/fonts/OFL-geist.txt` y `site/src/fonts/OFL-geist-mono.txt`. En la app, las fuentes aparecen con el resto del software de terceros.
