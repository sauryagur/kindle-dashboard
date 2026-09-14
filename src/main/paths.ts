import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)


let cachedAppCommit =
  process.env.APP_COMMIT?.trim() ||
  process.env.GIT_COMMIT?.trim() ||
  process.env.SOURCE_VERSION?.trim() ||
  ''

export function appAssetPath(name: string): string {
  if (app.isPackaged) return join(process.resourcesPath, name)
  return join(app.getAppPath(), 'build', name)
}


export function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}


export async function appCommitHash(): Promise<string> {
  if (cachedAppCommit) return cachedAppCommit.slice(0, 7)

  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short=7', 'HEAD'], {
      cwd: app.getAppPath(),
      windowsHide: true,
    })
    cachedAppCommit = stdout.trim()
  } catch {
    cachedAppCommit = 'build'
  }

  return cachedAppCommit
}
