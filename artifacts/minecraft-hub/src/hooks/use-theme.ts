import { useEffect } from "react";
import { useGetSettings } from "@workspace/api-client-react";

const THEME_CLASSES = [
  "theme-creeper",
  "theme-nether",
  "theme-ocean",
  "theme-end",
  "theme-sky",
  "theme-default",
] as const;

/** Apply theme + dark mode to <html>. Also persists to localStorage so the
 *  next page load is instant (avoids the white flash). */
export function applyTheme(theme: string, darkMode: boolean) {
  const html = document.documentElement;

  if (darkMode) {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }

  html.classList.remove(...THEME_CLASSES);
  html.classList.add(`theme-${theme}`);

  try {
    localStorage.setItem("mc-theme", theme);
    localStorage.setItem("mc-dark", String(darkMode));
  } catch {
    // localStorage blocked — ignore
  }
}

export function useTheme() {
  const { data: settings } = useGetSettings();

  useEffect(() => {
    if (!settings) return;
    applyTheme(settings.theme, settings.darkMode);
  }, [settings]);

  return { theme: settings?.theme, darkMode: settings?.darkMode };
}
