'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Search, Zap } from 'lucide-react';
import { primeiroNome } from '@/lib/api/ia/team-templates';

interface MensagemRapida {
  id: string;
  titulo: string;
  grupo: string;
  busca: string;
  texto: string;
}

export interface MensagensRapidasHandle {
  /** Setas, Enter e Esc vindos da caixa de texto quando a lista abriu por "/". Devolve true se tratou. */
  tecla: (e: React.KeyboardEvent) => boolean;
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// A lista geral (equipe, cursos, editais) muda pouco: guarda 5 minutos entre aberturas.
let cache: { em: number; itens: MensagemRapida[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** "{nome}" → primeiro nome do contato; sem nome, some junto com a vírgula ("Olá, {nome}!" → "Olá!"). */
export function preencherNome(texto: string, nomeContato?: string | null): string {
  // Mesma regra da saudação da IA (primeiroNome): pula emoji, recusa @usuário do Instagram.
  const nome = primeiroNome(nomeContato);
  if (nome) return texto.replace(/\{nome\}/g, nome);
  return texto
    .replace(/,\s*\{nome\}(?=[!?.,])/g, '')
    .replace(/^\{nome\},\s*(\p{L})/gmu, (_, l: string) => l.toUpperCase())
    .replace(/\{nome\}/g, '');
}

/**
 * Lista de mensagens prontas: as "deste aluno" (boleto/PIX em aberto), as da
 * equipe, a apresentação de cada curso e os editais. Abre pelo botão ⚡ (com
 * campo de busca) ou digitando "/" no início da mensagem (a busca é o próprio
 * texto depois da barra).
 */
export const MensagensRapidas = forwardRef<
  MensagensRapidasHandle,
  {
    conversationId: string;
    nomeContato?: string | null;
    consulta?: string;
    comBusca: boolean;
    onEscolher: (texto: string) => void;
    onFechar: () => void;
  }
>(function MensagensRapidas({ conversationId, nomeContato, consulta = '', comBusca, onEscolher, onFechar }, ref) {
  const fresco = cache && Date.now() - cache.em < CACHE_MS ? cache.itens : null;
  const [gerais, setGerais] = useState<MensagemRapida[] | null>(fresco);
  const [doAluno, setDoAluno] = useState<MensagemRapida[]>([]);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (cache && Date.now() - cache.em < CACHE_MS) return;
    fetch('/api/ia/mensagens-rapidas')
      .then((r) => r.json())
      .then((d) => {
        cache = { em: Date.now(), itens: Array.isArray(d.mensagens) ? d.mensagens : [] };
        setGerais(cache.itens);
      })
      .catch(() => setGerais([]));
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/ia/mensagens-rapidas?conversationId=${encodeURIComponent(conversationId)}`)
      .then((r) => r.json())
      .then((d) => !cancelado && setDoAluno(Array.isArray(d.mensagens) ? d.mensagens : []))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [conversationId]);

  const lista = useMemo(() => (gerais ? [...doAluno, ...gerais] : null), [gerais, doAluno]);
  const escolher = (m: MensagemRapida) => onEscolher(preencherNome(m.texto, nomeContato));

  const termo = normalizar(comBusca ? busca : consulta);
  const filtradas = useMemo(() => {
    if (!lista) return [];
    if (!termo) return lista;
    const palavras = termo.split(' ');
    return lista.filter((m) => {
      const alvo = normalizar(`${m.titulo} ${m.busca}`);
      return palavras.every((p) => alvo.includes(p));
    });
  }, [lista, termo]);

  useEffect(() => setAtivo(0), [termo]);
  useEffect(() => {
    listaRef.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  const tecla = (e: React.KeyboardEvent): boolean => {
    if (e.key === 'Escape') {
      onFechar();
      return true;
    }
    if (!filtradas.length) return false;
    if (e.key === 'ArrowDown') setAtivo((i) => (i + 1) % filtradas.length);
    else if (e.key === 'ArrowUp') setAtivo((i) => (i - 1 + filtradas.length) % filtradas.length);
    else if (e.key === 'Enter' || e.key === 'Tab') escolher(filtradas[ativo]);
    else return false;
    e.preventDefault();
    return true;
  };
  useImperativeHandle(ref, () => ({ tecla }));

  const selecionada = filtradas[ativo];

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-popover border shadow-xl z-[100] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b text-xs font-semibold text-muted-foreground">
        <Zap className="w-3.5 h-3.5" />
        Mensagens rápidas
        <span className="ml-auto font-normal">↑↓ escolhe · Enter insere · Esc fecha</span>
      </div>
      {comBusca && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => tecla(e)}
            placeholder="Buscar (ex.: pcmg, reembolso, edital pmpe, matérias)"
            className="flex-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
      )}
      <div className="flex max-h-72">
        <ul ref={listaRef} className="w-1/2 sm:w-2/5 overflow-y-auto border-r py-1">
          {lista == null && <li className="px-3 py-2 text-xs text-muted-foreground">Carregando…</li>}
          {lista != null && !filtradas.length && (
            <li className="px-3 py-2 text-xs text-muted-foreground">Nada com “{comBusca ? busca : consulta}”.</li>
          )}
          {filtradas.map((m, i) => (
            <li key={m.id} data-i={i}>
              <button
                type="button"
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(m)}
                className={`w-full text-left px-3 py-1.5 text-sm ${i === ativo ? 'bg-muted' : 'hover:bg-muted/60'}`}
              >
                <span className="block truncate">{m.titulo}</span>
                <span className="block text-[10px] text-muted-foreground">{m.grupo}</span>
              </button>
            </li>
          ))}
        </ul>
        <pre className="flex-1 overflow-y-auto p-3 text-xs whitespace-pre-wrap break-words font-sans text-muted-foreground">
          {selecionada ? preencherNome(selecionada.texto, nomeContato) : ''}
        </pre>
      </div>
    </div>
  );
});
