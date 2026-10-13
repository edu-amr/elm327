import {
  CpuIcon,
  DownloadMinimalisticIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  SunIcon,
} from '@solar-icons/react/linear';
import { useTheme } from 'next-themes';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Button } from '@/components/ui/button';
import { HaloBadge } from '@/components/ui/halo-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import type { WireAction, WireMeta, WireState } from '../../../../src/session/wire';

interface TopBarProps {
  state: WireState;
  meta: WireMeta;
  connected: boolean;
  act: (action: WireAction) => void;
}

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

export function TopBar({ state, meta, connected, act }: TopBarProps) {
  const { t, locale, setLocale } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  const paused = state.status === 'paused';
  const controllable = state.status === 'live' || paused;

  return (
    <header className='sticky top-0 z-20 -mx-4 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6'>
      <div className='mx-auto flex max-w-[1760px] flex-wrap items-center gap-x-4 gap-y-3'>
        <div className='flex items-baseline gap-2'>
          <span className='text-lg font-bold tracking-[0.18em] text-primary'>ELM327</span>
          <span className='num text-[11px] text-muted-foreground'>
            v{meta.version.split('.')[0]}
          </span>
        </div>

        <HaloBadge
          variant={STATUS_VARIANT[state.status]}
          className='px-2.5 py-1 text-[11px] uppercase tracking-[0.12em]'
          live={state.status === 'live'}
          layout={false}
        >
          {t(`status.${state.status}`)}
        </HaloBadge>

        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground'>
          <span className='font-semibold text-foreground'>{state.title}</span>
          {state.adapter ? <span>{state.adapter.version}</span> : null}
          {state.adapter ? (
            <span className='hidden lg:inline'>{state.adapter.protocol}</span>
          ) : null}
          {state.voltage !== undefined ? (
            <span className='num'>{state.voltage.toFixed(1)} V</span>
          ) : null}
          <span className='num'>
            {t('header.up')} {formatDuration(state.now - state.startedAt)}
          </span>
          {!connected ? (
            <span className='font-semibold text-bad'>{t('web.streamLost')}</span>
          ) : null}
        </div>

        <div className='arc-scope flex flex-wrap items-center gap-2'>
          <SegmentedControl
            label={t('web.interval')}
            value={String(state.intervalMs)}
            onValueChange={(value) => act({ type: 'interval', value: Number(value) })}
            options={meta.intervals
              .filter((ms) => ms >= 250 && ms <= 2000)
              .map((ms) => ({ value: String(ms), label: `${ms}` }))}
          />
          <Button
            variant='default'
            onClick={() => act({ type: paused ? 'resume' : 'pause' })}
            disabled={!controllable}
          >
            {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
            {paused ? t('web.resume') : t('web.pause')}
          </Button>
          <IconButton
            label={t('web.readCodes')}
            onClick={() => act({ type: 'read-dtcs' })}
            disabled={state.status === 'connecting' || state.status === 'offline'}
          >
            <CpuIcon size={16} />
          </IconButton>
          <IconButton
            label={t('web.reset')}
            onClick={() => act({ type: 'reset' })}
            disabled={!controllable}
          >
            <RestartIcon size={16} />
          </IconButton>
          <IconButton label={t('web.save')} onClick={() => act({ type: 'save' })}>
            <DownloadMinimalisticIcon size={16} />
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
          <IconButton
            label={t('web.theme')}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
          </IconButton>
        </div>
      </div>
    </header>
  );
}
