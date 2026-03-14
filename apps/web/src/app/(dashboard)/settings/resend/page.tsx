'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, ChevronLeft, Loader2, Save, User, Key, Search, Copy } from 'lucide-react';

const PLATFORMS: Array<{ value: string; label: string }> = [
  { value: 'monster_study', label: 'Monster Study' },
  { value: 'monster_questoes', label: 'Monster Questões' },
  { value: 'monster_sound', label: 'Monster Sound' },
];

interface EmailItem {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event: string;
}

interface EmailDetail {
  email: { id: string; to: string[]; subject: string; created_at: string; html: string | null; text: string | null };
  credentials: { login: string | null; password: string | null };
}

interface ContactOption {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface CredentialRow {
  platform: string;
  platformLabel: string;
  login: string;
  password: string;
  sent_at: string | null;
}

export default function ResendPage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [savingContactId, setSavingContactId] = useState<string | null>(null);
  const [creatingAndSaving, setCreatingAndSaving] = useState(false);
  const [platform, setPlatform] = useState('monster_study');
  const [emailFilter, setEmailFilter] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupCredentials, setLookupCredentials] = useState<Array<{ contact: ContactOption; credentials: CredentialRow[] }>>([]);
  const [hasLookedUp, setHasLookedUp] = useState(false);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [resendConfigured, setResendConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/integrations/resend/emails?limit=30');
        const data = await res.json();
        if (!cancelled) {
          setEmails(Array.isArray(data.emails) ? data.emails : []);
          setHasMoreEmails(data.hasMore === true);
          setResendConfigured(data.configured === true || data.configured === false ? data.configured : null);
        }
      } catch {
        if (!cancelled) setEmails([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadFirstPage = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integrations/resend/emails?limit=30');
      const data = await res.json();
      setEmails(Array.isArray(data.emails) ? data.emails : []);
      setHasMoreEmails(data.hasMore === true);
      setResendConfigured(data.configured === true || data.configured === false ? data.configured : null);
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreEmails = async () => {
    if (emails.length === 0 || loadingMore) return;
    const lastId = emails[emails.length - 1]?.id;
    if (!lastId) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/integrations/resend/emails?limit=30&after=${encodeURIComponent(lastId)}`);
      const data = await res.json();
      const more = Array.isArray(data.emails) ? data.emails : [];
      setEmails((prev) => [...prev, ...more]);
      setHasMoreEmails(data.hasMore === true);
    } catch {
      setHasMoreEmails(false);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/integrations/resend/emails/${selectedId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.email) setDetail({ email: data.email, credentials: data.credentials ?? {} });
      })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const recipientEmail = detail?.email?.to?.[0] ?? '';
  useEffect(() => {
    if (!recipientEmail) {
      setContacts([]);
      return;
    }
    setContactSearch(recipientEmail);
    let cancelled = false;
    fetch(`/api/contacts?email=${encodeURIComponent(recipientEmail)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.contacts)) setContacts(data.contacts);
      })
      .catch(() => { if (!cancelled) setContacts([]); });
    return () => { cancelled = true; };
  }, [recipientEmail]);

  const filteredEmails = emailFilter.trim()
    ? emails.filter((e) => {
        const to = Array.isArray(e.to) ? e.to[0] : e.to;
        return String(to ?? '').toLowerCase().includes(emailFilter.trim().toLowerCase());
      })
    : emails;

  const searchCredentialsByEmail = async () => {
    const email = lookupEmail.trim();
    if (!email) return;
    setLookupLoading(true);
    setLookupCredentials([]);
    setHasLookedUp(false);
    try {
      const res = await fetch(`/api/contacts?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      const contactList: ContactOption[] = Array.isArray(data.contacts) ? data.contacts : [];
      const results: Array<{ contact: ContactOption; credentials: CredentialRow[] }> = [];
      for (const c of contactList) {
        const credRes = await fetch(`/api/contacts/${c.id}/credentials`);
        const credData = await credRes.json();
        const creds: CredentialRow[] = Array.isArray(credData.credentials) ? credData.credentials : [];
        if (creds.length > 0) results.push({ contact: c, credentials: creds });
      }
      setLookupCredentials(results);
    } catch {
      setLookupCredentials([]);
    } finally {
      setLookupLoading(false);
      setHasLookedUp(true);
    }
  };

  const saveToContact = async (contactId: string) => {
    if (!detail?.credentials?.login || !detail?.credentials?.password) return;
    setSavingContactId(contactId);
    try {
      const res = await fetch('/api/integrations/resend/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          platform,
          login: detail.credentials.login,
          password: detail.credentials.password,
          resendEmailId: detail.email.id,
          sentAt: detail.email.created_at,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Falha ao salvar');
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSavingContactId(null);
    }
  };

  const createContactAndSaveCredentials = async () => {
    if (!recipientEmail || !detail?.credentials?.login || !detail?.credentials?.password) return;
    setCreatingAndSaving(true);
    try {
      const createRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail,
          name: recipientEmail.split('@')[0] || recipientEmail,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        alert(created.error || 'Falha ao criar contato');
        return;
      }
      const contactId = created.id;
      const saveRes = await fetch('/api/integrations/resend/save-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          platform,
          login: detail.credentials.login,
          password: detail.credentials.password,
          resendEmailId: detail.email.id,
          sentAt: detail.email.created_at,
        }),
      });
      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}));
        alert(err.error || 'Contato criado, mas falha ao salvar credenciais');
        return;
      }
      setContacts((prev) => [...prev, { id: created.id, name: created.name, email: created.email, phone: created.phone }]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro');
    } finally {
      setCreatingAndSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/settings/ia"
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="w-7 h-7 text-[#7c3aed]" />
            E-mails Resend (acesso)
          </h1>
        </div>
        <p className="text-gray-600 text-sm mb-4">
          E-mails enviados com login e senha das plataformas Monster. Clique em um e-mail para ver o conteúdo e salvar as credenciais em um contato — assim você pode reenviar o acesso direto no chat.
        </p>

        {/* Pesquisar credenciais salvas por e-mail (login/senha que o Resend enviou e já salvamos no contato) */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 mb-6">
          <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Search className="w-4 h-4" />
            Pesquisar login/senha por e-mail do aluno
          </h3>
          <p className="text-xs text-gray-600 mb-2">
            Digite o e-mail que o aluno informou e veja as credenciais que já salvamos para esse contato (enviadas pelo Resend).
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              placeholder="ex: aluno@email.com"
              value={lookupEmail}
              onChange={(e) => setLookupEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchCredentialsByEmail()}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
            />
            <button
              type="button"
              onClick={searchCredentialsByEmail}
              disabled={lookupLoading || !lookupEmail.trim()}
              className="px-4 py-2 rounded-lg bg-[#7c3aed] text-white text-sm font-medium hover:bg-[#6d28d9] disabled:opacity-50 flex items-center gap-2"
            >
              {lookupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
          {lookupCredentials.length > 0 && (
            <div className="mt-3 space-y-3">
              {lookupCredentials.map(({ contact, credentials }) => (
                <div key={contact.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                  <p className="font-medium text-gray-900 mb-2">{contact.name || contact.email || contact.id}</p>
                  {credentials.map((cred) => (
                    <div key={cred.platform} className="flex flex-wrap items-center gap-2 py-2 border-t border-gray-100 first:border-t-0">
                      <span className="text-gray-600">{cred.platformLabel}:</span>
                      <span className="text-gray-900">Login: {cred.login}</span>
                      <span className="text-gray-900">Senha: {cred.password}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(`Login: ${cred.login}\nSenha: ${cred.password}`)}
                        className="text-[#7c3aed] hover:underline text-xs flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" /> Copiar
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {hasLookedUp && lookupCredentials.length === 0 && !lookupLoading && (
            <p className="text-sm text-gray-500 mt-2">Nenhuma credencial salva para contatos com esse e-mail.</p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : emails.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
            <p className="text-gray-600 mb-4">
              {resendConfigured === false
                ? 'RESEND_API_KEY não configurada. Configure no .env (ou nas variáveis da Vercel) e reinicie.'
                : resendConfigured === true
                  ? 'A API retornou 0 e-mails. Confira: (1) A API key em RESEND_API_KEY tem permissão "Full access" em Resend → API Keys; (2) A key é da mesma conta (ex.: davimnferraz) onde os e-mails aparecem no dashboard.'
                  : 'Nenhum e-mail listado. Configure RESEND_API_KEY no ambiente e envie e-mails pelo Resend.'}
            </p>
            <button
              type="button"
              onClick={loadFirstPage}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/5 text-sm font-medium text-[#7c3aed] hover:bg-[#7c3aed]/10 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Carregar e-mails do Resend
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
              <div className="bg-gray-50 px-3 py-2 border-b flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-600">E-mails enviados</span>
                <input
                  type="text"
                  placeholder="Filtrar por e-mail do destinatário..."
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs"
                />
                <button
                  type="button"
                  onClick={loadMoreEmails}
                  disabled={loadingMore || !hasMoreEmails}
                  className="w-full py-2 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/5 text-sm font-medium text-[#7c3aed] hover:bg-[#7c3aed]/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                >
                  {loadingMore ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : hasMoreEmails ? (
                    'Carregar mais e-mails (anteriores)'
                  ) : (
                    'Não há mais e-mails para carregar'
                  )}
                </button>
              </div>
              <ul className="max-h-[320px] overflow-y-auto divide-y divide-gray-100 flex-1 min-h-0">
                {filteredEmails.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${selectedId === e.id ? 'bg-[#7c3aed]/10 border-l-2 border-[#7c3aed]' : ''}`}
                    >
                      <span className="font-medium text-gray-900 truncate block">{e.subject}</span>
                      <span className="text-xs text-gray-500 truncate block">
                        {(Array.isArray(e.to) ? e.to[0] : e.to) ?? '—'} · {e.created_at ? new Date(e.created_at).toLocaleString('pt-BR') : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b text-xs font-medium text-gray-600">
                Conteúdo e salvar em contato
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto">
                {!selectedId ? (
                  <p className="text-gray-500 text-sm">Selecione um e-mail.</p>
                ) : detailLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : detail ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Login / Senha extraídos</p>
                      <div className="flex items-center gap-2 text-sm">
                        <Key className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-gray-700">{detail.credentials.login ?? '—'}</span>
                        {detail.credentials.login && (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(detail.credentials.login ?? '')}
                            className="text-[#7c3aed] hover:underline text-xs flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copiar
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <Key className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-gray-700">{detail.credentials.password ?? '—'}</span>
                        {detail.credentials.password && (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(detail.credentials.password ?? '')}
                            className="text-[#7c3aed] hover:underline text-xs flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copiar senha
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Plataforma</label>
                      <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm"
                      >
                        {PLATFORMS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Salvar em contato (e-mail do destinatário)</p>
                      {contacts.length === 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm text-amber-700">
                            Nenhum contato com e-mail <strong>{recipientEmail}</strong>. Crie um contato para que, quando esse usuário entrar em contato, o sistema já mostre login e senha para o atendente.
                          </p>
                          <button
                            type="button"
                            onClick={createContactAndSaveCredentials}
                            disabled={creatingAndSaving}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#7c3aed] text-white text-sm font-medium hover:bg-[#6d28d9] disabled:opacity-50"
                          >
                            {creatingAndSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Criar contato e salvar credenciais
                          </button>
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {contacts.map((c) => (
                            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <User className="w-4 h-4 text-gray-400 shrink-0" />
                                <span className="text-sm truncate">{c.name || c.email || c.id}</span>
                                {c.email && <span className="text-xs text-gray-500 truncate">{c.email}</span>}
                              </div>
                              <button
                                type="button"
                                onClick={() => saveToContact(c.id)}
                                disabled={savingContactId !== null}
                                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded bg-[#7c3aed] text-white text-xs font-medium hover:bg-[#6d28d9] disabled:opacity-50"
                              >
                                {savingContactId === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Salvar
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {(detail.email.text || detail.email.html) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Ver corpo do e-mail</summary>
                        <pre className="mt-2 p-2 rounded bg-gray-50 overflow-auto max-h-32 whitespace-pre-wrap break-words">
                          {(detail.email.text || detail.email.html || '').slice(0, 1500)}
                        </pre>
                      </details>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Não foi possível carregar o e-mail.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
