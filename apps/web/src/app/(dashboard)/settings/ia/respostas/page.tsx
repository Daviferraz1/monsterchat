'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Zap, Plus, Trash2, Loader2, Save, ArrowUp, ArrowDown } from 'lucide-react';

interface Resposta {
  id: string;
  titulo: string;
  texto: string;
}

/**
 * Respostas da equipe que aparecem no ⚡ da caixa de mensagem (junto com cursos,
 * editais e o boleto em aberto do aluno). `{nome}` vira o primeiro nome do contato.
 */
export default function RespostasRapidasPage() {
  const [itens, setItens] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [mudou, setMudou] = useState(false);

  useEffect(() => {
    fetch('/api/ia/mensagens-rapidas?equipe=1')
      .then((r) => r.json())
      .then((d) => setItens(Array.isArray(d.itens) ? d.itens : []))
      .finally(() => setCarregando(false));
  }, []);

  const alterar = (i: number, campo: 'titulo' | 'texto', valor: string) => {
    setItens((l) => l.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)));
    setMudou(true);
    setMsg(null);
  };
  const mover = (i: number, d: -1 | 1) => {
    setItens((l) => {
      const n = [...l];
      const [x] = n.splice(i, 1);
      n.splice(i + d, 0, x);
      return n;
    });
    setMudou(true);
  };
  const remover = (i: number) => {
    if (!confirm(`Remover "${itens[i].titulo || 'sem título'}"?`)) return;
    setItens((l) => l.filter((_, j) => j !== i));
    setMudou(true);
  };
  const adicionar = () => {
    setItens((l) => [...l, { id: `r${Date.now()}`, titulo: '', texto: '' }]);
    setMudou(true);
  };

  const salvar = async () => {
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch('/api/ia/mensagens-rapidas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setItens(d.itens);
        setMudou(false);
        setMsg({ ok: true, texto: 'Salvo. Aparece no ⚡ em até 5 minutos.' });
      } else setMsg({ ok: false, texto: d.message || 'Falha ao salvar.' });
    } catch {
      setMsg({ ok: false, texto: 'Falha ao salvar.' });
    } finally {
      setSalvando(false);
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
            <Zap className="w-7 h-7 text-[#7c3aed]" />
            Respostas rápidas
          </h1>
        </div>
        <p className="text-gray-600 text-sm mb-6">
          Textos que a equipe manda sempre igual. Aparecem no botão ⚡ da caixa de mensagem (ou digitando{' '}
          <code className="px-1 rounded bg-gray-100">/</code> e o título), junto com a apresentação de cada curso, os editais
          e o boleto em aberto do aluno. Escreva <code className="px-1 rounded bg-gray-100">{'{nome}'}</code> onde deve
          entrar o primeiro nome do contato.
        </p>

        {carregando ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <ul className="space-y-3">
            {itens.map((r, i) => (
              <li key={r.id} className="p-4 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={r.titulo}
                    onChange={(e) => alterar(i, 'titulo', e.target.value)}
                    placeholder="Título (é o que a busca encontra)"
                    className="flex-1 min-w-0 text-sm font-medium border rounded-lg px-3 py-2"
                  />
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label="Subir">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(i, 1)}
                    disabled={i === itens.length - 1}
                    className="p-2 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                    aria-label="Descer"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => remover(i)} className="p-2 text-gray-500 hover:text-red-600" aria-label="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={r.texto}
                  onChange={(e) => alterar(i, 'texto', e.target.value)}
                  placeholder="Texto da mensagem"
                  rows={Math.min(12, Math.max(3, r.texto.split('\n').length + 1))}
                  className="w-full text-sm border rounded-lg px-3 py-2 font-sans"
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button
            type="button"
            onClick={adicionar}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#7c3aed] text-[#7c3aed] hover:bg-[#7c3aed] hover:text-white transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nova resposta
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={!mudou || salvando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9] text-sm font-medium disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.texto}</span>}
        </div>
      </div>
    </div>
  );
}
