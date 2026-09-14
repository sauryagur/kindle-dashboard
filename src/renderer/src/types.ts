export type NavKey = 'kindle' | 'configuracoes'
export type KindleTab = 'config' | 'diagnostico'
export type KindleScriptAction = 'start' | 'stop'

export type IconName =
  | 'book'
  | 'kindle'
  | 'login'
  | 'refresh'
  | 'settings'
  | 'stethoscope'
  | 'save'
  | 'download'
  | 'trash'
  | 'play'
  | 'stop'
  | 'search'
  | 'globe'
  | 'github'

export interface NavItem {
  key: NavKey
  label: string
  hint: string
  icon: IconName
}

export interface ConfigForm {
  imageUrl: string
  kindleFullRefreshEvery: string
  kindleIp: string
  kindlePassword: string
  kindlePort: string
  kindleRefreshInterval: string
  kindleUser: string
  kindleWifiRetryEvery: string
}
