import axios from 'axios';
import { sanitizeTokenForHeader } from '../utils';

/**
 * A API WhatsApp exige "to" como número só dígitos no formato esperado.
 * Contatos vindos da Guru podem vir com celular em 8 dígitos (ex.: 553194056541).
 * No Brasil o WhatsApp usa 9 dígitos (9 + 8): normaliza 12 dígitos (55+DDD+8) → 13 (55+DDD+9+8).
 */
function normalizeToPhone(to: string): string {
  let digits = (to || '').replace(/\D/g, '');
  if (!digits) return to || '';
  if (digits.startsWith('55') && digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  if (digits.startsWith('55') && digits.length === 11) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  return digits;
}

export interface WhatsAppSendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export async function sendWhatsAppText(params: WhatsAppSendTextParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) {
    throw new Error('Número do destinatário inválido (vazio após normalização).');
  }
  // Remove caracteres de controle que podem causar (#131009) Parameter value is not valid
  const bodyText = (params.text || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  const response = await axios.post<WhatsAppSendMessageResponse>(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: bodyText || ' ',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('WhatsApp message sent:', {
    phoneNumberId: params.phoneNumberId,
    to,
    messageId: response.data.messages[0]?.id,
  });

  return response.data;
}

export interface WhatsAppSendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  /** Nome do template aprovado no Gerenciador da Meta. */
  template: string;
  /** Código do idioma cadastrado no template (ex.: pt_BR). */
  idioma?: string;
  /** Valores de {{1}}, {{2}}… do corpo, na ordem. */
  parametros?: string[];
  /**
   * Sufixo do botão de URL dinâmica (o template guarda a base fixa e recebe só
   * o final). Ex.: base `.../invoice/` + sufixo `a2cd51fe-…` = link da fatura.
   */
  botaoUrlSufixo?: string;
  /** Posição do botão no template, quando não for o primeiro. */
  botaoIndice?: number;
}

/**
 * Um parâmetro de template não pode ter quebra de linha, tab nem 4 espaços
 * seguidos: a Meta recusa com (#132000). A limpeza é feita aqui, não em quem
 * chama — e é a MESMA usada para montar o texto que fica gravado na conversa,
 * senão o inbox mostraria uma coisa e a pessoa teria lido outra.
 */
function limparParametro(v: string): string {
  return (
    (v ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{4,}/g, '   ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim() || '-'
  );
}

/**
 * Corpo aprovado de um template, com `{{1}}`, `{{2}}`… ainda no lugar.
 *
 * A Meta é a dona do texto: o template é editado e aprovado lá, e uma cópia no
 * código vira mentira na primeira revisão que alguém fizer pelo painel. Então o
 * texto é buscado de lá, e guardado num cache de processo porque uma execução
 * da régua manda dezenas de mensagens com dois ou três templates.
 *
 * Devolve `null` se não achar — quem chama continua o envio, que é o que
 * importa, e grava o rótulo genérico.
 */
export interface TemplateResolvido {
  corpo: string;
  /** Só os botões de URL: são os que viram link na conversa. */
  botoes: Array<{ texto: string; url: string }>;
}

const corpoEmCache = new Map<string, TemplateResolvido>();

export async function corpoDoTemplate(opts: {
  wabaId: string;
  accessToken: string;
  nome: string;
  idioma?: string;
}): Promise<TemplateResolvido | null> {
  const idioma = opts.idioma || 'pt_BR';
  const chave = `${opts.wabaId}:${opts.nome}:${idioma}`;
  const guardado = corpoEmCache.get(chave);
  if (guardado !== undefined) return guardado;

  try {
    const url =
      `https://graph.facebook.com/v21.0/${opts.wabaId}/message_templates` +
      `?name=${encodeURIComponent(opts.nome)}&fields=name,language,components&limit=50`;
    const resposta = await axios.get<{
      data?: Array<{
        name: string;
        language: string;
        components?: Array<{
          type: string;
          text?: string;
          buttons?: Array<{ type?: string; text?: string; url?: string }>;
        }>;
      }>;
    }>(url, {
      headers: { Authorization: `Bearer ${sanitizeTokenForHeader(opts.accessToken)}` },
    });

    const lista = resposta.data?.data ?? [];
    // `name=` na Graph API filtra por prefixo, não por igualdade: pedir
    // `pagamento_pendente` traz também `pagamento_pendente_final`.
    const achado =
      lista.find((t) => t.name === opts.nome && t.language === idioma) ??
      lista.find((t) => t.name === opts.nome);
    const corpo = achado?.components?.find((c) => c.type === 'BODY')?.text;
    if (!corpo) return null;
    const botoes = (achado?.components?.find((c) => c.type === 'BUTTONS')?.buttons ?? [])
      .filter((b) => b.type === 'URL' && b.url)
      .map((b) => ({ texto: b.text || 'Abrir', url: b.url as string }));
    const resolvido: TemplateResolvido = { corpo, botoes };
    corpoEmCache.set(chave, resolvido);
    return resolvido;
  } catch (err) {
    console.error('[WhatsApp] falha ao ler o corpo do template:', opts.nome, err);
    return null;
  }
}

/** Troca `{{1}}`, `{{2}}`… pelos valores, do jeito que a Meta troca no envio. */
export function aplicarParametros(corpo: string, parametros: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (inteiro, n: string) => {
    const valor = parametros[Number(n) - 1];
    return valor === undefined ? inteiro : limparParametro(valor);
  });
}

/**
 * O texto que a pessoa vai ler, pronto para gravar na conversa.
 *
 * Sem isto o inbox guardava um rótulo ("🤖 Lembrete de pagamento") no lugar da
 * mensagem, e quem abria a conversa para atender não tinha como saber o que
 * havia sido dito.
 *
 * O botão de URL entra como uma linha no fim, com o link já montado. No celular
 * ele aparece como botão abaixo do texto; no inbox não apareceria de jeito
 * nenhum, e "é só abrir o link abaixo" sem link nenhum é exatamente o tipo de
 * mensagem que faz o atendente achar que o sistema falhou.
 */
export async function textoDoTemplate(opts: {
  wabaId?: string | null;
  accessToken: string;
  nome: string;
  idioma?: string;
  parametros?: string[];
  /** O mesmo sufixo mandado no envio, para o link ficar igual ao que a pessoa recebeu. */
  botaoUrlSufixo?: string;
}): Promise<string | null> {
  if (!opts.wabaId) return null;
  const resolvido = await corpoDoTemplate({
    wabaId: opts.wabaId,
    accessToken: opts.accessToken,
    nome: opts.nome,
    idioma: opts.idioma,
  });
  if (!resolvido) return null;

  const texto = aplicarParametros(resolvido.corpo, opts.parametros ?? []);
  const links = resolvido.botoes.map((b) => {
    // A URL do template guarda a base e recebe o sufixo no lugar do {{1}}.
    const url = opts.botaoUrlSufixo
      ? b.url.replace(/\{\{\d+\}\}/g, opts.botaoUrlSufixo)
      : b.url;
    return `${b.texto}: ${url}`;
  });
  return links.length ? `${texto}\n\n${links.join('\n')}` : texto;
}

/**
 * Envia um template aprovado.
 *
 * Existe porque texto livre só vale dentro da janela de 24h a partir da última
 * mensagem da pessoa. Para falar com quem está quieto — um lembrete de
 * pagamento, por exemplo — a Meta exige template e recusa o texto livre com
 * (#131047). Quando a pessoa responde ao template, a janela abre e a conversa
 * segue normal.
 */
export async function sendWhatsAppTemplate(params: WhatsAppSendTemplateParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) {
    throw new Error('Número do destinatário inválido (vazio após normalização).');
  }
  if (!params.template) {
    throw new Error('Template não informado.');
  }

  const componentes: Array<Record<string, unknown>> = [];
  if (params.parametros?.length) {
    componentes.push({
      type: 'body',
      parameters: params.parametros.map((v) => ({ type: 'text', text: limparParametro(v) })),
    });
  }
  if (params.botaoUrlSufixo) {
    componentes.push({
      type: 'button',
      sub_type: 'url',
      index: String(params.botaoIndice ?? 0),
      parameters: [{ type: 'text', text: limparParametro(params.botaoUrlSufixo) }],
    });
  }

  const response = await axios.post<WhatsAppSendMessageResponse>(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: params.template,
        language: { code: params.idioma || 'pt_BR' },
        ...(componentes.length ? { components: componentes } : {}),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('WhatsApp template sent:', {
    phoneNumberId: params.phoneNumberId,
    to,
    template: params.template,
    messageId: response.data.messages[0]?.id,
  });

  return response.data;
}

export interface WhatsAppSendMediaParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export async function sendWhatsAppImage(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: params.mediaUrl, caption: params.caption || undefined },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppVideo(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: params.mediaUrl, caption: params.caption || undefined },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppAudio(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { link: params.mediaUrl },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppDocument(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      link: params.mediaUrl,
      caption: params.caption || undefined,
      filename: params.filename || 'documento',
    },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}
