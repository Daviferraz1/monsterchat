import { supabaseAdmin } from '../supabase';

const AUTOPILOT_KEY = 'autopilot_enabled';
const SUGGESTION_KEY = 'suggestion_enabled';
const SUGGESTION_AI_KEY = 'suggestion_ai_enabled';
const LEARN_KB_USE_AI_KEY = 'learn_kb_use_ai';
const LEARN_STYLE_KEY = 'learn_operator_style';
const AGENT_MODEL_KEY = 'agent_model';
const LEARN_KB_MODE_KEY = 'learn_kb_mode';

/** Modelo padrão do agente de sugestão (Claude Sonnet). */
export const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-6';

/** Modelos permitidos para o agente de sugestão (admin escolhe). */
export const AGENT_MODEL_OPTIONS: { value: string; label: string; provider: 'anthropic' | 'gemini' }[] = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — melhor qualidade (padrão)', provider: 'anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — Claude mais barato', provider: 'anthropic' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — Google, barato', provider: 'gemini' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite — o mais barato', provider: 'gemini' },
];

/** Modelo do agente de sugestão escolhido no admin (cai no padrão se não setado/ inválido). */
export async function getAgentModel(): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', AGENT_MODEL_KEY)
      .single();
    if (error || !data?.value) return DEFAULT_AGENT_MODEL;
    const v = data.value as { model?: string };
    const m = typeof v?.model === 'string' ? v.model.trim() : '';
    return AGENT_MODEL_OPTIONS.some((o) => o.value === m) ? m : DEFAULT_AGENT_MODEL;
  } catch {
    return DEFAULT_AGENT_MODEL;
  }
}

export async function setAgentModel(model: string): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: AGENT_MODEL_KEY, value: { model }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

export async function isAutopilotEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', AUTOPILOT_KEY)
      .single();

    if (error || !data?.value) return false;
    const v = data.value as { enabled?: boolean };
    return v?.enabled === true;
  } catch {
    return false;
  }
}

export async function setAutopilotEnabled(enabled: boolean): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: AUTOPILOT_KEY, value: { enabled }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

export async function isSuggestionEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', SUGGESTION_KEY)
      .single();

    if (error || !data?.value) return false;
    const v = data.value as { enabled?: boolean };
    return v?.enabled === true;
  } catch {
    return false;
  }
}

export async function setSuggestionEnabled(enabled: boolean): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: SUGGESTION_KEY, value: { enabled }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

export async function isSuggestionAIEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', SUGGESTION_AI_KEY)
      .single();

    if (error || !data?.value) return true;
    const v = data.value as { enabled?: boolean };
    return v?.enabled !== false;
  } catch {
    return true;
  }
}

export async function setSuggestionAIEnabled(enabled: boolean): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: SUGGESTION_AI_KEY, value: { enabled }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

/** Usar IA (Claude) ao salvar automaticamente na base quando o atendente não usa a sugestão. Se false, salva pergunta e resposta sem normalizar. */
export async function isLearnFromFeedbackUseAi(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', LEARN_KB_USE_AI_KEY)
      .single();

    if (error || !data?.value) return true;
    const v = data.value as { enabled?: boolean };
    return v?.enabled !== false;
  } catch {
    return true;
  }
}

export async function setLearnFromFeedbackUseAi(enabled: boolean): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: LEARN_KB_USE_AI_KEY, value: { enabled }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

/** Aprender o PADRÃO do atendente (estilo) quando ele responde diferente da sugestão. Ligado por padrão. */
export async function isLearnOperatorStyleEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', LEARN_STYLE_KEY)
      .single();

    if (error || !data?.value) return true;
    const v = data.value as { enabled?: boolean };
    return v?.enabled !== false;
  } catch {
    return true;
  }
}

export async function setLearnOperatorStyleEnabled(enabled: boolean): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: LEARN_STYLE_KEY, value: { enabled }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}

/**
 * O que fazer com a correção do atendente.
 *
 * 'queue' — vira proposta e espera aprovação (padrão).
 * 'auto'  — entra direto na base. Era o comportamento anterior, e foi ele que
 *           encheu a base de 17 mil entradas cruas; só ligue depois de a
 *           curadoria estar em dia.
 * 'off'   — não aprende nada.
 */
export type LearnKbMode = 'queue' | 'auto' | 'off';

export async function getLearnKbMode(): Promise<LearnKbMode> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_settings')
      .select('value')
      .eq('key', LEARN_KB_MODE_KEY)
      .single();
    if (error || !data?.value) return 'queue';
    const v = (data.value as { mode?: string }).mode;
    return v === 'auto' || v === 'off' ? v : 'queue';
  } catch {
    return 'queue';
  }
}

export async function setLearnKbMode(mode: LearnKbMode): Promise<void> {
  await supabaseAdmin
    .from('ia_settings')
    .upsert(
      { key: LEARN_KB_MODE_KEY, value: { mode }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
}
