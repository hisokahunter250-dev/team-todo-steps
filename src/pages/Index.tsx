import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Plus, Users as UsersIcon, Loader2, Clock, CheckCircle2, Circle, ListChecks } from "lucide-react";

interface Profile { id: string; username: string; display_name: string }
interface TaskRow {
  id: string; title: string; description: string | null;
  visibility: "shared" | "assigned"; is_completed: boolean;
  completed_by: string | null; completed_at: string | null;
  created_by: string; last_activity_at: string; created_at: string;
}
interface TaskWithMeta extends TaskRow {
  assignees: string[]; // user ids
  step_count: number;
}

export default function Index() {
  return (
    <AppShell>
      <TasksDashboard />
    </AppShell>
  );
}

function TasksDashboard() {
  const { user, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<TaskWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "done" | "mine">("all");
  const [showNew, setShowNew] = useState(false);

  async function refresh() {
    setLoading(true);
    const [{ data: p }, { data: t }, { data: a }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name").order("display_name"),
      supabase.from("tasks").select("*").order("last_activity_at", { ascending: false }),
      supabase.from("task_assignees").select("task_id, user_id"),
      supabase.from("task_steps").select("task_id"),
    ]);
    setProfiles((p as Profile[]) ?? []);
    const stepCounts = new Map<string, number>();
    (s ?? []).forEach((row: any) => stepCounts.set(row.task_id, (stepCounts.get(row.task_id) ?? 0) + 1));
    const assigneesByTask = new Map<string, string[]>();
    (a ?? []).forEach((row: any) => {
      const arr = assigneesByTask.get(row.task_id) ?? [];
      arr.push(row.user_id);
      assigneesByTask.set(row.task_id, arr);
    });
    const merged: TaskWithMeta[] = ((t as TaskRow[]) ?? []).map((tk) => ({
      ...tk,
      assignees: assigneesByTask.get(tk.id) ?? [],
      step_count: stepCounts.get(tk.id) ?? 0,
    }));
    setTasks(merged);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const filtered = tasks.filter((t) => {
    if (filter === "open") return !t.is_completed;
    if (filter === "done") return t.is_completed;
    if (filter === "mine") return t.assignees.includes(user?.id ?? "") || t.created_by === user?.id;
    return true;
  });

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-display font-black mb-1">المهام</h1>
          <p className="text-muted-foreground">{tasks.length} مهمة • {tasks.filter(t => !t.is_completed).length} مفتوحة</p>
        </div>
        <Button variant="hero" size="lg" onClick={() => setShowNew((v) => !v)}>
          <Plus className="w-4 h-4" /> {showNew ? "إلغاء" : "مهمة جديدة"}
        </Button>
      </section>

      {showNew && (
        <NewTaskCard
          profiles={profiles}
          onCreated={() => { setShowNew(false); refresh(); }}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {(["all", "open", "done", "mine"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "الكل" : f === "open" ? "المفتوحة" : f === "done" ? "المنجزة" : "مهامي"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card p-10 text-center">
          <ListChecks className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">لا توجد مهام لعرضها.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((t) => <TaskCard key={t.id} task={t} profiles={profiles} />)}
        </div>
      )}
    </div>
  );
}

function NewTaskCard({ profiles, onCreated }: { profiles: Profile[]; onCreated: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"shared" | "assigned">("shared");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !user) return;
    setBusy(true);
    const { data, error } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      visibility,
      created_by: user.id,
    }).select().single();
    if (error || !data) {
      setBusy(false);
      toast({ title: "تعذّر إنشاء المهمة", description: error?.message, variant: "destructive" });
      return;
    }
    if (assignees.length) {
      await supabase.from("task_assignees").insert(assignees.map((uid) => ({ task_id: data.id, user_id: uid })));
    }
    setBusy(false);
    toast({ title: "تم إنشاء المهمة" });
    onCreated();
  }

  return (
    <Card className="glass-card p-5 sm:p-6 animate-scale-in">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">عنوان المهمة</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تجهيز عرض العميل" required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="desc">الوصف (اختياري)</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>النوع</Label>
            <div className="flex gap-2">
              {(["shared", "assigned"] as const).map((v) => (
                <Button key={v} type="button" size="sm" variant={visibility === v ? "default" : "outline"} onClick={() => setVisibility(v)}>
                  {v === "shared" ? "مشتركة" : "مُسندة"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>إسناد إلى</Label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {profiles.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setAssignees((a) => a.includes(p.id) ? a.filter((x) => x !== p.id) : [...a, p.id])}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    assignees.includes(p.id) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary/60"
                  }`}
                >
                  {p.display_name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Button type="submit" variant="hero" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          إنشاء المهمة
        </Button>
      </form>
    </Card>
  );
}

function TaskCard({ task, profiles }: { task: TaskWithMeta; profiles: Profile[] }) {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const creator = profileMap.get(task.created_by);
  const completer = task.completed_by ? profileMap.get(task.completed_by) : null;

  return (
    <Link to={`/task/${task.id}`} className="block group">
      <Card className={`glass-card p-5 h-full transition-all group-hover:shadow-elegant group-hover:-translate-y-0.5 ${task.is_completed ? "opacity-75" : ""}`}>
        <div className="flex items-start gap-3">
          <div className={`mt-1 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${task.is_completed ? "bg-success text-success-foreground" : "bg-secondary text-muted-foreground"}`}>
            {task.is_completed ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-display font-bold text-lg leading-snug mb-1 ${task.is_completed ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </h3>
            {task.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{task.description}</p>}

            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <Badge variant="secondary" className="gap-1">
                <ListChecks className="w-3 h-3" />
                {task.step_count} خطوة
              </Badge>
              {task.visibility === "assigned" ? (
                <Badge variant="outline" className="gap-1"><UsersIcon className="w-3 h-3" /> مُسندة</Badge>
              ) : (
                <Badge variant="outline">مشتركة</Badge>
              )}
              {task.is_completed && completer && (
                <Badge className="bg-success/15 text-success border-success/30">منجزة بواسطة {completer.display_name}</Badge>
              )}
            </div>

            {task.assignees.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {task.assignees.map((uid) => (
                  <span key={uid} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {profileMap.get(uid)?.display_name ?? "—"}
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>أنشأها {creator?.display_name ?? "—"}</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {timeAgo(task.last_activity_at)}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
  return new Date(iso).toLocaleDateString("ar-EG");
}
