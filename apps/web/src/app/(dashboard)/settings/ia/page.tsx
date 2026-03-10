'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bot, BookOpen, Loader2, BarChart3, MessageSquare, Database, Package } from 'lucide-react';

interface IAStats {
  conversationsAnalyzed: number;
  knowledgeEntries: number;
  byBrand: Array<{ brand: string; total: number; avg_quality?: number; avg_response_time_s?: number }>;
}

export default function IAPage() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IAStats | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [autopilotRes, statsRes] = await Promise.all([
        fetch('/api/ia/autopilot'),
        fetch('/api/ia/stats'),
      ]);
      const autopilotData = await autopilotRes.json().catch(() => ({}));
      const statsData = await statsRes.json().catch(() => ({}));

      setStats({
        conversationsAnalyzed: statsData.conversationsAnalyzed ?? 0,
        knowledgeEntries: statsData.knowledgeEntries ?? 0,
        byBrand: statsData.byBrand ?? [],
      });

      if (!autopilotRes.ok) throw new Error(autopilotData.error || 'Falha ao carregar');
      setEnabled(autopilotData.enabled === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setEnabled(!enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-7 h-7 text-[#7c3aed]" />
          IA Atendimento
        </h1>
        <p className="text-gray-600 mt-1 text-sm">
          Com piloto ativo, a IA responde direto ao aluno no WhatsApp. Escalonamento para humano quando necessário. Catálogo de produtos alimenta as respostas.
        </p>

        <div className="mt-4 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Como ativar a IA para responder aos alunos</h2>
          <ol className="text-sm text-gray-700 list-decimal list-inside space-y-1">
            <li>Abra <strong>Configurações</strong> (menu) → <strong>IA Atendimento</strong>.</li>
            <li>Ative o <strong>Piloto automático</strong> (toggle abaixo).</li>
            <li>Com o piloto ativo, toda mensagem de texto recebida no WhatsApp será respondida pela IA (com base no catálogo e nas regras). O aluno não precisa fazer nada — a IA responde direto.</li>
          </ol>
          <p className="text-xs text-gray-600 mt-2">Certifique-se de ter produtos no <strong>Catálogo</strong> e variáveis <code className="bg-white/60 px-1 rounded">ANTHROPIC_API_KEY</code> e Supabase configuradas no ambiente.</p>
        </div>

        {/* Resumo da IA */}
        {stats && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#7c3aed]" />
              Resumo da IA
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200">
                <MessageSquare className="w-8 h-8 text-[#7c3aed] shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.conversationsAnalyzed}</p>
                  <p className="text-xs text-gray-600">Conversas analisadas</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200">
                <Database className="w-8 h-8 text-[#7c3aed] shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.knowledgeEntries}</p>
                  <p className="text-xs text-gray-600">Entradas na base</p>
                </div>
              </div>
            </div>
            {stats.byBrand.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Por marca</p>
                <div className="flex flex-wrap gap-3">
                  {stats.byBrand.map((b: { brand: string; total: number; avg_quality?: number }) => (
                    <span
                      key={b.brand}
                      className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-800"
                    >
                      {b.brand === 'monster' ? 'Monster' : b.brand === 'fagenius' ? 'FAGENIUS' : b.brand}: {Number(b.total)} conversas
                      {b.avg_quality != null && ` · qualidade ${Number(b.avg_quality)}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Piloto automático</h2>
            <p className="text-gray-600 text-sm mb-4">
              Quando ativo, a IA responde direto ao aluno no WhatsApp (com base no catálogo e nas regras de atendimento). Se o operador enviar uma mensagem manual, a IA para de responder naquela conversa até ser reativada.
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={handleToggle}
                  disabled={saving}
                  className="rounded border-gray-400 bg-white text-[#7c3aed] focus:ring-[#7c3aed]"
                />
                <span className="text-gray-900 font-medium">
                  {enabled ? 'Piloto automático ativo' : 'Piloto automático desativado'}
                </span>
                {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
              </label>
            )}
            {error && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#7c3aed]" />
              Catálogo de produtos
            </h2>
            <p className="text-gray-700 text-sm mb-4">
              Cursos e produtos (Monster / FAGENIUS) que a IA usa para responder sobre preços, links de checkout e disponibilidade.
            </p>
            <Link
              href="/settings/ia/catalog"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-colors font-medium shadow-sm"
            >
              <Package className="w-5 h-5" />
              Gerenciar catálogo
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#7c3aed]" />
              Base de conhecimento
            </h2>
            <p className="text-gray-700 text-sm mb-4">
              Perguntas-tipo e respostas ouro geradas pelo batch (phase:all). Usada para melhoria semanal com feedback do operador.
            </p>
            <Link
              href="/settings/ia/knowledge"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#7c3aed] text-[#7c3aed] hover:bg-[#7c3aed] hover:text-white transition-colors font-medium"
            >
              <BookOpen className="w-5 h-5" />
              Ver base de conhecimento
            </Link>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Primeira vez?</h2>
            <p className="text-gray-700 text-sm mb-3">
              Para criar a base a partir das conversas já salvas no banco, execute <strong className="text-gray-900">uma vez</strong> no terminal (na raiz do projeto):
            </p>
            <code className="block p-3 rounded-lg bg-gray-900 text-amber-100 text-sm overflow-x-auto font-mono">
              npm run phase:all --workspace=ia-atendimento-monster
            </code>
            <p className="text-gray-600 text-xs mt-2">
              Certifique-se de ter rodado as migrações 022 e 023 no Supabase (SQL Editor) e de configurar o .env do projeto com SUPABASE_URL, SUPABASE_SERVICE_KEY e ANTHROPIC_API_KEY.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
