'use client';

import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { AssignmentFilter, ChannelTypeFilter, RepliedFilter, UnreadFilter } from '@/hooks/useConversations';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';

interface InboxFiltersProps {
  filters: {
    status?: string;
    assigned_to?: string;
    channel_id?: string;
    channel_type?: ChannelTypeFilter;
    replied?: RepliedFilter;
    unread?: UnreadFilter;
    department_id?: string;
    assignment?: AssignmentFilter;
    search?: string;
  };
  onFiltersChange: (filters: InboxFiltersProps['filters']) => void;
  /** Quantidade de conversas não respondidas (badge vermelho no chip). */
  notRepliedCount?: number;
}

/**
 * Filtros do inbox.
 *
 * Ficam recolhidos de propósito: a coluna é estreita e a lista de conversas é o
 * que importa. Só os dois atalhos que a equipe usa o dia inteiro ficam à vista —
 * o resto vira seletor dentro do painel, que ocupa duas linhas em vez de oito.
 */
export function InboxFilters({ filters, onFiltersChange, notRepliedCount = 0 }: InboxFiltersProps) {
  const { departments, me } = useTeamDirectory();
  const [open, setOpen] = useState(false);

  const channelType = filters.channel_type ?? 'all';
  const assignment = filters.assignment ?? 'all';
  const departmentId = filters.department_id ?? '';
  const status = filters.status ?? '';
  const replied = filters.replied ?? 'all';
  const search = filters.search ?? '';

  const showDepartments =
    departments.length > 1 && (me?.scope === 'all' || (me?.departmentIds.length ?? 0) > 1);

  // Status e "respondido" são a mesma pergunta para quem atende, então viram um
  // seletor só — era o que mais confundia com dois grupos de chips separados.
  const marcadas = filters.unread === 'marked';
  const statusValue = marcadas
    ? 'marked'
    : replied === 'replied'
      ? 'replied'
      : replied === 'not_replied'
        ? 'not_replied'
        : status === 'closed'
          ? 'finalized'
          : status === 'open'
            ? 'open'
            : 'all';

  const applyStatus = (key: string) => {
    const map: Record<string, InboxFiltersProps['filters']> = {
      all: { status: undefined, replied: 'all', unread: 'all' },
      open: { status: 'open', replied: 'all', unread: 'all' },
      not_replied: { status: undefined, replied: 'not_replied', unread: 'all' },
      replied: { status: undefined, replied: 'replied', unread: 'all' },
      marked: { status: undefined, replied: 'all', unread: 'marked' },
      finalized: { status: 'closed', replied: 'all', unread: 'all' },
    };
    onFiltersChange({ ...filters, ...(map[key] ?? map.all) });
  };

  const ativos =
    (channelType !== 'all' ? 1 : 0) +
    (departmentId ? 1 : 0) +
    (assignment !== 'all' ? 1 : 0) +
    (statusValue !== 'all' ? 1 : 0);

  const limpar = () =>
    onFiltersChange({
      ...filters,
      channel_type: 'all',
      department_id: undefined,
      assignment: 'all',
      status: undefined,
      replied: 'all',
      unread: 'all',
    });

  const chip = (selected: boolean) =>
    `shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      selected
        ? 'bg-[rgba(139,92,246,0.2)] text-[#a78bfa]'
        : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
    }`;

  const select =
    'w-full text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]';
  const legend = 'block text-[10px] uppercase tracking-wider text-gray-500 mb-1';

  return (
    <div className="p-3 border-b border-white/5 space-y-2 bg-[#0f0f1e]">
      <div>
        <label htmlFor="inbox-search" className="sr-only">
          Pesquisar conversa
        </label>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            aria-hidden
          />
          <input
            id="inbox-search"
            type="search"
            placeholder="Pesquisar por nome, telefone, @..."
            value={search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
          />
        </div>
      </div>

      {/* Atalhos do dia a dia + acesso ao resto */}
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => applyStatus(statusValue === 'not_replied' ? 'all' : 'not_replied')}
          className={chip(statusValue === 'not_replied')}
        >
          Não respondido
          {notRepliedCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
              {notRepliedCount > 99 ? '99+' : notRepliedCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() =>
            onFiltersChange({ ...filters, assignment: assignment === 'mine' ? 'all' : 'mine' })
          }
          className={chip(assignment === 'mine')}
        >
          Minhas
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={chip(open || ativos > 0)}
          aria-expanded={open}
          aria-controls="inbox-filtros"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filtros
          {ativos > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-[#8b5cf6] text-white">
              {ativos}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div id="inbox-filtros" className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label htmlFor="filtro-status" className={legend}>
              Status
            </label>
            <select
              id="filtro-status"
              value={statusValue}
              onChange={(e) => applyStatus(e.target.value)}
              className={select}
            >
              <option value="all" className="bg-[#1a1a2e]">
                Todas
              </option>
              <option value="open" className="bg-[#1a1a2e]">
                Abertas
              </option>
              <option value="not_replied" className="bg-[#1a1a2e]">
                Não respondido
              </option>
              <option value="replied" className="bg-[#1a1a2e]">
                Respondido
              </option>
              <option value="marked" className="bg-[#1a1a2e]">
                Marcadas como não lidas
              </option>
              <option value="finalized" className="bg-[#1a1a2e]">
                Finalizadas
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="filtro-fila" className={legend}>
              Fila
            </label>
            <select
              id="filtro-fila"
              value={assignment}
              onChange={(e) =>
                onFiltersChange({ ...filters, assignment: e.target.value as AssignmentFilter })
              }
              className={select}
            >
              <option value="all" className="bg-[#1a1a2e]">
                Todas
              </option>
              <option value="mine" className="bg-[#1a1a2e]">
                Minhas
              </option>
              <option value="unassigned" className="bg-[#1a1a2e]">
                Sem dono
              </option>
            </select>
          </div>

          <div>
            <label htmlFor="filtro-canal" className={legend}>
              Canal
            </label>
            <select
              id="filtro-canal"
              value={channelType}
              onChange={(e) =>
                onFiltersChange({ ...filters, channel_type: e.target.value as ChannelTypeFilter })
              }
              className={select}
            >
              <option value="all" className="bg-[#1a1a2e]">
                Todos
              </option>
              <option value="whatsapp" className="bg-[#1a1a2e]">
                WhatsApp
              </option>
              <option value="whatsapp_baileys" className="bg-[#1a1a2e]">
                WhatsApp Web
              </option>
              <option value="instagram" className="bg-[#1a1a2e]">
                Instagram
              </option>
            </select>
          </div>

          {showDepartments && (
            <div>
              <label htmlFor="filtro-depto" className={legend}>
                Departamento
              </label>
              <select
                id="filtro-depto"
                value={departmentId}
                onChange={(e) =>
                  onFiltersChange({ ...filters, department_id: e.target.value || undefined })
                }
                className={select}
              >
                <option value="" className="bg-[#1a1a2e]">
                  Todos
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1a2e]">
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {ativos > 0 && (
            <button
              type="button"
              onClick={limpar}
              className="col-span-2 inline-flex items-center justify-center gap-1 text-[11px] text-gray-400 hover:text-white py-1"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
