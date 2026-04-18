import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, ShieldCheck, Trash2, KeyRound, UserPlus } from "lucide-react";

interface Profile { id: string; username: string; display_name: string; created_at: string }

export default function AdminUsers() {
  return (
    <AppShell requireAdmin>
      <UsersPanel />
    </AppShell>
  );
}

function UsersPanel() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    setLoading(true);
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role").eq("role", "admin"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    setAdminIds(new Set(((r as any[]) ?? []).map((x) => x.user_id)));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function call(action: string, body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, ...body } });
    if (error || (data as any)?.error) {
      toast({ title: "خطأ", description: (data as any)?.error || error?.message, variant: "destructive" });
      return false;
    }
    return true;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-black mb-1">المستخدمون</h1>
          <p className="text-muted-foreground">{profiles.length} مستخدم</p>
        </div>
        <Button variant="hero" onClick={() => setShowNew((v) => !v)}>
          <UserPlus className="w-4 h-4" /> {showNew ? "إلغاء" : "إضافة مستخدم"}
        </Button>
      </div>

      {showNew && <NewUserCard onCreated={() => { setShowNew(false); refresh(); }} call={call} />}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <Card className="glass-card divide-y divide-border/60 overflow-hidden">
          {profiles.map((p) => (
            <UserRow
              key={p.id}
              profile={p}
              isAdmin={adminIds.has(p.id)}
              isSelf={p.id === user?.id}
              onChange={refresh}
              call={call}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function NewUserCard({ onCreated, call }: { onCreated: () => void; call: (a: string, b: Record<string, unknown>) => Promise<boolean> }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "كلمة مرور قصيرة", description: "٦ أحرف على الأقل.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const ok = await call("create_user", { username, password, display_name: displayName || username, is_admin: makeAdmin });
    setBusy(false);
    if (ok) {
      toast({ title: "تم إنشاء المستخدم" });
      setUsername(""); setDisplayName(""); setPassword(""); setMakeAdmin(false);
      onCreated();
    }
  }

  return (
    <Card className="glass-card p-5 sm:p-6 animate-scale-in">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="u">اسم المستخدم</Label>
          <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ahmad" required dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d">الاسم المعروض</Label>
          <Input id="d" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="أحمد" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p">كلمة المرور المؤقتة</Label>
          <Input id="p" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} dir="ltr" />
        </div>
        <div className="flex items-center justify-between sm:col-span-2 p-3 rounded-lg bg-secondary/40">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">منح صلاحية المدير</span>
          </div>
          <Switch checked={makeAdmin} onCheckedChange={setMakeAdmin} />
        </div>
        <Button type="submit" variant="hero" disabled={busy} className="sm:col-span-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          <Plus className="w-4 h-4" /> إنشاء
        </Button>
      </form>
    </Card>
  );
}

function UserRow({ profile, isAdmin, isSelf, onChange, call }: {
  profile: Profile; isAdmin: boolean; isSelf: boolean; onChange: () => void;
  call: (a: string, b: Record<string, unknown>) => Promise<boolean>;
}) {
  const [newPwd, setNewPwd] = useState("");
  const [pwdOpen, setPwdOpen] = useState(false);

  return (
    <div className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-gradient-primary text-primary-foreground font-bold flex items-center justify-center shrink-0">
        {profile.display_name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{profile.display_name}</span>
          {isAdmin && <Badge className="bg-accent/15 text-accent border-accent/30 gap-1"><ShieldCheck className="w-3 h-3" /> مدير</Badge>}
          {isSelf && <Badge variant="outline">أنت</Badge>}
        </div>
        <p className="text-sm text-muted-foreground" dir="ltr">@{profile.username}</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/40">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs">مدير</span>
          <Switch
            checked={isAdmin}
            disabled={isSelf}
            onCheckedChange={async (v) => { if (await call("toggle_admin", { user_id: profile.id, make_admin: v })) onChange(); }}
          />
        </div>

        <AlertDialog open={pwdOpen} onOpenChange={setPwdOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm"><KeyRound className="w-4 h-4" /> كلمة مرور</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تعيين كلمة مرور جديدة</AlertDialogTitle>
              <AlertDialogDescription>للمستخدم <strong dir="ltr">@{profile.username}</strong></AlertDialogDescription>
            </AlertDialogHeader>
            <Input value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="كلمة المرور الجديدة" dir="ltr" minLength={6} />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setNewPwd("")}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (newPwd.length < 6) { toast({ title: "٦ أحرف على الأقل", variant: "destructive" }); return; }
                  if (await call("set_password", { user_id: profile.id, password: newPwd })) {
                    toast({ title: "تم تحديث كلمة المرور" });
                    setNewPwd(""); setPwdOpen(false);
                  }
                }}
              >تحديث</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {!isSelf && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>حذف المستخدم؟</AlertDialogTitle>
                <AlertDialogDescription>سيتم حذف الحساب نهائياً مع كل بياناته (مهامه، خطواته، تعليقاته).</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  onClick={async () => {
                    if (await call("delete_user", { user_id: profile.id })) {
                      toast({ title: "تم الحذف" });
                      onChange();
                    }
                  }}
                >حذف</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
