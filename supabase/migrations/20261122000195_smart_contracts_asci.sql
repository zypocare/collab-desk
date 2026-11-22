-- 1-Tap Smart Contracts & ASCI India Disclosure Checklist (zero-cost Postgres + click-wrap audit trail)

create extension if not exists pgcrypto;

create table if not exists public.smart_contracts (
  collab_id           uuid primary key references public.collabs(id) on delete cascade,
  usage_terms         text not null default 'Meta Ads · 90d',
  exclusivity         text not null default '30d · Category',
  revision_rounds     smallint not null default 2 check (revision_rounds between 1 and 10),
  payout_terms        text not null default 'Within 7d of live post',
  asci_rules          jsonb not null default '[]'::jsonb,
  brand_signed_name   text,
  brand_signed_email  text,
  brand_signed_at     timestamptz,
  creator_signed_name text,
  creator_signed_email text,
  creator_signed_at   timestamptz,
  audit_hash          text,
  updated_at          timestamptz not null default now()
);

alter table public.smart_contracts enable row level security;

-- Helper: resolve a collab row by code only if the caller is its creator or brand team member.
create or replace function private.smart_contract_collab(p_code text)
returns public.collabs
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.collabs;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  select * into c from public.collabs where code = p_code;
  if not found then
    raise exception 'Collab not found.';
  end if;
  if public.is_creator() then
    if c.creator_id <> public.current_creator() then
      raise exception 'Not authorized for this collab.';
    end if;
  else
    if not exists (select 1 from private.my_collabs() k where k.id = c.id) then
      raise exception 'Not authorized for this request.';
    end if;
  end if;
  return c;
end;
$$;
revoke execute on function private.smart_contract_collab(text) from public, anon, authenticated;

-- Read smart contract for a collab (brand or creator).
create or replace function public.smart_contract_get(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  c public.collabs;
  sc public.smart_contracts;
begin
  c := private.smart_contract_collab(p_code);
  select * into sc from public.smart_contracts where collab_id = c.id;
  if not found then
    return null;
  end if;
  return to_jsonb(sc);
end;
$$;
revoke execute on function public.smart_contract_get(text) from public, anon;
grant execute on function public.smart_contract_get(text) to authenticated;

-- Brand configures terms + ASCI checklist and signs in 1 tap.
create or replace function public.smart_contract_brand_sign(
  p_code text,
  p_usage text,
  p_exclusivity text,
  p_revisions integer,
  p_payout text,
  p_asci jsonb,
  p_signer text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  sc public.smart_contracts;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_name text := left(btrim(coalesce(p_signer, '')), 140);
  v_hash text;
begin
  if public.is_creator() then
    raise exception 'Only the brand can send and sign brand terms.';
  end if;
  if v_name = '' then
    raise exception 'Enter the authorized signatory name.';
  end if;
  c := private.smart_contract_collab(p_code);

  v_hash := encode(
    digest(
      concat_ws('|', c.id::text, p_usage, p_exclusivity, p_revisions::text, p_payout, coalesce(p_asci::text, '[]'), v_name, v_email, now()::text),
      'sha256'
    ),
    'hex'
  );

  insert into public.smart_contracts (
    collab_id, usage_terms, exclusivity, revision_rounds, payout_terms, asci_rules,
    brand_signed_name, brand_signed_email, brand_signed_at,
    creator_signed_name, creator_signed_email, creator_signed_at,
    audit_hash, updated_at
  )
  values (
    c.id,
    left(btrim(coalesce(p_usage, 'Meta Ads · 90d')), 120),
    left(btrim(coalesce(p_exclusivity, 'None')), 120),
    greatest(1, least(10, coalesce(p_revisions, 2))),
    left(btrim(coalesce(p_payout, 'Within 7d of live post')), 120),
    coalesce(p_asci, '[]'::jsonb),
    v_name, v_email, now(),
    null, null, null,
    v_hash, now()
  )
  on conflict (collab_id) do update set
    usage_terms = excluded.usage_terms,
    exclusivity = excluded.exclusivity,
    revision_rounds = excluded.revision_rounds,
    payout_terms = excluded.payout_terms,
    asci_rules = excluded.asci_rules,
    brand_signed_name = excluded.brand_signed_name,
    brand_signed_email = excluded.brand_signed_email,
    brand_signed_at = excluded.brand_signed_at,
    creator_signed_name = null,
    creator_signed_email = null,
    creator_signed_at = null,
    audit_hash = excluded.audit_hash,
    updated_at = now()
  returning * into sc;

  return to_jsonb(sc);
end;
$$;
revoke execute on function public.smart_contract_brand_sign(text, text, text, integer, text, jsonb, text) from public, anon;
grant execute on function public.smart_contract_brand_sign(text, text, text, integer, text, jsonb, text) to authenticated;

-- Creator confirms required ASCI rules and countersigns in 1 tap.
create or replace function public.smart_contract_creator_sign(
  p_code text,
  p_asci jsonb,
  p_signer text
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  c public.collabs;
  sc public.smart_contracts;
  v_email text := coalesce(auth.jwt() ->> 'email', '');
  v_name text := left(btrim(coalesce(p_signer, '')), 140);
  v_hash text;
begin
  if not public.is_creator() then
    raise exception 'Only the creator can countersign this contract.';
  end if;
  if v_name = '' then
    raise exception 'Enter your full name to countersign.';
  end if;
  c := private.smart_contract_collab(p_code);

  select * into sc from public.smart_contracts where collab_id = c.id;
  if not found or sc.brand_signed_at is null then
    raise exception 'Wait for the brand to send and sign the contract first.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_asci, '[]'::jsonb)) elem
    where coalesce((elem ->> 'required')::boolean, false) = true
      and coalesce((elem ->> 'creator_ok')::boolean, false) = false
  ) then
    raise exception 'Please confirm every required ASCI disclosure rule before signing.';
  end if;

  v_hash := encode(
    digest(
      concat_ws('|', sc.collab_id::text, sc.usage_terms, sc.exclusivity, sc.revision_rounds::text, sc.payout_terms, coalesce(p_asci::text, '[]'), sc.brand_signed_name, v_name, v_email, now()::text),
      'sha256'
    ),
    'hex'
  );

  update public.smart_contracts set
    asci_rules = coalesce(p_asci, sc.asci_rules),
    creator_signed_name = v_name,
    creator_signed_email = v_email,
    creator_signed_at = now(),
    audit_hash = v_hash,
    updated_at = now()
  where collab_id = c.id
  returning * into sc;

  return to_jsonb(sc);
end;
$$;
revoke execute on function public.smart_contract_creator_sign(text, jsonb, text) from public, anon;
grant execute on function public.smart_contract_creator_sign(text, jsonb, text) to authenticated;
