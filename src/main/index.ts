import { app, Menu } from "electron";
import { loadConfig } from "./config";
import { applyLanguagePreference, loadLocales } from "./i18n";
import { registerIpc } from "./ipc";
import { createTray, destroyTray } from "./tray";
import {
  createMainWindow,
  destroyMainWindow,
  restoreMainWindow,
  setQuitting,
  showKindleWindow,
  showSettingsWindow,
} from "./windows";

let quitInProgress = false;

function quitApplication(): void {
  if (quitInProgress) return;
  quitInProgress = true;
  setQuitting(true);
  destroyMainWindow();
  destroyTray();
  app.exit(0);
}

app.setName("kindle-dashboard");

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on("second-instance", restoreMainWindow);

  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId("com.alexi.kindle-dashboard");
      Menu.setApplicationMenu(null);

      loadLocales();
      const config = await loadConfig();
      applyLanguagePreference(config.language);

      registerIpc({ quitApplication });
      createMainWindow({ showOnReady: !config.setupComplete });
      createTray({
        onOpenKindle: showKindleWindow,
        onOpenSettings: showSettingsWindow,
        onQuit: quitApplication,
      });
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });

  app.on("activate", restoreMainWindow);
  app.on("before-quit", () => setQuitting(true));
  app.on("will-quit", (event) => {
    if (quitInProgress) return;
    event.preventDefault();
    quitApplication();
  });
}
