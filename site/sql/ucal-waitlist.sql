begin;
create schema if not exists campus_growth;
revoke all on schema campus_growth from public;
create table if not exists campus_growth.ucal_waitlist (
  id uuid primary key default gen_random_uuid(),
  email_key text unique not null check (email_key ~ '^[a-f0-9]{64}$'),
  encrypted_email text,
  state text not null default 'pending' check (state in ('pending','confirmed','notified')),
  consent_version text not null check (consent_version = 'ucal-availability-v1'),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz not null default now() + interval '180 days',
  confirmation_hash text,
  confirmation_expires_at timestamptz,
  confirmation_sent_at timestamptz,
  confirmation_lease uuid,
  confirmation_lease_until timestamptz,
  notice_lease uuid,
  notice_lease_until timestamptz,
  notice_started_at timestamptz,
  notice_attempts integer not null default 0,
  notified_at timestamptz
);
create unique index if not exists ucal_confirmation_token on campus_growth.ucal_waitlist(confirmation_hash) where confirmation_hash is not null;
create table if not exists campus_growth.ucal_limits (window_id bigint not null,bucket text not null,hits integer not null,primary key(window_id,bucket));
revoke all on campus_growth.ucal_waitlist,campus_growth.ucal_limits from public;

create or replace function campus_growth.request_ucal(p_key text,p_email text,p_bucket text,p_hash text,p_lease uuid)
returns table(outcome text,signup_id uuid)
language plpgsql security definer set search_path=pg_catalog as $$
declare rec campus_growth.ucal_waitlist; w bigint := floor(extract(epoch from now())/600)::bigint;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_hash !~ '^[a-f0-9]{64}$' or p_bucket !~ '^[a-f0-9]{64}$' or length(p_email)>2048 then raise exception 'invalid_request'; end if;
  delete from campus_growth.ucal_waitlist where expires_at <= now();
  delete from campus_growth.ucal_limits where window_id < w;
  insert into campus_growth.ucal_limits as l values(w,p_bucket,1)
    on conflict(window_id,bucket) do update set hits=l.hits+1 where l.hits<5;
  if not found then return query select 'limited'::text,null::uuid; return; end if;
  insert into campus_growth.ucal_waitlist(email_key,encrypted_email,consent_version)
    values(p_key,p_email,'ucal-availability-v1') on conflict(email_key) do nothing;
  select * into rec from campus_growth.ucal_waitlist where email_key=p_key for update;
  if rec.state<>'pending' or (rec.confirmation_sent_at>now()-interval '1 hour' and rec.confirmation_expires_at>now()) then
    return query select 'accepted'::text,rec.id; return;
  end if;
  if rec.confirmation_lease_until>now() then return query select 'busy'::text,null::uuid; return; end if;
  update campus_growth.ucal_waitlist set encrypted_email=p_email,confirmation_hash=p_hash,
    confirmation_expires_at=now()+interval '48 hours',confirmation_sent_at=null,
    confirmation_lease=p_lease,confirmation_lease_until=now()+interval '1 minute'
    where id=rec.id;
  return query select 'send'::text,rec.id;
end;
$$;
create or replace function campus_growth.ucal_confirmation_delivery(p_id uuid,p_lease uuid,p_sent boolean)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update campus_growth.ucal_waitlist set confirmation_sent_at=case when p_sent then now() else null end,
    confirmation_lease=null,confirmation_lease_until=null where id=p_id and confirmation_lease=p_lease;
  return found;
end;
$$;
create or replace function campus_growth.confirm_ucal(p_hash text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
begin
  update campus_growth.ucal_waitlist set state='confirmed',confirmed_at=coalesce(confirmed_at,now())
    where confirmation_hash=p_hash and confirmation_expires_at>now() and expires_at>now() and state in ('pending','confirmed');
  return found;
end;
$$;
create or replace function campus_growth.remove_ucal(p_id uuid)
returns void language sql security definer set search_path=pg_catalog as $$
  delete from campus_growth.ucal_waitlist where id=p_id;
$$;
revoke all on function campus_growth.request_ucal(text,text,text,text,uuid) from public;
revoke all on function campus_growth.ucal_confirmation_delivery(uuid,uuid,boolean) from public;
revoke all on function campus_growth.confirm_ucal(text) from public;
revoke all on function campus_growth.remove_ucal(uuid) from public;
-- The deployment's dedicated writer gets USAGE and EXECUTE on these four
-- functions only. It has no SELECT, INSERT, UPDATE or DELETE table privileges.
commit;
