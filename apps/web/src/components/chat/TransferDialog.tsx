'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Loader2, X } from 'lucide-react';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';
import { useSupabase } from '@/hooks/useSupabase';
import { PRIORITIES, type Priority } from '@/lib/priority';

interface TransferRow {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  from_department: string | null;
  to_department: string | null;
  reason: string | null;
  created_at: string;
}

interface TransferDialogProps {
  conversationId: string;
  currentAssignedTo?: string | null;
  currentDepartmentId?: string | null;
  currentPriority?: string | null;
  onClose: () => void;
  onTransferred?: () => void;
}

const NONE = '__none__';

/**
 * Transferir conversa: escolhe departamento e/ou operador.
 *
 * A lista de operadores é filtrada pelo departamento escolhido — mandar para alguém
 * que não cobre aquela fila é a forma mais fácil de a conversa sumir. O servidor
 * ainda corrige o departamento se preciso e avisa quando fez isso.
 */
export function TransferDialog({
  conversationId,
  currentAssignedTo,
  currentDepartmentId,
  currentPriority,
  onClose,
  onTransferred,
}: TransferDialogProps) {
  const { departments, members, nameOfUser, department } = useTeamDirectory();
  const supabase = useSupabase();
  const [history, setHistory] = useState<TransferRow[]>([]);
  const [departmentId, setDepartmentId] = useState<string>(currentDepartmentId ?? NONE);
  const [userId, setUserId] = useState<string>(currentAssignedTo ?? NONE);
  const [priority, setPriority] = useState<Priority>((currentPriority as Priority) ?? 'normal');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyFromDepartment, setOnlyFromDepartment] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('conversation_transfers')
      .select('id, from_user_id, to_user_id, from_department, to_department, reason, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (!cancelled && data) setHistory(data as TransferRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, supabase]);

  const eligible = useMemo(() => {
    const withLogin = members.filter((m) => m.userId);
    if (!onlyFromDepartment || departmentId === NONE) return withLogin;
    return withLogin.filter(
      (m) => m.scope === 'all' || m.departmentIds.includes(departmentId)
    );
  }, [members, departmentId, onlyFromDepartment]);

  const currentName = nameOfUser(currentAssignedTo) ?? (currentAssignedTo ? 'Operador' : null);
  const currentDept = department(currentDepartmentId);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: userId === NONE ? null : userId,
          toDepartmentId: departmentId === NONE ? null : departmentId,
          priority,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Falha ao transferir.');
        return;
      }
      if (data?.department_adjusted) {
        // Não é erro: o servidor ajustou o departamento para o destinatário enxergar.
        const adjusted = departments.find((d) => d.id === data.department_id);
        alert(
          `Transferido. O departamento foi ajustado para "${adjusted?.name ?? 'o do destinatário'}" — senão a pessoa não enxergaria a conversa.`
        );
      }
      onTransferred?.();
      onClose();
    } catch {
      setError('Falha ao transferir.');
    } finally {
      setSaving(false);
    }
  };

  const unchanged =
    (userId === NONE ? null : userId) === (currentAssignedTo ?? null) &&
    (departmentId === NONE ? null : departmentId) === (currentDepartmentId ?? null) &&
    priority === ((currentPriority as Priority) ?? 'normal');

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Transferir conversa"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-popover border rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2 text-foreground">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            Transferir conversa
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Hoje:{' '}
            <span className="text-foreground font-medium">{currentName ?? 'sem dono'}</span>
            {' · '}
            <span className="text-foreground font-medium">{currentDept?.name ?? 'sem departamento'}</span>
          </p>

          <div>
            <label htmlFor="transfer-department" className="block text-xs font-medium text-muted-foreground mb-1">
              Departamento
            </label>
            <select
              id="transfer-department"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setUserId(NONE);
              }}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground"
            >
              <option value={NONE}>Sem departamento (fila geral)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="transfer-user" className="block text-xs font-medium text-muted-foreground">
                Operador responsável
              </label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyFromDepartment}
                  onChange={(e) => setOnlyFromDepartment(e.target.checked)}
                  className="accent-[#7c3aed]"
                />
                só do departamento
              </label>
            </div>
            <select
              id="transfer-user"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground"
            >
              <option value={NONE}>Deixar na fila (sem dono)</option>
              {eligible.map((m) => (
                <option key={m.id} value={m.userId!}>
                  {m.fullName}
                  {m.role !== 'atendente' ? ` · ${m.role}` : ''}
                </option>
              ))}
            </select>
            {eligible.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                Ninguém cadastrado neste departamento. Desmarque o filtro ou ajuste em Configurações › Equipe.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="transfer-priority" className="block text-xs font-medium text-muted-foreground mb-1">
              Prioridade
            </label>
            <select
              id="transfer-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="transfer-reason" className="block text-xs font-medium text-muted-foreground mb-1">
              Motivo (opcional)
            </label>
            <textarea
              id="transfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ex.: aluno quer negociar valores em aberto"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {history.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Histórico
              </p>
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="text-[11px] text-muted-foreground leading-snug">
                    <span className="text-foreground">
                      {nameOfUser(h.from_user_id) ?? 'fila'} → {nameOfUser(h.to_user_id) ?? 'fila'}
                    </span>
                    {h.to_department && ` · ${department(h.to_department)?.name ?? 'departamento'}`}
                    {' · '}
                    {new Date(h.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {h.reason && <span className="block italic">“{h.reason}”</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || unchanged}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Transferir
          </button>
        </div>
      </div>
    </div>
  );
}
