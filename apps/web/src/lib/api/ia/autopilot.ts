import { supabaseAdmin } from '../supabase';

const AUTOPILOT_KEY = 'autopilot_enabled';
const SUGGESTION_KEY = 'suggestion_enabled';

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
