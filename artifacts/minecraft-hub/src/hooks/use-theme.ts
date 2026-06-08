import { useEffect } from "react";
import { useGetSettings } from "@workspace/api-client-react";

export function useTheme() {
  const { data: settings } = useGetSettings();

  useEffect(() => {
    if (!settings) return;

    const html = document.documentElement;

    // Dark mode
    if (settings.darkMode) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }

    // Theme classes
    const themeClasses = [
      "theme-creeper",
      "theme-nether",
      "theme-ocean",
      "theme-end",
      "theme-sky",
      "theme-default",
    ];

    html.classList.remove(...themeClasses);
    html.classList.add(`theme-${settings.theme}`);
  }, [settings]);

  return { theme: settings?.theme, darkMode: settings?.darkMode };
}
