import {
  ChartSquareIcon,
  DangerTriangleIcon,
  MoonIcon,
  PanelBottomIcon,
  SunIcon,
} from '@solar-icons/react/linear';
import { useTheme } from 'next-themes';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface RailButtonProps {
  label: string;
  active?: boolean;
  badge?: number;
  tone?: 'bad';
  onClick?: () => void;
  children: React.ReactNode;
}

function RailButton({ label, active, badge, tone, onClick, children }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type='button'
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              'relative grid size-10 place-items-center text-muted-foreground transition-colors hover:text-foreground',
              active &&
                'text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:bg-primary',
            )}
          >
            {children}
            {badge ? (
              <span
                className={cn(
                  'absolute right-1 top-1 grid min-w-4 place-items-center rounded-full px-1 text-[9.5px] font-bold leading-4 text-background',
                  tone === 'bad' ? 'bg-bad' : 'bg-primary',
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        }
      />
      <TooltipContent side='right'>{label}</TooltipContent>
    </Tooltip>
  );
}

interface ActivityRailProps {
  problems: number;
  panelOpen: boolean;
  panelTab: 'traffic' | 'problems';
  onProblems: () => void;
  onTogglePanel: () => void;
}

/** Narrow icon rail on the left, like an editor's activity bar. */
export function ActivityRail({
  problems,
  panelOpen,
  panelTab,
  onProblems,
  onTogglePanel,
}: ActivityRailProps) {
  const { t } = useI18n();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <nav
      className='flex w-11 shrink-0 flex-col items-center justify-between border-r border-border bg-card py-1'
      aria-label='Views'
    >
      <div className='flex flex-col'>
        <RailButton label={t('web.rail.overview')} active>
          <ChartSquareIcon size={20} />
        </RailButton>
        <RailButton
          label={t('web.rail.problems')}
          active={panelOpen && panelTab === 'problems'}
          badge={problems || undefined}
          tone='bad'
          onClick={onProblems}
        >
          <DangerTriangleIcon size={20} />
        </RailButton>
      </div>
      <div className='flex flex-col'>
        <RailButton
          label={t('web.rail.terminal')}
          active={panelOpen && panelTab === 'traffic'}
          onClick={onTogglePanel}
        >
          <PanelBottomIcon size={20} />
        </RailButton>
        <RailButton
          label={t('web.theme')}
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          {resolvedTheme === 'dark' ? <SunIcon size={19} /> : <MoonIcon size={19} />}
        </RailButton>
      </div>
    </nav>
  );
}
