'use client';

import { useEffect, useState } from 'react';
import { Loader2, Repeat, Search, X } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';
import { PRIORITIES, type Priority } from '@/lib/priority';
import { SLA_OPTIONS, dueFromNow, slaLabel } from '@/lib/deadline';
import type { Contact, TaskType } from '@/types';

interface TaskDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

type Frequency = 'none' | 'daily' | 'weekly' | 'monthly';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/**
 * Nova tarefa interna.
 *
 * O vínculo com o aluno é opcional e existe por um motivo específico: quando o
 * responsável concluir, quem abriu precisa saber a quem responder — sem procurar
 * a conversa de novo.
 */
export function TaskDialog({ onClose, onCreated }: TaskDialogProps) {
  const supabase = useSupabase();
  const { departments, members, me } = useTeamDirectory();

  const [types, setTypes] = useState<TaskType[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskTypeId, setTaskTypeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [slaMinutes, setSlaMinutes] = useState<number | ''>('');
  const [dueAt, setDueAt] = useState('');
  /** Prazo digitado à mão para de seguir o limite — quem escreveu a data mandou. */
  const [dueTouched, setDueTouched] = useState(false);

  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);

  const [frequency, setFrequency] = useState<Frequency>('none');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [leadDays, setLeadDays] = useState(3);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    supabase
      .from('task_types')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .then(({ data }) => setTypes((data ?? []) as TaskType[]));
  }, [supabase]);

  // Busca de aluno: só a partir de 3 letras, para não varrer a base a cada tecla.
  useEffect(() => {
    const term = contactQuery.trim();
    if (term.length < 3) {
      setContactResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, name, phone, email, external_id, channel_type, metadata, created_at, updated_at')
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(8);
      if (!cancelled) setContactResults((data ?? []) as Contact[]);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [contactQuery, supabase]);

  /** datetime-local não aceita ISO com fuso: precisa de "YYYY-MM-DDTHH:mm" local. */
  const toLocalInput = (date: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours()
    )}:${pad(date.getMinutes())}`;
  };

  const applySla = (minutes: number | '') => {
    setSlaMinutes(minutes);
    if (minutes && !dueTouched) setDueAt(toLocalInput(dueFromNow(minutes)));
  };

  /** Escolher o tipo puxa o limite padrão dele (Financeiro é mais curto de propósito). */
  const applyType = (id: string) => {
    setTaskTypeId(id);
    const padrao = types.find((t) => t.id === id)?.default_sla_minutes;
    if (padrao && !slaMinutes) applySla(padrao);
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const comum = {
        title: title.trim(),
        description: description.trim() || undefined,
        taskTypeId: taskTypeId || undefined,
        departmentId: departmentId || undefined,
        assignedTo: assignedTo || undefined,
        priority,
      };

      const res =
        frequency === 'none'
          ? await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...comum,
                contactId: contact?.id,
                slaMinutes: slaMinutes || undefined,
                dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
              }),
            })
          : await fetch('/api/tasks/recurrences', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...comum,
                frequency,
                dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
                dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
                leadDays,
                nextDueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
              }),
            });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Falha ao criar.');
        return;
      }
      if (frequency !== 'none' && data?.firstTaskCreated === false) {
        alert(
          'Regra criada. A primeira tarefa vai aparecer no quadro quando entrar na janela de antecedência.'
        );
      }
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]';
  const legend = 'block text-[11px] font-medium text-gray-500 mb-1';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nova tarefa"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0f0f1e] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center justify-between gap-2 p-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Nova tarefa</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <div>
            <label htmlFor="tarefa-titulo" className={legend}>
              O que precisa ser feito
            </label>
            <input
              id="tarefa-titulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: pagar a hospedagem do sistema"
              className={field}
            />
          </div>

          <div>
            <label htmlFor="tarefa-desc" className={legend}>
              Detalhes (opcional)
            </label>
            <textarea
              id="tarefa-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${field} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tarefa-tipo" className={legend}>
                Tipo
              </label>
              <select
                id="tarefa-tipo"
                value={taskTypeId}
                onChange={(e) => applyType(e.target.value)}
                className={field}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Sem tipo
                </option>
                {types.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#1a1a2e]">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tarefa-depto" className={legend}>
                Departamento
              </label>
              <select
                id="tarefa-depto"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className={field}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Do tipo escolhido
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1a2e]">
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tarefa-resp" className={legend}>
                Responsável
              </label>
              <select
                id="tarefa-resp"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={field}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Deixar na fila
                </option>
                {me?.userId && (
                  <option value={me.userId} className="bg-[#1a1a2e]">
                    Eu mesmo
                  </option>
                )}
                {members
                  .filter((m) => m.userId && m.userId !== me?.userId)
                  .map((m) => (
                    <option key={m.id} value={m.userId!} className="bg-[#1a1a2e]">
                      {m.fullName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="tarefa-prio" className={legend}>
                Prioridade
              </label>
              <select
                id="tarefa-prio"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={field}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value} className="bg-[#1a1a2e]">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {frequency === 'none' && (
            <div>
              <label htmlFor="tarefa-sla" className={legend}>
                Limite para resolver
              </label>
              <select
                id="tarefa-sla"
                value={slaMinutes}
                onChange={(e) => applySla(e.target.value ? Number(e.target.value) : '')}
                className={field}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Sem limite
                </option>
                {SLA_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes} className="bg-[#1a1a2e]">
                    {o.label}
                  </option>
                ))}
              </select>
              {slaMinutes ? (
                <p className="text-[11px] text-gray-500 mt-1">
                  Vence {dueAt ? new Date(dueAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }) : '—'} · limite de {slaLabel(slaMinutes)}
                </p>
              ) : null}
            </div>
          )}

          <div>
            <label htmlFor="tarefa-prazo" className={legend}>
              {frequency === 'none' ? 'Prazo (ajuste se precisar)' : 'Primeiro vencimento'}
            </label>
            <input
              id="tarefa-prazo"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => {
                setDueAt(e.target.value);
                setDueTouched(true);
              }}
              className={field}
            />
          </div>

          {/* Aluno vinculado — só faz sentido em tarefa avulsa */}
          {frequency === 'none' && (
            <div>
              <label htmlFor="tarefa-aluno" className={legend}>
                Aluno que pediu (opcional)
              </label>
              {contact ? (
                <div className="flex items-center gap-2 text-xs text-gray-200 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  <span className="flex-1 truncate">
                    {contact.name || contact.phone || contact.email || 'Contato'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setContact(null);
                      setContactQuery('');
                    }}
                    className="text-gray-400 hover:text-white"
                    aria-label="Remover aluno"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                      aria-hidden
                    />
                    <input
                      id="tarefa-aluno"
                      value={contactQuery}
                      onChange={(e) => setContactQuery(e.target.value)}
                      placeholder="Nome, telefone ou e-mail (3+ letras)"
                      className={`${field} pl-9`}
                    />
                  </div>
                  {contactResults.length > 0 && (
                    <ul className="mt-1 border border-white/10 rounded-lg divide-y divide-white/5 overflow-hidden">
                      {contactResults.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setContact(c)}
                            className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-white/5"
                          >
                            <span className="font-medium text-gray-200">{c.name || 'Sem nome'}</span>
                            {c.phone && <span className="text-gray-500"> · {c.phone}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {/* Recorrência */}
          <div className="pt-2 border-t border-white/10">
            <label htmlFor="tarefa-repete" className={`${legend} flex items-center gap-1.5`}>
              <Repeat className="w-3.5 h-3.5 text-[#a78bfa]" />
              Repetir
            </label>
            <select
              id="tarefa-repete"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className={field}
            >
              <option value="none" className="bg-[#1a1a2e]">
                Não repete
              </option>
              <option value="daily" className="bg-[#1a1a2e]">
                Todo dia
              </option>
              <option value="weekly" className="bg-[#1a1a2e]">
                Toda semana
              </option>
              <option value="monthly" className="bg-[#1a1a2e]">
                Todo mês
              </option>
            </select>

            {frequency !== 'none' && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                {frequency === 'weekly' && (
                  <div>
                    <label htmlFor="tarefa-dia-semana" className={legend}>
                      Dia da semana
                    </label>
                    <select
                      id="tarefa-dia-semana"
                      value={dayOfWeek}
                      onChange={(e) => setDayOfWeek(Number(e.target.value))}
                      className={field}
                    >
                      {WEEKDAYS.map((d, i) => (
                        <option key={d} value={i} className="bg-[#1a1a2e]">
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {frequency === 'monthly' && (
                  <div>
                    <label htmlFor="tarefa-dia-mes" className={legend}>
                      Dia do mês
                    </label>
                    <input
                      id="tarefa-dia-mes"
                      type="number"
                      min={1}
                      max={31}
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Number(e.target.value))}
                      className={field}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="tarefa-antecedencia" className={legend}>
                    Aparece quantos dias antes
                  </label>
                  <input
                    id="tarefa-antecedencia"
                    type="number"
                    min={0}
                    max={60}
                    value={leadDays}
                    onChange={(e) => setLeadDays(Number(e.target.value))}
                    className={field}
                  />
                </div>
              </div>
            )}
            {frequency === 'monthly' && dayOfMonth > 28 && (
              <p className="text-[11px] text-amber-500 mt-1">
                Em fevereiro cai no último dia do mês, para não pular o mês inteiro.
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <footer className="shrink-0 flex justify-end gap-2 p-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Criar
          </button>
        </footer>
      </div>
    </div>
  );
}
