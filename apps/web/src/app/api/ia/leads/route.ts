import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

interface LeadMeta {
  interesse?: string;
  motivo?: string;
  obs?: string | null;
  at?: string;
}

/** Lista os contatos classificados como lead para follow-up (metadata.lead). */
export async function GET() {
  try {
    const { data: contacts, error } = await supabaseAdmin
      .from('contacts')
      .select('id, name, phone, email, metadata, updated_at')
      .not('metadata->lead', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (contacts ?? []).filter((c) => {
      const lead = (c.metadata as { lead?: LeadMeta } | null)?.lead;
      return !!(lead && (lead.interesse || lead.motivo));
    });

    const ids = rows.map((c) => c.id);
    const convByContact = new Map<string, string>();
    if (ids.length) {
      const { data: convs } = await supabaseAdmin
        .from('conversations')
        .select('id, contact_id, last_message_at')
        .in('contact_id', ids)
        .order('last_message_at', { ascending: false });
      for (const cv of (convs ?? []) as Array<{ id: string; contact_id: string }>) {
        if (!convByContact.has(cv.contact_id)) convByContact.set(cv.contact_id, cv.id);
      }
    }

    const leads = rows.map((c) => {
      const lead = (c.metadata as { lead: LeadMeta }).lead;
      return {
        contactId: c.id,
        name: c.name ?? null,
        phone: c.phone ?? null,
        email: c.email ?? null,
        interesse: lead.interesse ?? null,
        motivo: lead.motivo ?? null,
        obs: lead.obs ?? null,
        at: lead.at ?? c.updated_at ?? null,
        conversationId: convByContact.get(c.id) ?? null,
      };
    });

    return NextResponse.json({ leads });
  } catch (err) {
    console.error('[API ia/leads] GET', err);
    return NextResponse.json({ error: 'Falha ao listar leads' }, { status: 500 });
  }
}

/** Conclui (remove) a classificação de lead de um contato. */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');
    if (!contactId) return NextResponse.json({ error: 'contactId obrigatório' }, { status: 400 });

    const { data: c } = await supabaseAdmin
      .from('contacts')
      .select('metadata')
      .eq('id', contactId)
      .maybeSingle();
    const metadata = ((c?.metadata as Record<string, unknown>) || {});
    delete metadata.lead;
    const { error } = await supabaseAdmin
      .from('contacts')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', contactId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/leads] DELETE', err);
    return NextResponse.json({ error: 'Falha ao concluir lead' }, { status: 500 });
  }
}
