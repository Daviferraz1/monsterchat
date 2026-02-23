-- Permite canal Guru para contatos criados a partir de vendas (sem duplicar quem já está no chat)
alter table public.channels
  drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check check (type in ('whatsapp', 'instagram', 'guru'));

-- Canal único para contatos vindos das vendas Guru (aparecem na lista de contatos e na inbox)
insert into public.channels (type, name, external_id, access_token, is_active)
select 'guru', 'Guru (vendas)', 'guru', 'guru-placeholder', true
where not exists (select 1 from public.channels where type = 'guru' and external_id = 'guru');
