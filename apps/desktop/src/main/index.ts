import { join } from 'node:path';
import { app, BrowserWindow, Menu, session, shell, type Tray } from 'electron';
import icon from '../../resources/icon.png?asset';
import { createHandlers } from './handlers';
import { registerIpcHandlers } from './ipc';
import { log, setupLog } from './log';
import { type AppPaths, type Runtime, startRuntime } from './runtime';
import { isAllowedNavigation, isSafeExternalUrl } from './security';
import { createTray } from './tray';

// Sets the userData folder to %APPDATA%/School Assistant (also in development).
app.setName('School Assistant');
// Logs go to <userData>/logs on Windows.
app.setAppLogsPath();

let mainWindow: BrowserWindow | null = null;
// Module-level so the tray icon is not garbage-collected.
let tray: Tray | null = null;
let quitting = false;
let runtime: Runtime | null = null;
let stopBackups: (() => void) | null = null;

const devServerUrl = process.env.ELECTRON_RENDERER_URL;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'School Assistant',
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Links open in the default browser, never inside the app. Only web/mail links get through.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The renderer never navigates away from the app (dev server in development, file:// in prod).
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, { devServerUrl })) event.preventDefault();
  });

  // Closing the window hides it; the app keeps running in the tray.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function showWindow(): void {
  if (!mainWindow) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function appPaths(): AppPaths {
  const dataDir = app.getPath('userData');
  return {
    dataDir,
    logDir: app.getPath('logs'),
    dbFile: join(dataDir, 'school-assistant.db'),
    defaultBackupFolder: join(app.getPath('documents'), 'School Assistant Backups'),
  };
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  const paths = appPaths();
  setupLog(paths.logDir);
  log.info(
    `School Assistant ${app.getVersion()} starting (Electron ${process.versions.electron}, ` +
      `${process.platform}, packaged: ${app.isPackaged})`,
  );

  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    tray?.destroy();
  });
  app.on('will-quit', () => {
    stopBackups?.();
    // Closing checkpoints the WAL into the main file.
    if (runtime?.ok) runtime.database.close();
    log.info('School Assistant quit');
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.schoolassistant.app');
    // No web permissions (camera, geolocation, etc.) are ever needed by the renderer.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    // The packaged app has no menu bar; this also drops the DevTools and reload shortcuts.
    if (app.isPackaged) Menu.setApplicationMenu(null);
    runtime = startRuntime(paths, log);
    registerIpcHandlers(createHandlers(paths, runtime), log);
    mainWindow = createWindow();
    tray = createTray(icon, showWindow);
    if (runtime.ok) stopBackups = runtime.services.backup.startSchedule();
  });

  // Stay alive in the tray when every window is closed.
  app.on('window-all-closed', () => {});
}
