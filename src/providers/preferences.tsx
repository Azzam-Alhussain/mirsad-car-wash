import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { messages } from '../lib/messages'
import type { VehicleSize, WashStatus } from '../types'

export type Language = 'ar' | 'en'
export type Theme = 'dark' | 'light'
type Variables = Record<string, string | number>

type PreferencesValue = {
  language: Language
  theme: Theme
  setLanguage: (language: Language) => void
  setTheme: (theme: Theme) => void
  t: (text: string, variables?: Variables) => string
  number: (value: number) => string
  decimal: (value: number) => string
  money: (value: number) => string
  sizeText: (size: VehicleSize) => string
  statusText: (status: WashStatus) => string
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

function storedValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key) as T | null
  return value && allowed.includes(value) ? value : fallback
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => storedValue('mirsad-language', ['ar', 'en'] as const, 'ar'))
  const [theme, setTheme] = useState<Theme>(() => storedValue('mirsad-theme', ['dark', 'light'] as const, 'dark'))

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.dataset.theme = theme
    document.title = language === 'ar' ? 'مِرصد | مركز عمليات المغسلة' : 'Mirsad | Car wash operations center'
    window.localStorage.setItem('mirsad-language', language)
    window.localStorage.setItem('mirsad-theme', theme)
  }, [language, theme])

  const t = useCallback((text: string, variables: Variables = {}) => {
    const template = messages[text]?.[language] ?? text
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(variables[key] ?? `{${key}}`))
  }, [language])

  const numberFormatter = useMemo(() => new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US'), [language])
  const decimalFormatter = useMemo(() => new Intl.NumberFormat(language === 'ar' ? 'ar-SA' : 'en-US', { maximumFractionDigits: 1 }), [language])
  const number = useCallback((value: number) => numberFormatter.format(value), [numberFormatter])
  const decimal = useCallback((value: number) => decimalFormatter.format(value), [decimalFormatter])
  const money = useCallback((value: number) => `${numberFormatter.format(Math.round(value))} ${t('SAR')}`, [numberFormatter, t])
  const sizeText = useCallback((size: VehicleSize) => t({ small: 'Small', medium: 'Medium', large: 'Large' }[size]), [t])
  const statusText = useCallback((status: WashStatus) => t({ completed: 'Completed', washing: 'Washing', queued: 'Queued' }[status]), [t])

  const value = useMemo(() => ({ language, theme, setLanguage, setTheme, t, number, decimal, money, sizeText, statusText }), [language, theme, t, number, decimal, money, sizeText, statusText])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider')
  return value
}
