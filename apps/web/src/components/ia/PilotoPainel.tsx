'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

interface Config {
  modo: 'ensaio' | 'ativo';
  horario: 'sempre' | 'madrugada' | 'fora_comercial';
  espera_seg: number;
  max_seguidas: number;
  janela_min: number;
  espera_com_atendente_min: number;
}

interface Decisao {
  id: string;
  conversationId: string;
  nome: string | null;
  modo: string;
  decisao: 'enviou' | 'enviaria' | 'equipe' | 'nada';
  assunto: string | null;
  motivo: string | null;
  texto: string | null;
  em: string;
}

const ROTULO: Record<Decisao['decisao'], { txt: string; cls: string }> = {
  enviou: { txt: 'Enviou', cls: 'bg-green-100 text-green-800' },
  enviaria: { txt: 'Enviaria (ensaio)', cls: 'bg-blue-100 text-blue-800' },
  equipe: { txt: 'Passou para a equipe', cls: 'bg-amber-100 text-amber-800' },
  nada: { txt: 'Nada a responder', cls: 'bg-gray-100 text-gray-600' },
};

/**
 * Modo, horário e histórico do piloto automático (lib/api/ia/piloto.ts).
 * Fica embaixo do liga/desliga em Config. › IA.
 */
export function PilotoPainel() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [resumo, setResumo] = useState<Record<string, number>>({});
  const [ultimas, setUltimas] = useState<Decisao[]>([]);
  const [tabelaExiste, setTabelaExiste] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const d = await (await fetch('/api/ia/piloto')).json().catch(() => ({}));
    if (d.config) setCfg(d.config);
    setResumo(d.resumo ?? {});
    setUltimas(d.ultimas ?? []);
    setTabelaExiste(d.tabelaExiste !== false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async (parcial: Partial<Config>) => {
    setSalvando(true);
    try {
      const d = await (
        await fetch('/api/ia/piloto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parcial),
        })
      ).json();
      if (d.config) setCfg(d.config);
      else if (d.message) alert(d.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!cfg) return null;

  return (
    <div className="mt-4 space-y-4">
      {!tabelaExiste && (
        <p className="text-sm text-red-600">
          Falta rodar a migração <code>063_ia_piloto_log.sql</code> no Supabase: sem ela o piloto não registra as decisões.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-gray-700 font-medium mb-1">Modo</span>
          <select
            value={cfg.modo}
            disabled={salvando}
            onChange={(e) => salvar({ modo: e.target.value as Config['modo'] })}
            className="w-full border rounded-lg px-3 py-2 bg-white"
          >
            <option value="ensaio">Ensaio: só registra o que enviaria (não envia nada)</option>
            <option value="ativo">Ativo: envia ao aluno</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-700 font-medium mb-1">Quando responde</span>
          <select
            value={cfg.horario}
            disabled={salvando}
            onChange={(e) => salvar({ horario: e.target.value as Config['horario'] })}
            className="w-full border rounded-lg px-3 py-2 bg-white"
          >
            <option value="madrugada">Madrugada (23h às 8h)</option>
            <option value="fora_comercial">Fora do horário comercial (18h às 8h e fim de semana)</option>
            <option value="sempre">O dia todo</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-gray-600">
        Responde depois de {Math.round(cfg.espera_seg / 60)} min de silêncio do aluno (junta as mensagens), no máximo{' '}
        {cfg.max_seguidas} vezes seguidas. Em conversa em que um atendente escreveu nas últimas 2h, só entra se o aluno
        ficar {cfg.espera_com_atendente_min} min sem resposta. Pagamento,
        liberação de acesso, reembolso, cancelamento, desconto, escolaridade x cargo, reclamação, foto e áudio sem
        transcrição vão sempre para a equipe.
      </p>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-gray-700 font-medium">Últimos 7 dias:</span>
        {(Object.keys(ROTULO) as Decisao['decisao'][]).map((k) => (
          <span key={k} className={`px-2 py-0.5 rounded-full ${ROTULO[k].cls}`}>
            {ROTULO[k].txt}: {resumo[k] ?? 0}
          </span>
        ))}
      </div>

      {ultimas.length > 0 && (
        <ul className="divide-y border rounded-lg bg-white text-sm max-h-96 overflow-y-auto">
          {ultimas.map((d) => (
            <li key={d.id} className="p-3">
              <button type="button" onClick={() => setAberta(aberta === d.id ? null : d.id)} className="w-full text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${ROTULO[d.decisao].cls}`}>{ROTULO[d.decisao].txt}</span>
                  <span className="font-medium text-gray-900">{d.nome || 'Contato'}</span>
                  {d.assunto && <span className="text-xs text-gray-500">{d.assunto}</span>}
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(d.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {d.motivo && <p className="text-xs text-gray-600 mt-1">{d.motivo}</p>}
              </button>
              {aberta === d.id && (
                <div className="mt-2 space-y-2">
                  {d.texto && <pre className="whitespace-pre-wrap font-sans text-xs bg-gray-50 rounded p-2 text-gray-800">{d.texto}</pre>}
                  <Link href={`/inbox/${d.conversationId}`} className="text-xs text-[#7c3aed] hover:underline">
                    Abrir conversa
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
