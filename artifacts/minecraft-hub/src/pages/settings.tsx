import { useState } from "react";
import { motion } from "framer-motion";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Moon, Palette, CheckCircle, Languages, LogOut } from "lucide-react";
import { useLanguage, LANGUAGES, type Language } from "@/contexts/language-context";
import { useClerk, useUser } from "@clerk/react";
import { applyTheme } from "@/hooks/use-theme";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type ThemeName = "default" | "creeper" | "nether" | "ocean" | "end" | "sky";

const themes: Array<{ id: ThemeName; label: string; description: string; primaryHsl: string; bgHsl: string }> = [
  { id: "default", label: "Default", description: "Gray neutral", primaryHsl: "240 5.9% 80%", bgHsl: "240 10% 8%" },
  { id: "creeper", label: "Creeper", description: "Iconic green", primaryHsl: "142 71% 45%", bgHsl: "142 10% 6%" },
  { id: "nether", label: "Nether", description: "Fire red-orange", primaryHsl: "15 90% 55%", bgHsl: "15 15% 6%" },
  { id: "ocean", label: "Ocean", description: "Deep blue", primaryHsl: "217 91% 60%", bgHsl: "217 15% 6%" },
  { id: "end", label: "The End", description: "Void purple", primaryHsl: "270 60% 60%", bgHsl: "270 15% 6%" },
  { id: "sky", label: "Sky", description: "Cyan bright", primaryHsl: "190 90% 50%", bgHsl: "190 15% 6%" },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const [saved, setSaved] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { signOut } = useClerk();
  const { user } = useUser();

  function update(patch: { theme?: ThemeName; darkMode?: boolean; virusTotalEnabled?: boolean }) {
    // Apply to DOM immediately so the user sees the change at once
    const nextTheme = patch.theme ?? settings?.theme ?? "default";
    const nextDark = patch.darkMode ?? settings?.darkMode ?? true;
    applyTheme(nextTheme, nextDark);

    updateMutation.mutate({ data: patch }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      },
    });
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.settings.subtitle}</p>
        </div>
        {saved && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            {t.settings.saved}
          </motion.div>
        )}
      </motion.div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-10 w-40" />
          <div className="grid grid-cols-3 gap-3">{[1,2,3,4,5,6].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
          {/* Theme */}
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t.settings.themeSection}</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {themes.map((t_) => {
                const isSelected = settings?.theme === t_.id;
                return (
                  <button
                    key={t_.id}
                    data-testid={`button-theme-${t_.id}`}
                    onClick={() => update({ theme: t_.id })}
                    className={cn(
                      "relative p-3 border text-left transition-all hover:border-primary/50 cursor-pointer",
                      isSelected ? "border-primary" : "border-border"
                    )}
                  >
                    <div className="w-full h-8 mb-2" style={{ background: `linear-gradient(135deg, hsl(${t_.bgHsl}) 40%, hsl(${t_.primaryHsl}) 100%)` }} />
                    <p className="text-xs font-semibold">{t_.label}</p>
                    <p className="text-xs text-muted-foreground">{t_.description}</p>
                    {isSelected && (
                      <motion.div layoutId="theme-check" className="absolute top-2 right-2 w-4 h-4 bg-primary flex items-center justify-center">
                        <CheckCircle className="w-3 h-3 text-primary-foreground" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Display */}
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-4">
              <Moon className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t.settings.displaySection}</h2>
            </div>
            <div className="bg-card border border-card-border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t.settings.darkMode}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.settings.darkModeDesc}</p>
              </div>
              <Switch
                data-testid="switch-dark-mode"
                checked={settings?.darkMode ?? true}
                onCheckedChange={(checked) => update({ darkMode: checked })}
              />
            </div>
          </motion.div>

          {/* Language */}
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-4">
              <Languages className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t.settings.languageSection}</h2>
            </div>
            <div className="bg-card border border-card-border p-4">
              <div className="mb-3">
                <p className="text-sm font-medium">{t.settings.languageLabel}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.settings.languageDesc}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((lang) => {
                  const isSelected = language === lang.id;
                  return (
                    <button
                      key={lang.id}
                      data-testid={`button-lang-${lang.id}`}
                      onClick={() => setLanguage(lang.id as Language)}
                      className={cn(
                        "flex items-center gap-3 p-3 border text-left transition-all hover:border-primary/50",
                        isSelected ? "border-primary bg-primary/10" : "border-border"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold">{lang.nativeLabel}</p>
                        <p className="text-xs text-muted-foreground">{lang.label}</p>
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>

          {/* Account */}
          {user && (
            <motion.div variants={item}>
              <div className="flex items-center gap-2 mb-4">
                <LogOut className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Account</h2>
              </div>
              <div className="bg-card border border-card-border p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sign out</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sign out of your account on this device</p>
                </div>
                <button
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                  data-testid="button-settings-signout"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground border border-border hover:border-primary/60 hover:text-primary transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
