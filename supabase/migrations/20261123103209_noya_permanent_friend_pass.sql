alter table public.noya_club_trial_campaigns add column if not exists is_permanent boolean not null default false;
alter table public.club_subscriptions add column if not exists gift_campaign_id uuid references public.noya_club_trial_campaigns(id);
create unique index if not exists noya_friend_pass_unique on public.club_subscriptions(student_id,gift_campaign_id) where gift_campaign_id is not null;
create or replace function public.noya_club_redeem_trial(p_student_id uuid,p_campaign_code text)
returns table(applied boolean,starts_at timestamptz,ends_at timestamptz,reason text)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare campaign public.noya_club_trial_campaigns%rowtype; existing public.noya_club_trials%rowtype; stamp timestamptz:=now();
begin
 if p_student_id is null or p_campaign_code is null or length(p_campaign_code)>70 then
  return query select false,null::timestamptz,null::timestamptz,'invalid';return;
 end if;
 select * into campaign from public.noya_club_trial_campaigns where code=p_campaign_code for update;
 if not found or not campaign.enabled or campaign.starts_at>stamp or (campaign.ends_at is not null and campaign.ends_at<=stamp) then
  return query select false,null::timestamptz,null::timestamptz,'unavailable';return;
 end if;
 if campaign.is_permanent then
  if exists(select 1 from public.club_subscriptions cs where cs.student_id=p_student_id and cs.gift_campaign_id=campaign.id and cs.status='active') then
   return query select true,stamp,null::timestamptz,'permanent';return;
  end if;
  if campaign.max_uses is not null and campaign.used_count>=campaign.max_uses then
   return query select false,null::timestamptz,null::timestamptz,'unavailable';return;
  end if;
  insert into public.club_subscriptions(student_id,status,price,currency,start_date,end_date,next_payment_date,prodamus_subscription_id,gift_campaign_id)
  values(p_student_id,'active',0,'RUB',stamp,null,null,null,campaign.id)
  on conflict(student_id,gift_campaign_id) where gift_campaign_id is not null do nothing;
  if found then update public.noya_club_trial_campaigns set used_count=used_count+1 where id=campaign.id; end if;
  return query select true,stamp,null::timestamptz,'permanent';return;
 end if;
 select * into existing from public.noya_club_trials where student_id=p_student_id;
 if found then return query select false,existing.starts_at,existing.ends_at,'already_redeemed';return; end if;
 if exists(select 1 from public.club_subscriptions cs where cs.student_id=p_student_id and cs.status='active' and (cs.start_date is null or cs.start_date<=stamp) and (cs.end_date is null or cs.end_date>stamp)) then
  return query select false,null::timestamptz,null::timestamptz,'already_subscribed';return;
 end if;
 if campaign.max_uses is not null and campaign.used_count>=campaign.max_uses then
  return query select false,null::timestamptz,null::timestamptz,'unavailable';return;
 end if;
 insert into public.noya_club_trials(student_id,campaign_id,starts_at,ends_at)
 values(p_student_id,campaign.id,stamp,stamp+interval '48 hours') on conflict(student_id) do nothing;
 if not found then return query select false,null::timestamptz,null::timestamptz,'already_redeemed';return; end if;
 update public.noya_club_trial_campaigns set used_count=used_count+1 where id=campaign.id;
 return query select true,stamp,stamp+interval '48 hours','granted';
end;
$$;
revoke all on function public.noya_club_redeem_trial(uuid,text) from public,anon,authenticated;
grant execute on function public.noya_club_redeem_trial(uuid,text) to service_role;
