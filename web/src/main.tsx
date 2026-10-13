import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dashboard } from '@/components/dashboard/dashboard';
import { fetchMeta, fetchState, hasToken } from '@/lib/api';
import { I18nProvider, loadCatalogs } from '@/lib/i18n';
import './index.css';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the preference simply does not persist
  }
}

async function boot(): Promise<void> {
  const container = document.getElementById('root')!;
  const root = createRoot(container);

  if (!hasToken) {
    root.render(
      <p className='mx-auto mt-[20vh] max-w-lg rounded-md border p-6'>
        Access token missing. Open the link printed by the terminal.
      </p>,
    );
    return;
  }

  try {
    const [meta, state] = await Promise.all([fetchMeta(), fetchState()]);
    const saved = readStored('elm327-lang');
    const language = meta.locales.some((entry) => entry.code === saved) ? saved! : meta.language;
    const catalogs = await loadCatalogs(language);
    document.documentElement.lang = language;

    root.render(
      <StrictMode>
        <ThemeProvider attribute='class' defaultTheme='dark' enableSystem storageKey='elm327-theme'>
          <I18nProvider initial={catalogs} onChange={(code) => writeStored('elm327-lang', code)}>
            <TooltipProvider delay={200}>
              <Dashboard initial={state} meta={meta} />
              <Toaster position='bottom-center' />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </StrictMode>,
    );
  } catch (error) {
    root.render(
      <p className='mx-auto mt-[20vh] max-w-lg rounded-md border p-6'>
        Cannot reach the dashboard: {error instanceof Error ? error.message : String(error)}
      </p>,
    );
  }
}

void boot();
