'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarClock,
  Hand,
  KanbanSquare,
  ListChecks,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Plus,
  Repeat,
} from 'lucide-react';
import { useBoard } from '@/hooks/useBoard';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';
import { ChannelBadge } from '@/components/layout/ChannelBadge';
import { TaskDialog } from '@/components/board/TaskDialog';
import { TaskPanel } from '@/components/board/TaskPanel';
import { BOARD_COLUMNS, timeAgo } from '@/lib/boardColumns';
import { PRIORITIES, priorityMeta, type Priority } from '@/lib/priority';
import { isOverdue, type BoardItem } from '@/lib/boardItem';
import { isAtRisk, remainingLabel, slaLabel } from '@/lib/deadline';
import type { ConversationStatus } from '@/types';

function initials(name: string): string {
  const clean = name.trim();
  if (!clean || clean === 'Contato sem nome') return '?';
  return clean.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function shortDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CardProps {
  item: BoardItem;
  showOwner: boolean;
  ownerName: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  noteCount: number;
  onMove: (status: ConversationStatus) => void;
  onPriority: (priority: Priority) => void;
  onDragStart: () => void;
  onOpenDetails: () => void;
  onClaim: (() => void) | null;
}

function BoardCard({
  item,
  showOwner,
  ownerName,
  departmentName,
  departmentColor,
  noteCount,
  onMove,
  onPriority,
  onDragStart,
  onOpenDetails,
  onClaim,
}: CardProps) {
  const prio = priorityMeta(item.priority);
  const atrasada = isOverdue(item);
  const noLimite = isAtRisk(item.dueAt, item.slaMinutes);
  const restante = remainingLabel(item.dueAt);
  const isTask = item.kind === 'task';

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      className="rounded-xl border border-white/10 border-l-4 bg-[#1a1a2e] p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-[#8b5cf6]/40 transition-colors"
      style={{ borderLeftColor: prio.color }}
    >
      <button type="button" onClick={onOpenDetails} className="w-full flex items-start gap-2 text-left">
        {isTask ? (
          <div
            className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center bg-[#8b5cf6]/15 text-[#a78bfa]"
            aria-hidden
          >
            <ListChecks className="w-4 h-4" />
          </div>
        ) : (
          <div
            className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            aria-hidden
          >
            {initials(item.title)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
            {item.title}
            {item.recurring && <Repeat className="w-3 h-3 text-[#a78bfa] shrink-0" />}
          </p>
          <p className="text-[11px] text-gray-500 truncate">{item.subtitle}</p>
        </div>
        {item.channelType && (
          <ChannelBadge
            type={item.channelType}
            className="w-5 h-5 [&>svg]:w-3.5 [&>svg]:h-3.5 shrink-0"
          />
        )}
      </button>

      <div className="flex flex-wrap items-center gap-1">
        {item.priority !== 'normal' && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${prio.chipClass}`}>
            {prio.label}
          </span>
        )}
        {restante && item.status !== 'closed' && (
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              atrasada
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : noLimite
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  : 'bg-white/5 text-gray-400 border-white/10'
            }`}
            title={item.slaMinutes ? `Limite de ${slaLabel(item.slaMinutes)}` : 'Prazo'}
          >
            <CalendarClock className="w-3 h-3 shrink-0" />
            {restante}
          </span>
        )}
        {item.needsReply && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-red-500/15 text-red-400 border-red-500/30">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Sem resposta
          </span>
        )}
        {departmentName && departmentColor && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{
              background: `${departmentColor}22`,
              color: departmentColor,
              borderColor: `${departmentColor}55`,
            }}
          >
            {departmentName}
          </span>
        )}
        {ownerName ? (
          showOwner && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-white/5 text-gray-400 border-white/10">
              {ownerName.split(' ')[0]}
            </span>
          )
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/30">
            Sem dono
          </span>
        )}
        <span className="text-[10px] text-gray-500 ml-auto">{timeAgo(item.activityAt)}</span>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
        {onClaim ? (
          <button
            type="button"
            onClick={onClaim}
            className="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
          >
            <Hand className="w-3 h-3 shrink-0" />
            Assumir
          </button>
        ) : (
          <span className="truncate">
            {item.dueAt
              ? `Vence ${shortDate(item.dueAt)}`
              : item.assignedAt
                ? `Atribuída em ${shortDate(item.assignedAt)}`
                : 'Sem prazo'}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenDetails}
          className={`inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded transition-colors ${
            noteCount > 0
              ? 'text-[#a78bfa] bg-[#8b5cf6]/15 hover:bg-[#8b5cf6]/25'
              : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
          }`}
          title="Conversa interna da equipe"
        >
          <MessagesSquare className="w-3 h-3 shrink-0" />
          {noteCount > 0 ? noteCount : 'Recados'}
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <label className="sr-only" htmlFor={`prioridade-${item.id}`}>
          Prioridade de {item.title}
        </label>
        <select
          id={`prioridade-${item.id}`}
          value={item.priority}
          onChange={(e) => onPriority(e.target.value as Priority)}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          className="shrink-0 w-[76px] text-[11px] rounded-lg bg-white/5 border border-white/10 text-gray-300 px-1.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value} className="bg-[#1a1a2e]">
              {p.label}
            </option>
          ))}
        </select>
        {/* Seletor além do arrastar: no celular (PWA) não dá para arrastar entre colunas. */}
        <label className="sr-only" htmlFor={`mover-${item.id}`}>
          Mover {item.title}
        </label>
        <select
          id={`mover-${item.id}`}
          value={item.status}
          onChange={(e) => onMove(e.target.value as ConversationStatus)}
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
          className="flex-1 min-w-0 text-[11px] rounded-lg bg-white/5 border border-white/10 text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
        >
          {BOARD_COLUMNS.map((c) => (
            <option key={c.status} value={c.status} className="bg-[#1a1a2e]">
              {c.label}
            </option>
          ))}
        </select>
        {item.conversationId && (
          <Link
            href={`/inbox/${item.conversationId}`}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-[#8b5cf6]/20 text-[#a78bfa] hover:bg-[#8b5cf6]/30 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Abrir
          </Link>
        )}
      </div>
    </article>
  );
}

export default function QuadroPage() {
  const { me, members, departments, nameOfUser, department } = useTeamDirectory();
  const [owner, setOwner] = useState<string | 'todos' | 'ninguem'>('todos');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [kind, setKind] = useState<'tudo' | 'conversas' | 'tarefas'>('tudo');
  const [dragOver, setDragOver] = useState<ConversationStatus | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  // Guarda o card arrastado: alguns navegadores não entregam o dataTransfer no drop.
  const draggingId = useRef<string | null>(null);

  const filters = useMemo(
    () => ({ owner, departmentId: departmentId || undefined, kind }),
    [owner, departmentId, kind]
  );
  const {
    items,
    raw,
    noteCounts,
    loading,
    truncated,
    error,
    changeStatus,
    changePriority,
    claim,
    markSeen,
    reload,
  } = useBoard(filters);

  const byStatus = useMemo(() => {
    const map = new Map<ConversationStatus, BoardItem[]>();
    for (const column of BOARD_COLUMNS) map.set(column.status, []);
    for (const item of items) map.get(item.status)?.push(item);
    return map;
  }, [items]);

  const openItem = items.find((i) => i.id === openId) ?? null;
  const operadores = members.filter((m) => m.userId);
  const showOwnerFilter = me?.isManager || me?.scope === 'all';
  const atrasadas = items.filter((i) => isOverdue(i)).length;

  const abrirDetalhe = (item: BoardItem) => {
    setOpenId(item.id);
    // Carimba "o responsável viu" — é o que responde "ela já olhou?" sem perguntar.
    if (item.kind === 'task' && item.assignedTo === me?.userId) markSeen(item);
  };

  const selectClass =
    'text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]';

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d1a]" style={{ color: '#e2e8f0' }}>
      <header className="shrink-0 border-b border-white/10 bg-[#0a0a18] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <KanbanSquare className="w-5 h-5 text-[#a78bfa]" />
              Quadro
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Atendimentos e tarefas internas no mesmo lugar. Arraste o card ou use o seletor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#8b5cf6] hover:bg-[#7c3aed]"
          >
            <Plus className="w-4 h-4" />
            Nova tarefa
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <label htmlFor="filtro-tipo" className="sr-only">
            Tipo de card
          </label>
          <select
            id="filtro-tipo"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={selectClass}
          >
            <option value="tudo" className="bg-[#1a1a2e]">
              Tudo
            </option>
            <option value="conversas" className="bg-[#1a1a2e]">
              Só atendimentos
            </option>
            <option value="tarefas" className="bg-[#1a1a2e]">
              Só tarefas
            </option>
          </select>

          {showOwnerFilter && (
            <>
              <label htmlFor="filtro-operador" className="sr-only">
                Operador
              </label>
              <select
                id="filtro-operador"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className={selectClass}
              >
                <option value="todos" className="bg-[#1a1a2e]">
                  Toda a equipe
                </option>
                <option value="ninguem" className="bg-[#1a1a2e]">
                  Sem dono (fila)
                </option>
                {me?.userId && (
                  <option value={me.userId} className="bg-[#1a1a2e]">
                    Só as minhas
                  </option>
                )}
                {operadores
                  .filter((m) => m.userId !== me?.userId)
                  .map((m) => (
                    <option key={m.id} value={m.userId!} className="bg-[#1a1a2e]">
                      {m.fullName}
                    </option>
                  ))}
              </select>
            </>
          )}

          {departments.length > 1 && (
            <>
              <label htmlFor="filtro-departamento" className="sr-only">
                Departamento
              </label>
              <select
                id="filtro-departamento"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className={selectClass}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Todos os departamentos
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1a2e]">
                    {d.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <span className="text-xs text-gray-500 self-center">
            {items.length} card{items.length === 1 ? '' : 's'}
            {atrasadas > 0 && <span className="text-red-400"> · {atrasadas} atrasada(s)</span>}
            {truncated && ' · mostrando os 200 mais recentes de cada tipo'}
          </span>
        </div>
      </header>

      {error && (
        <p className="shrink-0 px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <p className="text-gray-400">Nada no quadro ainda.</p>
          <p className="text-xs text-gray-600 mt-1 max-w-sm">
            Um atendimento entra aqui quando ganha departamento ou dono. Uma tarefa interna
            entra assim que você criar — use o botão acima.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3">
          <div className="flex gap-3 h-full min-w-max md:min-w-0">
            {BOARD_COLUMNS.map((column) => {
              const cards = byStatus.get(column.status) ?? [];
              const isTarget = dragOver === column.status;
              return (
                <section
                  key={column.status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOver !== column.status) setDragOver(column.status);
                  }}
                  onDragLeave={() => setDragOver((s) => (s === column.status ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData('text/plain') || draggingId.current;
                    const dropped = items.find((i) => i.id === id);
                    if (dropped) changeStatus(dropped, column.status);
                  }}
                  className={`flex flex-col min-h-0 w-[280px] md:w-auto md:flex-1 rounded-xl border transition-colors ${
                    isTarget ? 'border-[#8b5cf6] bg-[#8b5cf6]/5' : 'border-white/5 bg-[#0f0f1e]'
                  }`}
                  aria-label={column.label}
                >
                  <div className="shrink-0 px-3 py-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: column.color }}
                        aria-hidden
                      />
                      <h2 className="text-sm font-semibold text-white">{column.label}</h2>
                      <span className="ml-auto text-[11px] font-medium text-gray-500">
                        {cards.length}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-0.5">{column.hint}</p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                    {cards.length === 0 && (
                      <p className="text-[11px] text-gray-600 text-center py-6">Vazio</p>
                    )}
                    {cards.map((item) => {
                      const dept = department(item.departmentId);
                      return (
                        <BoardCard
                          key={item.id}
                          item={item}
                          showOwner={owner === 'todos'}
                          ownerName={nameOfUser(item.assignedTo)}
                          departmentName={dept?.name ?? null}
                          departmentColor={dept?.color ?? null}
                          noteCount={noteCounts[item.id] ?? 0}
                          onOpenDetails={() => abrirDetalhe(item)}
                          onClaim={
                            !item.assignedTo && me?.userId ? () => claim(item, me.userId) : null
                          }
                          onDragStart={() => {
                            draggingId.current = item.id;
                          }}
                          onMove={(status) => changeStatus(item, status)}
                          onPriority={(priority) => changePriority(item, priority)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {openItem && (
        <TaskPanel
          item={openItem}
          task={openItem.kind === 'task' ? raw.tasks.find((t) => t.id === openItem.id) : null}
          conversation={
            openItem.kind === 'conversation'
              ? raw.conversations.find((c) => c.id === openItem.id)
              : null
          }
          onClose={() => setOpenId(null)}
          onMove={(status) => changeStatus(openItem, status)}
          onPriority={(priority) => changePriority(openItem, priority)}
        />
      )}

      {showNew && <TaskDialog onClose={() => setShowNew(false)} onCreated={reload} />}
    </div>
  );
}
