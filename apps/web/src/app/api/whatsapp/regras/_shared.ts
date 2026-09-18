/** Validação das regras de resposta automática do WhatsApp (mesmo padrão do Instagram). */
export function lerRegraWhatsapp(body: Record<string, unknown>, parcial = false) {
  const out: Record<string, unknown> = {};
  if (!parcial || 'nome' in body) {
    const nome = String(body.nome ?? '').trim();
    if (!nome) return { erro: 'Dê um nome para a regra.' };
    out.nome = nome.slice(0, 80);
  }
  if (!parcial || 'palavras' in body) {
    const lista = (Array.isArray(body.palavras) ? body.palavras : String(body.palavras ?? '').split(','))
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 30);
    if (lista.length === 0) return { erro: 'Informe ao menos uma palavra-chave ou frase.' };
    out.palavras = Array.from(new Set(lista));
  }
  if (!parcial || 'mensagem' in body) {
    const msg = String(body.mensagem ?? '').trim();
    if (!msg) return { erro: 'Escreva a mensagem que será enviada.' };
    // Limite do WhatsApp para texto é 4.096; deixamos folga para a UTM dos links.
    if (msg.length > 3500) return { erro: 'A mensagem passa de 3.500 caracteres.' };
    out.mensagem = msg;
  }
  if ('ativo' in body) out.ativo = Boolean(body.ativo);
  if ('apenas_uma_vez' in body) out.apenas_uma_vez = Boolean(body.apenas_uma_vez);
  if ('channel_id' in body) out.channel_id = body.channel_id ? String(body.channel_id) : null;
  return { campos: out };
}
