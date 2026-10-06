'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { indexar, sugerirContinuacao, type FraseIndexada } from '@/lib/autocompletar';
import { preencherNome } from '@/components/chat/MensagensRapidas';

// As frases mudam uma vez por dia: baixa uma vez por sessão do navegador.
let carregadas: Array<[string, number]> | null = null;
let carregando: Promise<Array<[string, number]>> | null = null;

function baixarFrases(): Promise<Array<[string, number]>> {
  if (carregadas) return Promise.resolve(carregadas);
  carregando ??= fetch('/api/ia/frases')
    .then((r) => r.json())
    .then((d) => (carregadas = Array.isArray(d.frases) ? d.frases : []))
    .catch(() => {
      carregando = null;
      return [];
    });
  return carregando;
}

/**
 * Continuação para o que o atendente está digitando, tirada das frases que a
 * equipe mais usa (sem IA, sem custo, na hora). Tab aceita; Esc descarta até o
 * texto mudar. `{nome}` das respostas da equipe vira o nome do contato.
 */
export function useAutocompletar(texto: string, ativo: boolean, nomeContato?: string | null) {
  const [brutas, setBrutas] = useState<Array<[string, number]> | null>(carregadas);
  const [descartadoEm, setDescartadoEm] = useState<string | null>(null);

  useEffect(() => {
    if (!brutas) baixarFrases().then(setBrutas);
  }, [brutas]);

  const frases: FraseIndexada[] = useMemo(
    () => indexar((brutas ?? []).map(([t, n]) => [t.includes('{nome}') ? preencherNome(t, nomeContato) : t, n])),
    [brutas, nomeContato]
  );

  const continuacao = useMemo(
    () => (ativo && texto !== descartadoEm && !texto.startsWith('/') ? sugerirContinuacao(texto, frases) : ''),
    [ativo, texto, descartadoEm, frases]
  );

  const descartar = useCallback(() => setDescartadoEm(texto), [texto]);
  const limpar = useCallback(() => setDescartadoEm(null), []);

  return { continuacao, descartar, limpar };
}
