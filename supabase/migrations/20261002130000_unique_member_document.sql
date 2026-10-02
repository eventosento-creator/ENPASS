-- Un DNI por socio dentro de un club: no puede haber dos socios con el mismo DNI (se compara solo
-- por dígitos, así "40.111.222" y "40111222" son el mismo). Se controla en la base para que valga
-- sin importar por dónde entre el socio (alta manual, solicitud pública, importación CSV).
-- Son triggers (no un índice único) a propósito: los duplicados que ya existan no rompen la
-- migración, solo se bloquean los nuevos. Los DNI repetidos entre compradores de entradas que no
-- son socios siguen permitidos.

create function public.normalize_document(value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(coalesce(value, ''), '\D', '', 'g'), '');
$$;

create function public.assert_member_document_unique()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_customer uuid; target_org uuid; doc text;
begin
  if tg_table_name = 'memberships' then
    target_customer := new.customer_id; target_org := new.organization_id;
    select public.normalize_document(c.document) into doc from public.customers c where c.id = new.customer_id;
  else
    target_customer := new.id; target_org := new.organization_id;
    doc := public.normalize_document(new.document);
  end if;
  if doc is null then return new; end if;
  if exists (
    select 1 from public.memberships m
    join public.customers c on c.id = m.customer_id
    where m.organization_id = target_org and m.customer_id <> target_customer
      and public.normalize_document(c.document) = doc
  ) then
    raise exception 'DOCUMENT_TAKEN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger memberships_unique_document before insert on public.memberships
  for each row execute function public.assert_member_document_unique();

-- Si la persona ya es socia, no se le puede cambiar el DNI por el de otro socio.
create function public.assert_customer_document_unique()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.normalize_document(new.document) is null
    or not exists (select 1 from public.memberships m where m.customer_id = new.id) then
    return new;
  end if;
  if exists (
    select 1 from public.memberships m
    join public.customers c on c.id = m.customer_id
    where m.organization_id = new.organization_id and m.customer_id <> new.id
      and public.normalize_document(c.document) = public.normalize_document(new.document)
  ) then
    raise exception 'DOCUMENT_TAKEN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger customers_unique_member_document before update of document on public.customers
  for each row execute function public.assert_customer_document_unique();

revoke all on function public.assert_member_document_unique(), public.assert_customer_document_unique(), public.normalize_document(text) from public, anon, authenticated;
