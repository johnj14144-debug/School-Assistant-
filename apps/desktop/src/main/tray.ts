import { Menu, nativeImage, Tray } from 'electron';

/** Tray icon: the app keeps running here (timer, reminders) when the window is closed. */
export function createTray(iconPath: string, showWindow: () => void): Tray {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip('School Assistant');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open School Assistant', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]),
  );
  tray.on('click', showWindow);
  return tray;
}
