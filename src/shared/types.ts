// A BCP-47-ish language code backed by a file in `locales/`. Kept as a string so
// contributors can add a language by dropping in a JSON file — no code changes.
export type SupportedLanguage = string

export type LanguagePreference = SupportedLanguage | 'system'

export interface AppInfo {
  appCommit: string
  appVersion: string
  configured: boolean
  systemLanguage: SupportedLanguage
}

export interface DashboardConfig {
  imageUrl: string
  kindleFullRefreshEvery: number
  kindleIp: string
  kindlePasswordSaved: boolean
  kindlePort: number
  kindleRefreshInterval: number
  kindleUser: string
  kindleWifiRetryEvery: number
  language: LanguagePreference
  setupComplete: boolean
}

export interface DashboardConfigInput {
  imageUrl: string
  kindleFullRefreshEvery: number
  kindleIp: string
  kindlePassword?: string
  kindlePort: number
  kindleRefreshInterval: number
  kindleUser: string
  kindleWifiRetryEvery: number
}

export interface KindleStatus {
  canInstall: boolean
  checkedAt: string
  connected: boolean
  detail: string
  fbink: boolean
  hotfix: boolean
  initctl: boolean
  jailbroken: boolean
  mntroot: boolean
  mntus: boolean
  model: string | null
}

export interface KindleScriptStatus {
  imageReachable: boolean
  enabled: boolean
  installed: boolean
  output: string
  running: boolean
}

export interface KindleInstallResult {
  config: DashboardConfig
  output: string
  status: KindleScriptStatus
}

export interface DashboardApi {
  checkKindle: () => Promise<KindleStatus>
  getAppInfo: () => Promise<AppInfo>
  getConfig: () => Promise<DashboardConfig>
  getKindleScriptStatus: () => Promise<KindleScriptStatus>
  installKindle: () => Promise<KindleInstallResult>
  openRepo: () => Promise<void>
  quit: () => Promise<void>
  saveConfig: (config: DashboardConfigInput) => Promise<DashboardConfig>
  setLanguage: (language: LanguagePreference) => Promise<DashboardConfig>
  startKindleScript: () => Promise<KindleScriptStatus>
  stopKindleScript: () => Promise<KindleScriptStatus>
  uninstallKindle: () => Promise<KindleInstallResult>
  onOpenKindle: (callback: () => void) => () => void
  onOpenSettings: (callback: () => void) => () => void
}
