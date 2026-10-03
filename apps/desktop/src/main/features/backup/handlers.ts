import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import type { BackupService } from '../../db/backup';
import type { HandlersFor } from '../../ipc';
import { openFolder } from '../app/handlers';

export function backupHandlers(backup: BackupService): HandlersFor<'backup'> {
  return {
    'backup:status': () => backup.status(),
    'backup:run': () => backup.backUpNow(),
    'backup:choose-folder': async () => {
      const options: OpenDialogOptions = {
        title: 'Choose a folder for daily backups',
        defaultPath: backup.folder(),
        properties: ['openDirectory', 'createDirectory'],
      };
      const window = BrowserWindow.getFocusedWindow();
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      const folder = result.filePaths[0];
      if (result.canceled || !folder) return null;
      return backup.setFolder(folder);
    },
    'backup:use-default-folder': () => backup.setFolder(null),
    'backup:open-folder': () => openFolder(backup.folder()),
  };
}
