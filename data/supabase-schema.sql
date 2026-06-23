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

insert into teachers (id, name, college, title, email, research, intro)
values
  ('t-automation-chen', 'Professor Chen', 'Department of Automation', 'Professor', 'chen@example.tsinghua.edu.cn', 'Intelligent control, machine learning, system modeling', 'Clear course structure with emphasis on fundamentals and practice.'),
  ('t-cs-li', 'Professor Li', 'Department of Computer Science and Technology', 'Associate Professor', 'li@example.tsinghua.edu.cn', 'Database systems, data management, cloud computing', 'Rich classroom examples, suitable for students interested in systems.'),
  ('t-ee-wang', 'Professor Wang', 'Department of Electronic Engineering', 'Professor', 'wang@example.tsinghua.edu.cn', 'Signal processing, communication systems, intelligent sensing', 'Theory-focused lectures with detailed board work.')
on conflict (id) do nothing;

insert into reviews (teacher_id, score, text, author, date)
values
  ('t-automation-chen', 4.7, 'Steady lecture pace, challenging assignments, and timely feedback.', 'Anonymous student', '2026-06-20'),
  ('t-cs-li', 4.4, 'The project is practical and the final review scope is clear.', 'Anonymous student', '2026-06-19'),
  ('t-ee-wang', 4.2, 'Exams focus on understanding. Follow the weekly exercises carefully.', 'Anonymous student', '2026-06-18');

insert into system_logs (time, message)
values
  ('2026-06-22 09:00', 'Supabase cloud database initialized.'),
  ('2026-06-22 09:05', 'Teachers, reviews, and system logs tables created.');

alter table teachers enable row level security;
alter table reviews enable row level security;
alter table system_logs enable row level security;

drop policy if exists "public read teachers" on teachers;
drop policy if exists "public insert teachers" on teachers;
drop policy if exists "public read reviews" on reviews;
drop policy if exists "public insert reviews" on reviews;
drop policy if exists "public read logs" on system_logs;
drop policy if exists "public insert logs" on system_logs;

create policy "public read teachers" on teachers for select using (true);
create policy "public insert teachers" on teachers for insert with check (true);

create policy "public read reviews" on reviews for select using (true);
create policy "public insert reviews" on reviews for insert with check (true);

create policy "public read logs" on system_logs for select using (true);
create policy "public insert logs" on system_logs for insert with check (true);
