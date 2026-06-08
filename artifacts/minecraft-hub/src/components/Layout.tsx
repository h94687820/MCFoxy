import { Link, useLocation } from "wouter";
import { LayoutGrid, Upload, Settings, Shield, Box, Download, LogIn, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { useClerk, useUser } from "@clerk/react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { canInstall, install } = usePWAInstall();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();

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

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border space-y-3">
          {/* User section */}
          {isLoaded && (
            user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 px-1">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={user.fullName ?? "User"}
                      className="w-6 h-6 rounded-full flex-shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="text-xs text-sidebar-foreground truncate flex-1">
                    {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? "User"}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border border-sidebar-border hover:border-primary/60 hover:text-primary transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/sign-in"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border border-sidebar-border hover:border-primary/60 hover:text-primary transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
                Sign in
              </Link>
            )
          )}

          {canInstall && (
            <button
              onClick={install}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-sidebar-foreground border border-sidebar-border hover:border-primary/60 hover:text-primary transition-colors"
            >
              <Download className="w-3.5 h-3.5 flex-shrink-0" />
              Install App
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
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
