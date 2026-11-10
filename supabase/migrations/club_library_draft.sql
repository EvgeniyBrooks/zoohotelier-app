-- NOYA CLUB library. Additive schema; does not touch existing course lessons.
-- Draft: review and apply separately before enabling library API.
create table if not exists public.club_lessons (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9-]{3,100}$'),
 title text not null check (char_length(title) between 3 and 160),
 description text not null default '',
 topic text not null check (topic in ('understanding','attention','social','walks','home','emotions','advanced')),
 sort_order integer not null default 0,
 duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
 cloudflare_video_id text,
 is_published boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists club_lessons_topic_order_idx on public.club_lessons(topic,sort_order);
create table if not exists public.club_lesson_progress (
 student_id uuid not null references public.students(id) on delete cascade,
 dog_id uuid not null,
 lesson_id uuid not null references public.club_lessons(id) on delete cascade,
 completed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key (dog_id,lesson_id),
 foreign key (dog_id,student_id) references public.club_dogs(id,student_id) on delete cascade
);
create index if not exists club_lesson_progress_student_idx on public.club_lesson_progress(student_id);
alter table public.club_lessons enable row level security;
alter table public.club_lesson_progress enable row level security;
revoke all on public.club_lessons from anon,authenticated;
revoke all on public.club_lesson_progress from anon,authenticated;
grant select,insert,update,delete on public.club_lessons to service_role;
grant select,insert,update,delete on public.club_lesson_progress to service_role;
-- Lessons stay unpublished until real content is entered and verified.
