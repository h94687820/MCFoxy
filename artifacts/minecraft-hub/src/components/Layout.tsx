import { Link, useLocation } from "wouter";
import { LayoutGrid, Upload, Settings, Shield, Box, LogIn, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/use-auth-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, isLoading, isAdmin, isAuthenticated, login, logout } = useAdminAuth();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary flex items-center justify-center">
              <Box className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-bold text-sidebar-foreground leading-none tracking-tight">
                ModVault
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                Mods &amp; Maps Hub
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Auth section */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : isAuthenticated ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <div className="w-6 h-6 bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-xs font-medium text-sidebar-foreground truncate">
                  {user?.firstName ?? user?.email ?? "Admin"}
                </span>
                <span className="ml-auto text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5">
                  admin
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                onClick={logout}
                data-testid="button-logout"
              >
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Sign out
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground px-1">
                Sign in to upload files and manage scans
              </p>
              <Button
                size="sm"
                className="w-full"
                onClick={login}
                data-testid="button-login"
              >
                <LogIn className="w-3.5 h-3.5 mr-2" />
                Sign in
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono pt-1">
            <Shield className="w-3.5 h-3.5" />
            <span>VirusTotal Protected</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
