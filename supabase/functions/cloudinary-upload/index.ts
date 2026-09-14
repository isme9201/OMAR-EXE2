import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sha1 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !cloudName || !apiKey || !apiSecret) return json({ error: "Function secrets are incomplete" }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(payload?.action ?? "");

  if (action === "create_link") {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: callerData } = await callerClient.auth.getUser();
    if (!callerData.user) return json({ error: "Unauthenticated" }, 401);
    const { data: profile } = await adminClient.from("profiles").select("role").eq("id", callerData.user.id).maybeSingle();
    if (!profile || !["admin", "manager"].includes(profile.role)) return json({ error: "Admin or manager role required" }, 403);
    const token = crypto.randomUUID().replaceAll("-", "");
    const expiresAt = new Date(Date.now() + Math.min(Number(payload?.ttlHours ?? 48), 168) * 60 * 60 * 1000).toISOString();
    const { data: link, error } = await adminClient.from("task_upload_links").insert({ token, task_id: typeof payload?.taskId === "string" ? payload.taskId : null, client_name: typeof payload?.clientName === "string" ? payload.clientName : null, expires_at: expiresAt, created_by: callerData.user.id }).select("id,token,task_id,client_name,expires_at").single();
    if (error) return json({ error: error.message }, 400);
    return json({ link, uploadUrl: `${new URL(request.url).origin}/upload?token=${token}` }, 201);
  }

  if (action === "sign_upload") {
    const token = String(payload?.token ?? "");
    const { data: link } = await adminClient.from("task_upload_links").select("token,task_id,client_name,expires_at,revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) return json({ error: "Upload link expired or invalid" }, 410);
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `avenmedia/${link.task_id ?? "unassigned"}/${token}`;
    const signature = await sha1(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);
    return json({ cloudName, apiKey, timestamp, signature, folder, taskId: link.task_id, clientName: link.client_name });
  }

  if (action === "complete_upload") {
    const token = String(payload?.token ?? "");
    const { data: link } = await adminClient.from("task_upload_links").select("token,task_id,client_name,expires_at,revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) return json({ error: "Upload link expired or invalid" }, 410);
    const asset = (payload?.asset ?? {}) as Record<string, unknown>;
    const { data: upload, error } = await adminClient.from("client_uploads").insert({ client_name: link.client_name, file_url: String(asset.secure_url ?? ""), secure_url: String(asset.secure_url ?? ""), cloudinary_public_id: String(asset.public_id ?? ""), resource_type: String(asset.resource_type ?? "image"), bytes: Number(asset.bytes ?? 0), format: String(asset.format ?? ""), task_id: link.task_id }).select("id,client_name,secure_url,cloudinary_public_id,resource_type,bytes,format,task_id,uploaded_at").single();
    if (error) return json({ error: error.message }, 400);
    return json({ upload }, 201);
  }

  return json({ error: "Unknown action" }, 400);
});
