create function public.noya_claim_fifth_month_coin_gift(p_student_id uuid)
returns table(credited boolean, balance integer)
language plpgsql security invoker set search_path to 'pg_catalog', 'public'
as $function$
declare awarded integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_student_id::text,7338));
  insert into public.noya_coin_wallets(student_id)
  values(p_student_id) on conflict(student_id) do nothing;
  insert into public.noya_coin_ledger(student_id,coins,reason,source_key)
  values(p_student_id,10000,'Подарок за пятый месяц NOYA CLUB','gift:club:month:5')
  on conflict(student_id,source_key) do nothing returning coins into awarded;
  if awarded is not null then
    update public.noya_coin_wallets w
    set balance=w.balance+awarded,lifetime_earned=w.lifetime_earned+awarded,updated_at=now()
    where w.student_id=p_student_id;
  end if;
  return query select awarded is not null,w.balance
  from public.noya_coin_wallets w where w.student_id=p_student_id;
end;
$function$;

revoke all on function public.noya_claim_fifth_month_coin_gift(uuid) from public, anon, authenticated;
grant execute on function public.noya_claim_fifth_month_coin_gift(uuid) to service_role;
