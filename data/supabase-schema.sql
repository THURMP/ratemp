create extension if not exists pgcrypto;

create table if not exists teachers (
  id text primary key,
  name text not null,
  college text not null,
  title text not null default 'To be added',
  email text not null default 'To be added',
  research text not null default 'To be added',
  intro text not null default 'No introduction yet',
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id bigint generated always as identity primary key,
  teacher_id text not null references teachers(id) on delete cascade,
  score numeric not null check (score >= 1 and score <= 5),
  text text not null,
  author text not null default 'Anonymous student',
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists system_logs (
  id bigint generated always as identity primary key,
  time text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists pending_teachers (
  id text primary key,
  name text not null,
  college text not null,
  title text not null default 'To be added',
  email text not null default 'To be added',
  research text not null default 'To be added',
  intro text not null default 'No introduction yet',
  score numeric not null check (score >= 1 and score <= 5),
  review_text text not null default '未填写评语',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists developer_keys (
  id text primary key,
  key_hash text not null,
  created_at timestamptz not null default now()
);

-- Run this once after replacing change-this-developer-key with your private developer login key.
insert into developer_keys (id, key_hash)
values ('primary', crypt('change-this-developer-key', gen_salt('bf')))
on conflict (id) do update set key_hash = excluded.key_hash;

create or replace function public.is_developer_key()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from developer_keys
    where key_hash = crypt(
      coalesce((current_setting('request.headers', true)::json ->> 'x-developer-key'), ''),
      key_hash
    )
  );
$$;

revoke all on function public.is_developer_key() from public;
grant execute on function public.is_developer_key() to anon, authenticated;

insert into system_logs (time, message)
values
  ('2026-06-22 09:00', 'Supabase cloud database initialized.'),
  ('2026-06-22 09:05', 'Teachers, reviews, and system logs tables created.')
on conflict do nothing;

alter table teachers enable row level security;
alter table reviews enable row level security;
alter table system_logs enable row level security;
alter table pending_teachers enable row level security;
alter table developer_keys enable row level security;

drop policy if exists "public read teachers" on teachers;
drop policy if exists "public insert teachers" on teachers;
drop policy if exists "developer insert teachers" on teachers;
drop policy if exists "developer update teachers" on teachers;
drop policy if exists "developer delete teachers" on teachers;
drop policy if exists "public read reviews" on reviews;
drop policy if exists "public insert reviews" on reviews;
drop policy if exists "developer update reviews" on reviews;
drop policy if exists "developer delete reviews" on reviews;
drop policy if exists "public read logs" on system_logs;
drop policy if exists "public insert logs" on system_logs;
drop policy if exists "developer read logs" on system_logs;
drop policy if exists "public insert pending teachers" on pending_teachers;
drop policy if exists "developer read pending teachers" on pending_teachers;
drop policy if exists "developer update pending teachers" on pending_teachers;
drop policy if exists "developer delete pending teachers" on pending_teachers;

create policy "public read teachers" on teachers for select using (true);
create policy "developer insert teachers" on teachers for insert with check (public.is_developer_key());
create policy "developer update teachers" on teachers for update using (public.is_developer_key()) with check (public.is_developer_key());
create policy "developer delete teachers" on teachers for delete using (public.is_developer_key());

create policy "public read reviews" on reviews for select using (true);
create policy "public insert reviews" on reviews for insert with check (true);
create policy "developer update reviews" on reviews for update using (public.is_developer_key()) with check (public.is_developer_key());
create policy "developer delete reviews" on reviews for delete using (public.is_developer_key());

create policy "developer read logs" on system_logs for select using (public.is_developer_key());
create policy "public insert logs" on system_logs for insert with check (true);

create policy "public insert pending teachers" on pending_teachers for insert with check (status = 'pending');
create policy "developer read pending teachers" on pending_teachers for select using (public.is_developer_key());
create policy "developer update pending teachers" on pending_teachers for update using (public.is_developer_key()) with check (public.is_developer_key());
create policy "developer delete pending teachers" on pending_teachers for delete using (public.is_developer_key());
