begin;
create schema if not exists campus_legal;
revoke all on schema campus_legal from public;

create table if not exists campus_legal.complaints (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  encrypted_record text not null
);
revoke all on campus_legal.complaints from public;

create table if not exists campus_legal.complaint_limits (
  bucket_at bigint not null,
  bucket_key text not null,
  hits integer not null,
  primary key (bucket_at, bucket_key)
);
revoke all on campus_legal.complaint_limits from public;

create or replace function campus_legal.register_complaint(p_bucket text, p_record text)
returns table (id bigint, received_at timestamptz)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  window_id bigint := floor(extract(epoch from now()) / 600)::bigint;
begin
  delete from campus_legal.complaint_limits where bucket_at < window_id;
  insert into campus_legal.complaint_limits as limits (bucket_at, bucket_key, hits)
  values (window_id, p_bucket, 1)
  on conflict (bucket_at, bucket_key) do update set hits = limits.hits + 1 where limits.hits < 5;
  if found then
    return query insert into campus_legal.complaints as complaints (encrypted_record)
      values (p_record) returning complaints.id, complaints.received_at;
  end if;
end;
$$;
revoke all on function campus_legal.register_complaint(text, text) from public;

-- After creating dedicated roles, grant separately as the schema owner:
-- grant usage on schema campus_legal to campus_complaints_writer, campus_complaints_reader;
-- grant execute on function campus_legal.register_complaint(text, text) to campus_complaints_writer;
-- grant select on campus_legal.complaints to campus_complaints_reader;
commit;
