'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Instagram, MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react';

interface Regra {
  id: string;
  nome: string;
  palavras: string[];
  media_id: string | null;
  mensagem_direct: string;
  resposta_publica: string | null;
  respostas_publicas: string[] | null;
  mensagem_followup: string | null;
  followup_minutos: number | null;
  ativo: boolean;
  enviados: number;
  falhas: number;
}

interface Post {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  comments_count?: number;
}

interface Form {
  id?: string;
  nome: string;
  palavras: string;
  media_id: string | null;
  mensagem_direct: string;
  respostas_publicas: string[];
  mensagem_followup: string;
  followup_minutos: number;
}

/** Variações prontas: uma é sorteada a cada comentário, sem repetir a anterior. */
const SUGESTOES = [
  'Te mandei no direct! 📩',
  'Enviado! Confere sua DM 😉',
  'Acabei de te chamar no direct 🚀',
  'Link no seu direct! 📲',
  'Olha a DM, mandei tudo lá ✅',
  'Prontinho, chegou no seu direct 🔥',
];

const VAZIO: Form = {
  nome: '',
  palavras: '',
  media_id: null,
  mensagem_direct: '',
  respostas_publicas: SUGESTOES.slice(0, 4),
  mensagem_followup: '',
  followup_minutos: 60,
};

function variacoesDa(r: Regra): string[] {
  if (r.respostas_publicas?.length) return r.respostas_publicas;
  return r.resposta_publica ? [r.resposta_publica] : [];
}

function capa(p?: Post) {
  if (!p) return undefined;
  return p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url || p.thumbnail_url;
}

export default function AutomacaoInstagramPage() {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch('/api/instagram/comment-rules');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Não foi possível carregar as regras.');
      setRegras(d.regras);
      setPosts(d.posts);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const postPorId = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    try {
      const corpo = {
        nome: form.nome,
        palavras: form.palavras,
        media_id: form.media_id,
        mensagem_direct: form.mensagem_direct,
        respostas_publicas: form.respostas_publicas.map((t) => t.trim()).filter(Boolean),
        mensagem_followup: form.mensagem_followup.trim(),
        followup_minutos: form.followup_minutos,
      };
      const r = await fetch(form.id ? `/api/instagram/comment-rules/${form.id}` : '/api/instagram/comment-rules', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Não foi possível salvar.');
      setForm(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(regra: Regra) {
    await fetch(`/api/instagram/comment-rules/${regra.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !regra.ativo }),
    });
    carregar();
  }

  async function excluir(regra: Regra) {
    if (!window.confirm(`Excluir a regra "${regra.nome}"? O histórico de respostas continua salvo.`)) return;
    await fetch(`/api/instagram/comment-rules/${regra.id}`, { method: 'DELETE' });
    carregar();
  }

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
                <Instagram className="w-7 h-7 text-[#7c3aed]" />
                Automação de comentários
              </h1>
              <p className="text-gray-600 text-sm mt-1 max-w-xl">
                Quem comentar a palavra-chave num post recebe a mensagem no direct na hora. A conversa aparece no
                inbox e os links saem com rastreio de origem.
              </p>
            </div>
            <button
              onClick={() => setForm({ ...VAZIO })}
              className="inline-flex items-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6d28d9]"
            >
              <Plus className="w-4 h-4" /> Nova regra
            </button>
          </div>
          <p className="mt-4 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
            A Meta permite <b>uma</b> resposta no direct por comentário, até 7 dias depois dele. Para funcionar, o
            campo <code>comments</code> precisa estar marcado nos webhooks do app. Desligue a automação equivalente no
            ManyChat para o aluno não receber duas mensagens.
          </p>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{erro}</div>
        )}

        {carregando ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-gray-500">Carregando regras…</div>
        ) : regras.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            Nenhuma regra ainda. Crie a primeira, por exemplo: palavra <b>PCBA</b> → link da página do curso.
          </div>
        ) : (
          <ul className="space-y-3">
            {regras.map((r) => {
              const post = r.media_id ? postPorId.get(r.media_id) : undefined;
              return (
                <li key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 flex gap-4">
                  <div className="w-16 h-16 shrink-0 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center text-[10px] text-gray-500 text-center">
                    {r.media_id ? (
                      capa(post) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={capa(post)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        'post específico'
                      )
                    ) : (
                      'qualquer post'
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{r.nome}</h2>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          r.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {r.ativo ? 'Ativa' : 'Pausada'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {r.palavras.map((p) => (
                        <span key={p} className="text-xs font-mono bg-gray-900 text-white px-1.5 py-0.5 rounded">
                          {p}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 flex gap-1.5">
                      <MessageCircle className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
                      {r.mensagem_direct}
                    </p>
                    <p className="text-xs text-gray-500 tabular-nums">
                      {variacoesDa(r).length > 0
                        ? `${variacoesDa(r).length} ${variacoesDa(r).length === 1 ? 'resposta pública' : 'respostas públicas sorteadas'} · `
                        : 'Sem resposta pública · '}
                      Últimos 30 dias: <b className="text-gray-800">{r.enviados}</b> enviados
                      {r.falhas > 0 && <> · {r.falhas} não enviados</>}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button onClick={() => alternar(r)} className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50">
                      {r.ativo ? 'Pausar' : 'Ativar'}
                    </button>
                    <button
                      onClick={() =>
                        setForm({
                          id: r.id,
                          nome: r.nome,
                          palavras: r.palavras.join(', '),
                          media_id: r.media_id,
                          mensagem_direct: r.mensagem_direct,
                          respostas_publicas: variacoesDa(r),
                          mensagem_followup: r.mensagem_followup ?? '',
                          followup_minutos: r.followup_minutos ?? 60,
                        })
                      }
                      className="text-xs rounded-lg border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button
                      onClick={() => excluir(r)}
                      className="text-xs rounded-lg border border-red-200 text-red-600 px-2.5 py-1.5 hover:bg-red-50 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{form.id ? 'Editar regra' : 'Nova regra'}</h2>
              <button onClick={() => setForm(null)} aria-label="Fechar" className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Nome</span>
              <input
                id="regra-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: PC BA – curso"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Palavras-chave</span>
              <input
                id="regra-palavras"
                value={form.palavras}
                onChange={(e) => setForm({ ...form, palavras: e.target.value })}
                placeholder="PCBA, PC BA, EDITAL"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono"
              />
              <span className="text-xs text-gray-500">Separe por vírgula. Maiúsculas e acentos não importam.</span>
            </label>

            <div className="text-sm">
              <span className="font-medium text-gray-800">Vale para</span>
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, media_id: null })}
                  className={`aspect-square rounded-lg border-2 text-[11px] font-semibold ${
                    form.media_id === null ? 'border-[#7c3aed] bg-[#7c3aed]/5 text-[#7c3aed]' : 'border-gray-200 text-gray-500'
                  }`}
                >
                  Qualquer post
                </button>
                {posts.slice(0, 23).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.caption?.slice(0, 120)}
                    onClick={() => setForm({ ...form, media_id: p.id })}
                    className={`aspect-square rounded-lg overflow-hidden border-2 bg-gray-100 ${
                      form.media_id === p.id ? 'border-[#7c3aed]' : 'border-transparent'
                    }`}
                  >
                    {capa(p) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capa(p)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-500">sem capa</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Mensagem no direct</span>
              <textarea
                id="regra-mensagem"
                value={form.mensagem_direct}
                onChange={(e) => setForm({ ...form, mensagem_direct: e.target.value })}
                rows={5}
                placeholder={'Oi! Aqui está a análise completa do edital da PC BA 👇\nhttps://www.monsterconcursos.com.br/pcba-investigador'}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
              <span className="text-xs text-gray-500 tabular-nums">
                {form.mensagem_direct.length}/1000 · links da Monster e da Fagenius ganham UTM automaticamente
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Segunda mensagem: a oferta (opcional)</span>
              <p className="text-xs text-gray-500 mb-1">
                Enviada só para quem recebeu o material e não respondeu. O Instagram só aceita
                mensagem até 24 h depois da interação da pessoa.
              </p>
              <textarea
                id="regra-followup"
                value={form.mensagem_followup}
                onChange={(e) => setForm({ ...form, mensagem_followup: e.target.value })}
                rows={3}
                maxLength={1000}
                placeholder="Ex.: Conseguiu baixar o edital? Se quiser treinar no estilo da banca, o kit de simulados sai por R$ 37: <link>"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-gray-800">Enviar a oferta depois de (minutos)</span>
              <input
                id="regra-followup-minutos"
                type="number"
                min={1}
                max={1380}
                value={form.followup_minutos}
                onChange={(e) => setForm({ ...form, followup_minutos: Number(e.target.value) })}
                className="mt-1 w-32 rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>

            <fieldset className="text-sm">
              <legend className="font-medium text-gray-800">Respostas públicas no comentário (opcional)</legend>
              <p className="text-xs text-gray-500 mb-2">
                A cada comentário uma delas é sorteada, sem repetir a anterior. Deixe vazio para não responder em público.
              </p>
              <div className="space-y-2">
                {form.respostas_publicas.map((texto, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      id={`regra-publica-${i}`}
                      aria-label={`Variação ${i + 1}`}
                      value={texto}
                      maxLength={300}
                      onChange={(e) => {
                        const lista = [...form.respostas_publicas];
                        lista[i] = e.target.value;
                        setForm({ ...form, respostas_publicas: lista });
                      }}
                      className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2"
                    />
                    <button
                      type="button"
                      aria-label={`Remover variação ${i + 1}`}
                      onClick={() =>
                        setForm({ ...form, respostas_publicas: form.respostas_publicas.filter((_, j) => j !== i) })
                      }
                      className="shrink-0 rounded-lg border border-gray-200 px-2.5 hover:bg-gray-50 text-gray-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  disabled={form.respostas_publicas.length >= 20}
                  onClick={() => setForm({ ...form, respostas_publicas: [...form.respostas_publicas, ''] })}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" /> Adicionar variação
                </button>
                {SUGESTOES.filter((t) => !form.respostas_publicas.includes(t)).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={form.respostas_publicas.length >= 20}
                    onClick={() => setForm({ ...form, respostas_publicas: [...form.respostas_publicas, t] })}
                    className="rounded-full bg-[#7c3aed]/10 text-[#6d28d9] px-2.5 py-1 text-xs hover:bg-[#7c3aed]/20 disabled:opacity-50"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setForm(null)} className="rounded-xl border border-gray-300 px-4 py-2 text-sm">
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-60"
              >
                {salvando ? 'Salvando…' : 'Salvar regra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
