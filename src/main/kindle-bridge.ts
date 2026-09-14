import { join } from 'node:path'
import { app } from 'electron'
import type { KindleScriptStatus } from '../shared/types'


export interface SshClient {
  end: () => void
}

export interface SshExecResult {
  code: number
  signal?: string | null
  stdout: string
  stderr: string
}

export interface SshOptions {
  host: string
  password: string
  port: number
  username: string
}

export interface KsshModule {
  connect: (options?: SshOptions) => Promise<SshClient>
  execCommand: (client: SshClient, command: string) => Promise<SshExecResult>
}

export interface KindleAutostartModule {
  runAction: (
    action: 'install' | 'status' | 'start' | 'stop' | 'uninstall',
    options: { env: Record<string, string>; ssh: SshOptions },
  ) => Promise<{ code: number; output: string; status: KindleScriptStatus }>
}

function loadModule<T>(...segments: string[]): T {
  return require(join(app.getAppPath(), ...segments)) as T
}

export function ksshModule(): KsshModule {
  return loadModule<KsshModule>('scripts', 'kssh.js')
}

export function kindleAutostartModule(): KindleAutostartModule {
  return loadModule<KindleAutostartModule>('scripts', 'kindle-autostart.js')
}
