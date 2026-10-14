# Compatibilidad con versiones de PostgreSQL

Qué funciona en cada versión. Se mantiene con la matriz de tests (`task test:go:all` y `task ci:full`, la CI local) y
los e2e en 12, 17, 18 y 19. Última revisión: 2026-10-10 (B02).

## Nivel de soporte

| Versión | Nivel (`support_level`) | Tests de Go | E2E |
| --- | --- | --- | --- |
| ≤ 11 | `unsupported`: Gresbase no arranca y lo explica | — | — |
| 12 | `legacy`: aviso en la tarjeta de conexión | verde | suite completa en verde |
| 13 | `legacy`: aviso en la tarjeta de conexión | verde | — |
| 14, 15, 16, 17 | `full` | verde | suite completa en verde (17, en `task ci:full`) |
| 18 | `full` | verde | suite completa en verde |
| 19 (`19beta4`) | `prerelease`: aviso en la tarjeta de conexión | verde | smoke en verde (login, navegación, editor SQL) |

## Funciones de Gresbase por versión

Todas las funciones de la v0.1 funcionan igual de 12 a 19: navegación y filtros, edición y deshacer,
importar y exportar, editor SQL con transacciones, DDL, relaciones y paleta. Las consultas al catálogo
usan solo columnas que existen desde 12 (por ejemplo `pg_constraint.conparentid`, de 11) y el DDL de
índices y constraints sale de `pg_get_indexdef`/`pg_get_constraintdef`, así que refleja lo que cada
versión sabe expresar.

| Capacidad (`capabilities`) | Desde | Uso en Gresbase |
| --- | --- | --- |
| `gen_random_uuid_core` | 13 | En 12, `gen_random_uuid()` necesita `pgcrypto` (el seed lo crea). Lo usarán los valores por defecto de la edición de estructura (B11). |
| `merge` | 15 | `MERGE` se ejecuta en el editor SQL desde 15; en 12–14 Postgres devuelve su error de sintaxis. |
| `nulls_not_distinct` | 15 | Aparece en el DDL si la constraint lo usa (`TestDDLNullsNotDistinct`); la edición de constraints (B12) solo lo ofrecerá desde 15. |
| `pg_input_is_valid` | 16 | Reservada para validar valores pegados (B14). |
| `pg_stat_statements` | extensión | Detectada por conexión. |
| `pg_stat_statements_exec_time` | 13 + extensión | `total_exec_time` (en 12 se llama `total_time`). |

## Diferencias conocidas

- El detector de SQL destructivo clasifica `MERGE` (15+) por sus acciones: `THEN DELETE`/`THEN UPDATE`
  avisan como un `DELETE`/`UPDATE` con `WHERE` (la condición `ON` limita las filas), y
  `WHEN NOT MATCHED BY SOURCE` (17+) sin condición `AND` pide confirmación, porque puede tocar todas las
  filas del destino. Es una ayuda de UX, no una barrera (ver `AGENTS.md`).
- El compose de desarrollo fija `PGDATA` porque 18 cambió la ruta de datos por defecto de la imagen.
- Desde 18, los NOT NULL son filas de `pg_constraint` (`contype = 'n'`). La introspección los excluye de
  la lista de restricciones: el NOT NULL se muestra y se cambia en la columna, igual que en 12–17.

## Cómo añadir una capacidad

Ver el comentario del paquete `internal/pg/capabilities`: nombre, fila en la tabla de reglas y, en el
frontend, `useCapability(nombre)`.
