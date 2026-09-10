# 데일리 말씀 / 예약 푸시 설정 가이드

기존 Flutter 앱은 말씀 200건을 앱 안에 JSON으로 들고 있다가, "알림이 왔다"는
빈 푸시를 받으면 앱이 날짜로 골라 화면에 띄우는 방식이었다. 웹에서는 말씀을
Supabase DB로 옮기고, 예약된 시각에 Edge Function 이 **말씀 본문을 담아서**
푸시한다. 알림을 누르면 `/daily-verse` 로 이동해 같은 말씀을 크게 볼 수 있다.

날짜 → 말씀 매핑 규칙은 앱과 동일하다: `(2025-01-01 부터 경과일) % 전체 건수`
(SQL 함수 `public.daily_verse_for(date)` 한 곳에만 구현되어 있고, 웹 페이지와
발송 함수가 모두 이 함수를 쓴다).

## 구성 요소

| 위치 | 내용 |
|---|---|
| `migrations/0007_daily_verses_scheduled_push.sql` | `daily_verses`(말씀 200건 시드 포함), `scheduled_pushes`, `daily_verse_for()`, `push_logs` 확장 |
| `functions/run-scheduled-push/index.ts` | 예약 발송 실행 (크론 호출 + 관리자 즉시발송) |
| `cron/0007_schedule_pushes.sql` | pg_cron 등록 (5분마다 함수 호출) |
| STLC_Admin `/scheduled-push` | 예약 목록/편집, 오늘 나갈 말씀 미리보기, "지금 발송" |
| STLC_Admin `/daily-verses` | 말씀 원본 CRUD |
| STLC_Web `/daily-verse` | 오늘의 말씀 페이지 (비로그인도 열람 가능) |

## 배포 순서

1. **마이그레이션 적용** — Supabase SQL Editor 에서
   `migrations/0007_daily_verses_scheduled_push.sql` 전체 실행.
   (`시드니 시간 매일 07:00 데일리 말씀` 예약 1건이 자동으로 만들어진다.)

2. **Edge Function 배포**

   ```bash
   supabase functions deploy run-scheduled-push
   ```

3. **시크릿 설정** — `CRON_SECRET` 은 아무 긴 랜덤 문자열이면 된다.

   ```bash
   supabase secrets set CRON_SECRET=<랜덤 문자열>
   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 는 send-push 에서 이미 설정됨
   ```

4. **크론 등록** — `cron/0007_schedule_pushes.sql` 의 `__CRON_SECRET__` 을 3번에서
   정한 값으로 바꾼 뒤 SQL Editor 에서 실행.

5. **확인** — 관리자 `/scheduled-push` 에서 "지금 발송" 으로 즉시 테스트.
   (즉시 발송은 `last_sent_on` 을 건드리지 않으므로 정규 발송은 예정대로 나간다.)

## 동작 규칙

- 크론은 5분마다 함수를 깨우고, "지금 보낼 게 있는지"는 함수가 판단한다.
  예약마다 타임존과 요일이 다를 수 있어 크론 표현식으로는 표현할 수 없기 때문.
- 하루 한 번 보장: 발송 전에 `last_sent_on` 을 조건부 UPDATE 로 선점한다.
  실행이 겹쳐도 한 번만 나가고, 발송이 실패하면 선점을 되돌려 다음 크론에서
  재시도한다.
- 크론이 오래 멈췄다 살아나도 예정 시각 + 120분(`CATCH_UP_MINUTES`) 이 지난
  알림은 보내지 않는다. 새벽에 뒤늦게 울리는 사고를 막기 위한 것.
- 예약 종류는 두 가지다. `daily_verse` 는 본문을 그날의 말씀으로 자동 생성하고,
  `text` 는 등록해 둔 고정 문구를 그대로 반복 발송한다(예: 매주 토요일 주보 안내).

## 문제가 있을 때

```sql
select jobid, jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
select id, status_code, content from net._http_response order by created desc limit 10;
select * from public.push_logs order by sent_at desc limit 20;
```

Edge Function 자체 로그는 Supabase 대시보드 → Edge Functions →
run-scheduled-push → Logs 에서 볼 수 있다.
