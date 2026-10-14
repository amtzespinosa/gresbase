# Gresbase — Guía de diseño

Interfaz minimalista y técnica: grises cálidos, un único acento amarillo, mucho aire, tarjetas flotantes
con esquinas redondeadas y nada de barra superior. Referencia de estilo: Supabase Studio (inspiración, no
copia de marca ni assets).

## Tokens

Defínelos como variables CSS en `:root` y `[data-theme="dark"]`, y expónlos a Tailwind v4 con `@theme`.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--bg` | `#F4F3F0` | `#0B0B0A` | Fondo de la página |
| `--surface` | `#FFFFFF` | `#161615` | Tarjetas |
| `--surface-2` | `#F7F6F3` | `#1C1C1A` | Cabeceras de tabla, inputs, item activo |
| `--border` | `#E6E3DD` | `#2A2926` | Bordes de 1 px |
| `--text` | `#1C1A17` | `#EDEBE6` | Texto principal |
| `--muted` | `#6B665E` | `#AEAAA1` | Texto secundario (contraste ≥ 4,5:1) |
| `--accent` | `#FFC929` | `#FFC929` | Botón primario, indicadores, logo |
| `--on-accent` | `#17130C` | `#17130C` | Texto e iconos sobre acento |
| `--accent-ink` | `#806515` | `#FFC929` | Acento usado como texto (keywords SQL, enlaces FK) |
| `--accent-tint` | `#FFC92933` | `#FFC9292E` | Celdas editadas, chips de filtro activos |
| `--row-selected` | `#EBE8E2` | `#2C2B28` | Fila seleccionada en el grid (gris claro, distinto de la fila normal y del hover: 1,22:1 / 1,28:1 frente a la fila y 1,16:1 / 1,23:1 frente al hover). Texto 14,2:1 / 11,9:1 |
| `--row-selected-edited` | `#ECD38C` | `#61542E` | Celda editada dentro de una fila seleccionada: amarillo opaco que se lee sobre el gris (sustituye a `--accent-tint` en esa fila). Texto 11,8:1 / 6,3:1 |
| `--row-selected-muted` | `#57524B` | `#D6D2C9` | `--muted` dentro de una fila seleccionada (6,3:1 / 9,4:1 sobre el gris; 5,3:1 / 4,9:1 sobre la celda editada) |
| `--row-selected-ink` | `#6B5410` | `#FFE08A` | `--accent-ink` dentro de una fila seleccionada (5,9:1 / 11,0:1 sobre el gris; 4,9:1 / 5,8:1 sobre la celda editada) |
| `--success` | `#22A06B` | `#22A06B` | Conexión OK |
| `--danger` | `#C2410C` | `#F97316` | Acciones destructivas |
| `--pill` | `#1C1A17` | `#EDEBE6` | Píldora flotante de cambios pendientes |
| `--on-pill` | `#F4F3F0` | `#17130C` | Texto de la píldora |
| `--syntax-string` | `#0F766E` | `#6EE7C8` | Cadenas SQL |
| `--syntax-number` | `#1D4ED8` | `#93C5FD` | Números SQL |
| `--syntax-function` | `#A21CAF` | `#F0ABFC` | Funciones SQL |
| `--syntax-comment` | `--muted` | `--muted` | Comentarios SQL |
| `--label-{gray,red,orange,green,blue,purple}` | `#8A857C` `#DC2626` `#EA580C` `#16A34A` `#2563EB` `#9333EA` | `#8A857C` `#F87171` `#FB923C` `#4ADE80` `#60A5FA` `#C084FC` | Color de etiqueta de una conexión guardada (decorativo: siempre va junto al nombre) |

Sombras de tarjeta: claro `0 1px 2px rgba(28,26,23,.04), 0 8px 24px rgba(28,26,23,.05)`; oscuro
`inset 0 1px 0 rgba(255,255,255,.03), 0 8px 24px rgba(0,0,0,.35)`.

Radios: tarjetas 16 px · controles 8–9 px · chips 8 px · icono de app 22% del lado.

## Tipografía

- **Geist** para la interfaz (400, 500, 600) y **Geist Mono** para datos, tipos, SQL y números.
- Autoalojadas (paquetes de Fontsource o equivalente). Nunca desde Google Fonts: la app funciona offline.
- Tamaños: 13 px base de la interfaz; 12,5 px celdas del grid (mono); 19 px título de pantalla; 11 px
  etiquetas de sección en mayúsculas con `letter-spacing: .05em`.
- Wordmark `gresbase` en minúsculas, Geist 600, `letter-spacing: -0.04em`.

## Layout

- Página con `padding: 12px` y `gap: 12px` entre tarjetas. **No hay barra superior.**
- **Barra lateral:** tarjeta flotante, 236 px desplegada, 64 px plegada (solo iconos y logo arriba,
  tooltips a la derecha). Por debajo de 1024 px empieza plegada.
- Pantalla **Tablas:** barra lateral · tarjeta "lista de tablas" (240 px por defecto; se ensancha arrastrando su borde derecho entre 200 y 560 px, con flechas y Inicio/Fin desde el teclado; doble clic restablece; ancho guardado en el navegador. Un nombre truncado se muestra entero al pasar el cursor o con foco: una copia de la fila flota encima de la tarjeta, sin desplazar nada) · tarjeta principal con
  cabecera (`public /` + nombre de tabla + recuento aproximado), pestañas segmentadas
  Datos/Estructura/Relaciones, toolbar (Filtrar, Ordenar, chips, CSV, Insertar fila) y el grid.
- Pantalla **SQL:** barra lateral · tarjeta "Consultas" (guardadas e historial) · columna con dos tarjetas:
  editor arriba (toolbar con título, timeout, Guardar, Ejecutar ⌘↵) y resultados abajo, redimensionable.
- Todo lo que desborda horizontalmente hace scroll dentro de su tarjeta, nunca la página.

## Componentes

- **Item de navegación:** 36 px de alto, radio 9 px, icono 18 px. Activo: fondo `--surface-2`, texto
  `--text`, icono `--accent-ink`. Inactivo: transparente, `--muted`.
- **Botón primario:** fondo `--accent`, texto `--on-accent`, 600, 32–36 px. **Secundario:** borde
  `--border`, fondo `--surface`. **Peligro:** fondo `--danger`, texto blanco.
- **Control segmentado** (pestañas Datos/Estructura, idioma): contenedor `--surface-2` con borde; opción
  activa con fondo `--surface` y sombra leve.
- **Checkbox** (`components/ui/Checkbox`, Radix): caja de 16 px con radio 4 px dentro de una zona de clic de
  24 × 24 px; sin marcar, borde `--muted` sobre `--surface`; marcado o indeterminado (−), fondo y borde
  `--accent` con la marca en `--on-accent`. Foco: contorno `--accent`. Es el único checkbox de la app
  (`CheckboxField` le añade la etiqueta, que también lo marca).
- **Menú contextual** (Radix ContextMenu): clic derecho, tecla de menú o Mayús+F10, y pulsación larga en
  táctil. Mismo aspecto que los desplegables (tarjeta `--surface`, ítems de 32 px con icono de 16 px); las
  acciones destructivas van al final, separadas y en `--danger`; las de escritura no aparecen en solo
  lectura. Lo usan la lista de tablas (sin estrella ni botón de opciones por fila) y las listas del
  editor SQL (historial y consultas guardadas).
- **Chip de filtro:** mono 12 px, fondo `--accent-tint`, texto `--accent-ink`, botón × para quitar.
- **Grid:** filas de 36 px, cabecera `--surface-2` con nombre + tipo atenuado + icono de llave (PK) o
  flecha (FK); celdas en Geist Mono; `NULL` en cursiva `--muted`; celdas FK como enlace `--accent-ink` con
  flecha ↗; celdas editadas con fondo `--accent-tint`; filas marcadas para borrar con texto tachado.
  Un clic en una fila la selecciona (fondo `--row-selected`; Ctrl/Cmd+clic añade, Mayús+clic selecciona
  un rango; es la misma selección que los checkboxes). El amarillo queda para los cambios pendientes: en
  una fila seleccionada la celda editada usa `--row-selected-edited`, y el texto secundario y de acento
  pasa a `--row-selected-muted` y `--row-selected-ink` para mantener 4,5:1.
- **Píldora de cambios pendientes:** flotante, centrada abajo dentro de la tarjeta del grid, fondo
  `--pill`, punto de color acento, "N cambios pendientes", enlace "Ver diff", Descartar y Guardar.
- **Tarjeta de conexión** (barra lateral abajo): punto `--success`, nombre de la conexión (o de la base),
  `host:puerto · PG N`, franja izquierda con su color de etiqueta y, si hay varias, selector (lista con
  color, estado y versión). La barra lateral lleva además una franja fina superior del mismo color.
- **Diálogos:** Radix Dialog, tarjeta de 16 px de radio, máximo 520 px; los de peligro con borde superior
  de color `--danger` y botón de peligro deshabilitado hasta escribir el nombre exacto cuando aplique.
- **Notificaciones:** abajo a la derecha, tarjeta oscura en ambos temas, con acción opcional (Deshacer).
- **Banderas de idioma:** control segmentado con `🇬🇧 EN` y `🇪🇸 ES` (bandera + código).
- **Distintivo solo lectura:** badge en la barra lateral, fondo `--accent-tint`, texto `--accent-ink`.

## Logo

Mamut monolínea de perfil con el colmillo por delante de la trompa. El colmillo lleva un "halo" que corta
la trompa en el cruce, de modo que ningún trazo se toca. El corte se hace con una **máscara** (no pintando
del color de fondo), así el logo funciona sobre cualquier fondo.

- **Con ojo:** logo principal, tamaños ≥ 32 px.
- **Sin ojo:** favicon y tamaños < 32 px.
- **Icono de app:** cuadrado redondeado `--accent` con el mamut en `--on-accent`.
- En modo oscuro, el logo de la barra lateral lleva un brillo suave: `box-shadow: 0 0 18px #FFC92966`.
- Ficheros fuente en `assets/brand/`. En React, un componente `<Logo eye={true|false} />` con `useId()`
  para que el id de la máscara sea único si hay varios logos en la página.

Geometría (viewBox 24×24, trazo 1,7, extremos y uniones redondeados):

```text
cuerpo   M3 17.5a1.5 1.5 0 0 0 3 0V12C6 6.5 9 3.5 12.5 3.5S20 6.5 21 11.5V20h-2.5v-4H11v4H8.5v-5.5
colmillo M7.7 12.9c-.1 3-2.8 4.2-5.1 1.7
ojo      círculo cx 9.6, cy 8.4, r 0.9
halo     colmillo con trazo 3.1 en la máscara (1,7 + 2 × 0,7)
```

## Tono de los textos

Directo, breve y humano. Verbos en los botones ("Guardar cambios", "Insertar fila"). Los errores dicen
qué pasó y qué hacer. Mismo tono en inglés y español; nada de traducciones literales.
