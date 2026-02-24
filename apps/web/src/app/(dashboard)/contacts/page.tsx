'use client';

import { useState } from 'react';
import { useContacts } from '@/hooks/useContacts';
import { useSupabase } from '@/hooks/useSupabase';
import { ChannelBadge } from '@/components/layout/ChannelBadge';
import { Mail, FileText, Loader2, Search } from 'lucide-react';
import type { Contact, ChannelType } from '@/types';

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

export default function ContactsPage() {
  const { contacts, loading } = useContacts();
  const supabase = useSupabase();
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const filtered = search.trim()
    ? contacts.filter(
        (c) =>
          (c.name?.toLowerCase().includes(search.toLowerCase()) ||
            c.phone?.includes(search) ||
            c.external_id?.includes(search) ||
            c.email?.toLowerCase().includes(search.toLowerCase()))
      )
    : contacts;

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

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[#0d0d1a]" style={{ color: '#e2e8f0' }}>
      <div className="p-4 sm:p-6 max-w-3xl w-full">
        <h1 className="text-2xl font-bold text-white mb-1">Contatos</h1>
        <p className="text-sm text-gray-500 mb-6">
          Contatos que já conversaram com você. Adicione e-mail e observações para identificá-los.
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
              const displayName = c.name || c.phone || c.external_id || 'Sem nome';
              const colorIndex = (displayName?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;

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
                      <p className="font-semibold text-white truncate">{displayName}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">
                        {c.phone || c.external_id}
                      </p>

                      {!isEditing ? (
                        <>
                          {c.email && (
                            <p className="text-sm text-gray-400 mt-2 flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5" /> {c.email}
                            </p>
                          )}
                          {c.notes && (
                            <p className="text-sm text-gray-400 mt-1 flex items-start gap-1.5">
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
                            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                              E-mail
                            </label>
                            <input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              placeholder="exemplo@email.com"
                              className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                              Observações
                            </label>
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
