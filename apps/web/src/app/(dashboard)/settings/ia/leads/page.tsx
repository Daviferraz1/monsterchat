'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, Users, Loader2, MessageCircle, Check, Search } from 'lucide-react';

interface Lead {
  contactId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  interesse: string | null;
  motivo: string | null;
  obs: string | null;
  at: string | null;
  conversationId: string | null;
}

const MOTIVO_LABEL: Record<string, string> = {
  curso_indisponivel: 'Curso indisponível',
  aguardando_edital: 'Aguardando edital',
  follow_up: 'Follow-up',
  outro: 'Outro',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [resolving, setResolving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/leads');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setLeads(data.leads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.interesse, l.name, l.phone, l.email, l.motivo]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [leads, query]);

  const resolve = async (contactId: string) => {
    if (!confirm('Concluir este lead? Ele sai da lista de follow-up.')) return;
    setResolving(contactId);
    try {
      const res = await fetch(`/api/ia/leads?contactId=${encodeURIComponent(contactId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha');
      setLeads((prev) => prev.filter((l) => l.contactId !== contactId));
    } catch {
      alert('Falha ao concluir o lead.');
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-2">
          <Link
            href="/settings/ia"
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-[#7c3aed]" />
            Leads para follow-up
          </h1>
        </div>
        <p className="text-gray-600 text-sm mb-6">
          Contatos que a IA classificou para retorno futuro (ex.: curso ainda não disponível). Abra a conversa para
          contatar e conclua quando resolver.
        </p>

        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por concurso, nome, telefone..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
          />
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-600 py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {leads.length === 0
              ? 'Nenhum lead para follow-up ainda. A IA registra aqui quando promete avisar o aluno depois.'
              : 'Nenhum lead corresponde ao filtro.'}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              {filtered.length} lead{filtered.length > 1 ? 's' : ''}
            </p>
            <ul className="space-y-3">
              {filtered.map((l) => (
                <li
                  key={l.contactId}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-gray-200 bg-white"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{l.name || l.phone || 'Contato'}</span>
                      {l.interesse && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                          {l.interesse}
                        </span>
                      )}
                      {l.motivo && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          {MOTIVO_LABEL[l.motivo] ?? l.motivo}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {[l.phone, l.email].filter(Boolean).join(' · ')}
                      {l.at && <span className="text-gray-400"> · {formatDate(l.at)}</span>}
                    </p>
                    {l.obs && <p className="text-xs text-gray-500 mt-0.5">{l.obs}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {l.conversationId && (
                      <Link
                        href={`/inbox/${l.conversationId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] text-sm font-medium"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Abrir conversa
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => resolve(l.contactId)}
                      disabled={resolving === l.contactId}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
                      title="Concluir (remover da lista)"
                    >
                      {resolving === l.contactId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      Concluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
