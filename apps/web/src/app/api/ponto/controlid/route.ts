import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { apiEnv } from '@/lib/api/env';

export const dynamic = 'force-dynamic';

/**
 * Webhook do Monitor do Control iD (iDFace) — recebe as batidas de ponto.
 *
 * Fluxo: iDFace (rede local) --Monitor/POST--> este endpoint --> Supabase (time_punches).
 *
 * Autenticacao: o Control iD nem sempre deixa mandar header custom, entao aceitamos o
 * segredo tanto no header `x-webhook-secret` quanto na query `?secret=...` (colocado no
 * path do servidor de monitoramento configurado no aparelho).
 *
 * IMPORTANTE: o formato exato do payload do Monitor so da pra fechar vendo um POST real.
 * Por isso este handler e TOLERANTE: extrai o que reconhece, guarda o corpo cru em `raw`
 * e nunca quebra. Assim que voce configurar o aparelho e cair a primeira batida, olhamos
 * o `raw` salvo e finalizamos o mapeamento dos campos.
 */
export async function POST(request: NextRequest) {
  try {
    // 1) Autenticacao por segredo compartilhado.
    const expected = apiEnv.CONTROLID_WEBHOOK_SECRET;
    if (expected) {
      const provided =
        request.headers.get('x-webhook-secret') ||
        request.nextUrl.searchParams.get('secret') ||
        '';
      if (provided !== expected) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    }

    const raw = await request.json().catch(() => ({}));

    // Extrai as batidas do payload (o Monitor pode empacotar de formas diferentes).
    const events = extractAccessEvents(raw);

    // Cache de aparelho por serial (evita resolver o mesmo device varias vezes no lote).
    const deviceCache = new Map<string, { id: string } | null>();

    let inserted = 0;
    for (const ev of events) {
      // So contam identificacoes bem-sucedidas. No Control iD, event 7 = acesso
      // concedido/identificado; 3 = nao identificado (ruido). Se o campo nao vier,
      // nao filtramos (defensivo). Ver migration 032 / doc access_logs.
      const eventCode = ev.event != null ? Number(ev.event) : null;
      if (eventCode !== null && eventCode !== 7) continue;

      const externalUserId = pickString(ev, ['user_id', 'userId', 'user', 'pis']) ?? null;
      if (externalUserId === '0') continue; // 0 = ninguem identificado

      const punchedAt = parseEventTime(ev);
      if (!punchedAt) continue; // sem horario nao ha batida valida

      // Serial do aparelho: vem em cada log (device_id) ou no topo do payload.
      const serial =
        pickString(ev, ['device_id', 'deviceId', 'serial']) ??
        pickString(raw, ['device_id', 'deviceId', 'serial', 'device_serial']);
      let device = deviceCache.get(serial ?? '');
      if (device === undefined) {
        device = await resolveDevice(serial);
        deviceCache.set(serial ?? '', device);
      }

      const eventId = pickString(ev, ['id', 'log_id', 'event_id']) ?? null;

      // Anti-duplicidade: serial do aparelho + id do log (fallback: user+timestamp).
      const dedupKey =
        `${serial ?? 'unknown'}:` +
        (eventId ?? `${externalUserId ?? 'x'}@${punchedAt}`);

      // Resolve o colaborador pelo mapeamento (pode nao existir ainda -> fica NULL).
      const teamMemberId = await resolveTeamMember(device?.id, externalUserId);

      const { error } = await supabaseAdmin.from('time_punches').insert({
        team_member_id: teamMemberId,
        device_id: device?.id ?? null,
        external_user_id: externalUserId,
        punched_at: punchedAt,
        direction: 'unknown', // entrada/saida derivada depois (pareamento por dia)
        source: 'monitor',
        dedup_key: dedupKey,
        raw: ev,
      });

      // Conflito de dedup_key = batida ja registrada; ignora silenciosamente.
      if (!error) inserted++;
      else if (error.code !== '23505') {
        console.error('[ponto/controlid] insert punch', error);
      }
    }

    // 4) Responde 200 com corpo vazio — o Monitor so quer o ACK.
    return NextResponse.json({ ok: true, received: events.length, inserted });
  } catch (err) {
    console.error('[ponto/controlid]', err);
    // Ainda respondemos 200 para o aparelho nao ficar em loop de retry por erro nosso.
    return NextResponse.json({ ok: false });
  }
}

// Alguns aparelhos "testam" o servidor com GET antes de configurar o Monitor.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'controlid-monitor' });
}

// ---------------------------------------------------------------------------
// Helpers (tolerantes a formato — refinados quando virmos um payload real)
// ---------------------------------------------------------------------------

function pickString(obj: unknown, keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return undefined;
}

/** Extrai a lista de eventos de acesso das formas conhecidas do Monitor do Control iD. */
function extractAccessEvents(raw: unknown): Array<Record<string, unknown>> {
  if (!raw || typeof raw !== 'object') return [];
  const rec = raw as Record<string, unknown>;

  // Forma 1: { access_logs: [ {...} ] }
  if (Array.isArray(rec.access_logs)) return rec.access_logs as Record<string, unknown>[];

  // Forma 2: { object_changes: [ { object: 'access_logs', values: {...} } ] }
  if (Array.isArray(rec.object_changes)) {
    return (rec.object_changes as Array<Record<string, unknown>>)
      .filter((c) => (c.object ?? c.table) === 'access_logs')
      .map((c) => (c.values ?? c.value ?? c) as Record<string, unknown>);
  }

  // Forma 3: { changes: [...] } ou { logs: [...] }
  for (const key of ['changes', 'logs', 'events']) {
    if (Array.isArray(rec[key])) return rec[key] as Record<string, unknown>[];
  }

  // Forma 4: o proprio corpo ja e um unico evento.
  if (rec.time || rec.timestamp || rec.user_id) return [rec];

  return [];
}

/** Converte o horario do evento (unix segundos, ms, ou ISO) para ISO string. */
function parseEventTime(ev: Record<string, unknown>): string | null {
  const t = ev.time ?? ev.timestamp ?? ev.event_time ?? ev.date;
  if (t == null) return null;
  if (typeof t === 'number') {
    // Control iD usa unix em segundos; se vier em ms, ajusta.
    const ms = t > 1e12 ? t : t * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(String(t));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Acha (ou cria) o aparelho pelo serial e atualiza o heartbeat. */
async function resolveDevice(serial: string | undefined): Promise<{ id: string } | null> {
  if (!serial) return null;
  const { data: existing } = await supabaseAdmin
    .from('time_devices')
    .select('id')
    .eq('serial', serial)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('time_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);
    return existing;
  }

  const { data: created } = await supabaseAdmin
    .from('time_devices')
    .insert({
      name: `Control iD ${serial}`,
      serial,
      vendor: 'control_id',
      last_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  return created ?? null;
}

/** Traduz o id da pessoa no aparelho -> colaborador. NULL se ainda nao mapeado. */
async function resolveTeamMember(
  deviceId: string | undefined,
  externalUserId: string | null
): Promise<string | null> {
  if (!externalUserId) return null;
  const query = supabaseAdmin
    .from('time_clock_mappings')
    .select('team_member_id')
    .eq('external_user_id', externalUserId);
  if (deviceId) query.eq('device_id', deviceId);
  const { data } = await query.maybeSingle();
  return data?.team_member_id ?? null;
}
