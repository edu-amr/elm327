import { useState } from 'react';
import { DangerTriangleIcon, ShieldCheckIcon } from '@solar-icons/react/linear';
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
import type { WireAction, WireState } from '../../../../src/session/wire';
import { Panel } from './panel';

export function DtcCard({ state, act }: { state: WireState; act: (action: WireAction) => void }) {
  const { t, tOptional } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const { dtcs } = state;
  const count = dtcs.codes.length;
  const checked =
    dtcs.checkedAt === undefined
      ? ''
      : ` · ${t('dtc.checked', { time: formatClock(dtcs.checkedAt).slice(0, 8) })}`;

  const banner = (
    <div className='flex items-center gap-3 rounded-md bg-bad/10 px-4 py-3'>
      <DangerTriangleIcon size={22} className='shrink-0 text-bad' />
      <div className='min-w-0'>
        <p className='font-semibold text-bad'>{t('web.mil.alert')}</p>
        <p className='text-xs text-muted-foreground'>
          {count === 1 ? t('dtc.storedOne') : t('dtc.storedMany', { count })}
        </p>
      </div>
    </div>
  );

  return (
    <Panel
      title={`${t('panel.dtc')}${checked}`}
      actions={
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
      }
    >
      {dtcs.milOn ? (
        <ElectricBorder
          color='#ff5d6c'
          speed={0.7}
          chaos={0.08}
          thickness={1.5}
          borderRadius={8}
          className='mb-3'
        >
          {banner}
        </ElectricBorder>
      ) : dtcs.milOn === false ? (
        <div className='mb-3 flex items-center gap-2 text-sm text-ok'>
          <ShieldCheckIcon size={18} />
          <span>{dtcs.codes.length === 0 ? t('dtc.none') : t('dtc.milOff')}</span>
        </div>
      ) : (
        <p className='mb-3 text-sm text-muted-foreground'>{t('dtc.hint')}</p>
      )}
      {dtcs.error ? <p className='mb-2 text-sm text-bad'>{dtcs.error}</p> : null}

      <ul className='grid gap-2'>
        {dtcs.codes.map(({ code, description }) => (
          <li key={code}>
            <GlareHover
              width='100%'
              height='auto'
              background='transparent'
              borderRadius='8px'
              borderColor='color-mix(in oklab, var(--bad) 35%, var(--border))'
              glareColor='#ff8f9a'
              glareOpacity={0.25}
            >
              <div className='flex w-full items-center gap-3 px-3 py-2.5'>
                <span className='num text-base font-bold text-bad'>{code}</span>
                <span className='text-sm'>{tOptional(`dtc.${code}`, description)}</span>
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
    </Panel>
  );
}
