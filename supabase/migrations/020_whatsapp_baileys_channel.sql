-- Canal WhatsApp via Baileys (QR code / sessão local)
alter table public.channels
  drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check check (type in ('whatsapp', 'instagram', 'guru', 'whatsapp_baileys'));

comment on table public.channels is 'Canais: whatsapp (Meta API), instagram, guru (vendas), whatsapp_baileys (QR/Baileys)';
