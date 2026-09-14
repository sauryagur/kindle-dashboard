import { app, ipcMain, shell } from "electron";
import type {
  AppInfo,
  DashboardConfig,
  DashboardConfigInput,
  KindleInstallResult,
  KindleScriptStatus,
  KindleStatus,
  LanguagePreference,
} from "../shared/types";
import { REPO_URL } from "./constants";
import { loadConfig, publicConfig, saveConfig, setLanguage } from "./config";
import { currentSystemLanguage } from "./i18n";
import {
  checkKindle,
  installKindle,
  manageKindleScript,
  uninstallKindle,
} from "./kindle";
import { appCommitHash } from "./paths";
import { refreshTray } from "./tray";

interface IpcHandlers {
  quitApplication: () => void;
}

export function registerIpc(handlers: IpcHandlers): void {
  ipcMain.handle("app:get-info", async (): Promise<AppInfo> => {
    const config = await loadConfig();
    return {
      appCommit: await appCommitHash(),
      appVersion: app.getVersion(),
      configured: config.setupComplete,
      systemLanguage: currentSystemLanguage(),
    };
  });

  ipcMain.handle("config:get", async (): Promise<DashboardConfig> =>
    publicConfig(await loadConfig()),
  );
  ipcMain.handle(
    "config:save",
    async (_event, config: DashboardConfigInput): Promise<DashboardConfig> =>
      saveConfig(config),
  );
  ipcMain.handle(
    "config:set-language",
    async (_event, language: LanguagePreference): Promise<DashboardConfig> => {
      const saved = await setLanguage(language);
      refreshTray();
      return saved;
    },
  );

  ipcMain.handle("app:openRepo", () => shell.openExternal(REPO_URL));
  ipcMain.handle("kindle:check", (): Promise<KindleStatus> => checkKindle());
  ipcMain.handle("kindle:install", async (): Promise<KindleInstallResult> => {
    const result = await installKindle();
    refreshTray();
    return result;
  });
  ipcMain.handle("kindle:uninstall", async (): Promise<KindleInstallResult> => {
    const result = await uninstallKindle();
    refreshTray();
    return result;
  });
  ipcMain.handle("kindle:script-status", (): Promise<KindleScriptStatus> =>
    manageKindleScript("status"),
  );
  ipcMain.handle("kindle:script-start", (): Promise<KindleScriptStatus> =>
    manageKindleScript("start"),
  );
  ipcMain.handle("kindle:script-stop", (): Promise<KindleScriptStatus> =>
    manageKindleScript("stop"),
  );
  ipcMain.handle("app:quit", () => handlers.quitApplication());
}
