begin;

-- A populated address is not necessarily a complete branch identifier.
create or replace function public.business_identity(n text,a text,c text,s text)
returns text language sql immutable set search_path = '' as $$
  select case when public.business_normalize(n) <> ''
    and public.business_normalize(c) <> '' and public.business_normalize(s) <> ''
    and coalesce(a,'') ~ '[0-9]' and coalesce(a,'') ~ '[[:alpha:]]'
    and public.business_normalize(a) <> public.business_normalize(n)
    then public.business_normalize(n) || '|' || public.business_normalize(a)
      || '|' || public.business_normalize(c) || '|' || public.business_normalize(s) end
$$;

-- Function changes require rebuilding indexes containing its derived identity.
reindex index public.registry_complete_identity;
commit;
