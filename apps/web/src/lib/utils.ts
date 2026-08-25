import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { dataCurtaEmBrasilia, ehHojeEmBrasilia, ehOntemEmBrasilia, horaEmBrasilia } from './timezone';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'agora';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  
  return dataCurtaEmBrasilia(d);
}

/** Hora da última mensagem: hoje = "14:32", ontem = "ontem 14:32", antigo = "19/02 14:32" */
export function formatLastMessageTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const timeStr = horaEmBrasilia(d);

  // "hoje" e "ontem" são dias de calendário de Brasília, não do fuso da máquina.
  if (ehHojeEmBrasilia(d)) return timeStr;
  if (ehOntemEmBrasilia(d)) return `ontem ${timeStr}`;
  return `${dataCurtaEmBrasilia(d)} ${timeStr}`;
}
