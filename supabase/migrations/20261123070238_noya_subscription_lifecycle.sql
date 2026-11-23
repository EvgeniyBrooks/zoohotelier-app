-- Server-only cancellation outbox and channel membership registry.
alter table public.club_subscriptions add column if not exists autorenew_cancelled_at timestamptz;
grant update(autorenew_cancelled_at,next_payment_date) on public.club_subscriptions to service_role;
create table public.noya_club_cancellations (
 subscription_id uuid primary key references public.club_subscriptions(id),
 student_id uuid not null references public.students(id),
 state text not null default 'pending' check(state in ('pending','confirmed')),
 requested_at timestamptz not null default now(),
 confirmed_at timestamptz,
 notified_at timestamptz
);
create table public.noya_channel_members (
 telegram_id bigint primary key check(telegram_id>0),
 status text not null check(status in ('member','removing','removed')),
 event_at timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table public.noya_club_cancellations enable row level security;
alter table public.noya_channel_members enable row level security;
revoke all on public.noya_club_cancellations,public.noya_channel_members from public,anon,authenticated;
grant select,insert,update on public.noya_club_cancellations,public.noya_channel_members to service_role;

create function public.noya_track_channel_member(p_user_id bigint,p_status text,p_event_at timestamptz)
returns void language sql security invoker set search_path=pg_catalog,public as $$
 insert into public.noya_channel_members(telegram_id,status,event_at)
 values(p_user_id,p_status,p_event_at)
 on conflict(telegram_id) do update set status=excluded.status,event_at=excluded.event_at,updated_at=now()
 where noya_channel_members.event_at<=excluded.event_at;
$$;
revoke all on function public.noya_track_channel_member(bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.noya_track_channel_member(bigint,text,timestamptz) to service_role;

create function public.noya_confirm_club_cancellation(p_subscription_id uuid)
returns void language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.club_subscriptions cs set autorenew_cancelled_at=coalesce(cs.autorenew_cancelled_at,now()),next_payment_date=null
 from public.noya_club_cancellations c
 where cs.id=p_subscription_id and c.subscription_id=cs.id and c.student_id=cs.student_id;
 if not found then raise exception 'cancellation owner mismatch'; end if;
 update public.noya_club_cancellations set state='confirmed',confirmed_at=coalesce(confirmed_at,now())
 where subscription_id=p_subscription_id;
end;
$$;
revoke all on function public.noya_confirm_club_cancellation(uuid) from public,anon,authenticated;
grant execute on function public.noya_confirm_club_cancellation(uuid) to service_role;

-- A delayed verified payment may extend paid access, but cannot restore auto-renewal.
create function public.noya_preserve_cancelled_autorenew()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.autorenew_cancelled_at is not null then new.autorenew_cancelled_at=old.autorenew_cancelled_at; end if;
 if new.autorenew_cancelled_at is not null then new.next_payment_date=null; end if;
 return new;
end;
$$;
revoke all on function public.noya_preserve_cancelled_autorenew() from public,anon,authenticated;
create trigger noya_preserve_cancelled_autorenew before update on public.club_subscriptions
for each row execute function public.noya_preserve_cancelled_autorenew();
