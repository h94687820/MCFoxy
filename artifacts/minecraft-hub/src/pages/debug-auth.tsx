import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react";

export default function DebugAuthPage() {
  const { isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();
  const [result, setResult] = useState<string>("جاري الفحص...");

  useEffect(() => {
    if (!isLoaded) return;

    async function run() {
      const lines: string[] = [];

      lines.push("=== حالة Clerk ===");
      lines.push(`isLoaded: ${isLoaded}`);
      lines.push(`userId: ${userId ?? "NULL — غير مسجّل"}`);
      lines.push(`user email: ${user?.primaryEmailAddress?.emailAddress ?? "—"}`);

      const token = await getToken();
      lines.push("");
      lines.push("=== Token ===");
      lines.push(
        token
          ? `✅ موجود: ${token.slice(0, 60)}...`
          : "❌ NULL — لم يتم الحصول على token",
      );

      lines.push("");
      lines.push("=== اختبار API (profiles/me) ===");
      try {
        const resp = await fetch("/api/profiles/me", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await resp.json();
        lines.push(`HTTP Status: ${resp.status}`);
        lines.push(JSON.stringify(data, null, 2));
      } catch (e) {
        lines.push(`خطأ في الاتصال: ${e}`);
      }

      setResult(lines.join("\n"));
    }

    run();
  }, [isLoaded, userId]);

  return (
    <div style={{ padding: 20, fontFamily: "monospace", direction: "ltr" }}>
      <h2 style={{ marginBottom: 16 }}>Auth Debug</h2>
      <pre
        style={{
          background: "#111",
          color: "#0f0",
          padding: 16,
          borderRadius: 8,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {result}
      </pre>
      <button
        onClick={() => window.location.reload()}
        style={{ marginTop: 12, padding: "8px 16px", cursor: "pointer" }}
      >
        إعادة الفحص
      </button>
    </div>
  );
}
