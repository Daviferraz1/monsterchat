'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bot, BookOpen, Loader2, BarChart3, MessageSquare, Database, Package, MessageCircle, Users, Sparkles } from 'lucide-react';

interface IAStats {
  conversationsAnalyzed: number;
  knowledgeEntries: number;
  byBrand: Array<{ brand: string; total: number; avg_quality?: number; avg_response_time_s?: number }>;
}

export default function IAPage() {
  const [enabled, setEnabled] = useState(false);
  const [suggestionEnabled, setSuggestionEnabled] = useState(false);
  const [suggestionAiEnabled, setSuggestionAiEnabled] = useState(true);
  const [learnFromFeedbackUseAi, setLearnFromFeedbackUseAi] = useState(true);
  const [learnOperatorStyle, setLearnOperatorStyle] = useState(true);
  const [agentModel, setAgentModel] = useState('claude-sonnet-4-6');
  const [agentModelOptions, setAgentModelOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<IAStats | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

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
      setSuggestionEnabled(autopilotData.suggestionEnabled === true);
      setSuggestionAiEnabled(autopilotData.suggestionAiEnabled !== false);
      setLearnFromFeedbackUseAi(autopilotData.learnFromFeedbackUseAi !== false);
      setLearnOperatorStyle(autopilotData.learnOperatorStyle !== false);
      setAgentModel(autopilotData.agentModel || 'claude-sonnet-4-6');
      setAgentModelOptions(autopilotData.agentModelOptions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleAutopilot = async () => {
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
      setEnabled(data.enabled === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuggestion = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionEnabled: !suggestionEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setSuggestionEnabled(data.suggestionEnabled === true);
      if (data.suggestionAiEnabled !== undefined) setSuggestionAiEnabled(data.suggestionAiEnabled !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSuggestionAI = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionAiEnabled: !suggestionAiEnabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setSuggestionAiEnabled(data.suggestionAiEnabled !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLearnFromFeedbackUseAi = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnFromFeedbackUseAi: !learnFromFeedbackUseAi }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setLearnFromFeedbackUseAi(data.learnFromFeedbackUseAi !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLearnOperatorStyle = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnOperatorStyle: !learnOperatorStyle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      setLearnOperatorStyle(data.learnOperatorStyle !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeModel = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentModel: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      if (data.agentModel) setAgentModel(data.agentModel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const handleBackfillEmbeddings = async () => {
    setBackfilling(true);
    setBackfillMsg('Gerando embeddings...');
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    try {
      let total = 0;
      for (let i = 0; i < 200; i++) {
        const res = await fetch('/api/ia/embeddings/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 100 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setBackfillMsg(data.error || 'Falha ao gerar embeddings.');
          return;
        }
        total += data.processed ?? 0;
        if (data.rateLimited) {
          setBackfillMsg(
            `Limite do plano grátis do Gemini atingido. Geradas ${total} • ainda faltam ${data.remaining ?? 0}. Aguarde alguns minutos e clique de novo, ou ative o faturamento no Google AI Studio para gerar tudo de uma vez.`
          );
          return;
        }
        if (data.done) {
          setBackfillMsg(`Concluído: ${total} entradas indexadas para busca semântica.`);
          return;
        }
        setBackfillMsg(`Geradas ${total} • restam ${data.remaining ?? 0}...`);
        await sleep(600);
      }
      setBackfillMsg(`Geradas ${total}. Clique novamente para continuar (base grande).`);
    } catch {
      setBackfillMsg('Erro ao gerar embeddings.');
    } finally {
      setBackfilling(false);
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
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#7c3aed]" />
              IA responde
            </h2>
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
                  onChange={handleToggleAutopilot}
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

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[#7c3aed]" />
              Sugestão de mensagem
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Quando ativo, o atendente vê sugestões de resposta no chat com base na última mensagem do lead e na base de conhecimento. O atendente escolhe se usa ou não a sugestão.
            </p>
            {loading ? (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : (
              <>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={suggestionEnabled}
                    onChange={handleToggleSuggestion}
                    disabled={saving}
                    className="rounded border-gray-400 bg-white text-[#7c3aed] focus:ring-[#7c3aed]"
                  />
                  <span className="text-gray-900 font-medium">
                    {suggestionEnabled ? 'Sugestão ativa' : 'Sugestão desativada'}
                  </span>
                  {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
                </label>
                {suggestionEnabled && (
                  <div className="mt-4 pl-7 border-l-2 border-[#7c3aed]/30">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={suggestionAiEnabled}
                        onChange={handleToggleSuggestionAI}
                        disabled={saving}
                        className="rounded border-gray-400 bg-white text-[#7c3aed] focus:ring-[#7c3aed]"
                      />
                      <span className="text-gray-800 text-sm">
                        Usar IA nas sugestões
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-7">
                      Quando ativo, a IA analisa o contexto e gera a sugestão. Quando desativado, usa apenas base de conhecimento e catálogo (sem IA).
                    </p>
                    {suggestionAiEnabled && (
                      <div className="mt-4 ml-7">
                        <label htmlFor="agent-model" className="block text-sm font-medium text-gray-800 mb-1">
                          Modelo da IA
                        </label>
                        <select
                          id="agent-model"
                          value={agentModel}
                          onChange={(e) => handleChangeModel(e.target.value)}
                          disabled={saving}
                          className="w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:ring-[#7c3aed] focus:border-[#7c3aed] disabled:opacity-60"
                        >
                          {agentModelOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Gemini (Google) é mais barato; Claude Sonnet tem a melhor qualidade. Vale para a sugestão do copiloto. Gemini exige <code className="bg-gray-100 px-1 rounded">GEMINI_API_KEY</code> no ambiente; Claude exige <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code>.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
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
              Perguntas-tipo e respostas ouro. Quando o atendente não usa a sugestão, o sistema pode salvar automaticamente a pergunta e a resposta na base.
            </p>
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={learnFromFeedbackUseAi}
                onChange={handleToggleLearnFromFeedbackUseAi}
                disabled={saving}
                className="mt-1 rounded border-gray-300 text-[#7c3aed] focus:ring-[#7c3aed]"
              />
              <span className="text-gray-800 text-sm">
                Usar IA ao salvar automaticamente
              </span>
            </label>
            <p className="text-xs text-gray-500 mb-4 ml-7">
              Quando ativo, o Claude normaliza a pergunta e a resposta antes de salvar. Quando desativado, salva a pergunta e a resposta do atendente como estão (sem IA).
            </p>

            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-800 mb-1">Busca semântica (embeddings)</p>
              <p className="text-xs text-gray-500 mb-3">
                Gera os embeddings das entradas já existentes para a IA encontrar respostas mesmo com sinônimos ou outras palavras. Rode uma vez após configurar a <code className="bg-gray-100 px-1 rounded">GEMINI_API_KEY</code> e a migração 030.
              </p>
              <button
                type="button"
                onClick={handleBackfillEmbeddings}
                disabled={backfilling}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60 transition-colors text-sm font-medium"
              >
                {backfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                {backfilling ? 'Gerando...' : 'Gerar embeddings da base'}
              </button>
              {backfillMsg && <p className="text-xs text-gray-600 mt-2">{backfillMsg}</p>}
            </div>

            <Link
              href="/settings/ia/knowledge"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#7c3aed] text-[#7c3aed] hover:bg-[#7c3aed] hover:text-white transition-colors font-medium"
            >
              <BookOpen className="w-5 h-5" />
              Ver base de conhecimento
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#7c3aed]" />
              Padrão do atendente
            </h2>
            <p className="text-gray-700 text-sm mb-4">
              Quando o atendente responde diferente da sugestão, a IA compara as duas mensagens e aprende o jeito da
              equipe (tamanho, tom, o que mandar junto, o que nunca dizer). Nas próximas sugestões ela já segue esse
              padrão.
            </p>
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={learnOperatorStyle}
                onChange={handleToggleLearnOperatorStyle}
                disabled={saving}
                className="mt-1 rounded border-gray-300 text-[#7c3aed] focus:ring-[#7c3aed]"
              />
              <span className="text-gray-800 text-sm">Aprender o padrão do atendente automaticamente</span>
            </label>
            <Link
              href="/settings/ia/estilo"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#7c3aed] text-[#7c3aed] hover:bg-[#7c3aed] hover:text-white transition-colors font-medium"
            >
              <Sparkles className="w-5 h-5" />
              Ver o que a IA aprendeu
            </Link>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#7c3aed]" />
              Leads para follow-up
            </h2>
            <p className="text-gray-700 text-sm mb-4">
              Contatos que a IA classificou para retorno futuro (ex.: curso que o aluno quer ainda não está disponível). A equipe contata quando houver novidade.
            </p>
            <Link
              href="/settings/ia/leads"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#7c3aed] text-[#7c3aed] hover:bg-[#7c3aed] hover:text-white transition-colors font-medium"
            >
              <Users className="w-5 h-5" />
              Ver leads
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
