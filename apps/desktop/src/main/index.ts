import { join } from 'node:path';
import { app, BrowserWindow, shell, type Tray } from 'electron';
import icon from '../../resources/icon.png?asset';
import { createHandlers } from './handlers';
import { registerIpcHandlers } from './ipc';
import { createTray } from './tray';

// Sets the userData folder to %APPDATA%/School Assistant (also in development).
app.setName('School Assistant');

let mainWindow: BrowserWindow | null = null;
// Module-level so the tray icon is not garbage-collected.
let tray: Tray | null = null;
let quitting = false;

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

  // Links open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing the window hides it; the app keeps running in the tray.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    tray?.destroy();
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.schoolassistant.app');
    registerIpcHandlers(createHandlers());
    mainWindow = createWindow();
    tray = createTray(icon, showWindow);
  });

  // Stay alive in the tray when every window is closed.
  app.on('window-all-closed', () => {});
}
