// Admin-only edge function to create / delete users and toggle admin role.
// Uses service_role key to bypass auth.users restrictions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FAKE_DOMAIN = "todo.local";

function usernameToEmail(username: string) {
  return `${username.toLowerCase().trim()}@${FAKE_DOMAIN}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json();
    const action = body.action as string;

    // ---------- BOOTSTRAP: create first admin if none exists ----------
    if (action === "bootstrap_admin") {
      const { username, password, display_name } = body;
      if (!username || !password || password.length < 6) {
        return json({ error: "بيانات غير صالحة" }, 400);
      }

      // check if any admin already exists
      const { count, error: cErr } = await admin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if (cErr) return json({ error: cErr.message }, 500);
      if ((count ?? 0) > 0) {
        return json({ error: "يوجد مدير بالفعل" }, 400);
      }

      const email = usernameToEmail(username);
      const { data: created, error: cuErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: username.toLowerCase().trim(),
          display_name: display_name || username,
        },
      });
      if (cuErr) return json({ error: cuErr.message }, 400);

      // promote to admin
      await admin.from("user_roles").insert({
        user_id: created.user!.id,
        role: "admin",
      });

      return json({ ok: true });
    }

    // For everything else, caller must be authenticated admin.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "غير مصرح" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData.user) return json({ error: "غير مصرح" }, 401);

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "للأدمن فقط" }, 403);

    if (action === "create_user") {
      const { username, password, display_name, is_admin } = body;
      if (!username || !password || password.length < 6) {
        return json({ error: "اسم المستخدم وكلمة مرور (٦ أحرف على الأقل) مطلوبان" }, 400);
      }
      const email = usernameToEmail(username);
      const { data: created, error: cuErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: username.toLowerCase().trim(),
          display_name: display_name || username,
        },
      });
      if (cuErr) return json({ error: cuErr.message }, 400);

      if (is_admin) {
        await admin.from("user_roles").insert({
          user_id: created.user!.id,
          role: "admin",
        });
      }
      return json({ ok: true, user_id: created.user!.id });
    }

    if (action === "delete_user") {
      const { user_id } = body;
      if (!user_id) return json({ error: "user_id مطلوب" }, 400);
      if (user_id === userData.user.id) {
        return json({ error: "لا يمكنك حذف نفسك" }, 400);
      }
      const { error: dErr } = await admin.auth.admin.deleteUser(user_id);
      if (dErr) return json({ error: dErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "set_password") {
      const { user_id, password } = body;
      if (!user_id || !password || password.length < 6) {
        return json({ error: "بيانات غير صالحة" }, 400);
      }
      const { error: pErr } = await admin.auth.admin.updateUserById(user_id, {
        password,
      });
      if (pErr) return json({ error: pErr.message }, 400);
      return json({ ok: true });
    }

    if (action === "toggle_admin") {
      const { user_id, make_admin } = body;
      if (!user_id) return json({ error: "user_id مطلوب" }, 400);
      if (make_admin) {
        await admin.from("user_roles").upsert({ user_id, role: "admin" });
      } else {
        if (user_id === userData.user.id) {
          return json({ error: "لا يمكنك إزالة صلاحياتك" }, 400);
        }
        await admin
          .from("user_roles")
          .delete()
          .eq("user_id", user_id)
          .eq("role", "admin");
      }
      return json({ ok: true });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
