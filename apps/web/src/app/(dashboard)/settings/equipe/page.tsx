'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, Loader2, Plus, Save, Users, X } from 'lucide-react';

type Role = 'atendente' | 'supervisor' | 'gestor' | 'admin';
type Scope = 'all' | 'department' | 'assigned';

interface Member {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  login_email: string | null;
  role: Role;
  conversation_scope: Scope;
  active: boolean;
  department_ids: string[];
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  color: string;
  active: boolean;
  sort_order: number;
  sla_first_response_minutes: number | null;
  member_count: number;
  conversation_count: number;
}

const ROLE_LABEL: Record<Role, string> = {
  atendente: 'Operador',
  supervisor: 'Supervisor',
  gestor: 'Gestor',
  admin: 'Admin',
};

const ROLE_HINT: Record<Role, string> = {
  atendente: 'Atende conversas. Não mexe em configurações.',
  supervisor: 'Atende e acompanha a equipe do setor.',
  gestor: 'Vê todas as conversas e gerencia equipe e departamentos.',
  admin: 'Acesso total, inclusive configurações do sistema.',
};

const SCOPE_LABEL: Record<Scope, string> = {
  all: 'Todas as conversas',
  department: 'Do(s) departamento(s) dele + as não triadas',
  assigned: 'Somente as atribuídas a ele',
};

const emptyForm = {
  id: '' as string,
  fullName: '',
  userId: '' as string,
  role: 'atendente' as Role,
  scope: 'department' as Scope,
  departmentIds: [] as string[],
};

export default function EquipePage() {
  const [tab, setTab] = useState<'membros' | 'departamentos'>('membros');
  const [members, setMembers] = useState<Member[]>([]);
  const [unlinked, setUnlinked] = useState<{ id: string; email: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [deptForm, setDeptForm] = useState<Partial<Department> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, deptRes] = await Promise.all([
        fetch('/api/team/members'),
        fetch('/api/team/departments'),
      ]);
      if (membersRes.status === 403 || deptRes.status === 403) {
        setForbidden(true);
        return;
      }
      const membersData = await membersRes.json().catch(() => ({}));
      const deptData = await deptRes.json().catch(() => ({}));
      setMembers(membersData.members ?? []);
      setUnlinked(membersData.unlinkedUsers ?? []);
      setDepartments(deptData.departments ?? []);
    } catch {
      setError('Falha ao carregar. Tente recarregar a página.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveMember = async () => {
    if (!form || !form.fullName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        id: form.id || undefined,
        fullName: form.fullName.trim(),
        userId: form.userId || null,
        role: form.role,
        scope: form.scope,
        departmentIds: form.departmentIds,
      };
      const res = await fetch('/api/team/members', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Falha ao salvar.');
        return;
      }
      setForm(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleMemberActive = async (member: Member) => {
    setError(null);
    const res = await fetch('/api/team/members', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: member.id, active: !member.active }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data?.error === 'string' ? data.error : 'Falha ao atualizar.');
      return;
    }
    await load();
  };

  const saveDepartment = async () => {
    if (!deptForm || !deptForm.name?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/team/departments', {
        method: deptForm.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deptForm.id,
          name: deptForm.name.trim(),
          description: deptForm.description ?? '',
          color: deptForm.color ?? '#8b5cf6',
          slaFirstResponseMinutes:
            deptForm.sla_first_response_minutes === undefined ||
            deptForm.sla_first_response_minutes === null ||
            Number.isNaN(deptForm.sla_first_response_minutes)
              ? null
              : Number(deptForm.sla_first_response_minutes),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Falha ao salvar.');
        return;
      }
      setDeptForm(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleDepartmentActive = async (department: Department) => {
    await fetch('/api/team/departments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: department.id, active: !department.active }),
    });
    await load();
  };

  if (forbidden) {
    return (
      <div className="min-h-full bg-gray-100 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-700 font-medium">Só gestor ou admin acessa esta tela.</p>
          <Link href="/settings" className="text-sm text-[#7c3aed] mt-2 inline-block">
            Voltar às configurações
          </Link>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#7c3aed] focus:border-[#7c3aed]';

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ArrowLeft className="w-4 h-4" /> Configurações
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-[#7c3aed]" />
            Equipe e departamentos
          </h1>
          <p className="text-gray-600 text-sm mt-1">
            Quem atende, o que cada um enxerga e para onde as conversas podem ser transferidas.
          </p>

          <div className="flex gap-2 mt-4">
            {(['membros', 'departamentos'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t ? 'bg-[#7c3aed] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'membros' ? 'Colaboradores' : 'Departamentos'}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{error}</div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 flex items-center justify-center text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : tab === 'membros' ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-900">Colaboradores ({members.filter((m) => m.active).length})</h2>
              <button
                type="button"
                onClick={() => setForm({ ...emptyForm })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9]"
              >
                <Plus className="w-4 h-4" /> Novo
              </button>
            </div>

            {members.length === 0 && (
              <p className="text-sm text-gray-500">
                Ninguém cadastrado ainda. Enquanto a equipe estiver vazia, todo mundo que loga enxerga
                todas as conversas — cadastre as pessoas para o escopo por departamento valer.
              </p>
            )}

            <ul className="divide-y divide-gray-100">
              {members.map((m) => (
                <li key={m.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-medium ${m.active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                      {m.full_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {m.login_email ?? 'sem login vinculado'} · {ROLE_LABEL[m.role]} ·{' '}
                      {m.role === 'admin' || m.role === 'gestor' ? 'vê tudo' : SCOPE_LABEL[m.conversation_scope]}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.department_ids.length === 0 && (
                        <span className="text-[11px] text-amber-600">sem departamento</span>
                      )}
                      {m.department_ids.map((id) => {
                        const d = departments.find((x) => x.id === id);
                        if (!d) return null;
                        return (
                          <span
                            key={id}
                            className="text-[11px] px-1.5 py-0.5 rounded border"
                            style={{ background: `${d.color}18`, color: d.color, borderColor: `${d.color}55` }}
                          >
                            {d.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          id: m.id,
                          fullName: m.full_name,
                          userId: m.user_id ?? '',
                          role: m.role,
                          scope: m.conversation_scope,
                          departmentIds: m.department_ids,
                        })
                      }
                      className="text-sm text-[#7c3aed] hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMemberActive(m)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      {m.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#7c3aed]" /> Departamentos
              </h2>
              <button
                type="button"
                onClick={() => setDeptForm({ name: '', color: '#8b5cf6' })}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9]"
              >
                <Plus className="w-4 h-4" /> Novo
              </button>
            </div>

            <ul className="divide-y divide-gray-100">
              {departments.map((d) => (
                <li key={d.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-medium flex items-center gap-2 ${d.active ? 'text-gray-900' : 'text-gray-400'}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      {d.name}
                    </p>
                    {d.description && <p className="text-xs text-gray-500">{d.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {d.member_count} pessoa(s) · {d.conversation_count} conversa(s)
                      {d.sla_first_response_minutes
                        ? ` · SLA 1ª resposta ${d.sla_first_response_minutes} min`
                        : ' · sem SLA'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => setDeptForm(d)} className="text-sm text-[#7c3aed] hover:underline">
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleDepartmentActive(d)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      {d.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Formulário de colaborador */}
      {form && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {form.id ? 'Editar colaborador' : 'Novo colaborador'}
              </h3>
              <button type="button" onClick={() => setForm(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label htmlFor="member-name" className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
                <input
                  id="member-name"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className={inputClass}
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <label htmlFor="member-login" className="block text-xs font-medium text-gray-500 mb-1">
                  Login do sistema
                </label>
                <select
                  id="member-login"
                  value={form.userId}
                  onChange={(e) => setForm({ ...form, userId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Sem login (não acessa o chat)</option>
                  {form.id && members.find((m) => m.id === form.id)?.user_id && (
                    <option value={members.find((m) => m.id === form.id)!.user_id!}>
                      {members.find((m) => m.id === form.id)!.login_email ?? 'login atual'} (atual)
                    </option>
                  )}
                  {unlinked.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  A lista traz os logins já criados no Supabase Auth que ainda não estão vinculados a ninguém.
                </p>
              </div>

              <div>
                <label htmlFor="member-role" className="block text-xs font-medium text-gray-500 mb-1">Cargo</label>
                <select
                  id="member-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  className={inputClass}
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">{ROLE_HINT[form.role]}</p>
              </div>

              <div>
                <label htmlFor="member-scope" className="block text-xs font-medium text-gray-500 mb-1">
                  O que enxerga no inbox
                </label>
                <select
                  id="member-scope"
                  value={form.scope}
                  disabled={form.role === 'admin' || form.role === 'gestor'}
                  onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })}
                  className={`${inputClass} disabled:bg-gray-100 disabled:text-gray-400`}
                >
                  {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </option>
                  ))}
                </select>
                {(form.role === 'admin' || form.role === 'gestor') && (
                  <p className="text-[11px] text-gray-400 mt-1">Gestor e admin sempre enxergam tudo.</p>
                )}
              </div>

              <div>
                <p className="block text-xs font-medium text-gray-500 mb-1">Departamentos</p>
                <div className="space-y-1.5">
                  {departments
                    .filter((d) => d.active)
                    .map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-[#7c3aed]"
                          checked={form.departmentIds.includes(d.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              departmentIds: e.target.checked
                                ? [...form.departmentIds, d.id]
                                : form.departmentIds.filter((x) => x !== d.id),
                            })
                          }
                        />
                        <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                        {d.name}
                      </label>
                    ))}
                </div>
                {form.scope === 'department' && form.departmentIds.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Sem departamento e com escopo por departamento, essa pessoa só vai ver as conversas
                    ainda não triadas e as atribuídas a ela.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button type="button" onClick={() => setForm(null)} className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveMember}
                disabled={saving || !form.fullName.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulário de departamento */}
      {deptForm && (
        <div className="fixed inset-0 z-[300] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                {deptForm.id ? 'Editar departamento' : 'Novo departamento'}
              </h3>
              <button type="button" onClick={() => setDeptForm(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label htmlFor="dept-name" className="block text-xs font-medium text-gray-500 mb-1">Nome</label>
                <input
                  id="dept-name"
                  value={deptForm.name ?? ''}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="dept-desc" className="block text-xs font-medium text-gray-500 mb-1">
                  Descrição
                </label>
                <input
                  id="dept-desc"
                  value={deptForm.description ?? ''}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  className={inputClass}
                  placeholder="Que tipo de assunto cai aqui"
                />
              </div>
              <div className="flex gap-3">
                <div className="w-24">
                  <label htmlFor="dept-color" className="block text-xs font-medium text-gray-500 mb-1">Cor</label>
                  <input
                    id="dept-color"
                    type="color"
                    value={deptForm.color ?? '#8b5cf6'}
                    onChange={(e) => setDeptForm({ ...deptForm, color: e.target.value })}
                    className="w-full h-10 rounded-lg border border-gray-300"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="dept-sla" className="block text-xs font-medium text-gray-500 mb-1">
                    SLA de 1ª resposta (min)
                  </label>
                  <input
                    id="dept-sla"
                    type="number"
                    min={1}
                    value={deptForm.sla_first_response_minutes ?? ''}
                    onChange={(e) =>
                      setDeptForm({
                        ...deptForm,
                        sla_first_response_minutes: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className={inputClass}
                    placeholder="ex.: 15"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button type="button" onClick={() => setDeptForm(null)} className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveDepartment}
                disabled={saving || !deptForm.name?.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
