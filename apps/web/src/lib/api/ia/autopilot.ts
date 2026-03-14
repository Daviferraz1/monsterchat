import { supabaseAdmin } from '../supabase';

const AUTOPILOT_KEY = 'autopilot_enabled';
const SUGGESTION_KEY = 'suggestion_enabled';
const SUGGESTION_AI_KEY = 'suggestion_ai_enabled';
const LEARN_KB_USE_AI_KEY = 'learn_kb_use_ai';

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
