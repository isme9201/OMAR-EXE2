import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Supabase function secrets are incomplete" }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: callerData, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Unauthenticated" }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", callerData.user.id).maybeSingle();
  const callerRole = callerProfile?.role?.trim().toLowerCase();
  if (!callerRole || !["admin", "manager"].includes(callerRole)) return json({ error: "Admin or manager role required" }, 403);

  const payload = await request.json().catch(() => null) as { email?: string; password?: string; name?: string; role?: string; specialty?: string } | null;
  const email = payload?.email?.trim().toLowerCase();
  const password = payload?.password;
  const name = payload?.name?.trim();
  const role = payload?.role?.trim().toLowerCase() || "employee";
  const specialtyAliases: Record<string, string> = {
    "مصمم": "designer", "مصممة": "designer", "تصميم": "designer", "تصميم جرافيك": "designer",
    "مصور": "photographer", "مصورة": "photographer", "تصوير": "photographer", "تصوير فوتوغرافي": "photographer",
    "مسوق": "marketing", "مسوقة": "marketing", "تسويق": "marketing",
    "موارد بشرية": "hr", "الموارد البشرية": "hr",
    "محاسب": "accountant", "محاسبة": "accountant", "حسابات": "accountant",
    "مونتاج": "editor", "مونتير": "editor", "محرر فيديو": "editor",
  };
  const specialtyInput = payload?.specialty?.trim().toLowerCase() ?? "";
  const specialty = specialtyAliases[specialtyInput] ?? specialtyInput;
  if (!["employee", "manager", "admin"].includes(role)) return json({ error: "role must be employee, manager, or admin" }, 400);
  if (!["designer", "photographer", "marketing", "hr", "accountant", "editor"].includes(specialty)) return json({ error: "Choose one of the supported employee specialties" }, 400);
  if (!email || !password || !name) return json({ error: "email, password, and name are required" }, 400);
  if (password.length < 12) return json({ error: "password must be at least 12 characters" }, 400);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role, specialty } });
  if (createError || !created.user) return json({ error: createError?.message ?? "Unable to create Auth account" }, 400);

  const { error: profileError } = await adminClient.from("profiles").upsert({ id: created.user.id, name, email, role, specialty, is_active: true, updated_at: new Date().toISOString() });
  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return json({ error: `Auth account created but profile failed: ${profileError.message}` }, 500);
  }

  return json({ id: created.user.id, name, email, role, specialty }, 201);
});
