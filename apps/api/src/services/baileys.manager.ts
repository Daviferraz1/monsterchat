/**
 * Gerencia conexões WhatsApp via Baileys (QR code) por canal.
 * Uma sessão por channelId; credenciais salvas em disco em sessions/baileys/{channelId}.
 */
import path from 'path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
  type proto,
  downloadMediaMessage,
  getContentType,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { getChannelById } from './channel.service.js';
import { upsertContact } from './contact.service.js';
import { findOrCreateConversation, updateConversation } from './conversation.service.js';
import { createMessage, getMessageByExternalId } from './message.service.js';
import { logger } from '../utils/logger.js';

const SESSIONS_DIR = path.join(process.cwd(), 'sessions', 'baileys');

interface ChannelSession {
  sock: WASocket | null;
  qr: string | null;
  connected: boolean;
  connecting: boolean;
}

const sessions = new Map<string, ChannelSession>();

function getSessionDir(channelId: string): string {
  return path.join(SESSIONS_DIR, channelId.replace(/[^a-zA-Z0-9-_]/g, '_'));
}

function jidToPhone(jid: string): string {
  return jid.replace(/@.*/, '').trim();
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
  const m = msg.message;
  if (!m) return undefined;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.locationMessage) return JSON.stringify(m.locationMessage);
  if (m.reactionMessage) return m.reactionMessage.text || '';
  return undefined;
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

  const conversation = await findOrCreateConversation({
    channelId,
    contactId: contactRecord.id,
  });

  const contentType = normalizeContentType(msg);
  let body = extractBody(msg);
  let mediaUrl: string | undefined;
  let mediaMimeType: string | undefined;
  let mediaFilename: string | undefined;

  // Baileys: mídia pode ser baixada depois para Supabase Storage se quiser; por ora só texto e referência
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
        // Por simplicidade não subimos para Supabase aqui; poderia usar media.service
        // Salvar como data URL ou URL temporária não é ideal; deixamos body com legenda e sem mediaUrl
        mediaMimeType = getContentType(msg.message)?.includes('image') ? 'image/jpeg' : undefined;
      }
    } catch (e) {
      logger.warn('Baileys: could not download media', { messageId, error: e });
    }
  }

  const timestamp = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

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

  await updateConversation(conversation.id, {
    lastMessageAt: timestamp,
    lastMessagePreview: body || `[${contentType}]`,
    unreadCount: (conversation.unread_count ?? 0) + 1,
  });

  logger.info('Baileys message persisted', {
    channelId,
    conversationId: conversation.id,
    messageId,
  });
}

export async function connectChannel(channelId: string): Promise<{ qr: string | null; connected: boolean }> {
  let session = sessions.get(channelId);
  if (session?.connected && session.sock) {
    return { qr: null, connected: true };
  }

  const channel = await getChannelById(channelId);
  if (!channel || channel.type !== 'whatsapp_baileys') {
    throw new Error('Channel not found or not whatsapp_baileys');
  }

  if (session?.connecting) {
    return { qr: session.qr, connected: false };
  }

  const sessionDir = getSessionDir(channelId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  session = {
    sock: null,
    qr: null,
    connected: false,
    connecting: true,
  };
  sessions.set(channelId, session);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  session.sock = sock;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session!.qr = qr;
      session!.connecting = false;
    }

    if (connection === 'open') {
      session!.connected = true;
      session!.qr = null;
      session!.connecting = false;
      logger.info('Baileys connected', { channelId });
    }

    if (connection === 'close') {
      session!.connected = false;
      session!.sock = null;
      session!.connecting = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.info('Baileys connection closed', { channelId, statusCode, shouldReconnect });
      if (shouldReconnect) {
        setTimeout(() => connectChannel(channelId).catch((e) => logger.error('Baileys reconnect failed', e)), 3000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages) {
      if (m.key.fromMe) continue;
      try {
        await processIncomingMessage(channelId, m);
      } catch (err) {
        logger.error('Baileys process message error', err, { channelId, messageId: m.key.id ?? undefined });
      }
    }
  });

  // Aguardar um pouco para QR aparecer
  await new Promise((r) => setTimeout(r, 1500));

  session.connecting = false;
  return { qr: session.qr, connected: session.connected };
}

export function getQR(channelId: string): string | null {
  return sessions.get(channelId)?.qr ?? null;
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
  s && (s.connected = false);
  s && (s.qr = null);
}
