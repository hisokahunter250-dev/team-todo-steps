import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usernameToEmail } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, ListTodo, ShieldCheck } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    // already logged in?
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) nav("/", { replace: true });
    });
    // any admin yet? (use edge function with service role to bypass RLS)
    supabase.functions
      .invoke("admin-users", { body: { action: "has_any_admin" } })
      .then(({ data }) => {
        const hasAdmin = !!(data as any)?.has_admin;
        setNeedsBootstrap(!hasAdmin);
        if (!hasAdmin) setBootstrapMode(true);
      })
      .catch(() => {
        setNeedsBootstrap(false);
      });
  }, [nav]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setBusy(false);
    if (error) {
      toast({ title: "تعذّر تسجيل الدخول", description: "اسم المستخدم أو كلمة المرور غير صحيحة.", variant: "destructive" });
      return;
    }
    nav("/", { replace: true });
  }

  async function handleBootstrap(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "كلمة المرور قصيرة", description: "٦ أحرف على الأقل.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "bootstrap_admin", username, password, display_name: displayName || username },
    });
    if (error || (data as any)?.error) {
      setBusy(false);
      toast({ title: "تعذّر إنشاء المدير", description: (data as any)?.error || error?.message, variant: "destructive" });
      return;
    }
    // auto-login
    const { error: lErr } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setBusy(false);
    if (lErr) {
      toast({ title: "تم إنشاء المدير", description: "سجّل الدخول الآن." });
      setBootstrapMode(false);
      return;
    }
    nav("/", { replace: true });
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-primary shadow-glow mb-4">
            <ListTodo className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-display font-black gradient-text mb-2">مهامي</h1>
          <p className="text-muted-foreground">قائمة مهام جماعية بسجل كامل لكل إجراء</p>
        </div>

        <Card className="glass-card p-6 sm:p-8 shadow-dramatic">
          {bootstrapMode ? (
            <>
              <div className="flex items-center gap-2 mb-5 text-accent">
                <ShieldCheck className="w-5 h-5" />
                <h2 className="font-display font-bold text-lg">إعداد أول مدير</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                لا يوجد مدير بعد. أنشئ حساب المدير الآن — سيكون هو من يضيف باقي الأشخاص.
              </p>
              <form onSubmit={handleBootstrap} className="space-y-4">
                <Field id="u" label="اسم المستخدم" value={username} onChange={setUsername} placeholder="admin" required />
                <Field id="d" label="الاسم المعروض" value={displayName} onChange={setDisplayName} placeholder="المدير" />
                <Field id="p" label="كلمة المرور" value={password} onChange={setPassword} type="password" placeholder="٦ أحرف على الأقل" required />
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  إنشاء المدير والدخول
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-display font-bold text-2xl mb-1">أهلاً بعودتك</h2>
              <p className="text-sm text-muted-foreground mb-6">سجّل دخولك للمتابعة.</p>
              <form onSubmit={handleLogin} className="space-y-4">
                <Field id="u" label="اسم المستخدم" value={username} onChange={setUsername} placeholder="مثلاً: ahmad" required />
                <Field id="p" label="كلمة المرور" value={password} onChange={setPassword} type="password" required />
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  دخول
                </Button>
              </form>
              {needsBootstrap === false && (
                <p className="text-xs text-center text-muted-foreground mt-6">
                  لا تملك حساباً؟ تواصل مع مدير الفريق لإضافتك.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}

function Field({
  id, label, value, onChange, type = "text", placeholder, required,
}: { id: string; label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} dir={type === "password" ? "ltr" : "auto"} />
    </div>
  );
}
