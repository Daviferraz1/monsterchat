'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Check, Loader2, X } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';

interface Tarefa {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
}

/** Hoje/amanhã + n dias, às 9h no horário do navegador. */
function diaAs9(diasAFrente: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  d.setHours(9, 0, 0, 0);
  return d;
}

const OPCOES: Array<{ rotulo: string; quando: () => Date }> = [
  { rotulo: 'Em 1 hora', quando: () => new Date(Date.now() + 60 * 60 * 1000) },
  { rotulo: 'Amanhã, 9h', quando: () => diaAs9(1) },
  { rotulo: 'Em 2 dias, 9h', quando: () => diaAs9(2) },
  // O cupom de assinatura vale 7 dias: no 6º ainda dá para fechar.
  { rotulo: 'Em 6 dias (antes do cupom vencer)', quando: () => diaAs9(6) },
];

function quando(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * "Me lembra de voltar nesse lead": vira tarefa no quadro (Tarefas), com prazo,
 * para quem criou, ligada à conversa e ao contato. Na hora, o aviso aparece em
 * qualquer tela (LembretesVencidos) com o atalho para abrir a conversa.
 */
export function Lembrete({ conversationId, contactId, contactName }: { conversationId: string; contactId?: string | null; contactName?: string | null }) {
  const supabase = useSupabase();
  const { me } = useTeamDirectory();
  const [aberto, setAberto] = useState(false);
  const [pendentes, setPendentes] = useState<Tarefa[]>([]);
  const [nota, setNota] = useState('');
  const [personalizado, setPersonalizado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!me?.userId) return;
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, due_at')
      .eq('conversation_id', conversationId)
      .eq('assigned_to', me.userId)
      .neq('status', 'closed')
      .not('due_at', 'is', null)
      .order('due_at');
    setPendentes((data ?? []) as Tarefa[]);
  }, [supabase, conversationId, me?.userId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = async (data: Date) => {
    if (!me?.userId) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Retornar para ${contactName?.trim() || 'o contato'}`,
          description: nota.trim() || null,
          assignedTo: me.userId,
          contactId: contactId ?? null,
          conversationId,
          dueAt: data.toISOString(),
          priority: 'normal',
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Falha ao criar o lembrete.');
      }
      setNota('');
      setPersonalizado('');
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar o lembrete.');
    } finally {
      setSalvando(false);
    }
  };

  const concluir = async (id: string) => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'closed' }),
    });
    await carregar();
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={`h-16 border-b flex items-center gap-1.5 px-3 hover:bg-muted/50 hover:text-foreground transition-colors ${
          pendentes.length ? 'text-primary' : 'text-muted-foreground'
        }`}
        title={pendentes.length ? `Lembrete: ${quando(pendentes[0].due_at)}` : 'Me lembrar de voltar nesta conversa'}
      >
        <AlarmClock className="w-4 h-4" />
        <span className="hidden lg:inline text-sm">{pendentes.length ? quando(pendentes[0].due_at) : 'Lembrar'}</span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-full z-[210] w-72 bg-popover border rounded-lg shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Me lembrar de voltar</h3>
            <button type="button" onClick={() => setAberto(false)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          {pendentes.map((t) => (
            <div key={t.id} className="flex items-start gap-2 rounded-md bg-muted/50 p-2 text-xs">
              <AlarmClock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{quando(t.due_at)}</p>
                {t.description && <p className="text-muted-foreground break-words">{t.description}</p>}
              </div>
              <button type="button" onClick={() => concluir(t.id)} className="flex items-center gap-1 text-primary hover:underline" title="Concluir">
                <Check className="w-3.5 h-3.5" /> Feito
              </button>
            </div>
          ))}

          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (opcional): ex. mandar cupom do Tecnólogo"
            className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
          />
          <div className="grid grid-cols-1 gap-1">
            {OPCOES.map((o) => (
              <button
                key={o.rotulo}
                type="button"
                disabled={salvando}
                onClick={() => criar(o.quando())}
                className="text-left text-xs px-2 py-1.5 rounded-md border hover:bg-muted disabled:opacity-50"
              >
                {o.rotulo}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="datetime-local"
              value={personalizado}
              onChange={(e) => setPersonalizado(e.target.value)}
              className="flex-1 min-w-0 text-xs border rounded-md px-2 py-1.5 bg-background"
            />
            <button
              type="button"
              disabled={!personalizado || salvando}
              onClick={() => criar(new Date(personalizado))}
              className="text-xs px-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
            >
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Criar'}
            </button>
          </div>
          {erro && <p className="text-[11px] text-red-600">{erro}</p>}
          <p className="text-[10px] text-muted-foreground">Vira uma tarefa sua no quadro e avisa em qualquer tela na hora marcada.</p>
        </div>
      )}
    </div>
  );
}
