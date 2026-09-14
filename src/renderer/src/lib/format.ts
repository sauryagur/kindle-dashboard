import type {
  DashboardConfig,
  DashboardConfigInput,
  LanguagePreference,
  SupportedLanguage,
} from '../../../shared/types'
import type { ConfigForm } from '../types'

export function resolveLanguage(
  preference: LanguagePreference | undefined,
  systemLanguage: SupportedLanguage | undefined,
): SupportedLanguage {
  if (preference && preference !== 'system') return preference
  return systemLanguage ?? 'en'
}

export function formFromConfig(config: DashboardConfig): ConfigForm {
  return {
    imageUrl: config.imageUrl,
    kindleFullRefreshEvery: String(config.kindleFullRefreshEvery),
    kindleIp: config.kindleIp,
    kindlePassword: '',
    kindlePort: String(config.kindlePort),
    kindleRefreshInterval: String(config.kindleRefreshInterval),
    kindleUser: config.kindleUser,
    kindleWifiRetryEvery: String(config.kindleWifiRetryEvery),
  }
}

export function inputFromForm(form: ConfigForm): DashboardConfigInput {
  return {
    imageUrl: form.imageUrl,
    kindleFullRefreshEvery: Number.parseInt(form.kindleFullRefreshEvery, 10),
    kindleIp: form.kindleIp,
    kindlePassword: form.kindlePassword,
    kindlePort: Number.parseInt(form.kindlePort, 10),
    kindleRefreshInterval: Number.parseInt(form.kindleRefreshInterval, 10),
    kindleUser: form.kindleUser,
    kindleWifiRetryEvery: Number.parseInt(form.kindleWifiRetryEvery, 10),
  }
}
