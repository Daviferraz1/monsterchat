'use client';

import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, Copy, Loader2 } from 'lucide-react';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/** Aceita "397", "397,50", "1.397,50" e "397.5". */
function numero(texto: string): number {
  const t = texto.trim();
  if (!t) return NaN;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return Number(normal);
}

interface Curso {
  id: string;
  nome: string;
}

/**
 * Gera um link de checkout com desconto (oferta dinâmica da Guru) para este contato.
 * O visor mostra o valor final antes de gerar, para o atendente conferir.
 */
export function LinkDesconto({ contactId }: { contactId: string }) {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [productId, setProductId] = useState('');
  const [de, setDe] = useState<number | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [modo, setModo] = useState<'pct' | 'valor'>('pct');
  const [entrada, setEntrada] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ link: string; de: number; por: number; reaproveitado: boolean } | null>(null);
  const [copiado, setCopiado] = useState<'link' | 'msg' | null>(null);

  useEffect(() => {
    fetch(`/api/contacts/${contactId}/link-desconto`)
      .then((r) => r.json())
      .then((d) => setCursos(Array.isArray(d.cursos) ? d.cursos : []))
      .catch(() => setCursos([]));
  }, [contactId]);

  useEffect(() => {
    setDe(null);
    setResultado(null);
    setErro(null);
    if (!productId) return;
    let cancelado = false;
    setConsultando(true);
    fetch(`/api/contacts/${contactId}/link-desconto?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        if (d.ok) setDe(Number(d.de));
        else setErro(d.message || 'Não consegui ler o preço na Guru.');
      })
      .catch(() => !cancelado && setErro('Não consegui ler o preço na Guru.'))
      .finally(() => !cancelado && setConsultando(false));
    return () => {
      cancelado = true;
    };
  }, [contactId, productId]);

  // Valor final calculado ao vivo, a partir do preço cheio da Guru.
  const por = useMemo(() => {
    if (de == null) return null;
    const n = numero(entrada);
    if (!Number.isFinite(n) || n <= 0) return null;
    const v = modo === 'pct' ? de * (1 - n / 100) : n;
    return Math.round(v * 100) / 100;
  }, [de, entrada, modo]);
  const valido = de != null && por != null && por > 0 && por < de;

  const gerar = async () => {
    if (!valido || por == null) return;
    setGerando(true);
    setErro(null);
    setResultado(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/link-desconto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, valor: por }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setResultado({ link: d.link, de: d.de, por: d.por, reaproveitado: d.reaproveitado });
      else setErro(d.message || 'Falha ao gerar o link.');
    } catch {
      setErro('Falha ao gerar o link.');
    } finally {
      setGerando(false);
    }
  };

  const copiar = (texto: string, qual: 'link' | 'msg') => {
    navigator.clipboard.writeText(texto);
    setCopiado(qual);
    setTimeout(() => setCopiado(null), 1500);
  };

  const curso = cursos.find((c) => c.id === productId);
  const mensagem = resultado
    ? `Consegui uma condição especial pra você no ${curso?.nome ?? 'curso'}: de ${brl(resultado.de)} por ${brl(resultado.por)} 🎉\n\nÉ só finalizar por este link:\n${resultado.link}`
    : '';

  return (
    <div className="pt-3 border-t space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <BadgePercent className="w-3.5 h-3.5" />
        Link com desconto
        <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">teste</span>
      </h4>

      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
      >
        <option value="">Escolha o curso…</option>
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>

      {productId && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden text-xs shrink-0">
              {(['pct', 'valor'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModo(m);
                    setEntrada('');
                  }}
                  className={`px-2 py-1.5 ${modo === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                >
                  {m === 'pct' ? '% off' : 'R$ final'}
                </button>
              ))}
            </div>
            <input
              value={entrada}
              onChange={(e) => {
                setEntrada(e.target.value);
                setResultado(null);
              }}
              inputMode="decimal"
              placeholder={modo === 'pct' ? 'ex.: 10' : 'ex.: 397,00'}
              className="flex-1 min-w-0 text-xs border rounded-md px-2 py-1.5 bg-background"
            />
          </div>

          {/* Visor: o atendente vê o valor final antes de gerar o link. */}
          <div className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
            {consultando ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Lendo o preço na Guru…
              </span>
            ) : de == null ? (
              <span className="text-muted-foreground">Preço cheio indisponível.</span>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Preço cheio</span>
                  <span>{brl(de)}</span>
                </div>
                {por != null && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Desconto</span>
                      <span>
                        − {brl(Math.max(de - por, 0))} ({(((de - por) / de) * 100).toFixed(1).replace('.', ',')}%)
                      </span>
                    </div>
                    <div className={`flex justify-between font-semibold ${valido ? 'text-foreground' : 'text-red-600'}`}>
                      <span>Aluno paga</span>
                      <span>{brl(por)}</span>
                    </div>
                    {!valido && <p className="text-[11px] text-red-600">O valor final tem de ficar entre zero e o preço cheio.</p>}
                  </>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={gerar}
            disabled={!valido || gerando}
            className="w-full inline-flex justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgePercent className="w-3.5 h-3.5" />}
            {por != null && valido ? `Gerar link de ${brl(por)}` : 'Gerar link'}
          </button>
        </>
      )}

      {erro && <p className="text-[11px] text-red-600 bg-red-50 rounded-md p-2">{erro}</p>}

      {resultado && (
        <div className="rounded-md border p-2 text-xs space-y-1.5">
          <p className="break-all text-foreground">{resultado.link}</p>
          {resultado.reaproveitado && (
            <p className="text-[10px] text-muted-foreground">Esse aluno já tinha um link com esse valor; é o mesmo.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => copiar(resultado.link, 'link')} className="flex items-center gap-1 text-primary hover:underline">
              <Copy className="w-3 h-3" />
              {copiado === 'link' ? 'Copiado!' : 'Copiar link'}
            </button>
            <button type="button" onClick={() => copiar(mensagem, 'msg')} className="flex items-center gap-1 text-primary hover:underline">
              <Copy className="w-3 h-3" />
              {copiado === 'msg' ? 'Copiado!' : 'Copiar mensagem pronta'}
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Só cursos de pagamento único. Em assinatura (Tecnólogo, Sequencial, combo) a Guru não troca o valor: use cupom.
      </p>
    </div>
  );
}
