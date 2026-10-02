import { useEffect, useState } from 'react';
import type { IpcOutput } from '../../../../shared/ipc';
import { PlaceholderPage } from '../../components/PlaceholderPage';

type AppInfo = IpcOutput<'app:info'>;

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.api.invoke('app:info').then(setInfo);
  }, []);

  return (
    <PlaceholderPage
      title="Settings"
      description="Sleep floor, routine, phone pairing, Claude usage and backups."
      milestone="M6+"
    >
      <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-zinc-500">Version</dt>
        <dd>{info?.version ?? '…'}</dd>
        <dt className="text-zinc-500">Platform</dt>
        <dd>{info?.platform ?? '…'}</dd>
        <dt className="text-zinc-500">Data folder</dt>
        <dd className="break-all font-mono text-xs leading-5">{info?.dataDir ?? '…'}</dd>
      </dl>
    </PlaceholderPage>
  );
}
