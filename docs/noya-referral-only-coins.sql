-- Applied remote migration: noya_referral_only_coins.
-- Starting balance zero; no welcome/learning awards. Existing referral payment rewards unchanged.
CREATE OR REPLACE FUNCTION public.noya_coin_sync(p_student_id uuid)
RETURNS TABLE(balance integer,lifetime_earned integer,lifetime_spent integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
 IF p_student_id IS NULL THEN RAISE EXCEPTION 'Student required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.students WHERE id=p_student_id) THEN RAISE EXCEPTION 'Student not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_student_id::text,7338));
 INSERT INTO public.noya_coin_wallets(student_id,balance,lifetime_earned,lifetime_spent)
 VALUES(p_student_id,0,0,0) ON CONFLICT(student_id) DO NOTHING;
 RETURN QUERY SELECT w.balance,w.lifetime_earned,w.lifetime_spent
 FROM public.noya_coin_wallets w WHERE w.student_id=p_student_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.noya_coin_sync(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.noya_coin_sync(uuid) TO service_role;
-- Correct only obsolete welcome/lesson earnings; keep an auditable ledger.
DO $correction$
DECLARE r record; applied integer;
BEGIN
 FOR r IN SELECT l.* FROM public.noya_coin_ledger l
 WHERE l.coins>0 AND (l.source_key='welcome:club' OR l.source_key LIKE 'lesson:%')
 ORDER BY l.student_id,l.id
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(r.student_id::text,7338));
  IF EXISTS(SELECT 1 FROM public.noya_coin_ledger WHERE student_id=r.student_id AND source_key='correction:referral_only:'||r.id::text) THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.noya_coin_wallets WHERE student_id=r.student_id AND balance>=r.coins AND lifetime_earned>=r.coins) THEN RAISE EXCEPTION 'Review previously spent non-referral coins before correction'; END IF;
  INSERT INTO public.noya_coin_ledger(student_id,coins,reason,source_key)
  VALUES(r.student_id,-r.coins,'Отмена прежнего бонуса: ноинкоины только за приглашения','correction:referral_only:'||r.id::text)
  ON CONFLICT(student_id,source_key) DO NOTHING RETURNING coins INTO applied;
  IF applied IS NOT NULL THEN
   UPDATE public.noya_coin_wallets SET balance=balance-r.coins,lifetime_earned=lifetime_earned-r.coins,updated_at=now() WHERE student_id=r.student_id;
  END IF;
 END LOOP;
END;
$correction$;