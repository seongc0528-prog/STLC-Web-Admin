-- Switch push_subscriptions from an FCM token to a standard Web Push
-- subscription (endpoint + keys), matching the move away from Firebase.

alter table public.push_subscriptions drop constraint if exists push_subscriptions_user_id_fcm_token_key;

alter table public.push_subscriptions
  add column if not exists endpoint text,
  add column if not exists p256dh text,
  add column if not exists auth_key text;

update public.push_subscriptions set endpoint = fcm_token where endpoint is null;

alter table public.push_subscriptions
  drop column if exists fcm_token,
  alter column endpoint set not null;

alter table public.push_subscriptions
  add constraint push_subscriptions_user_id_endpoint_key unique (user_id, endpoint);
