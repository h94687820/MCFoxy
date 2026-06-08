import { useEffect, useState } from "react";
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
import { Shield, Moon, Palette, CheckCircle } from "lucide-react";

type ThemeName = "default" | "creeper" | "nether" | "ocean" | "end" | "sky";

const themes: Array<{
  id: ThemeName;
  label: string;
  description: string;
  primaryHsl: string;
  bgHsl: string;
}> = [
  {
    id: "default",
    label: "Default",
    description: "Gray neutral",
    primaryHsl: "240 5.9% 80%",
    bgHsl: "240 10% 8%",
  },
  {
    id: "creeper",
    label: "Creeper",
    description: "Iconic green",
    primaryHsl: "142 71% 45%",
    bgHsl: "142 10% 6%",
  },
  {
    id: "nether",
    label: "Nether",
    description: "Fire red-orange",
    primaryHsl: "15 90% 55%",
    bgHsl: "15 15% 6%",
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Deep blue",
    primaryHsl: "217 91% 60%",
    bgHsl: "217 15% 6%",
  },
  {
    id: "end",
    label: "The End",
    description: "Void purple",
    primaryHsl: "270 60% 60%",
    bgHsl: "270 15% 6%",
  },
  {
    id: "sky",
    label: "Sky",
    description: "Cyan bright",
    primaryHsl: "190 90% 50%",
    bgHsl: "190 15% 6%",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const [saved, setSaved] = useState(false);

  function update(patch: { theme?: ThemeName; darkMode?: boolean; virusTotalEnabled?: boolean }) {
    updateMutation.mutate(
      { data: patch },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        },
      }
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize the appearance and scanning behavior
          </p>
        </div>
        {saved && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-xs text-green-400"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Saved
          </motion.div>
        )}
      </motion.div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-10 w-40" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          {/* Theme section */}
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Theme
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {themes.map((t) => {
                const isSelected = settings?.theme === t.id;
                return (
                  <button
                    key={t.id}
                    data-testid={`button-theme-${t.id}`}
                    onClick={() => update({ theme: t.id })}
                    className={cn(
                      "relative p-3 border text-left transition-all",
                      isSelected
                        ? "border-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {/* Color preview */}
                    <div
                      className="w-full h-8 mb-2"
                      style={{
                        background: `linear-gradient(135deg, hsl(${t.bgHsl}) 40%, hsl(${t.primaryHsl}) 100%)`,
                      }}
                    />
                    <p className="text-xs font-semibold">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                    {isSelected && (
                      <motion.div
                        layoutId="theme-check"
                        className="absolute top-2 right-2 w-4 h-4 bg-primary flex items-center justify-center"
                      >
                        <CheckCircle className="w-3 h-3 text-primary-foreground" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Display section */}
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-4">
              <Moon className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Display
              </h2>
            </div>
            <div className="bg-card border border-card-border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use dark background across the interface
                </p>
              </div>
              <Switch
                data-testid="switch-dark-mode"
                checked={settings?.darkMode ?? true}
                onCheckedChange={(checked) => update({ darkMode: checked })}
              />
            </div>
          </motion.div>

          {/* Scanning section */}
          <motion.div variants={item}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Security
              </h2>
            </div>
            <div className="bg-card border border-card-border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">VirusTotal Scanning</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable automatic file scanning via VirusTotal API
                </p>
              </div>
              <Switch
                data-testid="switch-vt-enabled"
                checked={settings?.virusTotalEnabled ?? true}
                onCheckedChange={(checked) => update({ virusTotalEnabled: checked })}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-3 font-mono">
              Scanning requires a VIRUSTOTAL_API_KEY environment variable to be set on the server.
            </p>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
