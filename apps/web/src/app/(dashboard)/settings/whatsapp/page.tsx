'use client';

/**
 * Respostas automáticas do WhatsApp por palavra-chave.
 *
 * Quem chega pelo botão "Receber no WhatsApp" das páginas do site já vem com uma
 * frase pronta; a regra casa essa frase e manda o material na hora, sem esperar
 * atendente. Esta tela deixa a equipe criar regras para outros concursos sem
 * precisar mexer no banco.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react';

interface Regra {
  id: string;
  nome: string;
  palavras: string[];
  mensagem: string;
  ativo: boolean;
  apenas_uma_vez: boolean;
  channel_id: string | null;
  atendidos_30d: number;
}

interface Canal {
  id: string;
  name: string;
}

interface Form {
  nome: string;
  palavras: string;
  mensagem: string;
  apenas_uma_vez: boolean;
  channel_id: string;
}

const VAZIO: Form = {
  nome: '',
  palavras: '',
  mensagem: '',
  apenas_uma_vez: true,
  channel_id: '',
};

export default function AutomacaoWhatsappPage() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [canais, setCanais] = useState<Canal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | 'nova' | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/whatsapp/regras');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Não foi possível carregar as regras.');
      setRegras(d.regras);
      setCanais(d.canais);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abrir = (r?: Regra) => {
    setErro(null);
    if (r) {
      setEditando(r.id);
      setForm({
        nome: r.nome,
        palavras: r.palavras.join(', '),
        mensagem: r.mensagem,
        apenas_uma_vez: r.apenas_uma_vez,
        channel_id: r.channel_id ?? '',
      });
    } else {
      setEditando('nova');
      setForm(VAZIO);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = {
        nome: form.nome,
        palavras: form.palavras.split(',').map((p) => p.trim()).filter(Boolean),
        mensagem: form.mensagem,
        apenas_uma_vez: form.apenas_uma_vez,
        channel_id: form.channel_id || null,
      };
      const r = await fetch(editando === 'nova' ? '/api/whatsapp/regras' : `/api/whatsapp/regras/${editando}`, {
        method: editando === 'nova' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Não foi possível salvar.');
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  const alternar = async (r: Regra) => {
    await fetch(`/api/whatsapp/regras/${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !r.ativo }),
    });
    carregar();
  };

  const excluir = async (r: Regra) => {
    if (!window.confirm(`Excluir a regra "${r.nome}"? O histórico de envios dela também sai.`)) return;
    await fetch(`/api/whatsapp/regras/${r.id}`, { method: 'DELETE' });
    carregar();
  };

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#7c3aed] mb-4">
            <ArrowLeft className="w-4 h-4" /> Configurações
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MessageCircle className="w-7 h-7 text-emerald-600" />
                Respostas automáticas do WhatsApp
              </h1>
              <p className="mt-1 text-sm text-gray-600 max-w-xl">
                Quando a mensagem do contato tiver uma das palavras ou frases da regra, o material é
                enviado na hora. A IA não responde em cima da mesma mensagem.
              </p>
            </div>
            <button
              onClick={() => abrir()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="w-4 h-4" /> Nova regra
            </button>
          </div>
        </div>

        {erro && !editando && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>
        )}

        {editando && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editando === 'nova' ? 'Nova regra' : 'Editar regra'}
              </h2>
              <button onClick={() => setEditando(null)} aria-label="Fechar" className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Nome da regra</span>
              <input
                id="wa-regra-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: PM PE - edital verticalizado"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Palavras ou frases que disparam (separe por vírgula)</span>
              <p className="text-xs text-gray-500 mb-1">
                Maiúscula e acento não importam. A frase precisa aparecer inteira na mensagem.
              </p>
              <input
                id="wa-regra-palavras"
                value={form.palavras}
                onChange={(e) => setForm({ ...form, palavras: e.target.value })}
                placeholder="edital verticalizado da pm pe, edital pmpe"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Mensagem enviada</span>
              <p className="text-xs text-gray-500 mb-1">Os links recebem UTM automaticamente.</p>
              <textarea
                id="wa-regra-mensagem"
                value={form.mensagem}
                onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                rows={8}
                maxLength={3500}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            {canais.length > 1 && (
              <label className="block text-sm">
                <span className="font-medium text-gray-800">Número</span>
                <select
                  id="wa-regra-canal"
                  value={form.channel_id}
                  onChange={(e) => setForm({ ...form, channel_id: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="">Todos os números</option>
                  {canais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input
                id="wa-regra-uma-vez"
                type="checkbox"
                checked={form.apenas_uma_vez}
                onChange={(e) => setForm({ ...form, apenas_uma_vez: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-gray-800">Enviar só uma vez por contato</span>
                <span className="block text-xs text-gray-500">
                  Recomendado para material: quem já recebeu não recebe de novo a cada mensagem parecida.
                </span>
              </span>
            </label>

            {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditando(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {salvando ? 'Salvando…' : 'Salvar regra'}
              </button>
            </div>
          </div>
        )}

        {carregando ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : regras.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            Nenhuma regra ainda. Crie a primeira para responder automaticamente no WhatsApp.
          </div>
        ) : (
          <ul className="space-y-3">
            {regras.map((r) => (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{r.nome}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          r.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {r.ativo ? 'Ativa' : 'Pausada'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.palavras.map((p) => (
                        <span key={p} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {p}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2 whitespace-pre-line">{r.mensagem}</p>
                    <p className="mt-2 text-xs text-gray-500 tabular-nums">
                      {r.apenas_uma_vez ? 'Uma vez por contato · ' : 'Toda mensagem · '}
                      Últimos 30 dias: {r.atendidos_30d} {r.atendidos_30d === 1 ? 'contato atendido' : 'contatos atendidos'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => alternar(r)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {r.ativo ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() => abrir(r)}
                      aria-label={`Editar ${r.nome}`}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-600 hover:bg-gray-50"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => excluir(r)}
                      aria-label={`Excluir ${r.nome}`}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
