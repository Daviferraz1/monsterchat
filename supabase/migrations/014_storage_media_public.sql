-- Permite leitura pública dos arquivos do bucket 'media' (áudio, imagem, vídeo do chat).
-- Sem esta política, as URLs públicas retornam 401.
-- O bucket 'media' deve existir no Dashboard (Storage) e estar marcado como público,
-- ou esta política já permite que qualquer um leia os objetos.

drop policy if exists "Public read media" on storage.objects;
create policy "Public read media"
  on storage.objects for select
  to public
  using (bucket_id = 'media');
