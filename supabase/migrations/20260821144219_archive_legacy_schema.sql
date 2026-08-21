do $$
begin
  if to_regclass('public.events') is not null
    and to_regclass('public.organizations') is null then
    create schema if not exists legacy_pre_enpass;

    drop trigger if exists on_auth_user_created on auth.users;

    if to_regclass('public.events') is not null then
      alter table public.events set schema legacy_pre_enpass;
    end if;
    if to_regclass('public.profiles') is not null then
      alter table public.profiles set schema legacy_pre_enpass;
    end if;
    if to_regclass('public.ticket_tiers') is not null then
      alter table public.ticket_tiers set schema legacy_pre_enpass;
    end if;
    if to_regclass('public.tickets') is not null then
      alter table public.tickets set schema legacy_pre_enpass;
    end if;
    if to_regclass('public.users') is not null then
      alter table public.users set schema legacy_pre_enpass;
    end if;

    if to_regprocedure('public.handle_new_auth_user()') is not null then
      alter function public.handle_new_auth_user() set schema legacy_pre_enpass;
    end if;

    revoke all on schema legacy_pre_enpass from public, anon, authenticated;
  end if;
end;
$$;
