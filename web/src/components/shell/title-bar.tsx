import {
  DownloadMinimalisticIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
} from '@solar-icons/react/linear';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Button } from '@/components/ui/button';
import { HaloBadge } from '@/components/ui/halo-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import type { WireAction, WireMeta, WireState } from '../../../../src/session/wire';

const STATUS_VARIANT = {
  live: 'default',
  paused: 'secondary',
  connecting: 'secondary',
  reconnecting: 'secondary',
  offline: 'destructive',
} as const;

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface TitleBarProps {
  state: WireState;
  meta: WireMeta;
  connected: boolean;
  act: (action: WireAction) => void;
}

export function TitleBar({ state, meta, connected, act }: TitleBarProps) {
  const { t, locale, setLocale } = useI18n();
  const paused = state.status === 'paused';
  const controllable = state.status === 'live' || paused;

  return (
    <header className='flex h-11 shrink-0 items-center gap-3 border-b border-border bg-card px-3'>
      <div className='flex items-center gap-2'>
        <img src='/logo-mark.png' alt='' className='h-6 w-auto' draggable={false} />
        <span className='text-[15px] font-bold tracking-[0.16em] text-primary'>ELM327</span>
        <span className='num text-[10px] text-muted-foreground'>v{meta.version.split('.')[0]}</span>
      </div>

      <HaloBadge
        variant={STATUS_VARIANT[state.status]}
        className='px-2.5 py-0.5 text-[10.5px] uppercase tracking-[0.12em]'
        live={state.status === 'live'}
        layout={false}
      >
        {t(`status.${state.status}`)}
      </HaloBadge>

      <div className='flex min-w-0 flex-1 items-center gap-3 truncate text-[12.5px] text-muted-foreground'>
        <span className='font-semibold text-foreground'>{state.title}</span>
        {state.adapter ? <span className='hidden md:inline'>{state.adapter.version}</span> : null}
        {state.adapter ? <span className='hidden xl:inline'>{state.adapter.protocol}</span> : null}
        {!connected ? <span className='font-semibold text-bad'>{t('web.streamLost')}</span> : null}
      </div>

      <div className='arc-scope flex items-center gap-1.5'>
        <SegmentedControl
          label={t('web.interval')}
          value={String(state.intervalMs)}
          onValueChange={(value) => act({ type: 'interval', value: Number(value) })}
          options={meta.intervals
            .filter((ms) => ms >= 100 && ms <= 2000)
            .map((ms) => ({ value: String(ms), label: `${ms}` }))}
        />
        <Button
          size='sm'
          onClick={() => act({ type: paused ? 'resume' : 'pause' })}
          disabled={!controllable}
        >
          {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
          <span className='hidden sm:inline'>{paused ? t('web.resume') : t('web.pause')}</span>
        </Button>
        <IconButton
          label={t('web.reset')}
          onClick={() => act({ type: 'reset' })}
          disabled={!controllable}
        >
          <RestartIcon size={15} />
        </IconButton>
        <IconButton label={t('web.save')} onClick={() => act({ type: 'save' })}>
          <DownloadMinimalisticIcon size={15} />
        </IconButton>
        <SegmentedControl
          label={t('web.language')}
          value={locale}
          onValueChange={(code) => void setLocale(code)}
          options={meta.locales.map((entry) => ({
            value: entry.code,
            label: entry.code === 'pt-BR' ? 'PT' : entry.code.toUpperCase(),
          }))}
        />
      </div>
    </header>
  );
}
