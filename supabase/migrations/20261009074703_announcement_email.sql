-- Email copies of announcements.
--
-- After publishing, the app asks the `notify-announcement` Edge Function to email
-- the recipients (supabase/functions/notify-announcement). The function runs with
-- the service role and uses the two functions below, which only the service role
-- may call: email addresses come from auth.users and never reach a browser.
--
-- Each delivery records its own email outcome, so a recipient is emailed at most
-- once, and anyone who already read the announcement in the app is skipped.

alter table public.recipient_deliveries
  add column email_status text check (email_status in ('sent', 'failed', 'skipped')),
  add column email_sent_at timestamptz,
  add column email_provider_id text,
  add column email_error text check (email_error is null or char_length(email_error) <= 300);

create index recipient_deliveries_email_pending_idx
  on public.recipient_deliveries (announcement_id)
  where email_status is null;

-- Recipients of one announcement who still need an email.
create function public.announcement_email_batch(target_announcement uuid, batch_size integer default 100)
returns table (delivery_id uuid, email text, recipient_name text, organization_name text, title text, body text,
               priority text, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, u.email, coalesce(p.full_name, ''), o.name, a.title, a.body, a.priority, a.published_at
  from public.recipient_deliveries d
  join public.announcements a on a.id = d.announcement_id and a.status = 'published'
  join public.organizations o on o.id = d.organization_id
  join public.memberships m on m.id = d.membership_id and m.status = 'active'
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where d.announcement_id = target_announcement
    and d.email_status is null
    and u.email is not null
    and u.email_confirmed_at is not null
    and not exists (select 1 from public.read_receipts r where r.recipient_delivery_id = d.id)
  order by d.id
  limit least(greatest(batch_size, 1), 100);
$$;

-- Store the outcome of a batch: [{ "deliveryId", "status", "providerId", "error" }].
create function public.record_email_results(results jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with updated as (
    update public.recipient_deliveries d
    set email_status = r.status,
        email_sent_at = case when r.status = 'sent' then now() else d.email_sent_at end,
        email_provider_id = r."providerId",
        email_error = left(r.error, 300)
    from jsonb_to_recordset(results) as r("deliveryId" uuid, status text, "providerId" text, error text)
    where d.id = r."deliveryId" and d.email_status is null
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- Only the service role (the Edge Function) may run these.
revoke all on function public.announcement_email_batch(uuid, integer) from public, anon, authenticated;
revoke all on function public.record_email_results(jsonb) from public, anon, authenticated;
grant execute on function public.announcement_email_batch(uuid, integer) to service_role;
grant execute on function public.record_email_results(jsonb) to service_role;
