import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sha1 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const allowedRoles = ["admin", "manager", "designer", "photographer", "editor", "social_media", "accountant", "hr", "indoor", "flex_printing", "flex_workshop", "laser", "acrylic", "employee"];

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

  const chatMember = async (conversationId: string) => {
    if (!callerId || !conversationId) return false;
    const { data } = await adminClient.from("conversation_members").select("user_id,blocked_at").eq("conversation_id", conversationId);
    return Boolean(data?.some((member) => member.user_id === callerId && !member.blocked_at) && !data?.some((member) => member.user_id !== callerId && member.blocked_at));
  };

  if (action === "sign_chat_upload") {
    const conversationId = String(payload?.conversationId ?? "");
    const clientMessageId = String(payload?.clientMessageId ?? "");
    const resourceType = String(payload?.resourceType ?? "raw");
    if (!conversationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId) || !["image", "video", "raw"].includes(resourceType)) return json({ error: "Invalid chat upload request" }, 400);
    if (!(await chatMember(conversationId))) return json({ error: "Conversation membership required" }, 403);
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `avenmedia/chat/${conversationId}`;
    const publicId = clientMessageId;
    const signature = await sha1(`folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
    return json({ cloudName, apiKey, timestamp, signature, folder, publicId, resourceType });
  }

  if (action === "complete_chat_upload") {
    const conversationId = String(payload?.conversationId ?? "");
    const clientMessageId = String(payload?.clientMessageId ?? "");
    const messageType = String(payload?.messageType ?? "file");
    const body = String(payload?.body ?? "").trim().slice(0, 5000);
    const replyToMessageId = typeof payload?.replyToMessageId === "string" ? payload.replyToMessageId : null;
    const asset = (payload?.asset ?? {}) as Record<string, unknown>;
    if (!(await chatMember(conversationId))) return json({ error: "Conversation membership required" }, 403);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId) || !["text", "image", "video", "pdf", "file", "voice"].includes(messageType)) return json({ error: "Invalid chat message" }, 400);
    const secureUrl = String(asset.secure_url ?? "");
    const allowedResource = messageType === "image" ? "image" : messageType === "video" ? "video" : "raw";
    const folder = `avenmedia/chat/${conversationId}`;
    const expectedPublicId = `${folder}/${clientMessageId}`;
    const publicId = String(asset.public_id ?? "");
    if (publicId !== expectedPublicId && !publicId.startsWith(`${expectedPublicId}.`)) return json({ error: "Attachment public id does not match the signed conversation upload" }, 400);
    let assetUrl: URL;
    let decodedPath: string;
    try { assetUrl = new URL(secureUrl); decodedPath = decodeURIComponent(assetUrl.pathname); }
    catch { return json({ error: "Cloudinary did not return a valid secure asset URL" }, 400); }
    const pathPrefix = `/${cloudName}/${allowedResource}/upload/`;
    if (assetUrl.protocol !== "https:" || assetUrl.hostname !== "res.cloudinary.com" || !decodedPath.startsWith(pathPrefix) || !decodedPath.includes(`/${publicId}`)) return json({ error: "Attachment URL does not match the signed Cloudinary asset" }, 400);
    if (String(asset.resource_type ?? "") !== allowedResource) return json({ error: "Attachment resource type mismatch" }, 400);
    const sizeBytes = Number(asset.bytes ?? 0);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return json({ error: "Attachment size is invalid" }, 400);
    if (replyToMessageId) {
      const { data: reply } = await adminClient.from("conversation_messages").select("id").eq("id", replyToMessageId).eq("conversation_id", conversationId).maybeSingle();
      if (!reply) return json({ error: "Reply target is not in this conversation" }, 400);
    }
    const { data: duplicate } = await adminClient.from("conversation_messages").select("*").eq("sender_id", callerId).eq("conversation_id", conversationId).eq("client_message_id", clientMessageId).maybeSingle();
    if (duplicate) return json({ message: duplicate, duplicate: true });
    const { data: message, error } = await adminClient.from("conversation_messages").insert({
      conversation_id: conversationId, sender_id: callerId, body, message_type: messageType,
      attachment_url: secureUrl, attachment_public_id: String(asset.public_id ?? "").slice(0, 500) || null,
      attachment_name: String(asset.original_filename ?? "مرفق").slice(0, 255),
      attachment_mime_type: String(asset.mime_type ?? "application/octet-stream").slice(0, 160),
      attachment_size_bytes: sizeBytes, attachment_resource_type: allowedResource,
      attachment_format: String(asset.format ?? "").slice(0, 80) || null, attachment_duration_seconds: Number(asset.duration_seconds ?? 0) || null,
      client_message_id: clientMessageId, reply_to_message_id: replyToMessageId,
    }).select("*").single();
    if (error || !message) return json({ error: error?.message ?? "Message creation failed" }, 400);
    return json({ message }, 201);
  }

  if (action === "revoke_link") {
    const linkId = String(payload?.linkId ?? "");
    if (!linkId) return json({ error: "Link id is required" }, 400);
    const { data: link } = await adminClient.from("task_upload_links").select("id,created_by").eq("id", linkId).maybeSingle();
    const { data: actor } = await adminClient.from("profiles").select("role").eq("id", callerId).maybeSingle();
    const actorRole = String(actor?.role ?? "").trim().toLowerCase();
    if (!link || (link.created_by !== callerId && !["admin", "manager"].includes(actorRole))) return json({ error: "Not allowed to revoke this link" }, 403);
    const { error } = await adminClient.from("task_upload_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId);
    return json(error ? { error: error.message } : { ok: true }, error ? 400 : 200);
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
    const clientName = typeof payload?.clientName === "string" ? payload.clientName.trim().slice(0, 160) || null : null;
    const { data: link, error } = await adminClient.from("task_upload_links").insert({ token, task_id: typeof payload?.taskId === "string" ? payload.taskId : null, client_name: clientName, expires_at: expiresAt, created_by: callerId }).select("id,token,task_id,client_name,expires_at,created_at").single();
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
