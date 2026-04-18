import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, CheckCircle2, Circle, ListChecks, MessageSquare, Plus,
  Trash2, Users as UsersIcon, RotateCcw, Clock,
} from "lucide-react";

interface Profile { id: string; username: string; display_name: string }
interface Task {
  id: string; title: string; description: string | null;
  visibility: "shared" | "assigned"; is_completed: boolean;
  completed_by: string | null; completed_at: string | null;
  created_by: string; last_activity_at: string; created_at: string;
}
interface Step { id: string; task_id: string; content: string; done_by: string; created_at: string }
interface Comment { id: string; task_id: string; content: string; author_id: string; created_at: string }

export default function TaskPage() {
  return (
    <AppShell>
      <TaskDetail />
    </AppShell>
  );
}

function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newStep, setNewStep] = useState("");
  const [newComment, setNewComment] = useState("");

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  async function load() {
    if (!id) return;
    setLoading(true);
    const [{ data: t }, { data: p }, { data: a }, { data: s }, { data: c }] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", id).maybeSingle(),
      supabase.from("profiles").select("id, username, display_name"),
      supabase.from("task_assignees").select("user_id").eq("task_id", id),
      supabase.from("task_steps").select("*").eq("task_id", id).order("created_at", { ascending: true }),
      supabase.from("task_comments").select("*").eq("task_id", id).order("created_at", { ascending: true }),
    ]);
    setTask((t as Task) ?? null);
    setProfiles((p as Profile[]) ?? []);
    setAssignees(((a as any[]) ?? []).map((r) => r.user_id));
    setSteps((s as Step[]) ?? []);
    setComments((c as Comment[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [id]);

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!newStep.trim() || !user || !id) return;
    const { error } = await supabase.from("task_steps").insert({
      task_id: id, content: newStep.trim(), done_by: user.id,
    });
    if (error) { toast({ title: "تعذّر الإضافة", description: error.message, variant: "destructive" }); return; }
    setNewStep("");
    load();
  }

  async function deleteStep(stepId: string) {
    const { error } = await supabase.from("task_steps").delete().eq("id", stepId);
    if (error) { toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !user || !id) return;
    const { error } = await supabase.from("task_comments").insert({
      task_id: id, content: newComment.trim(), author_id: user.id,
    });
    if (error) { toast({ title: "تعذّر الإضافة", description: error.message, variant: "destructive" }); return; }
    setNewComment("");
    load();
  }

  async function deleteComment(cid: string) {
    const { error } = await supabase.from("task_comments").delete().eq("id", cid);
    if (error) { toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" }); return; }
    load();
  }

  async function toggleComplete() {
    if (!task || !user) return;
    const next = !task.is_completed;
    const { error } = await supabase.from("tasks").update({
      is_completed: next,
      completed_by: next ? user.id : null,
      completed_at: next ? new Date().toISOString() : null,
    }).eq("id", task.id);
    if (error) { toast({ title: "تعذّر التحديث", description: error.message, variant: "destructive" }); return; }
    toast({ title: next ? "تم إنهاء المهمة" : "أُعيد فتح المهمة" });
    load();
  }

  async function deleteTask() {
    if (!task) return;
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) { toast({ title: "تعذّر الحذف", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم حذف المهمة" });
    nav("/");
  }

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (!task) {
    return (
      <Card className="glass-card p-10 text-center">
        <p className="text-muted-foreground mb-4">المهمة غير موجودة.</p>
        <Button onClick={() => nav("/")} variant="outline">العودة</Button>
      </Card>
    );
  }

  const canManage = task.created_by === user?.id || isAdmin;
  const completer = task.completed_by ? profileMap.get(task.completed_by) : null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => nav("/")}>
        <ArrowRight className="w-4 h-4 rotate-180" /> العودة للقائمة
      </Button>

      <Card className="glass-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <button
            onClick={toggleComplete}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              task.is_completed ? "bg-success text-success-foreground shadow-elegant" : "bg-secondary text-muted-foreground hover:bg-primary hover:text-primary-foreground"
            }`}
            aria-label="تبديل الإنجاز"
          >
            {task.is_completed ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
          </button>
          <div className="flex-1 min-w-0">
            <h1 className={`text-2xl sm:text-3xl font-display font-black mb-2 ${task.is_completed ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </h1>
            {task.description && <p className="text-muted-foreground whitespace-pre-wrap mb-4">{task.description}</p>}

            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant={task.visibility === "assigned" ? "default" : "outline"} className="gap-1">
                <UsersIcon className="w-3 h-3" /> {task.visibility === "assigned" ? "مُسندة" : "مشتركة"}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Clock className="w-3 h-3" /> آخر إجراء: {fmtDate(task.last_activity_at)}
              </Badge>
              {task.is_completed && completer && task.completed_at && (
                <Badge className="bg-success/15 text-success border-success/30">
                  أنهاها {completer.display_name} • {fmtDate(task.completed_at)}
                </Badge>
              )}
            </div>

            {assignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="text-xs text-muted-foreground self-center">مُسندة لـ:</span>
                {assignees.map((uid) => (
                  <span key={uid} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {profileMap.get(uid)?.display_name ?? "—"}
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">أنشأها {profileMap.get(task.created_by)?.display_name ?? "—"} • {fmtDate(task.created_at)}</p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button variant={task.is_completed ? "outline" : "success"} size="sm" onClick={toggleComplete}>
              {task.is_completed ? <><RotateCcw className="w-4 h-4" /> إعادة فتح</> : <><CheckCircle2 className="w-4 h-4" /> إنهاء</>}
            </Button>
            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" /> حذف
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>حذف المهمة؟</AlertDialogTitle>
                    <AlertDialogDescription>سيتم حذف المهمة وكل خطواتها وتعليقاتها نهائياً.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteTask} className="bg-destructive hover:bg-destructive/90">حذف</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </Card>

      {/* STEPS */}
      <Card className="glass-card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="w-5 h-5 text-primary" />
          <h2 className="font-display font-bold text-xl">الخطوات المُنجزة</h2>
          <span className="text-sm text-muted-foreground">({steps.length})</span>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">لا توجد خطوات بعد. أضف أول خطوة قمت بها.</p>
        ) : (
          <ol className="space-y-2.5 mb-5">
            {steps.map((s, idx) => {
              const author = profileMap.get(s.done_by);
              const canDel = s.done_by === user?.id || isAdmin;
              return (
                <li key={s.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 group">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="whitespace-pre-wrap break-words">{s.content}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      <span className="font-semibold text-foreground">{author?.display_name ?? "—"}</span> • {fmtDate(s.created_at)}
                    </p>
                  </div>
                  {canDel && (
                    <Button variant="ghost" size="icon" onClick={() => deleteStep(s.id)} className="opacity-0 group-hover:opacity-100 text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <form onSubmit={addStep} className="flex gap-2">
          <Input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="ما الخطوة التي قمت بها للتو؟"
            maxLength={500}
          />
          <Button type="submit" variant="hero" disabled={!newStep.trim()}>
            <Plus className="w-4 h-4" /> إضافة
          </Button>
        </form>
      </Card>

      {/* COMMENTS */}
      <Card className="glass-card p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="w-5 h-5 text-accent" />
          <h2 className="font-display font-bold text-xl">الملاحظات</h2>
          <span className="text-sm text-muted-foreground">({comments.length})</span>
        </div>

        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">لا ملاحظات بعد.</p>
        ) : (
          <ul className="space-y-2.5 mb-5">
            {comments.map((c) => {
              const author = profileMap.get(c.author_id);
              const canDel = c.author_id === user?.id || isAdmin;
              return (
                <li key={c.id} className="p-3 rounded-lg bg-secondary/40 group">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold">{author?.display_name ?? "—"}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</span>
                      {canDel && (
                        <Button variant="ghost" size="icon" onClick={() => deleteComment(c.id)} className="opacity-0 group-hover:opacity-100 text-destructive h-7 w-7">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{c.content}</p>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={addComment} className="space-y-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="اكتب ملاحظة…"
            rows={2}
            maxLength={1000}
          />
          <Button type="submit" variant="warm" disabled={!newComment.trim()}>
            <Plus className="w-4 h-4" /> إضافة ملاحظة
          </Button>
        </form>
      </Card>
    </div>
  );
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}
