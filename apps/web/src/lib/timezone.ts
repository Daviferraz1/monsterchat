/**
 * Fuso do sistema.
 *
 * A operação é em Brasília, mas o servidor da Vercel roda em UTC. Sempre que o código deriva
 * um **dia de calendário** a partir de um instante, os dois discordam durante 3 horas por dia:
 * uma mensagem das 21h em Brasília é 00h do dia seguinte em UTC. Na prática isso jogava toda a
 * noite — justamente o pico do atendimento — para o dia seguinte nas métricas.
 *
 * Regra: instantes continuam sendo guardados em UTC (timestamptz), como devem ser. O fuso só
 * entra quando o instante vira dia, hora ou texto para uma pessoa ler.
 */
export const FUSO_BRASILIA = 'America/Sao_Paulo';

const paraData = (d: Date | string | number): Date => (d instanceof Date ? d : new Date(d));

/** 'en-CA' produz exatamente YYYY-MM-DD, que é o formato usado como chave de dia. */
const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_BRASILIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia de calendário em Brasília, no formato YYYY-MM-DD. Use no lugar de toISOString().slice(0,10). */
export function diaEmBrasilia(d: Date | string | number = new Date()): string {
  return fmtDia.format(paraData(d));
}

const fmtPartes = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO_BRASILIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export interface PartesLocais {
  ano: number;
  /** 1-12, como as pessoas contam — não o 0-11 do Date. */
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = segunda, 6 = domingo. */
  diaDaSemana: number;
}

/**
 * Ano, mês, dia, hora e minuto **em Brasília**.
 *
 * Substitui getHours()/getDate()/getMonth(), que devolvem o fuso de quem executa: UTC no
 * servidor, o do sistema operacional no navegador. Nos dois casos, errado por acidente.
 */
export function partesEmBrasilia(d: Date | string | number = new Date()): PartesLocais {
  const data = paraData(d);
  const partes: Record<string, string> = {};
  for (const p of fmtPartes.formatToParts(data)) {
    if (p.type !== 'literal') partes[p.type] = p.value;
  }
  // A hora 24 aparece em algumas engines para meia-noite; normalizar evita cálculo negativo.
  const hora = Number(partes.hour) % 24;

  // Dia da semana pelo dia local, para não virar na fronteira do fuso.
  const [ano, mes, dia] = diaEmBrasilia(data).split('-').map(Number);
  const diaDaSemana = (new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() + 6) % 7;

  return { ano, mes, dia, hora, minuto: Number(partes.minute), diaDaSemana };
}

/** Quantos dias tem o mês do instante dado, em Brasília. */
export function diasNoMesEmBrasilia(d: Date | string | number = new Date()): number {
  const { ano, mes } = partesEmBrasilia(d);
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Mesmo dia de calendário em Brasília? */
export function mesmoDiaEmBrasilia(a: Date | string | number, b: Date | string | number): boolean {
  return diaEmBrasilia(a) === diaEmBrasilia(b);
}

/** O instante cai no dia de hoje em Brasília? */
export function ehHojeEmBrasilia(d: Date | string | number): boolean {
  return mesmoDiaEmBrasilia(d, new Date());
}

/** O instante cai no dia de ontem em Brasília? */
export function ehOntemEmBrasilia(d: Date | string | number): boolean {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return mesmoDiaEmBrasilia(d, ontem);
}

/**
 * Formata para leitura, sempre em Brasília — nunca no fuso da máquina de quem abriu a tela.
 * Sem isso, um atendente com o computador em outro fuso vê horários diferentes dos colegas.
 */
export function formatarEmBrasilia(
  d: Date | string | number,
  opcoes: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_BRASILIA, ...opcoes }).format(paraData(d));
}

/** Só a hora: "14:32". */
export const horaEmBrasilia = (d: Date | string | number) =>
  formatarEmBrasilia(d, { hour: '2-digit', minute: '2-digit' });

/** Data curta: "19/02". */
export const dataCurtaEmBrasilia = (d: Date | string | number) =>
  formatarEmBrasilia(d, { day: '2-digit', month: '2-digit' });

/** Data e hora: "19/02/2026 14:32". */
export const dataHoraEmBrasilia = (d: Date | string | number) =>
  formatarEmBrasilia(d, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
