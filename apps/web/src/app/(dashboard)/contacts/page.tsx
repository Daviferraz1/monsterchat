'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useContacts } from '@/hooks/useContacts';
import { useSupabase } from '@/hooks/useSupabase';
import { ChannelBadge } from '@/components/layout/ChannelBadge';
import { Mail, FileText, Loader2, Search, ChevronDown, ChevronUp, MessageSquare, MapPin, ShoppingBag, ExternalLink, Megaphone } from 'lucide-react';
import type { Contact, ChannelType, DigitalGuruMetadata, LeadCampaign } from '@/types';

const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function getInitials(name: string): string {
  if (!name || name === 'Sem nome') return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '—';
  const d = phone.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    const part = num.length >= 5 ? `${num.slice(0, 5)}-${num.slice(5)}` : num;
    return `+55 (${ddd}) ${part}`;
  }
  if (d.length >= 11) {
    const ddd = d.slice(0, 2);
    const num = d.slice(2);
    const part = num.length >= 5 ? `${num.slice(0, 5)}-${num.slice(5)}` : num;
    return `(${ddd}) ${part}`;
  }
  return phone;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string | null): string {
  if (!status) return '—';
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    approved: 'Aprovado',
    paid: 'Pago',
    pending: 'Pendente',
    refused: 'Recusado',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
    refunded: 'Reembolsado',
    chargeback: 'Chargeback',
    abandoned: 'Abandonado',
    expired: 'Expirado',
    processing: 'Processando',
    analyzing: 'Em análise',
  };
  return map[s] ?? status;
}

interface ContactSale {
  id: string;
  product_names: string;
  status: string | null;
  sold_at: string;
  payment_method: string | null;
  payment_total: number | null;
  address_full: string | null;
  conversation_id: string | null;
}

export default function ContactsPage() {
  const { contacts, loading } = useContacts();
  const supabase = useSupabase();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [conversationByContact, setConversationByContact] = useState<Record<string, string>>({});
  const [salesByContact, setSalesByContact] = useState<Record<string, ContactSale[]>>({});
  const [loadingExtra, setLoadingExtra] = useState(true);

  const filtered = useMemo(
    () =>
      search.trim()
        ? contacts.filter(
            (c) =>
              c.name?.toLowerCase().includes(search.toLowerCase()) ||
              c.phone?.includes(search) ||
              c.external_id?.includes(search) ||
              c.email?.toLowerCase().includes(search.toLowerCase())
          )
        : contacts,
    [contacts, search]
  );

  const contactIdsKey = useMemo(() => contacts.map((c) => c.id).sort().join(','), [contacts]);

  useEffect(() => {
    if (!supabase || contacts.length === 0) {
      setLoadingExtra(false);
      return;
    }
    let cancelled = false;
    setLoadingExtra(true);
    const contactIds = contacts.map((c) => c.id);

    (async () => {
      const [convsRes, salesRes] = await Promise.all([
        supabase.from('conversations').select('id, contact_id').in('contact_id', contactIds),
        fetch('/api/integrations/digital-guru/sales?limit=500').then((r) => r.json().catch(() => ({ sales: [] }))),
      ]);

      if (cancelled) return;
      const convMap: Record<string, string> = {};
      if (convsRes.data) {
        for (const conv of convsRes.data) {
          if (conv.contact_id && !convMap[conv.contact_id]) convMap[conv.contact_id] = conv.id;
        }
      }
      setConversationByContact(convMap);

      const salesList = Array.isArray(salesRes.sales) ? salesRes.sales : [];
      const byContact: Record<string, ContactSale[]> = {};
      const seenIdsByContact: Record<string, Set<string>> = {};
      for (const s of salesList) {
        const cid = s.contact_id as string | undefined;
        if (!cid) continue;
        const saleId = String(s.id);
        if (!seenIdsByContact[cid]) seenIdsByContact[cid] = new Set();
        if (seenIdsByContact[cid].has(saleId)) continue;
        seenIdsByContact[cid].add(saleId);
        if (!byContact[cid]) byContact[cid] = [];
        byContact[cid].push({
          id: s.id,
          product_names: s.product_names,
          status: s.status,
          sold_at: s.sold_at,
          payment_method: s.payment_method,
          payment_total: s.payment_total,
          address_full: s.address_full,
          conversation_id: s.conversation_id,
        });
      }
      for (const arr of Object.values(byContact)) {
        arr.sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime());
      }
      setSalesByContact(byContact);
      setLoadingExtra(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, contactIdsKey]);

  const startEdit = (c: Contact) => {
    setEditingId(c.id);
    setEditEmail(c.email ?? '');
    setEditNotes(c.notes ?? '');
  };

  const saveContact = async (id: string) => {
    setSavingId(id);
    const { error } = await supabase
      .from('contacts')
      .update({
        email: editEmail.trim() || null,
        notes: editNotes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating contact:', error);
    }
    setSavingId(null);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditEmail('');
    setEditNotes('');
  };

  const whatsAppUrl = (phone: string | null | undefined) => {
    if (!phone || typeof phone !== 'string') return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${withCountry}`;
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#0d0d1a]" style={{ color: '#e2e8f0' }}>
      <div className="p-4 sm:p-6 max-w-3xl w-full">
        <h1 className="text-2xl font-bold text-white mb-1">Contatos</h1>
        <p className="text-sm text-gray-500 mb-6">
          Contatos que já conversaram com você. Veja endereço, compras e histórico; abra ou inicie a conversa.
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone, e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            {search ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda. Eles aparecem ao receber mensagens.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => {
              const isEditing = editingId === c.id;
              const isExpanded = expandedId === c.id;
              const displayName = c.name || c.phone || c.external_id || 'Sem nome';
              const colorIndex = (displayName?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
              const conversationId = conversationByContact[c.id];
              const sales = salesByContact[c.id] ?? [];
              const dg = (c.metadata?.digital_guru as DigitalGuruMetadata | undefined);
              const campaign = (c.metadata?.campaign as LeadCampaign | undefined);
              const campaignLabel = campaign?.utm_source
                ? (campaign.utm_campaign ? `${campaign.utm_source} · ${campaign.utm_campaign}` : campaign.utm_source)
                : null;
              const latestAddress = sales.length > 0 ? sales[0].address_full : null;
              const approvedSales = sales.filter(
                (s) => s.status?.toLowerCase() === 'approved' || s.status?.toLowerCase() === 'paid'
              );
              const approvedProductNames =
                approvedSales.length > 0
                  ? [...new Set(approvedSales.map((s) => s.product_names).filter(Boolean))]
                  : [];
              const hasPurchased = approvedProductNames.length > 0;

              return (
                <li
                  key={c.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
                >
                  <div className="p-4 flex gap-4">
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                        style={{ background: AVATAR_COLORS[colorIndex] }}
                      >
                        {getInitials(displayName)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 bg-[#0d0d1a] rounded-full p-0.5 ring-1 ring-white/10">
                        <ChannelBadge
                          type={c.channel_type as ChannelType}
                          className="w-5 h-5 [&>svg]:w-3 [&>svg]:h-3"
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white truncate">{displayName}</p>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">
                            {formatPhoneDisplay(c.phone || c.external_id)}
                          </p>
                          {c.email && (
                            <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 shrink-0" /> {c.email}
                            </p>
                          )}
                          {campaignLabel && (
                            <p className="mt-1.5 flex items-center gap-1.5">
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                title={[campaign?.utm_source, campaign?.utm_medium, campaign?.utm_campaign].filter(Boolean).join(' · ')}
                              >
                                <Megaphone className="w-3.5 h-3.5 shrink-0" />
                                {campaignLabel}
                              </span>
                            </p>
                          )}
                          {hasPurchased && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30"
                                title={approvedProductNames.join(', ')}
                              >
                                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                                Comprou
                              </span>
                              {approvedProductNames.slice(0, 2).map((name, i) => (
                                <span
                                  key={i}
                                  className="inline-flex px-2 py-0.5 rounded-md text-xs bg-white/10 text-gray-300 truncate max-w-[180px]"
                                  title={name}
                                >
                                  {name}
                                </span>
                              ))}
                              {approvedProductNames.length > 2 && (
                                <span className="text-xs text-gray-500">
                                  +{approvedProductNames.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {conversationId ? (
                            <Link
                              href={`/inbox/${conversationId}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6]/20 text-[#a78bfa] hover:bg-[#8b5cf6]/30 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Abrir conversa
                            </Link>
                          ) : whatsAppUrl(c.phone || c.external_id) ? (
                            <a
                              href={whatsAppUrl(c.phone || c.external_id)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Iniciar conversa
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-white/5 hover:text-gray-300"
                            aria-expanded={isExpanded}
                            title={isExpanded ? 'Recolher' : 'Ver mais'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {!isEditing ? (
                        <>
                          {c.notes && (
                            <p className="text-sm text-gray-400 mt-2 flex items-start gap-1.5">
                              <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> {c.notes}
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="mt-2 text-xs font-medium text-[#a78bfa] hover:underline"
                          >
                            {c.email || c.notes ? 'Editar e-mail / observações' : 'Adicionar e-mail e observações'}
                          </button>
                        </>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">E-mail</label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              placeholder="exemplo@email.com"
                              className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">Observações</label>
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder="Anotações sobre o contato..."
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 resize-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveContact(c.id)}
                              disabled={savingId === c.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
                            >
                              {savingId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-gray-400 hover:bg-white/15"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-white/10 px-4 py-4 bg-white/[0.02] space-y-4">
                      {campaign && (campaign.utm_source || campaign.utm_medium || campaign.utm_campaign) && (
                        <div className="flex items-start gap-2">
                          <Megaphone className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Origem da campanha</p>
                            <ul className="text-sm text-gray-300 space-y-0.5">
                              {campaign.utm_source && <li><span className="text-gray-500">Fonte:</span> {campaign.utm_source}</li>}
                              {campaign.utm_medium && <li><span className="text-gray-500">Meio:</span> {campaign.utm_medium}</li>}
                              {campaign.utm_campaign && <li><span className="text-gray-500">Campanha:</span> {campaign.utm_campaign}</li>}
                              {campaign.utm_content && <li><span className="text-gray-500">Conteúdo:</span> {campaign.utm_content}</li>}
                              {campaign.utm_term && <li><span className="text-gray-500">Termo:</span> {campaign.utm_term}</li>}
                              {campaign.attributed_at && (
                                <li className="text-xs text-gray-500 mt-1">
                                  Atribuído em {new Date(campaign.attributed_at).toLocaleString('pt-BR')}
                                </li>
                              )}
                            </ul>
                          </div>
                        </div>
                      )}
                      {latestAddress && (
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Endereço</p>
                            <p className="text-sm text-gray-300 break-words">{latestAddress}</p>
                          </div>
                        </div>
                      )}
                      {(dg?.products?.length || dg?.situation) && (
                        <div className="flex items-start gap-2">
                          <ShoppingBag className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Digital Guru</p>
                            {dg?.situation && (
                              <p className="text-sm text-gray-300">
                                Status: <span className="text-[#a78bfa]">{dg.situation}</span>
                              </p>
                            )}
                            {dg?.products?.length ? (
                              <p className="text-sm text-gray-400 mt-0.5">
                                Produtos: {dg.products.map((p) => p.name).join(', ')}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                      {sales.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Histórico de compras</p>
                          <ul className="space-y-2">
                            {sales.slice(0, 10).map((s) => (
                              <li
                                key={s.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5 border-b border-white/5 last:border-0"
                              >
                                <span className="text-gray-300">{s.product_names}</span>
                                <span className="text-gray-500 text-xs">{formatDate(s.sold_at)}</span>
                                <span
                                  className={
                                    s.status?.toLowerCase() === 'approved' || s.status?.toLowerCase() === 'paid'
                                      ? 'text-green-400'
                                      : s.status?.toLowerCase() === 'pending'
                                        ? 'text-amber-400'
                                        : ['refunded', 'chargeback', 'refused', 'cancelled', 'canceled'].includes(s.status?.toLowerCase() ?? '')
                                          ? 'text-red-400'
                                          : 'text-gray-500'
                                  }
                                >
                                  {statusLabel(s.status)}
                                </span>
                                {s.payment_total != null && (
                                  <span className="text-[#a78bfa] font-medium">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.payment_total))}
                                  </span>
                                )}
                                {s.conversation_id && (
                                  <Link
                                    href={`/inbox/${s.conversation_id}`}
                                    className="text-xs text-[#a78bfa] hover:underline"
                                  >
                                    Abrir conversa
                                  </Link>
                                )}
                              </li>
                            ))}
                            {sales.length > 10 && (
                              <li className="text-xs text-gray-500 pt-1">
                                + {sales.length - 10} venda(s) anterior(es)
                              </li>
                            )}
                          </ul>
                        </div>
                      )}
                      {!latestAddress && !dg?.products?.length && !dg?.situation && sales.length === 0 && !(campaign?.utm_source || campaign?.utm_medium || campaign?.utm_campaign) && (
                        <p className="text-sm text-gray-500">Nenhum endereço, compra, campanha ou histórico registrado.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {loadingExtra && contacts.length > 0 && (
          <p className="text-center text-xs text-gray-500 py-2">Carregando conversas e vendas...</p>
        )}
      </div>
    </div>
  );
}
