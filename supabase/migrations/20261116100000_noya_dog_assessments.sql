create table public.noya_assessment_reviewers (
  telegram_id bigint primary key,
  display_name text not null,
  enabled boolean not null default true
);

create table public.noya_dog_assessments (
  student_id uuid primary key references public.students(id) on delete cascade,
  reviewer_id bigint not null references public.noya_assessment_reviewers(telegram_id),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz not null default now(),
  review jsonb check (review is null or jsonb_typeof(review) = 'object'),
  reviewed_at timestamptz,
  check ((review is null) = (reviewed_at is null))
);

alter table public.noya_assessment_reviewers enable row level security;
alter table public.noya_dog_assessments enable row level security;
revoke all on public.noya_assessment_reviewers, public.noya_dog_assessments from public, anon, authenticated;
grant select on public.noya_assessment_reviewers to service_role;
grant select, insert, update on public.noya_dog_assessments to service_role;
create index on public.noya_dog_assessments (reviewer_id, submitted_at desc);
