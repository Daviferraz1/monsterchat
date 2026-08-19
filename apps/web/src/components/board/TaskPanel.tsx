'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, MessageSquare, Paperclip, Repeat, Send, X } from 'lucide-react';
import { useInternalNotes } from '@/hooks/useInternalNotes';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';
import { BOARD_COLUMNS } from '@/lib/boardColumns';
import { PRIORITIES, priorityMeta, type Priority } from '@/lib/priority';
import { isOverdue, type BoardItem } from '@/lib/boardItem';
import { remainingLabel, slaLabel } from '@/lib/deadline';
import type { Conversation, ConversationStatus, Task } from '@/types';

interface TaskPanelProps {
  item: BoardItem;
  /** Registro cru, para os campos que só existem em um dos tipos. */
  task?: Task | null;
  conversation?: Conversation | null;
  onClose: () => void;
  onMove: (status: ConversationStatus) => void;
  onPriority: (priority: Priority) => void;
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Detalhe do card — serve conversa e tarefa.
 *
 * A parte de baixo é a conversa interna da equipe sobre aquele item, separada do
 * que o aluno vê. É o mesmo componente para os dois tipos de propósito: recado e
 * anexo têm que se comportar igual, venha o card de onde vier.
 */
export function TaskPanel({
  item,
  task,
  conversation,
  onClose,
  onMove,
  onPriority,
}: TaskPanelProps) {
  const { nameOfUser, department, me } = useTeamDirectory();
  const { notes, loading, sending, error, addNote } = useInternalNotes(
    item.kind === 'task' ? { taskId: item.id } : { conversationId: item.id }
  );
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [notes.length]);

  const dept = department(item.departmentId);
  const ownerName = nameOfUser(item.assignedTo);
  const prio = priorityMeta(item.priority);
  const atrasada = isOverdue(item);

  const submit = async () => {
    const ok = await addNote(text, file);
    if (ok) {
      setText('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes de ${item.title}`}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0f0f1e] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-start justify-between gap-2 p-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="font-semibold text-white truncate flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: prio.color }}
                aria-hidden
              />
              {item.title}
              {item.recurring && <Repeat className="w-3.5 h-3.5 text-[#a78bfa] shrink-0" />}
            </h2>
            <p className="text-[11px] text-gray-500">
              {item.kind === 'task' ? 'Tarefa interna' : 'Atendimento'} · {ownerName ?? 'sem dono'}
              {dept ? ` · ${dept.name}` : ' · sem departamento'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="shrink-0 px-4 py-3 border-b border-white/10 space-y-2">
          {item.kind === 'task' && task?.description && (
            <p className="text-xs text-gray-300 whitespace-pre-wrap">{task.description}</p>
          )}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div>
              <dt className="text-gray-500">Atribuída em</dt>
              <dd className="text-gray-200">{formatDateTime(item.assignedAt)}</dd>
            </div>
            {item.kind === 'task' ? (
              <>
                <div>
                  <dt className="text-gray-500">
                    Prazo{item.slaMinutes ? ` · limite de ${slaLabel(item.slaMinutes)}` : ''}
                  </dt>
                  <dd className={atrasada ? 'text-red-400 font-medium' : 'text-gray-200'}>
                    {formatDateTime(item.dueAt)}
                    {item.status !== 'closed' && remainingLabel(item.dueAt)
                      ? ` · ${remainingLabel(item.dueAt)}`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Aberta por</dt>
                  <dd className="text-gray-200">{nameOfUser(task?.created_by) ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Responsável viu</dt>
                  <dd className="text-gray-200">
                    {task?.first_seen_at ? formatDateTime(task.first_seen_at) : 'ainda não'}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="text-gray-500">Última mensagem</dt>
                  <dd className="text-gray-200">{formatDateTime(conversation?.last_message_at)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">1ª resposta</dt>
                  <dd className="text-gray-200">
                    {formatDateTime(conversation?.first_response_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Conversa criada</dt>
                  <dd className="text-gray-200">{formatDateTime(conversation?.created_at)}</dd>
                </div>
              </>
            )}
          </dl>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <label htmlFor="painel-status" className="sr-only">
              Andamento
            </label>
            <select
              id="painel-status"
              value={item.status}
              onChange={(e) => onMove(e.target.value as ConversationStatus)}
              className="flex-1 min-w-[120px] text-xs rounded-lg bg-white/5 border border-white/10 text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
            >
              {BOARD_COLUMNS.map((c) => (
                <option key={c.status} value={c.status} className="bg-[#1a1a2e]">
                  {c.label}
                </option>
              ))}
            </select>
            <label htmlFor="painel-prioridade" className="sr-only">
              Prioridade
            </label>
            <select
              id="painel-prioridade"
              value={item.priority}
              onChange={(e) => onPriority(e.target.value as Priority)}
              className="shrink-0 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value} className="bg-[#1a1a2e]">
                  {p.label}
                </option>
              ))}
            </select>
            {item.conversationId && (
              <Link
                href={`/inbox/${item.conversationId}`}
                className="shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-[#8b5cf6]/20 text-[#a78bfa] hover:bg-[#8b5cf6]/30"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {item.kind === 'task' ? 'Conversa do aluno' : 'Abrir conversa'}
              </Link>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            Conversa da equipe · o aluno não vê
          </p>

          {loading && (
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando…
            </p>
          )}

          {!loading && notes.length === 0 && (
            <p className="text-xs text-gray-600">
              Nada por aqui ainda. Use este espaço para combinar quem faz o quê e deixar
              registrado.
            </p>
          )}

          {notes.map((note) => {
            const mine = !!note.author_id && note.author_id === me?.userId;
            const author = note.author_id ? nameOfUser(note.author_id) ?? 'Operador' : 'Sistema';
            const isImage = (note.media_mime_type ?? '').startsWith('image/');
            // Anexo interno é privado: passa pela rota que assina a URL na hora.
            const href = note.media_path
              ? `/api/internal-files?path=${encodeURIComponent(note.media_path)}`
              : note.media_url;
            return (
              <article
                key={note.id}
                className={`rounded-xl border p-2.5 ${
                  mine
                    ? 'border-[#8b5cf6]/30 bg-[#8b5cf6]/10 ml-6'
                    : 'border-white/10 bg-[#1a1a2e] mr-6'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-gray-200 truncate">
                    {mine ? 'Você' : author}
                  </span>
                  <span className="text-[10px] text-gray-500 shrink-0">
                    {formatDateTime(note.created_at)}
                  </span>
                </div>
                {note.body && (
                  <p className="text-xs text-gray-300 whitespace-pre-wrap break-words mt-1">
                    {note.body}
                  </p>
                )}
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={href}
                        alt={note.media_filename ?? 'Anexo'}
                        className="max-h-40 rounded-lg border border-white/10"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[#a78bfa] hover:bg-white/10">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[200px]">
                          {note.media_filename ?? 'Anexo'}
                        </span>
                        <span className="text-gray-500">{formatSize(note.media_size)}</span>
                      </span>
                    )}
                  </a>
                )}
              </article>
            );
          })}
          <div ref={bottom} />
        </div>

        <footer className="shrink-0 border-t border-white/10 p-3 space-y-2">
          {error && <p className="text-[11px] text-red-400">{error}</p>}
          {file && (
            <div className="flex items-center gap-2 text-[11px] text-gray-300 bg-white/5 rounded-lg px-2 py-1.5">
              <Paperclip className="w-3.5 h-3.5 shrink-0 text-[#a78bfa]" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-gray-500">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
                className="text-gray-400 hover:text-white"
                aria-label="Remover anexo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              id="anexo-interno"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="anexo-interno"
              className="shrink-0 p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer"
              title="Anexar arquivo (máx. 50 MB)"
            >
              <Paperclip className="w-4 h-4" />
              <span className="sr-only">Anexar arquivo</span>
            </label>
            <label htmlFor="recado-interno" className="sr-only">
              Recado para a equipe
            </label>
            <textarea
              id="recado-interno"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Escreva para a equipe… (Enter envia)"
              className="flex-1 min-w-0 resize-none text-xs rounded-lg bg-white/5 border border-white/10 text-gray-200 placeholder-gray-500 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6] max-h-24"
            />
            <button
              type="button"
              onClick={submit}
              disabled={sending || (!text.trim() && !file)}
              className="shrink-0 p-2 rounded-lg bg-[#8b5cf6] text-white disabled:opacity-40 hover:bg-[#7c3aed]"
              aria-label="Enviar recado"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
