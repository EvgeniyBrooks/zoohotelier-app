BEGIN;

DO $migration$
BEGIN
 EXECUTE replace($definition$
CREATE OR REPLACE FUNCTION public.noya_club_record_confirmed_payment(p_order_num text, p_provider_subscription_id text, p_payment_id text, p_amount numeric, p_paid_at timestamp with time zone, p_next_payment_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(applied boolean, member_id uuid, paid_payments integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 v_student uuid;
 v_existing uuid;
 v_previous_end timestamptz;
 v_period_end timestamptz;
 v_subscription uuid;
 v_created_payment uuid;
 v_referrer uuid;
 v_renewal boolean;
 v_wallet_owner uuid;
 v_renewal_coins integer;
 v_referral_coins integer := 0;
 v_now timestamptz := now();
BEGIN
 IF p_order_num LIKE 'noya-demo-%' THEN
  RAISE EXCEPTION 'demo payment cannot activate membership';
 END IF;
 IF p_payment_id IS NULL OR length(trim(p_payment_id))<1 OR length(p_payment_id)>100
  OR p_provider_subscription_id IS NULL OR length(p_provider_subscription_id)>100
  OR length(p_provider_subscription_id)<1
  OR p_amount IS NULL OR p_amount<=0 OR p_amount>1000000
  OR p_paid_at IS NULL OR p_paid_at > v_now + interval '2 days'
  OR p_paid_at < v_now - interval '2 years' THEN
  RAISE EXCEPTION 'invalid confirmed club payment';
 END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p_provider_subscription_id, 19));
 SELECT ci.student_id INTO v_student
 FROM public.noya_club_checkout_intents ci
 WHERE ci.order_num = p_order_num
   AND ci.is_demo = false
   AND ci.status IN ('pending','paid')
   AND ci.created_at < p_paid_at + interval '2 days'
 ORDER BY ci.created_at DESC LIMIT 1 FOR UPDATE;
 IF v_student IS NULL THEN
   SELECT cs.student_id INTO v_student
   FROM public.club_subscriptions cs
   WHERE cs.prodamus_subscription_id = p_provider_subscription_id
   ORDER BY cs.created_at DESC LIMIT 1 FOR UPDATE;
 END IF;
 IF v_student IS NULL THEN
   RETURN QUERY SELECT false, NULL::uuid, 0::integer;
   RETURN;
 END IF;

 SELECT p.id INTO v_existing FROM public.payments p WHERE p.prodamus_payment_id=p_payment_id LIMIT 1;
 IF v_existing IS NOT NULL THEN
   RETURN QUERY SELECT false,v_student,
     (SELECT count(*)::integer FROM public.payments p WHERE p.student_id=v_student AND p.product_type='club' AND p.status='paid');
   RETURN;
 END IF;

 SELECT cs.id, cs.end_date INTO v_subscription,v_previous_end
 FROM public.club_subscriptions cs
 WHERE cs.prodamus_subscription_id=p_provider_subscription_id
 ORDER BY cs.created_at DESC LIMIT 1 FOR UPDATE;
 IF v_subscription IS NOT NULL AND
   NOT EXISTS (SELECT 1 FROM public.club_subscriptions cs WHERE cs.id=v_subscription AND cs.student_id=v_student) THEN
   RAISE EXCEPTION 'subscription owner mismatch';
 END IF;

 -- A trial or manually granted subscription has no earlier verified paid period.
 SELECT v_subscription IS NOT NULL
   AND p_paid_at >= '__RENEWAL_CUTOFF__'::timestamptz
   AND p_payment_id ~ '^[0-9]{1,40}$'
   AND EXISTS (
     SELECT 1
     FROM public.payments p
     WHERE p.student_id=v_student AND p.product_type='club'
       AND p.product_id='noya:' || p_provider_subscription_id
       AND p.status='paid' AND p.currency='RUB' AND p.amount>0 AND p.paid_at<p_paid_at
       AND p.prodamus_payment_id ~ '^[0-9]{1,40}$'
   )
 INTO v_renewal;

 INSERT INTO public.payments(student_id,product_type,product_id,prodamus_payment_id,amount,currency,status,paid_at)
 VALUES (v_student,'club','noya:' || p_provider_subscription_id,p_payment_id,p_amount,'RUB','paid',p_paid_at)
 ON CONFLICT (prodamus_payment_id) DO NOTHING RETURNING id INTO v_created_payment;
 IF v_created_payment IS NULL THEN
   RETURN QUERY SELECT false,v_student,
    (SELECT count(*)::integer FROM public.payments p WHERE p.student_id=v_student AND p.product_type='club' AND p.status='paid');
   RETURN;
 END IF;

 -- Accept provider next billing date only if plausible; do not allow an unbounded subscription.
 -- NOYA CLUB subscription uses exactly 30-day paid periods.
 v_period_end := p_paid_at + interval '30 days';
 IF v_subscription IS NULL THEN
   INSERT INTO public.club_subscriptions
    (student_id,status,price,currency,start_date,end_date,next_payment_date,prodamus_subscription_id)
   VALUES(v_student,'active',p_amount,'RUB',p_paid_at,v_period_end,v_period_end,p_provider_subscription_id);
 ELSE
   -- A verified renewal extends from the previous paid expiry, even if charged early.
   v_period_end := greatest(coalesce(v_previous_end,p_paid_at),p_paid_at) + interval '30 days';
   UPDATE public.club_subscriptions
   SET status='active',end_date=v_period_end,next_payment_date=v_period_end,
       price=p_amount,currency='RUB'
   WHERE id=v_subscription;
 END IF;
 UPDATE public.noya_club_checkout_intents SET status='paid',paid_at=p_paid_at
 WHERE order_num=p_order_num AND student_id=v_student;

 -- Each independently confirmed 2,900 RUB subscription charge (initial and
 -- every renewal) earns the original referrer 500 NOINCOINS.
 -- The existing unique payment guard above rejects duplicate Prodamus callbacks.
 IF p_amount >= 2900 THEN
   SELECT a.inviter_student_id INTO v_referrer
   FROM public.noya_referral_attributions a
   WHERE a.referred_student_id=v_student
     AND a.created_at<=p_paid_at + interval '5 minutes'
   FOR UPDATE;
 END IF;

 -- Coin redemption and referral credits use the same wallet lock.
 -- Lock both wallets in the same order when members have invited each other.
 FOR v_wallet_owner IN
   SELECT owner_id
   FROM (VALUES (CASE WHEN v_renewal THEN v_student END), (v_referrer)) AS owners(owner_id)
   WHERE owner_id IS NOT NULL GROUP BY owner_id ORDER BY owner_id
 LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(v_wallet_owner::text,7338));
 END LOOP;

 IF v_renewal THEN
   INSERT INTO public.noya_coin_wallets(student_id)
   VALUES(v_student) ON CONFLICT(student_id) DO NOTHING;

   INSERT INTO public.noya_coin_ledger(student_id,coins,reason,source_key)
   VALUES(v_student,500,'Продление подписки NOYA CLUB','renewal:'||p_payment_id)
   ON CONFLICT(student_id,source_key) DO NOTHING RETURNING coins INTO v_renewal_coins;

   IF v_renewal_coins IS NOT NULL THEN
     UPDATE public.noya_coin_wallets w
     SET balance=w.balance+v_renewal_coins,
         lifetime_earned=w.lifetime_earned+v_renewal_coins,updated_at=now()
     WHERE w.student_id=v_student;
   END IF;
 END IF;

 IF v_referrer IS NOT NULL AND v_referrer<>v_student THEN
   INSERT INTO public.noya_coin_wallets(student_id)
   VALUES(v_referrer) ON CONFLICT(student_id) DO NOTHING;
   -- Each VERIFIED payment gets a unique ledger key. Resent notifications
   -- or replayed renewals cannot issue the same reward twice.
   INSERT INTO public.noya_coin_ledger(student_id,coins,reason,source_key)
   VALUES(v_referrer,500,'Оплата подписки приглашённым другом NOYA CLUB',
     'referral:'||v_student::text||':'||p_payment_id)
   ON CONFLICT(student_id,source_key) DO NOTHING
   RETURNING coins INTO v_referral_coins;
   IF coalesce(v_referral_coins,0)=500 THEN
     UPDATE public.noya_coin_wallets w
     SET balance=w.balance+500,lifetime_earned=w.lifetime_earned+500,
         updated_at=now()
     WHERE w.student_id=v_referrer;
   END IF;
   UPDATE public.noya_referral_attributions a
   SET credited_at=coalesce(a.credited_at,p_paid_at)
   WHERE a.referred_student_id=v_student;
 END IF;
 RETURN QUERY SELECT true,v_student,
   (SELECT count(*)::integer FROM public.payments p WHERE p.student_id=v_student AND p.product_type='club' AND p.status='paid');
END;
$function$;
$definition$, '__RENEWAL_CUTOFF__',
   -- The cutoff comes from the database clock at deployment.
   statement_timestamp()::text);
END;
$migration$;

REVOKE ALL ON FUNCTION public.noya_club_record_confirmed_payment(text,text,text,numeric,timestamptz,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.noya_club_record_confirmed_payment(text,text,text,numeric,timestamptz,timestamptz)
  TO service_role;

COMMIT;
