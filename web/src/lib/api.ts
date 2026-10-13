import type { WireAction, WireMeta, WireState } from '../../../src/session/wire';

const PLACEHOLDER = '__ELM327_TOKEN__';

function findToken(): string {
  const injected =
    document.querySelector('meta[name="elm327-token"]')?.getAttribute('content') ?? '';
  if (injected && injected !== PLACEHOLDER) return injected;
  // Dev server: the token comes from the link or from the previous visit.
  const fromUrl = new URLSearchParams(location.search).get('token');
  try {
    if (fromUrl) sessionStorage.setItem('elm327-token', fromUrl);
    return fromUrl ?? sessionStorage.getItem('elm327-token') ?? '';
  } catch {
    return fromUrl ?? '';
  }
}

export const token = findToken();
export const hasToken = token.length > 0;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'x-elm327-token': token, 'content-type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const fetchMeta = (): Promise<WireMeta> => request('/api/meta');
export const fetchState = (): Promise<WireState> => request('/api/state');
export const fetchLocale = (code: string): Promise<Record<string, string>> =>
  request(`/api/locale/${encodeURIComponent(code)}`);

export const sendAction = (action: WireAction): Promise<unknown> =>
  request('/api/action', { method: 'POST', body: JSON.stringify(action) });

/** Opens the live stream; the browser reconnects by itself when it drops. */
export function openStream(
  onState: (state: WireState) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  const source = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
  source.addEventListener('state', (event) => {
    onState(JSON.parse((event as MessageEvent<string>).data) as WireState);
  });
  source.onopen = () => onConnection(true);
  source.onerror = () => onConnection(false);
  return () => source.close();
}
