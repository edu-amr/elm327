import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { sendAction } from '@/lib/api';
import { useLive } from '@/lib/live';
import { usePersistent } from '@/lib/storage';
import { ActivityRail } from '@/components/shell/activity-rail';
import { BottomPanel } from '@/components/shell/bottom-panel';
import type { PanelTab } from '@/components/shell/bottom-panel';
import { StatusBar } from '@/components/shell/status-bar';
import { TitleBar } from '@/components/shell/title-bar';
import type { WireAction, WireMeta, WireState } from '../../../../src/session/wire';
import { Overview } from './overview';

const MIN_PANEL = 110;
const defaultPanelHeight = (): number =>
  Math.round(Math.min(260, Math.max(120, window.innerHeight * 0.21)));

export function Dashboard({ initial, meta }: { initial: WireState; meta: WireMeta }) {
  const { state, connected } = useLive(initial);
  const { t } = useI18n();
  const lastNotice = useRef(0);

  const [open, setOpen] = usePersistent<boolean>(
    'elm327-panel-open',
    false,
    (raw) => raw === 'true',
  );
  const [tab, setTab] = usePersistent<PanelTab>('elm327-panel-tab', 'traffic', (raw) =>
    raw === 'problems' ? 'problems' : raw === 'traffic' ? 'traffic' : undefined,
  );
  const [height, setHeight] = usePersistent<number>(
    'elm327-panel-height',
    defaultPanelHeight(),
    (raw) => {
      const value = Number(raw);
      return Number.isFinite(value) ? value : undefined;
    },
  );

  const act = (action: WireAction): void => {
    sendAction(action).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : String(error)),
    );
  };
  const problems = state.dtcs.codes.length;
  const clampHeight = (value: number): number =>
    Math.round(Math.min(Math.max(value, MIN_PANEL), window.innerHeight * 0.7));

  useEffect(() => {
    document.title = `ELM327 · ${state.title}`;
  }, [state.title]);

  useEffect(() => {
    const notice = state.notice;
    if (notice && notice.id !== lastNotice.current) {
      lastNotice.current = notice.id;
      toast(t(notice.key, notice.params));
    }
  }, [state.notice, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const toggleProblems = (): void => {
    if (open && tab === 'problems') return setOpen(false);
    setTab('problems');
    setOpen(true);
  };

  return (
    <div className='flex h-dvh flex-col bg-background max-lg:overflow-auto'>
      <TitleBar state={state} meta={meta} connected={connected} act={act} />
      <div className='flex min-h-0 flex-1'>
        <ActivityRail
          problems={problems}
          panelOpen={open}
          panelTab={tab}
          onProblems={toggleProblems}
          onTogglePanel={() =>
            open && tab === 'traffic' ? setOpen(false) : (setTab('traffic'), setOpen(true))
          }
        />
        <div className='relative flex min-w-0 flex-1 flex-col'>
          <main className='min-h-0 flex-1 overflow-hidden max-lg:overflow-auto'>
            <Overview
              state={state}
              meta={meta}
              onFocus={(name) => act({ type: 'focus', value: name })}
            />
          </main>
          {open ? (
            <BottomPanel
              state={state}
              tab={tab}
              height={clampHeight(height)}
              problems={problems}
              act={act}
              onTab={setTab}
              onResize={(value) => setHeight(clampHeight(value))}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </div>
      </div>
      <StatusBar state={state} problems={problems} onProblems={toggleProblems} />
    </div>
  );
}
