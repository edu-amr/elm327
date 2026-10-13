import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseSquareIcon } from '@solar-icons/react/linear';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import ElectricBorder from '@/components/ElectricBorder';
import GlareHover from '@/components/GlareHover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { formatClock } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { WireAction, WireState } from '../../../../src/session/wire';

export type PanelTab = 'traffic' | 'problems';

type Filter = 'all' | 'tx' | 'rx' | 'warn';
const ARROWS = { tx: '→', rx: '←', warn: '!' } as const;

function TrafficView({ state, filter }: { state: WireState; filter: Filter }) {
  const { t } = useI18n();
  const viewport = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () => state.log.filter((line) => filter === 'all' || line.kind === filter).slice(-200),
    [state.log, filter],
  );
  const last = lines.at(-1)?.at;

  useEffect(() => {
    const node = viewport.current;
    if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 90)
      node.scrollTop = node.scrollHeight;
  }, [last, lines.length]);

  return (
    <div ref={viewport} className='h-full overflow-auto bg-surface px-3 py-1.5'>
      <ol className='num text-[12px] leading-[1.55]'>
        {lines.map((line, index) => (
          <li
            key={`${line.at}-${index}`}
            className={cn(
              'grid grid-cols-[92px_16px_1fr] gap-2',
              line.kind === 'tx' && 'text-primary',
              line.kind === 'rx' && 'text-muted-foreground',
              line.kind === 'warn' && 'text-bad',
            )}
          >
            <time className='text-muted-foreground/55'>{formatClock(line.at)}</time>
            <span>{ARROWS[line.kind]}</span>
            <span className='truncate'>{line.text}</span>
          </li>
        ))}
      </ol>
      {lines.length === 0 ? (
        <p className='py-6 text-center text-muted-foreground'>{t('web.noTraffic')}</p>
      ) : null}
    </div>
  );
}

function ProblemsView({ state, act }: { state: WireState; act: (action: WireAction) => void }) {
  const { t, tOptional } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const { dtcs } = state;
  const count = dtcs.codes.length;

  return (
    <div className='flex h-full min-h-0 gap-4 overflow-auto bg-surface px-3 py-2'>
      <div className='flex w-[min(100%,340px)] shrink-0 flex-col gap-2'>
        {dtcs.milOn ? (
          <ElectricBorder color='#e5575f' speed={0.6} chaos={0.07} thickness={1.4} borderRadius={4}>
            <div className='rounded-[4px] bg-bad/10 px-3 py-2'>
              <p className='text-sm font-semibold text-bad'>{t('web.mil.alert')}</p>
              <p className='text-xs text-muted-foreground'>
                {count === 1 ? t('dtc.storedOne') : t('dtc.storedMany', { count })}
              </p>
            </div>
          </ElectricBorder>
        ) : (
          <p className={cn('text-sm', dtcs.milOn === false ? 'text-ok' : 'text-muted-foreground')}>
            {dtcs.milOn === false ? t('dtc.none') : t('dtc.hint')}
          </p>
        )}
        {dtcs.error ? <p className='text-sm text-bad'>{dtcs.error}</p> : null}
        <div className='flex gap-2'>
          <Button size='sm' variant='outline' onClick={() => act({ type: 'read-dtcs' })}>
            {t('web.readCodes')}
          </Button>
          <Button
            size='sm'
            variant='destructive'
            disabled={count === 0}
            onClick={() => setConfirming(true)}
          >
            {t('web.clearCodes')}
          </Button>
        </div>
      </div>

      <ul className='grid min-w-0 flex-1 content-start gap-1.5'>
        {dtcs.codes.map(({ code, description }) => (
          <li key={code}>
            <GlareHover
              width='100%'
              height='auto'
              background='transparent'
              borderRadius='4px'
              borderColor='color-mix(in oklab, var(--bad) 35%, var(--border))'
              glareColor='#f09aa0'
              glareOpacity={0.22}
            >
              <div className='flex w-full items-center gap-3 px-3 py-1.5'>
                <span className='num text-[14px] font-bold text-bad'>{code}</span>
                <span className='truncate text-[13px]'>
                  {tOptional(`dtc.${code}`, description)}
                </span>
              </div>
            </GlareHover>
          </li>
        ))}
      </ul>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('web.confirm.clear.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('web.confirm.clear.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('web.confirm.no')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                setConfirming(false);
                act({ type: 'clear-dtcs' });
              }}
            >
              {t('web.confirm.yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface BottomPanelProps {
  state: WireState;
  tab: PanelTab;
  height: number;
  problems: number;
  act: (action: WireAction) => void;
  onTab: (tab: PanelTab) => void;
  onResize: (height: number) => void;
  onClose: () => void;
}

/** Resizable panel under the dashboard with Traffic and Problems tabs, like an editor's terminal. */
export function BottomPanel({
  state,
  tab,
  height,
  problems,
  act,
  onTab,
  onResize,
  onClose,
}: BottomPanelProps) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const move = (e: PointerEvent): void => onResize(startHeight + (startY - e.clientY));
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <section
      className='relative flex shrink-0 flex-col border-t border-border bg-card'
      style={{ height }}
    >
      <div
        role='separator'
        aria-orientation='horizontal'
        onPointerDown={startResize}
        className='absolute -top-1 inset-x-0 z-10 h-2 cursor-row-resize hover:bg-primary/30'
      />
      <header className='flex h-8 shrink-0 items-center gap-1 border-b border-border/70 px-2'>
        {(['traffic', 'problems'] as const).map((id) => (
          <button
            key={id}
            type='button'
            onClick={() => onTab(id)}
            className={cn(
              'label-caps flex h-8 items-center gap-1.5 border-b-2 px-2.5 transition-colors',
              tab === id
                ? 'border-primary text-foreground'
                : 'border-transparent hover:text-foreground',
            )}
          >
            {id === 'traffic' ? t('panel.traffic') : t('web.rail.problems')}
            {id === 'problems' && problems > 0 ? (
              <span className='rounded-full bg-bad px-1.5 text-[10px] font-bold leading-4 text-background'>
                {problems}
              </span>
            ) : null}
          </button>
        ))}
        <div className='arc-scope ml-auto flex items-center gap-2'>
          {tab === 'traffic' ? (
            <SegmentedControl
              label={t('panel.traffic')}
              value={filter}
              onValueChange={(value) => setFilter(value as Filter)}
              options={[
                { value: 'all', label: '•' },
                { value: 'tx', label: t('web.filter.tx') },
                { value: 'rx', label: t('web.filter.rx') },
                { value: 'warn', label: t('web.filter.warn') },
              ]}
            />
          ) : null}
          <button
            type='button'
            onClick={onClose}
            aria-label={t('web.panel.close')}
            className='text-muted-foreground hover:text-foreground'
          >
            <CloseSquareIcon size={16} />
          </button>
        </div>
      </header>
      <div className='min-h-0 flex-1'>
        {tab === 'traffic' ? (
          <TrafficView state={state} filter={filter} />
        ) : (
          <ProblemsView state={state} act={act} />
        )}
      </div>
    </section>
  );
}
