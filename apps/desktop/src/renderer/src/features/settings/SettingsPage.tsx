import { useEffect, useState } from 'react';
import type { IpcOutput } from '../../../../shared/ipc';
import { Button } from '../../components/Button';
import { PlaceholderPage } from '../../components/PlaceholderPage';
import { BackupSection } from './BackupSection';
import { PlannerSection } from './PlannerSection';

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
      milestone="M3+"
    >
      <BackupSection />
      <PlannerSection />
      <section className="mt-10">
        <h2 className="text-lg font-semibold">About</h2>
        <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-zinc-500">Version</dt>
          <dd>{info?.version ?? '…'}</dd>
          <dt className="text-zinc-500">Platform</dt>
          <dd>{info?.platform ?? '…'}</dd>
          <dt className="text-zinc-500">Data folder</dt>
          <dd className="break-all font-mono text-xs leading-5">{info?.dataDir ?? '…'}</dd>
          <dt className="text-zinc-500">Log folder</dt>
          <dd className="break-all font-mono text-xs leading-5">{info?.logDir ?? '…'}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void window.api.invoke('app:open-folder', { folder: 'data' })}>
            Open data folder
          </Button>
          <Button onClick={() => void window.api.invoke('app:open-folder', { folder: 'logs' })}>
            Open log folder
          </Button>
        </div>
      </section>
    </PlaceholderPage>
  );
}
