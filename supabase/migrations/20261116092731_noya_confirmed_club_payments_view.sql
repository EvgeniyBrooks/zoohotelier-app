CREATE VIEW public.noya_confirmed_club_payments_v
WITH (security_barrier = true) AS
SELECT id, student_id, product_id, prodamus_payment_id, paid_at
FROM public.payments
WHERE product_type = 'club'
  AND product_id LIKE 'noya:%'
  AND status = 'paid'
  AND currency = 'RUB'
  AND amount > 0
  AND prodamus_payment_id IS NOT NULL
  AND btrim(prodamus_payment_id) <> ''
  AND paid_at IS NOT NULL;

REVOKE ALL ON public.noya_confirmed_club_payments_v FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.noya_confirmed_club_payments_v TO service_role;
