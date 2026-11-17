\set ON_ERROR_STOP on
-- Run after the renewal test in its disposable CI database; no production data.
CREATE TABLE public.students (id uuid PRIMARY KEY);
\ir ../supabase/migrations/20261117052344_noya_video_views.sql
BEGIN;
DO $test$
DECLARE
 member uuid := gen_random_uuid();
 other_member uuid := gen_random_uuid();
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.noya_video_views'::regclass) THEN
  RAISE EXCEPTION 'Video views must have RLS enabled';
 END IF;
 IF has_table_privilege('anon','public.noya_video_views','SELECT,INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated','public.noya_video_views','SELECT,INSERT,UPDATE,DELETE')
  OR NOT has_table_privilege('service_role','public.noya_video_views','SELECT,INSERT,UPDATE') THEN
  RAISE EXCEPTION 'Unexpected video progress privileges';
 END IF;
 INSERT INTO public.students VALUES(member),(other_member);
 INSERT INTO public.noya_video_views(student_id,folder,video_id) VALUES(member,'training','test-video');
 INSERT INTO public.noya_video_views(student_id,folder,video_id) VALUES(member,'training','test-video')
 ON CONFLICT(student_id,folder,video_id) DO UPDATE SET video_id=excluded.video_id;
 INSERT INTO public.noya_video_views(student_id,folder,video_id) VALUES(other_member,'training','test-video'),(member,'podcast','test-video');
 IF (SELECT count(*) FROM public.noya_video_views WHERE student_id=member AND folder='training')<>1
  OR (SELECT count(*) FROM public.noya_video_views)<>3 THEN
  RAISE EXCEPTION 'Completion is not isolated or idempotent';
 END IF;
 BEGIN
  INSERT INTO public.noya_video_views(student_id,folder,video_id) VALUES(member,'unknown','video');
  RAISE EXCEPTION 'Invalid folder accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END;
$test$;
ROLLBACK;
