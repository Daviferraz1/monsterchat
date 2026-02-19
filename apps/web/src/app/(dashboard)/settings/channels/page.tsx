'use client';

import { useState, useEffect } from 'react';
import { MessageCircle, Instagram, Plus, Loader2, RefreshCw, Pencil } from 'lucide-react';

interface Channel {
  id: string;
  type: 'whatsapp' | 'instagram';
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
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editForm, setEditForm] = useState({ name: '', access_token: '', is_active: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    type: 'whatsapp' as 'whatsapp' | 'instagram',
    name: '',
    external_id: '',
    business_account_id: '',
    access_token: '',
    is_active: true,
  });

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
          external_id: form.external_id.trim(),
          business_account_id: form.business_account_id.trim() || undefined,
          access_token: form.access_token.trim(),
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
      const body: { name?: string; access_token?: string; is_active?: boolean } = {
        name: editForm.name.trim(),
        is_active: editForm.is_active,
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

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-2">Canais</h1>
        <p className="text-muted-foreground mb-6">
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
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'whatsapp' | 'instagram' }))}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nome do canal</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: WhatsApp Principal"
              className="w-full px-3 py-2 border rounded-md bg-background"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {form.type === 'whatsapp' ? 'ID do número de telefone (Phone Number ID)' : 'ID da página (Page ID)'}
            </label>
            <input
              type="text"
              value={form.external_id}
              onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
              placeholder={form.type === 'whatsapp' ? 'Ex: 247994065074259' : 'ID da página'}
              className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm"
              required
            />
          </div>

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
                  {ch.type === 'whatsapp' ? (
                    <MessageCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Instagram className="w-5 h-5 text-pink-500" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{ch.name}</p>
                  <p className="text-sm text-muted-foreground font-mono">{ch.external_id}</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    ch.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {ch.is_active ? 'Ativo' : 'Inativo'}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(ch)}
                    className="p-2 rounded-md border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Editar canal (nome, token, ativo)"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
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
      </div>
    </div>
  );
}
