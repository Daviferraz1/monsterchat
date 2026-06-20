/**
 * Consulta ao vivo na API do Digital Manager Guru (transações), por e-mail/telefone.
 * Usado pelo agente da IA para confirmar pagamento em tempo real (mais confiável que
 * a tabela local guru_sales, que depende do webhook/sync estar em dia).
 * Doc: https://docs.digitalmanager.guru/developers/transactions
 */
import { apiEnv } from '../env';

function normEmail(e?: string | null): string {
  return (e || '').trim().toLowerCase();
}
function normPhone(p?: string | null): string {
  return (p || '').replace(/\D/g, '');
}
function canon(p?: string | null): string {
  const d = normPhone(p);
  if (d.startsWith('55') && (d.length === 12 || d.length === 11)) return d.slice(0, 4) + '9' + d.slice(4);
  return d;
}
function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function extractArray(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const k of ['data', 'transactions', 'results', 'orders', 'items']) {
      if (Array.isArray(o[k])) return o[k] as Array<Record<string, unknown>>;
    }
  }
  return [];
}

function matches(t: Record<string, unknown>, email: string, phone: string): boolean {
  const c = t.contact as Record<string, unknown> | undefined;
  if (!c) return false;
  const cE = normEmail(c.email as string);
  const cP = normPhone((c.phone_full_number as string) || (c.phone_number as string));
  if (email && cE && cE === email) return true;
  if (phone && cP && (cP === phone || canon(cP) === canon(phone))) return true;
  return false;
}

function txSummary(t: Record<string, unknown>): string {
  const status = typeof t.status === 'string' ? t.status : '?';
  const dates = t.dates as Record<string, unknown> | undefined;
  const ordered = (dates?.ordered_at || dates?.confirmed_at || dates?.created_at) as string | undefined;
  let product = '';
  const items = t.items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items) && items[0]?.name) product = String(items[0].name);
  else if (t.product && typeof t.product === 'object') product = String((t.product as Record<string, unknown>).name ?? '');
  const payment = t.payment as Record<string, unknown> | undefined;
  let method = '';
  let total: number | null = null;
  if (payment) {
    const m = payment.method;
    method =
      typeof m === 'string'
        ? m
        : m && typeof m === 'object' && typeof (m as Record<string, unknown>).name === 'string'
          ? ((m as Record<string, unknown>).name as string)
          : '';
    const tot = payment.total;
    total = typeof tot === 'number' ? tot : typeof tot === 'string' ? parseFloat(tot) || null : null;
  }
  const parts: string[] = [];
  if (product) parts.push(product);
  parts.push(`status: ${status}`);
  if (ordered) parts.push(`data: ${String(ordered).slice(0, 10)}`);
  if (method) parts.push(`pagamento: ${method}`);
  if (total != null) parts.push(`valor: R$ ${total.toFixed(2)}`);
  return parts.join(' | ');
}

export interface GuruLiveResult {
  ok: boolean;
  configured: boolean;
  summaries: string[];
  error?: string;
}

export async function fetchGuruTransactionsLive(params: {
  email?: string | null;
  phone?: string | null;
}): Promise<GuruLiveResult> {
  const userToken = apiEnv.DIGITAL_GURU_USER_TOKEN;
  const baseUrl = apiEnv.DIGITAL_GURU_API_BASE_URL?.trim().replace(/\/$/, '');
  if (!userToken || !baseUrl) return { ok: false, configured: false, summaries: [] };

  const email = normEmail(params.email);
  let phone = normPhone(params.phone);
  if (phone && !phone.startsWith('55') && phone.length >= 10) phone = '55' + phone;
  if (!email && !phone) return { ok: false, configured: true, summaries: [], error: 'sem e-mail/telefone' };

  const end = toDateOnly(new Date());
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 180);
  const sp = new URLSearchParams();
  sp.set('ordered_at_ini', toDateOnly(startDate));
  sp.set('ordered_at_end', end);
  const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${sp.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${userToken}`, Accept: 'application/json' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { ok: false, configured: true, summaries: [], error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => ({}));
    let txs = extractArray(data);
    if (email || phone) txs = txs.filter((t) => matches(t, email, phone));
    return { ok: true, configured: true, summaries: txs.slice(0, 5).map(txSummary) };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return { ok: false, configured: true, summaries: [], error: isAbort ? 'timeout' : 'erro de rede' };
  }
}
