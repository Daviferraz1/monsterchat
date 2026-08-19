import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from './supabase';

export type TeamRole = 'atendente' | 'supervisor' | 'gestor' | 'admin';
export type ConversationScope = 'all' | 'department' | 'assigned';

export interface TeamContext {
  userId: string;
  /** Registro em team_members; null se a pessoa ainda não foi cadastrada na equipe. */
  memberId: string | null;
  fullName: string | null;
  role: TeamRole;
  scope: ConversationScope;
  departmentIds: string[];
  /** Pode configurar equipe, departamentos e ver todo mundo. */
  isManager: boolean;
}

/** Usuário da sessão (o middleware já garante que existe em /api/*). */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Contexto de permissão do usuário logado.
 *
 * Espelha exatamente as funções SQL da migração 038 (my_role / my_conversation_scope /
 * my_department_ids) — inclusive os dois fallbacks:
 *   - ninguém cadastrado ainda  → quem logar é admin (bootstrap do primeiro cadastro)
 *   - equipe existe mas a pessoa não está nela → atendente com escopo 'all'
 *     (não tira o acesso de ninguém no dia do deploy)
 */
export async function getTeamContext(): Promise<TeamContext | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const { data: member } = await supabaseAdmin
    .from('team_members')
    .select('id, full_name, role, conversation_scope, sector_id, active')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();

  if (!member) {
    const { count } = await supabaseAdmin
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    const isBootstrap = (count ?? 0) === 0;
    return {
      userId,
      memberId: null,
      fullName: null,
      role: isBootstrap ? 'admin' : 'atendente',
      scope: 'all',
      departmentIds: [],
      isManager: isBootstrap,
    };
  }

  const { data: extra } = await supabaseAdmin
    .from('team_member_departments')
    .select('department_id')
    .eq('team_member_id', member.id);

  const departmentIds = Array.from(
    new Set(
      [member.sector_id, ...(extra ?? []).map((d) => d.department_id)].filter(
        (id): id is string => typeof id === 'string'
      )
    )
  );

  const role = (member.role ?? 'atendente') as TeamRole;
  const isManager = role === 'admin' || role === 'gestor';

  return {
    userId,
    memberId: member.id,
    fullName: member.full_name ?? null,
    role,
    scope: isManager ? 'all' : ((member.conversation_scope ?? 'department') as ConversationScope),
    departmentIds,
    isManager,
  };
}

/** True se o usuário pode enxergar/atuar nesta conversa (mesma regra da RLS). */
export function canSeeConversation(
  ctx: TeamContext,
  conversation: { assigned_to?: string | null; department_id?: string | null }
): boolean {
  if (ctx.scope === 'all') return true;
  if (conversation.assigned_to && conversation.assigned_to === ctx.userId) return true;
  if (ctx.scope === 'assigned') return false;
  // 'department': o que é do seu setor + o que ainda não foi triado
  if (!conversation.department_id) return true;
  return ctx.departmentIds.includes(conversation.department_id);
}
