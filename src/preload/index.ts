import { contextBridge, ipcRenderer } from "electron";
import type {
  DashboardApi,
  DashboardConfigInput,
  LanguagePreference,
} from "../shared/types";

const api: DashboardApi = {
  checkKindle: () => ipcRenderer.invoke("kindle:check"),
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  getConfig: () => ipcRenderer.invoke("config:get"),
  getKindleScriptStatus: () => ipcRenderer.invoke("kindle:script-status"),
  installKindle: () => ipcRenderer.invoke("kindle:install"),
  openRepo: () => ipcRenderer.invoke("app:openRepo"),
  quit: () => ipcRenderer.invoke("app:quit"),
  saveConfig: (config: DashboardConfigInput) =>
    ipcRenderer.invoke("config:save", config),
  setLanguage: (language: LanguagePreference) =>
    ipcRenderer.invoke("config:set-language", language),
  startKindleScript: () => ipcRenderer.invoke("kindle:script-start"),
  stopKindleScript: () => ipcRenderer.invoke("kindle:script-stop"),
  uninstallKindle: () => ipcRenderer.invoke("kindle:uninstall"),
  onOpenKindle: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on("kindle:open", listener);
    return () => ipcRenderer.removeListener("kindle:open", listener);
  },
  onOpenSettings: (callback) => {
    const listener = (): void => callback();
    ipcRenderer.on("settings:open", listener);
    return () => ipcRenderer.removeListener("settings:open", listener);
  },
};

contextBridge.exposeInMainWorld("dashboard", api);
