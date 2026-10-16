import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sha1 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const allowedRoles = ["admin", "manager", "designer", "indoor", "flex_printing", "flex_workshop", "laser", "acrylic"];

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
  const publicUploadAction = action === "sign_upload" || action === "complete_upload" || action === "list_uploads";
  const authHeader = request.headers.get("Authorization");
  let callerId: string | null = null;
  if (authHeader && authHeader !== `Bearer ${anonKey}`) {
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: callerData } = await callerClient.auth.getUser();
    callerId = callerData.user?.id ?? null;
  }
  if (!publicUploadAction) {
    if (!callerId) return json({ error: "Unauthenticated" }, 401);
    const { data: profile } = await adminClient.from("profiles").select("id,role,is_active").eq("id", callerId).maybeSingle();
    const role = profile?.role?.trim().toLowerCase();
    if (!profile || profile.is_active === false || !role || (!allowedRoles.includes(role) && role !== "employee")) return json({ error: "Your account is not allowed to use Avenmedia chat" }, 403);
  }

  if (action === "create_chat_message") {
    const recipientId = String(payload?.recipientId ?? "");
    const text = String(payload?.text ?? "").trim();
    if (!recipientId || !text) return json({ error: "Recipient and message are required" }, 400);
    const { data: recipient } = await adminClient.from("profiles").select("id").eq("id", recipientId).or("is_active.eq.true,is_active.is.null").maybeSingle();
    if (!recipient) return json({ error: "Recipient is not active" }, 404);
    const { data, error } = await adminClient.from("tasks").insert({ title: text.slice(0, 80), description: text, task_type: "chat", status: "new", priority: "normal", created_by: callerId, client_name: recipientId }).select("id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at").single();
    if (error || !data) return json({ error: error?.message ?? "Message creation failed" }, 400);
    const assignment = await adminClient.from("task_assignments").insert({ task_id: data.id, employee_id: recipientId });
    if (assignment.error && assignment.error.code !== "23505") return json({ error: assignment.error.message }, 400);
    return json({ item: data }, 201);
  }

  if (action === "create_chat_task") {
    const recipientId = String(payload?.recipientId ?? "");
    const title = String(payload?.title ?? "ملف جديد").slice(0, 120);
    const description = String(payload?.description ?? "").trim() || `ملف مرسل: ${title}`;
    if (!recipientId) return json({ error: "Recipient is required" }, 400);
    const { data: recipient } = await adminClient.from("profiles").select("id").eq("id", recipientId).or("is_active.eq.true,is_active.is.null").maybeSingle();
    if (!recipient) return json({ error: "Recipient is not active" }, 404);
    const { data, error } = await adminClient.from("tasks").insert({ title, description, task_type: "chat", status: "new", priority: "normal", created_by: callerId, client_name: recipientId }).select("id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at").single();
    if (error || !data) return json({ error: error?.message ?? "Transfer creation failed" }, 400);
    const assignment = await adminClient.from("task_assignments").insert({ task_id: data.id, employee_id: recipientId });
    if (assignment.error && assignment.error.code !== "23505") return json({ error: assignment.error.message }, 400);
    return json({ item: data }, 201);
  }

  if (action === "create_link") {
    const token = crypto.randomUUID().replaceAll("-", "");
    const requestedHours = Number(payload?.ttlHours ?? 48);
    const ttlHours = Number.isFinite(requestedHours) ? Math.max(1, Math.min(168, Math.round(requestedHours))) : 48;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
    const { data: link, error } = await adminClient.from("task_upload_links").insert({ token, task_id: typeof payload?.taskId === "string" ? payload.taskId : null, client_name: typeof payload?.clientName === "string" ? payload.clientName : null, expires_at: expiresAt, created_by: callerId }).select("id,token,task_id,client_name,expires_at").single();
    if (error) return json({ error: error.message }, 400);
    return json({ link }, 201);
  }

  if (action === "list_links") {
    const { data: links, error } = await adminClient.from("task_upload_links").select("id,token,task_id,client_name,expires_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 400);
    return json({ links: links ?? [] });
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
    const { data: link } = await adminClient.from("task_upload_links").select("id,token,task_id,client_name,expires_at,revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) return json({ error: "Upload link expired or invalid" }, 410);
    const asset = (payload?.asset ?? {}) as Record<string, unknown>;
    const publicId = String(asset.public_id ?? "");
    const secureUrl = String(asset.secure_url ?? "");
    if (!publicId || !secureUrl) return json({ error: "Cloudinary did not return a complete asset" }, 400);
    const selectUpload = "id,upload_link_id,file_name,client_name,secure_url,cloudinary_public_id,resource_type,bytes,format,task_id,uploaded_at,uploaded_by,status,note,viewed_at,viewed_by";
    const { data: existing, error: lookupError } = await adminClient.from("client_uploads").select(selectUpload).eq("upload_token", token).eq("cloudinary_public_id", publicId).maybeSingle();
    if (lookupError) return json({ error: lookupError.message }, 400);
    if (existing) return json({ upload: existing, duplicate: true });
    const fileName = typeof payload?.fileName === "string" ? payload.fileName.slice(0, 255) : typeof asset.original_filename === "string" ? asset.original_filename.slice(0, 255) : null;
    const { data: upload, error } = await adminClient.from("client_uploads").insert({ upload_link_id: link.id, upload_token: token, file_name: fileName, client_name: link.client_name, file_url: secureUrl, secure_url: secureUrl, cloudinary_public_id: publicId, resource_type: String(asset.resource_type ?? "auto"), bytes: Number(asset.bytes ?? 0), format: String(asset.format ?? ""), task_id: link.task_id, uploaded_by: callerId }).select(selectUpload).single();
    if (error) return json({ error: error.message }, 400);
    return json({ upload }, 201);
  }
  if (action === "list_uploads") {
    const token = String(payload?.token ?? "");
    const { data: link } = await adminClient.from("task_upload_links").select("token,expires_at,revoked_at").eq("token", token).maybeSingle();
    if (!link || link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) return json({ error: "Upload link expired or invalid" }, 410);
    const { data: uploads, error } = await adminClient.from("client_uploads").select("id,file_name,secure_url,resource_type,bytes,format,uploaded_at,status").eq("upload_token", token).order("uploaded_at", { ascending: false }).limit(100);
    if (error) return json({ error: error.message }, 400);
    return json({ uploads: uploads ?? [] });
  }
  return json({ error: "Unknown action" }, 400);
});
