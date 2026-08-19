import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { isSupabasePlaceholder } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'media';
/** Bucket privado dos anexos da conversa interna (migração 042). */
const INTERNAL_BUCKET = 'internas';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest) {
  if (isSupabasePlaceholder()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    // O id serve só para agrupar os arquivos por dono (conversa ou tarefa).
    const conversationId =
      (formData.get('conversation_id') as string | null) || (formData.get('task_id') as string | null);
    // scope=internal → anexo da thread interna da equipe. Vai para um bucket
    // PRIVADO e sai só por URL assinada, via /api/internal-files.
    const isInternal = formData.get('scope') === 'internal';

    if (!file || !conversationId) {
      return NextResponse.json(
        { error: 'Envie file e conversation_id.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo 50 MB.' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop() || 'bin';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const path = `${conversationId}/${Date.now()}-${safeName}`;
    const bucket = isInternal ? INTERNAL_BUCKET : BUCKET;

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      return NextResponse.json(
        { error: error.message || 'Falha no upload.' },
        { status: 500 }
      );
    }

    if (isInternal) {
      // Sem URL pública: o arquivo é privado. A nota guarda só o caminho.
      return NextResponse.json({ path, bucket });
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: urlData.publicUrl, path });
  } catch (e) {
    console.error('Upload route error:', e);
    return NextResponse.json(
      { error: 'Erro interno.' },
      { status: 500 }
    );
  }
}
