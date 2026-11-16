create table public.noya_dog_assessment_tests
  (like public.noya_dog_assessments including all);
alter table public.noya_dog_assessment_tests
  add foreign key (student_id) references public.students(id) on delete cascade,
  add foreign key (reviewer_id) references public.noya_assessment_reviewers(telegram_id);
alter table public.noya_dog_assessment_tests enable row level security;
revoke all on public.noya_dog_assessment_tests from public, anon, authenticated;
grant select, insert, update on public.noya_dog_assessment_tests to service_role;
