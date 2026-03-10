/**
 * Gerencia conexões WhatsApp via Baileys (QR code) por canal.
 * Uma sessão por channelId; credenciais salvas em disco em sessions/baileys/{channelId}.
 */
import path from 'path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
  type proto,
  downloadMediaMessage,
  getContentType,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { getChannelById } from './channel.service.js';
import { upsertContact, getContactByExternalId, updateContactProfilePic } from './contact.service.js';
import { findOrCreateConversation, updateConversation } from './conversation.service.js';
import { createMessage, getMessageByExternalId } from './message.service.js';
import { uploadBufferToMedia, downloadAndUploadMedia } from './media.service.js';
import { logger } from '../utils/logger.js';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'baileys');

const RECONNECT_BLOCK_MS = 60_000; // após 405, não reconectar por 1 minuto

interface ChannelSession {
  sock: WASocket | null;
  qr: string | null;
  connected: boolean;
  connecting: boolean;
  /** Mensagem de erro quando WhatsApp rejeita (ex.: 405 em datacenter) */
  lastError: string | null;
  /** Timestamp até quando não tentar reconectar (após 405) */
  blockReconnectUntil: number;
}

const sessions = new Map<string, ChannelSession>();

function getSessionDir(channelId: string): string {
  return path.join(SESSIONS_DIR, channelId.replace(/[^a-zA-Z0-9-_]/g, '_'));
}

function jidToPhone(jid: string): string {
  return jid.replace(/@.*/, '').trim();
}

/** Extrai mimetype e nome do arquivo do conteúdo da mensagem (imagem, vídeo, áudio, documento). */
function getMediaInfo(msg: WAMessage): { mimetype: string; fileName?: string } {
  const m = msg.message as Record<string, { mimetype?: string; fileName?: string; title?: string }> | undefined;
  if (!m) return { mimetype: 'application/octet-stream' };
  const types = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
  for (const key of types) {
    const content = m[key];
    if (content?.mimetype) {
      return {
        mimetype: content.mimetype.split(';')[0]?.trim() || 'application/octet-stream',
        fileName: content.fileName || content.title,
      };
    }
  }
  return { mimetype: 'application/octet-stream' };
}

function extensionFromMime(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
  };
  const base = mimetype.split(';')[0]?.split('/').pop() ?? 'bin';
  return map[mimetype.split(';')[0] ?? ''] ?? base;
}

function normalizeContentType(msg: WAMessage): string {
  const type = getContentType(msg.message ?? undefined);
  if (!type) return 'text';
  const map: Record<string, string> = {
    conversation: 'text',
    extendedTextMessage: 'text',
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    documentMessage: 'document',
    stickerMessage: 'sticker',
    locationMessage: 'location',
    reactionMessage: 'reaction',
  };
  return map[type] || 'text';
}

function extractBody(msg: WAMessage): string | undefined {
  const m = msg.message as Record<string, unknown> | undefined;
  if (!m) return undefined;
  if (typeof (m as any).conversation === 'string') return (m as any).conversation;
  if (typeof (m as any).extendedTextMessage?.text === 'string') return (m as any).extendedTextMessage.text;
  if (typeof (m as any).imageMessage?.caption === 'string') return (m as any).imageMessage.caption;
  if (typeof (m as any).videoMessage?.caption === 'string') return (m as any).videoMessage.caption;
  if (typeof (m as any).documentMessage?.caption === 'string') return (m as any).documentMessage.caption;
  if ((m as any).locationMessage) return JSON.stringify((m as any).locationMessage);
  if (typeof (m as any).reactionMessage?.text === 'string') return (m as any).reactionMessage.text;
  // Botões, listas e respostas
  const buttons = (m as any).buttonsMessage;
  if (buttons && (typeof buttons.contentText === 'string' || typeof buttons.text === 'string'))
    return (buttons.contentText || buttons.text) as string;
  const list = (m as any).listMessage;
  if (list) {
    const str = [list.title, list.description, list.buttonText, list.footerText].filter(Boolean).join(' · ');
    if (str) return str;
  }
  if (typeof (m as any).templateButtonReplyMessage?.selectedDisplayText === 'string')
    return (m as any).templateButtonReplyMessage.selectedDisplayText;
  if (typeof (m as any).buttonsResponseMessage?.selectedButtonId === 'string')
    return (m as any).buttonsResponseMessage.selectedDisplayText || (m as any).buttonsResponseMessage.selectedButtonId;
  if (typeof (m as any).listResponseMessage?.title === 'string')
    return (m as any).listResponseMessage.title;
  return undefined;
}

/**
 * Busca a foto de perfil do contato no WhatsApp (profilePictureUrl), faz upload para o Storage
 * e atualiza o contato. Executado em background para não atrasar o processamento de mensagens.
 */
async function fetchAndSaveContactProfilePicture(
  channelId: string,
  jid: string,
  contactId: string,
  externalId: string
): Promise<void> {
  const sock = sessions.get(channelId)?.sock;
  if (!sock || typeof sock.profilePictureUrl !== 'function') return;

  const ppUrl = await sock.profilePictureUrl(jid, 'image');
  if (!ppUrl) return;

  const path = `baileys-profile/${channelId}/${externalId.replace(/\D/g, '')}.jpg`;
  const { url } = await downloadAndUploadMedia(ppUrl, 'media', path, 'image/jpeg');
  await updateContactProfilePic(contactId, url);
  logger.debug('Baileys profile picture saved', { channelId, contactId });
}

async function processIncomingMessage(
  channelId: string,
  msg: WAMessage
): Promise<void> {
  const from = msg.key.remoteJid;
  if (!from || from === 'status@broadcast') return;

  const messageId = msg.key.id;
  if (!messageId) return;

  const existing = await getMessageByExternalId(messageId);
  if (existing) {
    logger.debug('Baileys message already processed', { messageId });
    return;
  }

  const channel = await getChannelById(channelId);
  if (!channel || channel.type !== 'whatsapp_baileys') return;

  const phone = jidToPhone(from);
  const pushName = msg.pushName || undefined;

  const contactRecord = await upsertContact({
    channelType: 'whatsapp_baileys',
    externalId: phone,
    name: pushName,
    phone,
  });

  // Foto de perfil: buscar no WhatsApp e salvar se o contato ainda não tiver
  if (!contactRecord.profile_pic_url) {
    setImmediate(() => {
      fetchAndSaveContactProfilePicture(channelId, from, contactRecord.id, phone).catch((e) =>
        logger.warn('Baileys profile pic fetch failed', { channelId, jid: from, error: e })
      );
    });
  }

  const conversation = await findOrCreateConversation({
    channelId,
    contactId: contactRecord.id,
  });

  const contentType = normalizeContentType(msg);
  let body = extractBody(msg);
  if (body === undefined || body === null) body = contentType === 'text' ? '(mensagem)' : `[${contentType}]`;
  let mediaUrl: string | undefined;
  let mediaMimeType: string | undefined;
  let mediaFilename: string | undefined;

  // Baileys: baixar mídia e fazer upload para Supabase Storage para exibir imagem, áudio, vídeo, documento
  if (contentType !== 'text' && contentType !== 'reaction' && msg.message) {
    try {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger: logger as any,
          reuploadRequest: async (msg: proto.IWebMessageInfo) => {
            const sock = sessions.get(channelId)?.sock;
            if (sock && 'updateMediaMessage' in sock) {
              return (sock as any).updateMediaMessage(msg);
            }
            return msg;
          },
        }
      );
      if (Buffer.isBuffer(buffer) && buffer.length > 0) {
        const { mimetype, fileName } = getMediaInfo(msg);
        const ext = extensionFromMime(mimetype);
        const safeId = (messageId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const storagePath = `baileys/${channelId}/${safeId}.${ext}`;
        const { url } = await uploadBufferToMedia(buffer, storagePath, mimetype);
        mediaUrl = url;
        mediaMimeType = mimetype;
        mediaFilename = fileName || `arquivo.${ext}`;
      }
    } catch (e) {
      logger.warn('Baileys: could not download or upload media', { messageId, error: e });
    }
  }

  const timestamp = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  try {
    await createMessage({
      conversationId: conversation.id,
      direction: 'inbound',
      senderType: 'contact',
      senderId: phone,
      contentType: contentType as import('../types/common.types.js').MessageContentType,
      body,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
      externalId: messageId,
      status: 'delivered',
      metadata: msg as unknown as Record<string, unknown>,
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      logger.debug('Baileys incoming message duplicate ignored', { messageId });
      return;
    }
    throw err;
  }

  const preview = (body && String(body).trim()) || `[${contentType}]`;
  await updateConversation(conversation.id, {
    lastMessageAt: timestamp,
    lastMessagePreview: preview,
    unreadCount: (conversation.unread_count ?? 0) + 1,
    status: 'open',
  });

  logger.info('Baileys message persisted', {
    channelId,
    conversationId: conversation.id,
    messageId,
  });
}

/**
 * Processa mensagens enviadas pelo próprio número (respostas no celular) para aparecer no sistema.
 */
async function processOutgoingMessage(channelId: string, msg: WAMessage): Promise<void> {
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid === 'status@broadcast') return;

  const messageId = msg.key.id;
  if (!messageId) return;

  const existing = await getMessageByExternalId(messageId);
  if (existing) {
    logger.debug('Baileys outgoing message already processed', { messageId });
    return;
  }

  const channel = await getChannelById(channelId);
  if (!channel || channel.type !== 'whatsapp_baileys') return;

  const phone = jidToPhone(remoteJid);
  let contactRecord = await getContactByExternalId('whatsapp_baileys', phone);
  if (!contactRecord) {
    contactRecord = await upsertContact({
      channelType: 'whatsapp_baileys',
      externalId: phone,
      phone,
    });
  }

  const conversation = await findOrCreateConversation({
    channelId,
    contactId: contactRecord.id,
  });

  const contentType = normalizeContentType(msg);
  let body = extractBody(msg);
  if (body === undefined || body === null) body = contentType === 'text' ? '' : `[${contentType}]`;

  try {
    await createMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      senderType: 'agent',
      senderId: phone,
      contentType: contentType as import('../types/common.types.js').MessageContentType,
      body: (body && String(body).trim()) || undefined,
      externalId: messageId,
      status: 'delivered',
      metadata: msg as unknown as Record<string, unknown>,
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      logger.debug('Baileys outgoing message duplicate ignored', { messageId });
      return;
    }
    throw err;
  }

  const preview = (body && String(body).trim()) || `[${contentType}]`;
  await updateConversation(conversation.id, {
    lastMessageAt: msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString(),
    lastMessagePreview: preview,
  });

  logger.info('Baileys outgoing message persisted (reply from phone)', {
    channelId,
    conversationId: conversation.id,
    messageId,
  });
}

export async function connectChannel(channelId: string): Promise<{ qr: string | null; connected: boolean; error?: string }> {
  let session = sessions.get(channelId);
  if (session?.connected && session.sock) {
    return { qr: null, connected: true };
  }

  const channel = await getChannelById(channelId);
  if (!channel || channel.type !== 'whatsapp_baileys') {
    throw new Error('Channel not found or not whatsapp_baileys');
  }

  if (session?.connecting) {
    return { qr: session.qr, connected: false, error: session.lastError ?? undefined };
  }

  if (session && session.blockReconnectUntil > Date.now()) {
    return { qr: null, connected: false, error: session.lastError ?? undefined };
  }

  const sessionDir = getSessionDir(channelId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  session = {
    sock: null,
    qr: null,
    connected: false,
    connecting: true,
    lastError: null,
    blockReconnectUntil: 0,
  };
  sessions.set(channelId, session);

  // Usar versão mais recente do WhatsApp Web pode evitar 405 (ClientTooOld)
  let version: [number, number, number] | undefined;
  try {
    const { version: v } = await fetchLatestBaileysVersion();
    version = v;
    logger.debug('Baileys using fetched version', { version });
  } catch (e) {
    logger.warn('Baileys fetchLatestBaileysVersion failed, using default', { error: e });
  }

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
  });

  session.sock = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session!.qr = qr;
      session!.connecting = false;
      session!.lastError = null;
    }

    if (connection === 'open') {
      session!.connected = true;
      session!.qr = null;
      session!.connecting = false;
      session!.lastError = null;
      logger.info('Baileys connected', { channelId });
    }

    if (connection === 'close') {
      session!.connected = false;
      session!.sock = null;
      session!.connecting = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const is405 = statusCode === 405;
      if (is405) {
        session!.lastError = 'WhatsApp rejeitou a conexão (erro 405). Comum em servidores em nuvem (ex.: Render). Tente novamente em alguns minutos ou use a API em outro ambiente.';
        session!.blockReconnectUntil = Date.now() + RECONNECT_BLOCK_MS;
      }
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !is405;
      logger.info('Baileys connection closed', { channelId, statusCode, shouldReconnect });
      if (shouldReconnect) {
        const delay = is405 ? RECONNECT_BLOCK_MS : 3000;
        setTimeout(() => connectChannel(channelId).catch((e) => logger.error('Baileys reconnect failed', e)), delay);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    logger.info('Baileys messages.upsert received', { channelId, count: messages.length });
    for (const m of messages) {
      try {
        if (m.key.fromMe) {
          await processOutgoingMessage(channelId, m);
        } else {
          await processIncomingMessage(channelId, m);
        }
      } catch (err) {
        logger.error('Baileys process message error', err, { channelId, messageId: m.key.id ?? undefined });
      }
    }
  });

  // Aguardar um pouco para QR aparecer
  await new Promise((r) => setTimeout(r, 1500));

  session.connecting = false;
  return { qr: session.qr, connected: session.connected, error: session.lastError ?? undefined };
}

export function getQR(channelId: string): string | null {
  return sessions.get(channelId)?.qr ?? null;
}

/** Retorna a última mensagem de erro da conexão (ex.: 405) para exibir no frontend. */
export function getConnectionError(channelId: string): string | null {
  return sessions.get(channelId)?.lastError ?? null;
}

export function getStatus(channelId: string): { connected: boolean; hasSocket: boolean } {
  const s = sessions.get(channelId);
  return {
    connected: s?.connected ?? false,
    hasSocket: !!s?.sock,
  };
}

export async function sendText(
  channelId: string,
  toJidOrPhone: string,
  text: string
): Promise<{ sent: boolean; externalId?: string }> {
  const s = sessions.get(channelId);
  if (!s?.sock || !s.connected) {
    throw new Error('Baileys not connected for this channel. Scan the QR code first.');
  }

  const jid = toJidOrPhone.includes('@') ? toJidOrPhone : `${toJidOrPhone.replace(/\D/g, '')}@s.whatsapp.net`;
  const result = await s.sock.sendMessage(jid, { text });
  const externalId = result?.key?.id ?? undefined;

  return { sent: true, externalId };
}

export async function sendMedia(
  channelId: string,
  toJidOrPhone: string,
  options: {
    mediaUrl: string;
    contentType: 'image' | 'video' | 'audio' | 'document';
    caption?: string;
    filename?: string;
  }
): Promise<{ sent: boolean; externalId?: string }> {
  const s = sessions.get(channelId);
  if (!s?.sock || !s.connected) {
    throw new Error('Baileys not connected for this channel. Scan the QR code first.');
  }

  const jid = toJidOrPhone.includes('@') ? toJidOrPhone : `${toJidOrPhone.replace(/\D/g, '')}@s.whatsapp.net`;

  const res = await fetch(options.mediaUrl);
  if (!res.ok) throw new Error(`Failed to fetch media: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { contentType, caption, filename } = options;

  let result: { key?: { id?: string | null } } | undefined;
  if (contentType === 'image') {
    result = await s.sock.sendMessage(jid, { image: buffer, caption: caption ?? undefined });
  } else if (contentType === 'video') {
    result = await s.sock.sendMessage(jid, { video: buffer, caption: caption ?? undefined });
  } else if (contentType === 'audio') {
    result = await s.sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mp4' });
  } else {
    result = await s.sock.sendMessage(jid, {
      document: buffer,
      mimetype: 'application/octet-stream',
      fileName: filename || 'document',
      caption: caption ?? undefined,
    });
  }

  return { sent: true, externalId: result?.key?.id ?? undefined };
}

export function disconnectChannel(channelId: string): void {
  const s = sessions.get(channelId);
  if (s?.sock) {
    s.sock.end(undefined);
    s.sock = null;
  }
  if (s) {
    s.connected = false;
    s.qr = null;
    s.lastError = null;
    s.blockReconnectUntil = 0;
  }
}
