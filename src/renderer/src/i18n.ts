import type { SupportedLanguage } from '../../shared/types'

interface LocaleMeta {
  name: string
}

interface LocaleData {
  meta?: LocaleMeta
  ui?: Record<string, string>
}

// Cada arquivo em `locales/*.json` vira um idioma. Adicionar um arquivo já o
// disponibiliza no app — sem editar este código.
const modules = import.meta.glob('../../../locales/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, LocaleData>

const locales: Record<string, LocaleData> = {}
for (const [path, data] of Object.entries(modules)) {
  const code = path.split('/').pop()?.replace(/\.json$/, '')
  if (code) locales[code] = data
}

export interface LanguageOption {
  code: string
  name: string
}

export const LANGUAGES: LanguageOption[] = Object.entries(locales)
  .map(([code, data]) => ({ code, name: data.meta?.name ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name))


export function languageName(language: SupportedLanguage): string {
  return locales[language]?.meta?.name ?? language
}

export type Translator = (key: string, vars?: Record<string, string>) => string

// Merges `ui` with English as base, so target-language messages override while
// missing keys fall back to English.
export function createTranslator(language: SupportedLanguage): Translator {
  const base = locales.en ?? {}
  const target = locales[language] ?? base
  const messages: Record<string, string> = {
    ...(base.ui ?? {}),
    ...(target.ui ?? {}),
  }
  return (key, vars) => {
    const template = messages[key] ?? key
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => vars?.[name] ?? '')
  }
}
