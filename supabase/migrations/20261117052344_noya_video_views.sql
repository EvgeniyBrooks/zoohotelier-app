-- Standalone videos have stable catalog IDs separate from course/live UUIDs.
-- Only the Telegram-authenticated server reads or writes these completions.
create table public.noya_video_views (
 student_id uuid not null references public.students(id) on delete cascade,
 folder text not null check (folder in ('podcast','training')),
 video_id text not null check (video_id ~ '^[a-z0-9-]{1,100}$'),
 watched_at timestamptz not null default now(),
 primary key (student_id,folder,video_id)
);
alter table public.noya_video_views enable row level security;
revoke all on public.noya_video_views from public, anon, authenticated, service_role;
grant select, insert, update on public.noya_video_views to service_role;
comment on table public.noya_video_views is 'Server-only per-member completion of standalone NOYA videos. No historical backfill.';
