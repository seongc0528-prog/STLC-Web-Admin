// Supabase Edge Function: send-push
//
// Called by STLC_Admin's push page. Verifies the caller is an admin, then
// sends an FCM notification to every row in push_subscriptions using the
// FCM HTTP v1 API, authenticated via a Google service account (RS256 JWT
// exchanged for an OAuth2 access token — no external library needed, just
// Web Crypto, which Deno's edge runtime supports natively).
//
// Required secret (set with `supabase secrets set`):
//   FIREBASE_SERVICE_ACCOUNT = <the full service account JSON, as one line>
//
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the Supabase platform — no need to set them manually.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders });
    }

    const { data: profile } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { title, body } = await req.json();
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title/body required" }), { status: 400, headers: corsHeaders });
    }

    const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
    const accessToken = await getAccessToken(serviceAccount);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: subscriptions, error: subsError } = await adminClient
      .from("push_subscriptions")
      .select("id, fcm_token");
    if (subsError) throw subsError;

    let successCount = 0;
    let failureCount = 0;
    const invalidIds: string[] = [];

    for (const sub of subscriptions ?? []) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { token: sub.fcm_token, notification: { title, body } } }),
        },
      );
      if (res.ok) {
        successCount++;
      } else {
        failureCount++;
        const errBody = await res.json().catch(() => null);
        const status = errBody?.error?.status;
        if (status === "UNREGISTERED" || status === "NOT_FOUND" || status === "INVALID_ARGUMENT") {
          invalidIds.push(sub.id);
        }
      }
    }

    if (invalidIds.length > 0) {
      await adminClient.from("push_subscriptions").delete().in("id", invalidIds);
    }

    await adminClient.from("push_logs").insert({ sent_by: userData.user.id, title, body, target: "all" });

    return new Response(
      JSON.stringify({ successCount, failureCount, total: subscriptions?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
