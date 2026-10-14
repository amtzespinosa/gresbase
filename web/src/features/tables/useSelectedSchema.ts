import { useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSchemas } from '@/lib/api/queries'
import { usePrefs } from '@/lib/prefs/store'

/** Schema shown in the table browser: the open table's, else the saved one, else public/first. */
export function useSelectedSchema() {
  const schemas = useSchemas()
  const saved = usePrefs((s) => s.schema)
  const setSchema = usePrefs((s) => s.setSchema)
  const urlSchema = useParams({ strict: false }).schema

  // Opening a table of another schema (link, ⌘K…) switches the browser to it.
  useEffect(() => {
    if (urlSchema) setSchema(urlSchema)
  }, [urlSchema, setSchema])

  const list = schemas.data
  let schema: string | undefined
  if (list) {
    const wanted = saved ?? urlSchema
    schema = wanted && list.includes(wanted) ? wanted : list.includes('public') ? 'public' : list[0]
  }
  return { schema, schemas, setSchema }
}
