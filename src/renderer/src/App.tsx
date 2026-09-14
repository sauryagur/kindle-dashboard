import { useCallback, useEffect, useMemo, useState } from 'react'
import { createTranslator } from './i18n'
import { formFromConfig, inputFromForm, resolveLanguage } from './lib/format'
import type { ConfigForm, KindleScriptAction, KindleTab, NavItem, NavKey } from './types'
import { KindleView } from './views/KindleView'
import { SettingsView } from './views/SettingsView'
import { Sidebar } from './views/Sidebar'
import { Topbar } from './views/Topbar'
import type {
  AppInfo,
  DashboardConfig,
  KindleScriptStatus,
  KindleStatus,
  LanguagePreference,
} from '../../shared/types'

export default function App(): React.JSX.Element {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [config, setConfig] = useState<DashboardConfig | null>(null)
  const [form, setForm] = useState<ConfigForm | null>(null)
  const [kindle, setKindle] = useState<KindleStatus | null>(null)
  const [kindleScript, setKindleScript] = useState<KindleScriptStatus | null>(null)
  const [nav, setNav] = useState<NavKey>('kindle')
  const [kindleTab, setKindleTab] = useState<KindleTab>('config')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [checkingKindle, setCheckingKindle] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [scriptAction, setScriptAction] = useState<KindleScriptAction | null>(null)
  const [installOutput, setInstallOutput] = useState<string | null>(null)

  const language = resolveLanguage(config?.language, appInfo?.systemLanguage)
  const t = useMemo(() => createTranslator(language), [language])
  const configured = Boolean(config?.setupComplete)
  const navItems = useMemo<NavItem[]>(() => [
    { key: 'kindle', label: t('navKindle'), hint: t('navKindleHint'), icon: 'kindle' },
    { key: 'configuracoes', label: t('navSettings'), hint: t('navSettingsHint'), icon: 'settings' },
  ], [t])
  const activeNav = navItems.find((item) => item.key === nav) ?? navItems[0]

  const applyConfig = useCallback((next: DashboardConfig) => {
    setConfig(next)
    setForm(formFromConfig(next))
  }, [])

  const showError = useCallback((message: unknown) => {
    setError(message instanceof Error ? message.message : String(message))
  }, [])

  const refreshScriptStatus = useCallback(async () => {
    const status = await window.dashboard.getKindleScriptStatus()
    setKindleScript(status)
    return status
  }, [])

  useEffect(() => {
    let active = true
    void Promise.all([window.dashboard.getAppInfo(), window.dashboard.getConfig()])
      .then(([info, saved]) => {
        if (!active) return
        setAppInfo(info)
        applyConfig(saved)
      })
      .catch(showError)
    const offKindle = window.dashboard.onOpenKindle(() => {
      setNav('kindle')
      setKindleTab('config')
    })
    const offSettings = window.dashboard.onOpenSettings(() => setNav('configuracoes'))
    return () => {
      active = false
      offKindle()
      offSettings()
    }
  }, [applyConfig, showError])

  const updateForm = useCallback((key: keyof ConfigForm, value: string) => {
    setForm((current) => current ? { ...current, [key]: value } : current)
  }, [])

  const save = useCallback(async () => {
    if (!form) return
    setSaving(true)
    setError(null)
    try {
      applyConfig(await window.dashboard.saveConfig(inputFromForm(form)))
    } catch (saveError) {
      showError(saveError)
    } finally {
      setSaving(false)
    }
  }, [applyConfig, form, showError])

  const check = useCallback(async () => {
    setCheckingKindle(true)
    setError(null)
    try {
      setKindle(await window.dashboard.checkKindle())
      await refreshScriptStatus().catch(() => undefined)
    } catch (checkError) {
      showError(checkError)
    } finally {
      setCheckingKindle(false)
    }
  }, [refreshScriptStatus, showError])

  const install = useCallback(async () => {
    setInstalling(true)
    setError(null)
    try {
      const result = await window.dashboard.installKindle()
      applyConfig(result.config)
      setInstallOutput(result.output)
      setKindleScript(result.status)
      setKindleTab('diagnostico')
    } catch (installError) {
      showError(installError)
    } finally {
      setInstalling(false)
    }
  }, [applyConfig, showError])

  const uninstall = useCallback(async () => {
    setUninstalling(true)
    setError(null)
    try {
      const result = await window.dashboard.uninstallKindle()
      applyConfig(result.config)
      setInstallOutput(result.output)
      setKindleScript(result.status)
    } catch (uninstallError) {
      showError(uninstallError)
    } finally {
      setUninstalling(false)
    }
  }, [applyConfig, showError])

  const manageScript = useCallback(async (action: KindleScriptAction) => {
    setScriptAction(action)
    setError(null)
    try {
      setKindleScript(action === 'start'
        ? await window.dashboard.startKindleScript()
        : await window.dashboard.stopKindleScript())
    } catch (scriptError) {
      showError(scriptError)
    } finally {
      setScriptAction(null)
    }
  }, [showError])

  const setLanguage = useCallback(async (preference: LanguagePreference) => {
    setError(null)
    try {
      applyConfig(await window.dashboard.setLanguage(preference))
    } catch (languageError) {
      showError(languageError)
    }
  }, [applyConfig, showError])

  return (
    <div className="app-shell">
      <Sidebar
        appCommit={appInfo?.appCommit}
        appVersion={appInfo?.appVersion}
        nav={nav}
        navItems={navItems}
        onNav={setNav}
        onOpenRepo={() => void window.dashboard.openRepo()}
        t={t}
      />
      <main className="content">
        <Topbar activeNav={activeNav} />
        {error ? <p className="error-banner">{error}</p> : null}
        {nav === 'kindle' ? (
          <KindleView
            checkingKindle={checkingKindle}
            config={config}
            configured={configured}
            form={form}
            installOutput={installOutput}
            installing={installing}
            kindle={kindle}
            kindleScript={kindleScript}
            kindleTab={kindleTab}
            onCheckKindle={() => void check()}
            onInstall={() => void install()}
            onKindleTab={setKindleTab}
            onScript={(action) => void manageScript(action)}
            onSubmitConfig={() => void save()}
            onUninstall={() => void uninstall()}
            onUpdateForm={updateForm}
            saving={saving}
            scriptAction={scriptAction}
            t={t}
            uninstalling={uninstalling}
          />
        ) : (
          <SettingsView
            disabled={!config}
            languagePreference={config?.language ?? 'system'}
            onChangeLanguage={(preference) => void setLanguage(preference)}
            systemLanguage={appInfo?.systemLanguage}
            t={t}
          />
        )}
      </main>
    </div>
  )
}
