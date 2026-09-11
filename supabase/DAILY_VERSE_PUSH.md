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

2. **Edge Function 배포** — `--no-verify-jwt` 가 **반드시** 필요하다.

   ```bash
   supabase functions deploy run-scheduled-push --no-verify-jwt --use-api
   ```

   `verify_jwt`(기본값 true)를 켜 두면 Supabase 게이트웨이가 **유효한 JWT 없는 요청을
   함수 코드에 닿기 전에 401로 막는다.** 크론은 JWT 없이 `x-cron-secret` 헤더만 보내므로
   정시 발송이 전부 401로 실패한다. 대신 함수가 직접 호출자를 검증한다 —
   크론은 `CRON_SECRET` 일치, 관리자 즉시발송은 JWT + `profiles.role = 'admin'` 확인.
   따라서 게이트웨이 검증을 꺼도 인증 없이 발송할 수는 없다.

   `--use-api` 는 Docker 없이 서버에서 번들링하라는 뜻이다(로컬에 Docker가 없을 때 필요).

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

## "수동 발송은 되는데 정기 발송이 안 될 때"

수동 발송과 크론 발송은 코드의 절반만 공유한다. 수동이 되는데 정기가 안 되면 원인은
**크론 경로에만 있는 4단계** 중 하나다. 각각을 따로 검증해야 한다.

```
수동:  브라우저 → JWT 인증 → [발송 로직]
크론:  pg_cron → pg_net → 시크릿 인증 → isDue() → last_sent_on 선점 → [발송 로직]
                └─────────── 수동 경로엔 없는 구간 ───────────┘
```

**핵심: 알림을 보내지 않고도 크론 전송 경로를 검증할 수 있다.** 발송 시각이 아닐 때도
함수는 `200 {"results":[],"skipped":[...]}` 을 반환하므로, 아무 때나 아래를 확인하면
"크론이 함수까지 도달하는가"를 알 수 있다.

```sql
select jobname, status, start_time, return_message
from cron.job_run_details order by start_time desc limit 5;

select status_code, content, created
from net._http_response order by created desc limit 5;
```

| 증상 | 원인 |
|---|---|
| `cron.job_run_details` 가 비어 있음 | 크론 미등록. `select * from cron.job` 확인 |
| 크론은 도는데 `net._http_response` 가 비어 있음 | `pg_net` 확장 문제 |
| `status_code = 401` | 배포 시 `--no-verify-jwt` 누락 |
| `status_code = 401` + `{"error":"unauthenticated"}` | 크론 SQL의 시크릿이 `CRON_SECRET` 과 불일치 |
| `status_code = 200` + `skipped` | 정상 (발송 시각이 아닐 뿐) |
| `status_code = 200` + `results` 비어있고 계속 `skipped` | `isDue()` 조건 확인 — `last_sent_on`, `send_time`, `timezone`, 캐치업 120분 |

`net._http_response` 는 몇 시간 뒤 자동 삭제되므로 크론 실행 직후에 확인할 것.

## 문제가 있을 때

```sql
select jobid, jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
select id, status_code, content from net._http_response order by created desc limit 10;
select * from public.push_logs order by sent_at desc limit 20;
```

Edge Function 자체 로그는 Supabase 대시보드 → Edge Functions →
run-scheduled-push → Logs 에서 볼 수 있다.
