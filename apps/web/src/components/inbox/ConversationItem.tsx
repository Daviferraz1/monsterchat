'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { formatLastMessageTime } from '@/lib/utils';
import { orderStatusBadge, effectiveSituationFromDg } from '@/lib/orderStatusBadge';
import { ChannelBadge } from '../layout/ChannelBadge';
import { isFinalized } from '@/lib/conversationStatus';
import { useSupabase } from '@/hooks/useSupabase';
import type { Conversation } from '@/types';
import type { DigitalGuruMetadata, LeadCampaign } from '@/types';
import { Megaphone, CheckCheck, RotateCcw, UserRound, MailOpen, Mail } from 'lucide-react';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';

const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

const ACTION_W = 88; // largura de cada ação revelada ao arrastar
const ACTIONS_W = ACTION_W * 2; // "Não lida" + "Finalizar"

function getInitials(name: string): string {
  if (!name || name === 'Contato sem nome') return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ConversationItemProps {
  conversation: Conversation;
  /** No mobile, chamado ao tocar na conversa para fechar o drawer */
  onSelect?: () => void;
}

export function ConversationItem({ conversation, onSelect }: ConversationItemProps) {
  const pathname = usePathname();
  const supabase = useSupabase();
  const contact = conversation.contact;
  const channel = conversation.channel;
  const instagramUsername = channel?.type === 'instagram' && contact?.metadata?.username;
  const displayName =
    contact?.name ||
    contact?.phone ||
    (instagramUsername ? `@${contact.metadata.username}` : null) ||
    'Contato sem nome';
  const manuallyUnread = !!conversation.manually_unread;
  // Marca manual conta como não lida na lista, mesmo sem mensagem nova — é o
  // ponto da função: a conversa continua pedindo atenção depois de lida.
  const hasUnread = conversation.unread_count > 0 || manuallyUnread;
  const isActive = pathname === `/inbox/${conversation.id}`;
  const colorIndex = (displayName?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  const [avatarError, setAvatarError] = useState(false);
  const showProfilePic = contact?.profile_pic_url && !avatarError;
  const dg = contact?.metadata?.digital_guru as DigitalGuruMetadata | undefined;
  const hasProducts = (dg?.products?.length ?? 0) > 0;
  const effectiveSituation = effectiveSituationFromDg(dg?.situation, hasProducts);
  const situationBadge = effectiveSituation ? orderStatusBadge(effectiveSituation) : null;
  const campaign = contact?.metadata?.campaign as LeadCampaign | undefined;
  const isLeadFromAd = !!(campaign?.utm_source || campaign?.utm_medium || campaign?.utm_campaign);
  const finalized = isFinalized(conversation);
  const isClosed = conversation.status === 'closed';
  const { nameOfUser, department, me } = useTeamDirectory();
  const ownerName = nameOfUser(conversation.assigned_to);
  const ownerIsMe = !!conversation.assigned_to && conversation.assigned_to === me?.userId;
  const dept = department(conversation.department_id);

  // Arrastar para o lado (mobile) → revela ação de finalizar/reabrir
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const baseOffset = useRef(0);
  const dragging = useRef(false);
  const swiped = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    baseOffset.current = offset;
    dragging.current = true;
    swiped.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!swiped.current && Math.abs(dy) > Math.abs(dx)) return; // gesto vertical → deixa rolar
    if (Math.abs(dx) > 6) swiped.current = true;
    const next = Math.min(0, Math.max(-ACTIONS_W, baseOffset.current + dx));
    setOffset(next);
  };
  const onTouchEnd = () => {
    dragging.current = false;
    setOffset((o) => (o <= -ACTIONS_W / 2 ? -ACTIONS_W : 0));
  };
  const onClickCapture = (e: React.MouseEvent) => {
    // Se estava arrastando ou a ação está aberta, o toque fecha em vez de navegar
    if (offset !== 0 || swiped.current) {
      e.preventDefault();
      e.stopPropagation();
      setOffset(0);
      swiped.current = false;
    }
  };

  const toggleUnread = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const { error } = await supabase
      .from('conversations')
      .update({ manually_unread: !manuallyUnread, updated_at: new Date().toISOString() })
      .eq('id', conversation.id);
    if (error) console.error('Falha ao marcar como não lida:', error);
    setBusy(false);
    setOffset(0);
  };

  const toggleFinalize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const closing = !isClosed;
    const { error } = await supabase
      .from('conversations')
      .update({
        status: closing ? 'closed' : 'open',
        closed_at: closing ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);
    if (error) console.error('Falha ao finalizar/reabrir conversa:', error);
    setBusy(false);
    setOffset(0);
  };

  return (
    <div className="relative overflow-hidden">
      {/* Ações reveladas ao arrastar para a esquerda (mobile) */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_W }}>
        <button
          type="button"
          onClick={toggleUnread}
          disabled={busy}
          aria-label={manuallyUnread ? 'Desmarcar como não lida' : 'Marcar como não lida'}
          className="flex flex-col items-center justify-center gap-0.5 text-white text-[11px] font-medium bg-[#6d28d9]"
          style={{ width: ACTION_W }}
          tabIndex={offset === 0 ? -1 : 0}
        >
          {manuallyUnread ? <MailOpen className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
          {manuallyUnread ? 'Lida' : 'Não lida'}
        </button>
        <button
          type="button"
          onClick={toggleFinalize}
          disabled={busy}
          aria-label={isClosed ? 'Reabrir conversa' : 'Finalizar conversa'}
          className={`flex flex-col items-center justify-center gap-0.5 text-white text-[11px] font-medium ${
            isClosed ? 'bg-amber-600' : 'bg-green-600'
          }`}
          style={{ width: ACTION_W }}
          tabIndex={offset === 0 ? -1 : 0}
        >
          {isClosed ? <RotateCcw className="w-5 h-5" /> : <CheckCheck className="w-5 h-5" />}
          {isClosed ? 'Reabrir' : 'Finalizar'}
        </button>
      </div>

      {/* Linha da conversa (desliza por cima da ação) */}
      <div
        className="relative bg-[#0d0d1a]"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging.current ? 'none' : 'transform 0.2s ease',
          touchAction: 'pan-y',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={onClickCapture}
      >
        <Link
          href={`/inbox/${conversation.id}`}
          onClick={onSelect}
          className="group flex items-start gap-3 p-3 min-h-[72px] transition-all border-b border-white/[0.03] text-left hover:bg-white/[0.04] active:bg-white/[0.06]"
          style={{
            // Três estados, do mais forte ao mais fraco: a conversa aberta, a que
            // pede atenção (mensagem nova ou marcada por você) e a já resolvida.
            // O roxo da não lida é bem mais fraco que o da ativa de propósito —
            // se empatassem, você perderia de vista onde está.
            background: isActive
              ? 'rgba(139,92,246,0.18)'
              : hasUnread
                ? 'rgba(139,92,246,0.08)'
                : 'transparent',
            borderLeft: isActive
              ? '3px solid #8b5cf6'
              : hasUnread
                ? '3px solid rgba(139,92,246,0.5)'
                : '3px solid transparent',
          }}
        >
          <div className="relative flex-shrink-0 mt-0.5">
            {showProfilePic ? (
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={contact.profile_pic_url!}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center rounded-full w-10 h-10 text-white text-sm font-semibold"
                style={{ background: AVATAR_COLORS[colorIndex] }}
              >
                {getInitials(displayName)}
              </div>
            )}
            {channel && (
              <div className="absolute -bottom-0.5 -right-0.5 bg-[#0d0d1a] rounded-full p-0.5 ring-1 ring-white/10">
                <ChannelBadge type={channel.type} className="w-5 h-5 [&>svg]:w-3 [&>svg]:h-3" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p
                className={`text-sm truncate ${
                  hasUnread ? 'font-semibold text-white' : 'font-medium text-gray-300'
                }`}
              >
                {displayName}
              </p>
              {/* Atalho de desktop; no mobile a mesma ação vem do arrastar. */}
              <button
                type="button"
                onClick={toggleUnread}
                disabled={busy}
                title={manuallyUnread ? 'Desmarcar como não lida' : 'Marcar como não lida'}
                aria-label={manuallyUnread ? 'Desmarcar como não lida' : 'Marcar como não lida'}
                className={`hidden md:flex flex-shrink-0 items-center justify-center w-6 h-6 rounded-md transition-opacity hover:bg-white/10 ${
                  manuallyUnread ? 'opacity-100 text-[#a78bfa]' : 'opacity-0 group-hover:opacity-100 text-gray-400'
                }`}
              >
                {manuallyUnread ? <MailOpen className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
              </button>
              {conversation.last_message_at && (
                <span className="text-[10px] text-gray-500 flex-shrink-0">
                  {formatLastMessageTime(conversation.last_message_at)}
                </span>
              )}
            </div>
            <p className={`text-xs truncate ${hasUnread ? 'font-medium text-gray-300' : 'text-gray-500'}`}>
              {conversation.last_message_preview?.trim() ||
                (conversation.last_message_at ? 'Mensagem' : 'Sem mensagens')}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {finalized && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border w-fit bg-green-500/15 text-green-400 border-green-500/30"
                  title="Conversa finalizada"
                >
                  <CheckCheck className="w-3 h-3 shrink-0" />
                  Finalizada
                </span>
              )}
              {isLeadFromAd && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border w-fit bg-blue-500/20 text-blue-300 border-blue-500/30"
                  title={[campaign?.utm_source, campaign?.utm_medium, campaign?.utm_campaign].filter(Boolean).join(' · ') || 'Lead de anúncio'}
                >
                  <Megaphone className="w-3 h-3 shrink-0" />
                  Lead de anúncio
                </span>
              )}
              {dept && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border w-fit"
                  style={{
                    background: `${dept.color}22`,
                    color: dept.color,
                    borderColor: `${dept.color}55`,
                  }}
                  title={`Departamento: ${dept.name}`}
                >
                  {dept.name}
                </span>
              )}
              {conversation.assigned_to && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border w-fit ${
                    ownerIsMe
                      ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      : 'bg-white/5 text-gray-400 border-white/10'
                  }`}
                  title={ownerIsMe ? 'Atribuída a você' : `Atribuída a ${ownerName ?? 'outro operador'}`}
                >
                  <UserRound className="w-3 h-3 shrink-0" />
                  {ownerIsMe ? 'Você' : (ownerName ?? 'Atribuída').split(' ')[0]}
                </span>
              )}
              {situationBadge && (
                <span
                  className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border w-fit ${situationBadge.className}`}
                  title={situationBadge.label}
                >
                  {situationBadge.shortLabel}
                </span>
              )}
            </div>
            {hasUnread &&
              (conversation.unread_count > 0 ? (
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full text-white flex-shrink-0"
                  style={{ background: '#8b5cf6' }}
                >
                  {conversation.unread_count}
                </span>
              ) : (
                /* Marca do atendente sem mensagem nova: ponto, não número —
                   escrever "0" ou inventar "1" mentiria sobre o que chegou. */
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: '#8b5cf6' }}
                  title="Você marcou esta conversa como não lida"
                  aria-label="Marcada como não lida"
                />
              ))}
          </div>
        </Link>
      </div>
    </div>
  );
}
