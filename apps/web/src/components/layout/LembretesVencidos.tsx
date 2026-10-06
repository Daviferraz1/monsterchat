'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlarmClock, Check, X } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';

interface Vencido {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  conversation_id: string;
}

const INTERVALO_MS = 60 * 1000;

/**
 * Aviso dos lembretes ("me lembra de voltar nesse lead") que chegaram na hora.
 * São tarefas do quadro com prazo vencido, da pessoa logada e ligadas a uma
 * conversa. Fica no canto da tela em qualquer página até ela abrir, adiar ou concluir.
 */
export function LembretesVencidos() {
  const supabase = useSupabase();
  const router = useRouter();
  const { me } = useTeamDirectory();
  const [itens, setItens] = useState<Vencido[]>([]);
  // Fechado no X: some até a próxima carga da página (a tarefa continua no quadro).
  const [dispensados, setDispensados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    if (!me?.userId) return;
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, due_at, conversation_id')
      .eq('assigned_to', me.userId)
      .neq('status', 'closed')
      .not('conversation_id', 'is', null)
      .lte('due_at', new Date().toISOString())
      .order('due_at')
      .limit(5);
    setItens((data ?? []) as Vencido[]);
  }, [supabase, me?.userId]);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const patch = async (id: string, corpo: Record<string, unknown>) => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...corpo }),
    });
    await carregar();
  };

  const visiveis = itens.filter((i) => !dispensados.has(i.id));
  if (!visiveis.length) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-[300] w-[min(340px,calc(100vw-2rem))] space-y-2">
      {visiveis.map((t) => (
        <div key={t.id} className="rounded-xl border bg-popover shadow-xl p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlarmClock className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{t.title}</p>
              {t.description && <p className="text-xs text-muted-foreground break-words">{t.description}</p>}
              <p className="text-[11px] text-muted-foreground">
                Marcado para {new Date(t.due_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDispensados((s) => new Set(s).add(t.id))}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
              aria-label="Fechar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                setDispensados((s) => new Set(s).add(t.id));
                router.push(`/inbox/${t.conversation_id}`);
              }}
              className="flex-1 text-xs px-2 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              Abrir conversa
            </button>
            <button
              type="button"
              onClick={() => patch(t.id, { dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() })}
              className="text-xs px-2 py-1.5 rounded-md border hover:bg-muted"
            >
              Adiar 1h
            </button>
            <button
              type="button"
              onClick={() => patch(t.id, { status: 'closed' })}
              className="text-xs px-2 py-1.5 rounded-md border hover:bg-muted inline-flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" /> Feito
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
