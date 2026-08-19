'use client';

import { useCallback, useEffect, useState } from 'react';
import type { GoalPeriod, MetricKey, MetricsResponse } from '@/lib/metrics';

/**
 * Carrega o painel de desempenho.
 *
 * Sem realtime de propósito: métrica de mês não muda a cada mensagem que chega,
 * e uma tela que se redesenha sozinha enquanto a pessoa lê o próprio número é
 * mais atrapalho que informação. Recarrega quando muda o período ou ao pedido.
 */
export function useMetrics(dias: number) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/metrics?dias=${dias}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Falha ao carregar');
      setData(json as MetricsResponse);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvarMeta = useCallback(
    async (userId: string, metric: MetricKey, period: GoalPeriod, target: number | null) => {
      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, metric, period, target }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? 'Falha ao salvar a meta');
      }
      await carregar();
    },
    [carregar]
  );

  return { data, loading, erro, recarregar: carregar, salvarMeta };
}
