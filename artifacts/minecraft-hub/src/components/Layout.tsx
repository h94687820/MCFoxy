import { Link, useLocation } from "wouter";
import { LayoutGrid, Upload, Settings, Shield, Download, LogIn, LogOut, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePWAInstall } from "@/hooks/use-pwa-install";
import { useClerk, useUser } from "@clerk/react";
import { useLanguage } from "@/contexts/language-context";
import { useState, useEffect } from "react";
import { useGetMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { canInstall, install } = usePWAInstall();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const { t } = useLanguage();
  const { data: profile } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey(), enabled: !!user },
  });

  // Prefer the app's own profile identity (avatar/display name) over Clerk's
  // account data — Clerk holds the user's real name/email, but the app should
  // only ever surface the public display name / username the user chose.
  const avatarSrc = profile?.avatarUrl || user?.imageUrl;
  const displayLabel = profile?.displayName || (profile?.username ? `@${profile.username}` : "User");
  const [installBannerDismissed, setInstallBannerDismissed] = useState(() =>
    localStorage.getItem("pwa-banner-dismissed") === "1"
  );

  const navItems = [
    { href: "/", label: t.nav.dashboard, icon: LayoutGrid },
    { href: "/upload", label: t.nav.upload, icon: Upload },
    { href: "/settings", label: t.nav.settings, icon: Settings },
  ];

  function dismissBanner() {
    setInstallBannerDismissed(true);
    localStorage.setItem("pwa-banner-dismissed", "1");
  }

  async function handleInstall() {
    await install();
    dismissBanner();
  }

  const showInstallBanner = canInstall && !installBannerDismissed;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">

      {/* ── Install Banner (mobile top) ─────────────────────────────────────── */}
      {showInstallBanner && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-primary text-primary-foreground flex items-center gap-3 px-4 py-3 shadow-lg">
          <img src="/logo.svg" alt="iFoxyMC" className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none">iFoxyMC</p>
            <p className="text-xs opacity-80 mt-0.5">{t.nav.install}</p>
          </div>
          <button
            onClick={handleInstall}
            className="flex-shrink-0 bg-primary-foreground text-primary text-xs font-bold px-3 py-1.5"
          >
            {t.nav.install}
          </button>
          <button onClick={dismissBanner} className="flex-shrink-0 opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Desktop Sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden md:flex w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center overflow-hidden">
              <img src="/logo.svg" alt="iFoxyMC" className="w-9 h-9" />
            </div>
            <div>
              <p className="font-bold text-sidebar-foreground leading-none tracking-tight">iFoxyMC</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">Mods &amp; Maps Hub</p>
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
          {isLoaded && (
            user ? (
              <div className="space-y-2">
                <Link
                  href="/profile"
                  className="flex items-center gap-2.5 px-1 hover:opacity-80 transition-opacity cursor-pointer group"
                >
                  {avatarSrc ? (
                    <img src={avatarSrc} alt={displayLabel} className="w-6 h-6 rounded-full flex-shrink-0 object-cover ring-1 ring-transparent group-hover:ring-primary transition-all" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <User className="w-3 h-3 text-primary" />
                    </div>
                  )}
                  <span className="text-xs text-sidebar-foreground truncate flex-1 group-hover:text-primary transition-colors">
                    {displayLabel}
                  </span>
                </Link>
                <button
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border border-sidebar-border hover:border-primary/60 hover:text-primary transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                  {t.nav.signOut}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Link
                  href="/sign-in"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border border-sidebar-border hover:border-primary/60 hover:text-primary transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 flex-shrink-0" />
                  {t.nav.signIn}
                </Link>
              </div>
            )
          )}
          {canInstall && (
            <button
              onClick={handleInstall}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-sidebar-foreground border border-sidebar-border hover:border-primary/60 hover:text-primary transition-colors"
            >
              <Download className="w-3.5 h-3.5 flex-shrink-0" />
              {t.nav.install}
            </button>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
            <Shield className="w-3.5 h-3.5" />
            <span>{t.nav.virusTotalProtected}</span>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            by{" "}
            <a
              href="https://youtube.com/@ifoxymc?si=jqr_ai47Vji1QdOh"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
              onError={(e) => {
                (e.currentTarget as HTMLAnchorElement).href = "https://youtube.com/@iFoxyMC";
              }}
            >
              iFoxyMC
            </a>
          </div>
        </div>
      </aside>

      {/* ── Mobile Top Bar ───────────────────────────────────────────────────── */}
      <header className={cn(
        "md:hidden flex items-center justify-between px-4 bg-sidebar border-b border-sidebar-border flex-shrink-0",
        showInstallBanner ? "mt-14 h-14" : "h-14"
      )}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 flex items-center justify-center overflow-hidden">
            <img src="/logo.svg" alt="iFoxyMC" className="w-7 h-7" />
          </div>
          <span className="font-bold text-sm tracking-tight">iFoxyMC</span>
        </div>
        {isLoaded && (
          user ? (
            <div className="flex items-center gap-3">
              <Link href="/profile" className="flex items-center">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={displayLabel} className="w-7 h-7 rounded-full object-cover ring-1 ring-transparent hover:ring-primary transition-all" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                )}
              </Link>
              <button
                onClick={() => signOut({ redirectUrl: basePath || "/" })}
                className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-primary transition-colors"
                aria-label={t.nav.signOut}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link href="/sign-in" className="text-xs text-primary font-medium flex items-center gap-1">
              <LogIn className="w-3.5 h-3.5" />
              {t.nav.signIn}
            </Link>
          )
        )}
      </header>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className={cn(
        "flex-1 overflow-auto",
        "pb-20 md:pb-0"
      )}>
        {children}
      </main>

      {/* ── Mobile Bottom Navigation ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-sidebar border-t border-sidebar-border flex items-stretch h-16 safe-area-pb">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = location === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span>{label}</span>
            </Link>
          );
        })}
        {/* Shield icon for security badge */}
        <div className="flex-1 flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground/50">
          <Shield className="w-5 h-5" />
          <span>Safe</span>
        </div>
      </nav>
    </div>
  );
}
