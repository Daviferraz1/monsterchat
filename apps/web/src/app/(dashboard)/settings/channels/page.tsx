'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Instagram, Plus, Loader2, RefreshCw, Pencil, Trash2, Bell, QrCode } from 'lucide-react';
import { useNotificationSoundEnabled } from '@/hooks/useNotificationSoundEnabled';

const API_URL = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001') : 'http://localhost:3001';

interface Channel {
  id: string;
  type: 'whatsapp' | 'instagram' | 'whatsapp_baileys';
  name: string;
  external_id: string;
  business_account_id: string | null;
  access_token: string;
  is_active: boolean;
  created_at: string;
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingTokenId, setUpdatingTokenId] = useState<string | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editForm, setEditForm] = useState({ name: '', access_token: '', is_active: true, external_id: '', business_account_id: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [soundEnabled, setSoundEnabled] = useNotificationSoundEnabled();
  const [form, setForm] = useState({
    type: 'whatsapp' as 'whatsapp' | 'instagram' | 'whatsapp_baileys',
    name: '',
    external_id: '',
    business_account_id: '',
    access_token: '',
    is_active: true,
  });

  const [qrChannelId, setQrChannelId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrConnected, setQrConnected] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrApiUnreachable, setQrApiUnreachable] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadChannels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/channels');
      const text = await res.text();
      let data: Channel[] | { error?: string; code?: string } = [];
      try {
        data = text ? JSON.parse(text) : [];
      } catch {
        throw new Error(res.ok ? 'Resposta inválida' : 'Falha ao carregar canais');
      }
      if (!res.ok) {
        const err = typeof data === 'object' && data && 'error' in data ? (data as { error: string }).error : res.statusText;
        throw new Error(err || 'Falha ao carregar canais');
      }
      setChannels(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          external_id: form.type === 'whatsapp_baileys' ? 'baileys' : form.external_id.trim(),
          business_account_id: form.business_account_id.trim() || undefined,
          access_token: form.type === 'whatsapp_baileys' ? 'baileys-placeholder' : form.access_token.trim(),
          is_active: form.is_active,
        }),
      });
      const text = await res.text();
      let data: { error?: string; id?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        if (!res.ok) throw new Error('Falha ao salvar. Verifique as variáveis de ambiente do Supabase.');
      }
      if (!res.ok) throw new Error((data && data.error) || 'Falha ao salvar');
      setSuccess('Canal cadastrado com sucesso!');
      setForm({
        type: 'whatsapp',
        name: '',
        external_id: '',
        business_account_id: '',
        access_token: '',
        is_active: true,
      });
      if (form.type === 'whatsapp_baileys' && data?.id) {
        setQrChannelId(data.id);
        setQrImage(null);
        setQrConnected(false);
        setQrLoading(true);
      }
      loadChannels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (ch: Channel) => {
    setEditingChannel(ch);
    setEditForm({
      name: ch.name,
      access_token: '',
      is_active: ch.is_active,
      external_id: ch.external_id ?? '',
      business_account_id: ch.business_account_id ?? '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    setError(null);
    setSuccess(null);
    setSavingEdit(true);
    try {
      const body: { name?: string; access_token?: string; is_active?: boolean; external_id?: string; business_account_id?: string } = {
        name: editForm.name.trim(),
        is_active: editForm.is_active,
        external_id: editForm.external_id.trim() || undefined,
        business_account_id: editForm.business_account_id.trim() || undefined,
      };
      if (editForm.access_token.trim()) body.access_token = editForm.access_token.trim();

      const res = await fetch(`/api/channels/${editingChannel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar canal');
      setSuccess('Canal atualizado com sucesso.');
      setEditingChannel(null);
      loadChannels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleUpdateToken = async (channelId: string) => {
    const newToken = window.prompt(
      'Cole o novo Access Token do WhatsApp (token expirado pode ser renovado em developers.facebook.com):'
    );
    if (!newToken?.trim()) return;
    setError(null);
    setSuccess(null);
    setUpdatingTokenId(channelId);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: newToken.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar token');
      setSuccess('Token atualizado. Você já pode responder pelo Inbox.');
      loadChannels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar token');
    } finally {
      setUpdatingTokenId(null);
    }
  };

  const handleToggleActive = async (ch: Channel) => {
    setError(null);
    setSuccess(null);
    setTogglingActiveId(ch.id);
    try {
      const res = await fetch(`/api/channels/${ch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !ch.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar');
      setSuccess(ch.is_active ? 'Canal desativado.' : 'Canal ativado.');
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, is_active: !c.is_active } : c))
      );
      if (editingChannel?.id === ch.id) setEditForm((f) => ({ ...f, is_active: !ch.is_active }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar');
    } finally {
      setTogglingActiveId(null);
    }
  };

  const openQrModal = (ch: Channel) => {
    if (ch.type !== 'whatsapp_baileys') return;
    setQrChannelId(ch.id);
    setQrImage(null);
    setQrConnected(false);
    setQrLoading(true);
    setQrApiUnreachable(false);
    setQrError(null);
  };

  useEffect(() => {
    if (!qrChannelId) {
      if (qrPollRef.current) {
        clearInterval(qrPollRef.current);
        qrPollRef.current = null;
      }
      return;
    }

    const baseUrl = API_URL.replace(/\/$/, '');
    const fetchQr = async () => {
      try {
        const res = await fetch(`${baseUrl}/baileys/qr/${qrChannelId}`);
        setQrApiUnreachable(false);
        const data = await res.json().catch(() => ({}));
        if (data.connected) {
          setQrConnected(true);
          setQrImage(null);
          setQrError(null);
          if (qrPollRef.current) {
            clearInterval(qrPollRef.current);
            qrPollRef.current = null;
          }
          return;
        }
        if (data.error) {
          setQrError(data.error);
          setQrLoading(false);
          if (qrPollRef.current) {
            clearInterval(qrPollRef.current);
            qrPollRef.current = null;
          }
          return;
        }
        if (data.qr) {
          const img = data.qr.startsWith('data:') ? data.qr : `data:image/png;base64,${data.qr}`;
          setQrImage(img);
          setQrError(null);
        }
      } catch (err) {
        setQrLoading(false);
        setQrApiUnreachable(true);
        setQrError(null);
      }
    };

    fetchQr();
    qrPollRef.current = setInterval(fetchQr, 4000);

    return () => {
      if (qrPollRef.current) {
        clearInterval(qrPollRef.current);
        qrPollRef.current = null;
      }
    };
  }, [qrChannelId]);

  useEffect(() => {
    if (!qrChannelId) setQrLoading(false);
    else if (qrConnected || qrImage || qrError) setQrLoading(false);
  }, [qrChannelId, qrConnected, qrImage, qrError]);

  const handleDeleteChannel = async (ch: Channel) => {
    if (!window.confirm(`Excluir o canal "${ch.name}"? As conversas e mensagens vinculadas também serão removidas.`)) return;
    setError(null);
    setSuccess(null);
    setDeletingChannelId(ch.id);
    try {
      const res = await fetch(`/api/channels/${ch.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao excluir canal');
      setSuccess('Canal excluído.');
      if (editingChannel?.id === ch.id) setEditingChannel(null);
      loadChannels();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir');
    } finally {
      setDeletingChannelId(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Configurações</h1>
        <p className="text-muted-foreground mb-6">
          Preferências do atendente e canais para receber e enviar mensagens.
        </p>

        {/* Preferências */}
        <div className="mb-8 p-4 border rounded-lg bg-muted/30 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Bell className="w-4 h-4" /> Preferências
          </h2>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">Som ao receber nova mensagem</span>
            <button
              type="button"
              role="switch"
              aria-checked={soundEnabled}
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] focus:ring-offset-2 focus:ring-offset-background ${
                soundEnabled ? 'bg-[#8b5cf6] border-[#8b5cf6]' : 'bg-muted border-input'
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                  soundEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
                style={{ marginTop: 2 }}
              />
            </button>
          </label>
          <p className="text-xs text-muted-foreground">
            Ative ou desative o som de notificação quando chegar uma nova mensagem no inbox.
          </p>
        </div>

        <h2 className="text-xl font-bold mb-2">Canais</h2>
        <p className="text-muted-foreground mb-4">
          Cadastre seu canal do WhatsApp (e depois Instagram) para receber e enviar mensagens. Sem um canal ativo, o webhook não associa mensagens ao inbox.
        </p>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4 mb-8 p-4 border rounded-lg bg-muted/30">
          <h2 className="font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo canal
          </h2>

          <div>
            <label className="block text-sm font-medium mb-1">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'whatsapp' | 'instagram' | 'whatsapp_baileys' }))}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="whatsapp">WhatsApp (API Meta)</option>
              <option value="whatsapp_baileys">WhatsApp (QR / Baileys)</option>
              <option value="instagram">Instagram</option>
            </select>
            {form.type === 'whatsapp_baileys' && (
              <p className="text-xs text-muted-foreground mt-1">
                Conecte com QR code (WhatsApp comum). Requer a API do MonsterChat rodando (API_URL). Não usa API oficial da Meta.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nome do canal</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={form.type === 'whatsapp_baileys' ? 'Ex: WhatsApp Pessoal' : 'Ex: WhatsApp Principal'}
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
            />
          </div>

          {form.type !== 'whatsapp_baileys' && (
          <div>
            <label className="block text-sm font-medium mb-1">
              {form.type === 'whatsapp' ? 'ID do número de telefone (Phone Number ID)' : 'ID da Página do Facebook (Page ID) — para enviar mensagens'}
            </label>
            <input
              type="text"
              value={form.external_id}
              onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
              placeholder={form.type === 'whatsapp' ? 'Ex: 247994065074259' : 'Ex: 123456789012345'}
              className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
              required
            />
            {form.type === 'instagram' && (
              <div className="text-xs text-muted-foreground mt-1 space-y-1">
                <p>Para <strong>enviar</strong> mensagens use o ID da <strong>Página do Facebook</strong> (não o de &quot;Contas do Instagram&quot;).</p>
                <p>No Meta Business Suite: <strong>Configurações → Contas → Páginas</strong> (não &quot;Contas do Instagram&quot;) → abra a página vinculada ao Instagram → o ID dessa página vai no campo acima.</p>
              </div>
            )}
          </div>
          )}

          {form.type === 'whatsapp' && (
            <div>
              <label className="block text-sm font-medium mb-1">ID da conta Business (WABA ID) — opcional</label>
              <input
                type="text"
                value={form.business_account_id}
                onChange={(e) => setForm((f) => ({ ...f, business_account_id: e.target.value }))}
                placeholder="Ex: 285585611312219"
                className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
              />
            </div>
          )}
          {form.type === 'instagram' && (
            <div>
              <label className="block text-sm font-medium mb-1">ID da conta do Instagram (recipient.id no webhook) — obrigatório para o webhook</label>
              <input
                type="text"
                value={form.business_account_id}
                onChange={(e) => setForm((f) => ({ ...f, business_account_id: e.target.value }))}
                placeholder="Ex: 17841403342667626"
                className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">O ID que o webhook envia (pageId no log). Necessário para o canal ser encontrado ao receber mensagens. Não use o ID do app.</p>
            </div>
          )}

          {form.type !== 'whatsapp_baileys' && (
          <div>
            <label className="block text-sm font-medium mb-1">Token de acesso (Access Token)</label>
            <input
              type="password"
              value={form.access_token}
              onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
              placeholder="Cole o token gerado na Meta"
              className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
              required
            />
          </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="rounded"
            />
            <label htmlFor="is_active" className="text-sm">Canal ativo</label>
          </div>

          {error && (
            <div className="text-sm text-red-600 space-y-1">
              <p>{error}</p>
              {error.includes('Supabase não configurado') && (
                <div className="text-muted-foreground mt-2 space-y-1 text-xs">
                  <p><strong>Desenvolvimento local:</strong> Verifique se o arquivo <code className="bg-muted px-1 rounded">apps/web/.env</code> tem NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY. Depois <strong>reinicie o servidor Next.js</strong> (Ctrl+C e depois <code className="bg-muted px-1 rounded">npm run dev</code>).</p>
                  <p><strong>Vercel:</strong> Settings → Environment Variables → adicione as variáveis. Depois faça um novo deploy.</p>
                </div>
              )}
            </div>
          )}
          {success && (
            <p className="text-sm text-green-600">{success}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Cadastrar canal'}
          </button>
        </form>

        {/* Lista de canais */}
        <h2 className="font-semibold mb-3">Canais cadastrados</h2>
        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : channels.length === 0 ? (
          <p className="text-muted-foreground">Nenhum canal cadastrado. Cadastre um acima para começar.</p>
        ) : (
          <ul className="space-y-2">
            {channels.map((ch) => (
              <li
                key={ch.id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-background"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-muted">
                  {ch.type === 'whatsapp' || ch.type === 'whatsapp_baileys' ? (
                    <MessageCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Instagram className="w-5 h-5 text-pink-500" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{ch.name}</p>
                  <p className="text-sm text-muted-foreground font-mono">{ch.external_id}</p>
                </div>
                <div className="flex items-center gap-2">
                  {togglingActiveId === ch.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(ch)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                        ch.is_active ? 'bg-primary' : 'bg-muted'
                      }`}
                      role="switch"
                      aria-checked={ch.is_active}
                      aria-label={ch.is_active ? 'Desativar canal' : 'Ativar canal'}
                      title={ch.is_active ? 'Desativar canal' : 'Ativar canal'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                          ch.is_active ? 'translate-x-5' : 'translate-x-1'
                        }`}
                        style={{ marginTop: 2 }}
                      />
                    </button>
                  )}
                  <span
                    className={`text-xs px-2 py-1 rounded-full w-14 text-center ${
                      ch.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ch.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {ch.type === 'whatsapp_baileys' && (
                    <button
                      type="button"
                      onClick={() => openQrModal(ch)}
                      className="p-2 rounded-md border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Conectar com QR code"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(ch)}
                    className="p-2 rounded-md border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Editar canal (nome, token, ativo)"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {ch.type !== 'whatsapp_baileys' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateToken(ch.id)}
                    disabled={!!updatingTokenId}
                    className="p-2 rounded-md border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Atualizar token (use quando expirar ou der 401 ao responder)"
                  >
                    {updatingTokenId === ch.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch)}
                    disabled={!!deletingChannelId}
                    className="p-2 rounded-md border border-input bg-background hover:bg-red-50 text-muted-foreground hover:text-red-600 disabled:opacity-50"
                    title="Excluir canal"
                  >
                    {deletingChannelId === ch.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Modal Editar canal */}
        {editingChannel && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setEditingChannel(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-channel-title"
          >
            <div
              className="bg-background border rounded-lg shadow-lg w-full max-w-md p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="edit-channel-title" className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Pencil className="w-5 h-5" /> Editar canal
              </h2>
              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome do canal</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: WhatsApp Principal"
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {editingChannel.type === 'instagram' ? 'ID da Página do Facebook (Page ID) — para enviar' : 'External ID'}
                  </label>
                  <input
                    type="text"
                    value={editForm.external_id}
                    onChange={(e) => setEditForm((f) => ({ ...f, external_id: e.target.value }))}
                    placeholder={editingChannel.type === 'instagram' ? 'Page ID (Facebook)' : 'Page ID ou Phone Number ID'}
                    className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
                  />
                </div>
                {editingChannel.type === 'instagram' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">ID da conta do Instagram (para o webhook encontrar o canal)</label>
                    <input
                      type="text"
                      value={editForm.business_account_id}
                      onChange={(e) => setEditForm((f) => ({ ...f, business_account_id: e.target.value }))}
                      placeholder="Ex: 17841403342667626"
                      className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">O pageId que aparece no log do webhook. Necessário para receber mensagens.</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Novo token (opcional)</label>
                  <input
                    type="password"
                    value={editForm.access_token}
                    onChange={(e) => setEditForm((f) => ({ ...f, access_token: e.target.value }))}
                    placeholder="Deixe em branco para não alterar"
                    className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="edit_is_active"
                    checked={editForm.is_active}
                    onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="edit_is_active" className="text-sm">Canal ativo</label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingChannel(null)}
                    className="px-4 py-2 border rounded-md hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {savingEdit ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal QR Code (WhatsApp Baileys) */}
        {qrChannelId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setQrChannelId(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
          >
            <div
              className="bg-background border rounded-lg shadow-lg w-full max-w-sm p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="qr-modal-title" className="text-lg font-semibold mb-2 flex items-center gap-2">
                <QrCode className="w-5 h-5" /> Conectar WhatsApp (QR)
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Abra o WhatsApp no celular → Ajustes → Aparelhos conectados → Conectar um aparelho e escaneie o QR abaixo.
              </p>
              {qrApiUnreachable && (
                <div className="py-6 px-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm space-y-2">
                  <p className="font-medium">API do MonsterChat inacessível</p>
                  <p>
                    A conexão com <code className="bg-amber-100 px-1 rounded">{API_URL}</code> falhou (conexão recusada).
                    O canal WhatsApp (QR) precisa da API rodando.
                  </p>
                  <p className="mt-2">
                    No terminal, inicie a API (porta 3001). Depois feche este modal e abra de novo para gerar o QR.
                  </p>
                  <p className="mt-1 text-xs">
                    Bash: <code className="bg-amber-100 px-1 rounded">cd apps/api &amp;&amp; npm run dev</code>
                    <br />
                    PowerShell: <code className="bg-amber-100 px-1 rounded">cd apps/api; npm run dev</code>
                  </p>
                </div>
              )}
              {qrError && (
                <div className="py-6 px-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm space-y-2">
                  <p className="font-medium">QR indisponível</p>
                  <p>{qrError}</p>
                  <p className="mt-2 text-xs">
                    Feche o modal e tente novamente em alguns minutos, ou use a API em outro ambiente (ex.: máquina local ou VPS).
                  </p>
                </div>
              )}
              {qrLoading && !qrImage && !qrConnected && !qrApiUnreachable && !qrError && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {qrConnected && (
                <div className="py-6 text-center">
                  <p className="text-green-600 font-medium">Conectado</p>
                  <p className="text-sm text-muted-foreground mt-1">Você já pode receber e enviar mensagens por este canal.</p>
                </div>
              )}
              {qrImage && !qrConnected && (
                <div className="flex justify-center bg-white p-4 rounded-lg">
                  <img src={qrImage} alt="QR Code WhatsApp" className="max-w-[256px] w-full h-auto" />
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setQrChannelId(null)}
                  className="px-4 py-2 border rounded-md hover:bg-muted"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
