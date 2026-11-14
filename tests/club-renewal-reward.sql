\set ON_ERROR_STOP on

-- Run against an empty disposable database.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, product_type text,
  product_id text, prodamus_payment_id text UNIQUE, amount numeric,
  currency text, status text, paid_at timestamptz
);
CREATE TABLE public.club_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid, status text,
  price numeric, currency text, start_date timestamptz, end_date timestamptz,
  next_payment_date timestamptz, prodamus_subscription_id text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.noya_club_checkout_intents (
  order_num text PRIMARY KEY, student_id uuid, is_demo boolean DEFAULT false,
  status text DEFAULT 'pending', created_at timestamptz DEFAULT now(), paid_at timestamptz
);
CREATE TABLE public.noya_coin_wallets (
  student_id uuid PRIMARY KEY, balance int DEFAULT 0,
  lifetime_earned int DEFAULT 0, updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.noya_coin_ledger (
  student_id uuid, coins int, reason text, source_key text, UNIQUE (student_id, source_key)
);
CREATE TABLE public.noya_referral_attributions (
  referred_student_id uuid PRIMARY KEY, inviter_student_id uuid,
  created_at timestamptz DEFAULT now(), credited_at timestamptz
);

\ir ../supabase/migrations/20261114092234_noya_paid_renewal_reward.sql

BEGIN;
DO $test$
DECLARE
  member uuid := gen_random_uuid();
  inviter uuid := gen_random_uuid();
  trial_member uuid := gen_random_uuid();
  paid_at timestamptz := clock_timestamp();
  expiry timestamptz;
BEGIN
  IF has_function_privilege('anon', 'public.noya_club_record_confirmed_payment(text,text,text,numeric,timestamptz,timestamptz)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.noya_club_record_confirmed_payment(text,text,text,numeric,timestamptz,timestamptz)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.noya_club_record_confirmed_payment(text,text,text,numeric,timestamptz,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected payment RPC permissions';
  END IF;

  INSERT INTO public.noya_club_checkout_intents(order_num,student_id,created_at)
  VALUES ('noya-first',member,paid_at-interval '61 days');
  INSERT INTO public.noya_referral_attributions(referred_student_id,inviter_student_id,created_at)
  VALUES (member,inviter,paid_at-interval '61 days');

  PERFORM public.noya_club_record_confirmed_payment('noya-first','10','100',2900,paid_at-interval '60 days');
  PERFORM public.noya_club_record_confirmed_payment('','10','101',2900,paid_at-interval '30 days');
  IF EXISTS (SELECT FROM public.noya_coin_ledger WHERE source_key LIKE 'renewal:%') THEN
    RAISE EXCEPTION 'First or historical payment earned a renewal reward';
  END IF;

  INSERT INTO public.club_subscriptions(student_id,status,prodamus_subscription_id,end_date)
  VALUES (trial_member,'trial','20',paid_at);
  INSERT INTO public.payments(student_id,product_type,product_id,prodamus_payment_id,amount,currency,status,paid_at)
  VALUES (trial_member,'club','noya:20','200',2900,'RUB','pending',paid_at-interval '1 day');
  PERFORM public.noya_club_record_confirmed_payment('','20','201',2900,paid_at);
  IF EXISTS (SELECT FROM public.noya_coin_wallets WHERE student_id=trial_member) THEN
    RAISE EXCEPTION 'Trial or unpaid period counted as a prior paid month';
  END IF;

  PERFORM public.noya_club_record_confirmed_payment('','10','102',2900,paid_at);
  SELECT end_date INTO STRICT expiry FROM public.club_subscriptions WHERE student_id=member;
  IF EXISTS (SELECT FROM public.noya_club_record_confirmed_payment('noya-first','10','102',2900,paid_at) WHERE applied)
    OR expiry IS DISTINCT FROM (SELECT end_date FROM public.club_subscriptions WHERE student_id=member) THEN
    RAISE EXCEPTION 'Webhook replay reapplied the payment or subscription extension';
  END IF;

  BEGIN
    PERFORM public.noya_club_record_confirmed_payment('noya-demo-test','10','103',2900,paid_at);
    RAISE EXCEPTION 'Demo payment was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'demo payment cannot activate membership' THEN RAISE; END IF;
  END;

  PERFORM public.noya_club_record_confirmed_payment('','10','104',2900,paid_at+interval '1 second');
  IF (SELECT count(*) FROM public.noya_coin_ledger WHERE student_id=member AND coins=500 AND source_key IN ('renewal:102','renewal:104')) <> 2
    OR (SELECT balance FROM public.noya_coin_wallets WHERE student_id=member) IS DISTINCT FROM 1000
    OR (SELECT lifetime_earned FROM public.noya_coin_wallets WHERE student_id=member) IS DISTINCT FROM 1000
    OR (SELECT balance FROM public.noya_coin_wallets WHERE student_id=inviter) IS DISTINCT FROM 2000 THEN
    RAISE EXCEPTION 'Incorrect renewal or referral ledger and wallet totals';
  END IF;
END;
$test$;
ROLLBACK;
