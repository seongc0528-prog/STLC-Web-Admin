-- ================================================================
-- 예약 푸시 크론 설정 (Supabase SQL Editor 에서 1회 실행)
--
-- 마이그레이션 0007 을 먼저 적용하고, Edge Function 배포 + 시크릿 설정을
-- 끝낸 뒤에 실행한다:
--   supabase functions deploy run-scheduled-push --no-verify-jwt --use-api
--   supabase secrets set CRON_SECRET=<임의의 긴 문자열>
--
-- 배포 시 --no-verify-jwt 가 빠지면 아래 호출이 전부 401로 막힌다. 크론은 JWT 없이
-- x-cron-secret 헤더만 보내기 때문. (인증은 함수 코드가 직접 한다)
--
-- 아래 __CRON_SECRET__ 자리에 위에서 정한 값과 **같은 문자열**을 넣을 것.
-- 프로젝트 ref 는 cqzbkravqkenpytjyajy (다른 프로젝트면 바꿀 것).
--
-- 5분마다 함수를 깨우고, "지금 보낼 스케줄이 있는지" 판단은 함수가 한다.
-- (스케줄마다 타임존/요일이 다를 수 있어서 크론 표현식으로는 못 푼다)
-- ================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 재실행해도 중복 등록되지 않도록 기존 잡을 먼저 제거
select cron.unschedule('run-scheduled-push')
where exists (select 1 from cron.job where jobname = 'run-scheduled-push');

select cron.schedule(
  'run-scheduled-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cqzbkravqkenpytjyajy.supabase.co/functions/v1/run-scheduled-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '__CRON_SECRET__'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 확인용
-- select jobid, jobname, schedule, active from cron.job;
-- select * from cron.job_run_details order by start_time desc limit 20;
-- select id, status_code, content from net._http_response order by created desc limit 10;
