---
description: Cambia el idioma, el tema y la densidad del grid, y entérate de qué recuerda Gresbase de ellos.
---

## Idioma {#language}

Gresbase habla inglés y español. Puedes cambiar el idioma en cualquiera de estos sitios:

- **Ajustes** → **General** → **Idioma**.
- La pantalla de inicio de sesión, la de conexión del modo libre y el asistente de configuración, que muestran el mismo selector.
- La [paleta de comandos](./command-palette.md): **Idioma: English** o **Idioma: Español**.

La interfaz cambia al momento, sin recargar.

### Qué idioma ves primero {#language-order}

Gresbase elige el idioma en este orden:

1. El que elegiste en este navegador.
2. El idioma por defecto del servidor.
3. Inglés.

El idioma por defecto del servidor es `GRESBASE_LANG` (`en` o `es`). Sin esa variable, es el idioma con el que se usó el [asistente de configuración](./setup-wizard.md). El administrador puede cambiarlo en [Ajustes](./settings.md), en **Idioma por defecto**.

:::tip
Para un equipo que trabaja en español, define `GRESBASE_LANG=es`. Quien prefiera inglés puede cambiarlo en su navegador.
:::

## Tema {#theme}

Hay tres temas: **Claro**, **Oscuro** y **Automático**. **Automático** sigue al sistema y cambia con él.

| Dónde | Cómo |
| --- | --- |
| Barra lateral | El botón de tema, abajo, va pasando por **Claro** → **Oscuro** → **Automático**. |
| **Ajustes** → **General** → **Tema** | Elige uno de los tres. |
| [Paleta de comandos](./command-palette.md) | **Tema: Claro**, **Tema: Oscuro** o **Tema: Automático**. |
| Asistente de configuración | Las mismas tres opciones. |

El tema guardado se aplica antes de pintar la página, así que nunca ves un parpadeo con los colores equivocados.

## Densidad del grid {#density}

**Ajustes** → **General** → **Densidad del grid** fija la altura de las filas en todos los grids de datos:

- **Cómoda**: filas de 36 px. Es la opción por defecto.
- **Compacta**: filas de 28 px, caben más en pantalla.

## Barra lateral {#app-sidebar}

Pliega o despliega la barra lateral con <kbd>⌘</kbd> <kbd>B</kbd> (<kbd>Ctrl</kbd> <kbd>B</kbd> en Windows y Linux), con el botón **Plegar barra lateral** o desde la paleta.

Hasta que la cambias una vez, la barra empieza plegada en ventanas de menos de 1024 px de ancho.

## Qué se recuerda y dónde {#storage}

Estas preferencias viven en este navegador, en `localStorage`, con la clave `gresbase:prefs`:

| Preferencia | Valores |
| --- | --- |
| Tema | `light`, `dark` o `system` (que se muestra como **Automático**) |
| Densidad del grid | `comfortable` o `compact` |
| Barra lateral plegada | sí o no, en cuanto la cambias |
| Idioma | `en` o `es`, en cuanto eliges uno |

La misma clave guarda también el esquema que elegiste en la lista de tablas, su ancho y tus elementos recientes de la paleta.

Nada de esto llega al servidor. Otro navegador u otro equipo empieza con los valores por defecto. Si borras los datos del sitio en el navegador, todo vuelve a empezar.
