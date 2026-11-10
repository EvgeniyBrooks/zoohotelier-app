-- Additive migration: isolated club data; does not modify existing course tables.
-- Dog profiles and diagnostics are separate from course enrollments.
create table if not exists public.club_dogs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id)
);
create index if not exists club_dogs_student_idx on public.club_dogs(student_id);
create table if not exists public.club_diagnostics (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.club_dogs(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  constraint club_diagnostics_dog_owner_fkey foreign key (dog_id, student_id) references public.club_dogs(id, student_id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 10),
  recommended_topics jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists club_diagnostics_student_dog_idx on public.club_diagnostics(student_id,dog_id,created_at desc);
alter table public.club_dogs enable row level security;
alter table public.club_diagnostics enable row level security;
-- Telegram users are authenticated by the server API, not by Supabase Auth JWT.
-- No direct anon/authenticated access: all user operations must pass server-side
-- verified Telegram initData and ownership checks. Service role remains server-only.
revoke all on public.club_dogs from anon, authenticated;
revoke all on public.club_diagnostics from anon, authenticated;

grant select, insert, update, delete on public.club_dogs to service_role;
grant select, insert, update, delete on public.club_diagnostics to service_role;
