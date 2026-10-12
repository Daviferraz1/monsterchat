-- Canal Facebook Messenger (mensagens da Página do Facebook)
alter table public.channels
  drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check check (type in ('whatsapp', 'instagram', 'guru', 'whatsapp_baileys', 'facebook'));

comment on table public.channels is 'Canais: whatsapp (Meta API), instagram, guru (vendas), whatsapp_baileys (QR/Baileys), facebook (Messenger da Página)';

-- contacts.channel_type é texto livre (sem CHECK): 'facebook' entra sem alteração.
