import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListTodo, LogOut, Users, ShieldCheck } from "lucide-react";

export default function AppShell({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const { user, profile, isAdmin, loading } = useAuth();
  const nav = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!user) {
    nav("/login", { replace: true });
    return null;
  }
  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">للأدمن فقط</h2>
          <p className="text-muted-foreground mb-4">ليس لديك صلاحية لعرض هذه الصفحة.</p>
          <Button variant="outline" onClick={() => nav("/")}>العودة للرئيسية</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <NavLink to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-elegant group-hover:shadow-glow transition-shadow">
              <ListTodo className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-black text-xl gradient-text">مهامي</span>
          </NavLink>

          <nav className="hidden sm:flex items-center gap-1">
            <NavItem to="/">المهام</NavItem>
            {isAdmin && <NavItem to="/admin/users"><Users className="w-4 h-4" /> المستخدمون</NavItem>}
          </nav>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/70 text-sm">
              {isAdmin && <ShieldCheck className="w-4 h-4 text-accent" />}
              <span className="font-semibold">{profile?.display_name ?? profile?.username}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); nav("/login"); }}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">خروج</span>
            </Button>
          </div>
        </div>
        <div className="sm:hidden flex items-center gap-1 px-4 pb-2">
          <NavItem to="/">المهام</NavItem>
          {isAdmin && <NavItem to="/admin/users">المستخدمون</NavItem>}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-fade-in">{children}</main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isActive ? "bg-primary text-primary-foreground shadow-soft" : "hover:bg-secondary/60 text-muted-foreground"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
