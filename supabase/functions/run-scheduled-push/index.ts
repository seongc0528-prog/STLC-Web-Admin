// Supabase Edge Function: run-scheduled-push
//
// 예약 푸시(scheduled_pushes)를 실제로 발송한다. 호출 경로는 두 가지:
//
//  1) pg_cron → pg_net 이 몇 분마다 호출 (헤더 x-cron-secret: CRON_SECRET)
//     → 발송 시각이 지났고 오늘 아직 안 보낸 스케줄을 전부 발송.
//  2) 관리자가 STLC_Admin 에서 "지금 테스트 발송" (관리자 JWT)
//     → { scheduleId, force: true } 로 시각 조건을 무시하고 1건만 발송.
//        force 발송은 last_sent_on 을 건드리지 않으므로 정규 발송에 영향 없음.
//
// 필요한 시크릿 (supabase secrets set):
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — send-push 와 동일한 키 쌍
//   CRON_SECRET                          — pg_cron 호출을 인증할 임의 문자열

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// 크론이 멈췄다 살아난 경우, 예정 시각을 한참 지난 알림까지 뒤늦게 보내면
// 새벽 알림 같은 사고가 난다. 예정 시각 이후 이 시간 안에서만 발송한다.
const CATCH_UP_MINUTES = 120;

webpush.setVapidDetails(
  "mailto:admin@sydneythelordchurch.org",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type Schedule = {
  id: string;
  name: string;
  kind: "daily_verse" | "text";
  title: string;
  body: string | null;
  url: string;
  enabled: boolean;
  send_time: string; // 'HH:MM:SS'
  timezone: string;
  days_of_week: number[] | null;
  last_sent_on: string | null;
};

/** 주어진 타임존 기준의 현재 날짜(YYYY-MM-DD), 자정부터의 분, 요일(0=일). */
function localNow(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24; // en-US 는 자정을 '24' 로 주기도 한다
  const minute = Number(get("minute"));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + minute,
    weekday: weekdays.indexOf(get("weekday")),
  };
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function isDue(s: Schedule, now: Date) {
  const local = localNow(s.timezone, now);
  if (s.last_sent_on === local.date) return { due: false, local };
  if (s.days_of_week?.length && !s.days_of_week.includes(local.weekday)) {
    return { due: false, local };
  }
  const elapsed = local.minutes - timeToMinutes(s.send_time);
  return { due: elapsed >= 0 && elapsed <= CATCH_UP_MINUTES, local };
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;

/** 스케줄 본문을 만든다. daily_verse 는 해당 날짜의 말씀을 DB에서 가져온다. */
async function buildPayload(admin: AdminClient, s: Schedule, localDate: string) {
  const url = s.url || "/daily-verse";
  if (s.kind === "text") {
    return { title: s.title, body: s.body ?? "", url };
  }

  const { data, error } = await admin.rpc("daily_verse_for", { d: localDate });
  if (error) throw error;
  const verse = Array.isArray(data) ? data[0] : data;
  if (!verse) throw new Error("등록된 말씀이 없습니다.");
  return { title: s.title, body: verse.text_kr as string, url };
}

async function sendToAll(admin: AdminClient, payload: Record<string, string>) {
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key");
  if (error) throw error;

  let successCount = 0;
  let failureCount = 0;
  const invalidIds: string[] = [];
  const json = JSON.stringify(payload);

  for (const sub of subscriptions ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        json,
      );
      successCount++;
    } catch (err) {
      failureCount++;
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) invalidIds.push(sub.id);
    }
  }

  if (invalidIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", invalidIds);
  }

  return { successCount, failureCount, total: subscriptions?.length ?? 0 };
}

async function runSchedule(
  admin: AdminClient,
  s: Schedule,
  localDate: string,
  sentBy: string | null,
) {
  const payload = await buildPayload(admin, s, localDate);
  const result = await sendToAll(admin, payload);

  await admin.from("push_logs").insert({
    sent_by: sentBy,
    title: payload.title,
    body: payload.body,
    target: "all",
    source: "scheduled",
    schedule_id: s.id,
  });

  return { id: s.id, name: s.name, ...result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonResponse = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = req.headers.get("content-type")?.includes("json")
      ? await req.json().catch(() => ({}))
      : {};
    const { scheduleId, force } = body as { scheduleId?: string; force?: boolean };

    // --- 호출자 인증: 크론 시크릿 또는 관리자 JWT ---
    const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    let callerId: string | null = null;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const caller = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await caller.auth.getUser();
      if (!userData?.user) return jsonResponse({ error: "unauthenticated" }, 401);

      const { data: profile } = await caller
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
      if (profile?.role !== "admin") return jsonResponse({ error: "forbidden" }, 403);
      callerId = userData.user.id;
    }

    // --- 관리자 즉시(테스트) 발송 ---
    if (force) {
      if (isCron) return jsonResponse({ error: "force requires an admin caller" }, 403);
      if (!scheduleId) return jsonResponse({ error: "scheduleId required" }, 400);

      const { data: s, error } = await admin
        .from("scheduled_pushes")
        .select("*")
        .eq("id", scheduleId)
        .single();
      if (error || !s) return jsonResponse({ error: "schedule not found" }, 404);

      const local = localNow(s.timezone, new Date());
      const result = await runSchedule(admin, s as Schedule, local.date, callerId);
      return jsonResponse({ forced: true, results: [result] });
    }

    // --- 예정된 스케줄 일괄 처리 ---
    let query = admin.from("scheduled_pushes").select("*").eq("enabled", true);
    if (scheduleId) query = query.eq("id", scheduleId);
    const { data: schedules, error: schedulesError } = await query;
    if (schedulesError) throw schedulesError;

    const now = new Date();
    const results = [];
    const skipped = [];

    for (const s of (schedules ?? []) as Schedule[]) {
      const { due, local } = isDue(s, now);
      if (!due) {
        skipped.push({ id: s.id, name: s.name, localDate: local.date });
        continue;
      }

      // 크론이 겹쳐 돌아도 하루 한 번만 나가도록, 발송 전에 조건부 UPDATE 로
      // "오늘 발송" 자리를 먼저 선점한다. 행이 안 잡히면 다른 실행이 가져간 것.
      const { data: claimed } = await admin
        .from("scheduled_pushes")
        .update({ last_sent_on: local.date, last_run_at: now.toISOString() })
        .eq("id", s.id)
        .or(`last_sent_on.is.null,last_sent_on.neq.${local.date}`)
        .select("id");
      if (!claimed?.length) {
        skipped.push({ id: s.id, name: s.name, localDate: local.date, reason: "claimed" });
        continue;
      }

      try {
        results.push(await runSchedule(admin, s, local.date, null));
      } catch (err) {
        // 발송이 실패했으면 선점을 되돌려 다음 크론에서 재시도할 수 있게 한다.
        await admin
          .from("scheduled_pushes")
          .update({ last_sent_on: s.last_sent_on })
          .eq("id", s.id);
        throw err;
      }
    }

    return jsonResponse({ results, skipped });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
