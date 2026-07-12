import { motion } from "framer-motion";
import { useRoute } from "wouter";
import {
  useGetProfileByUsername,
  useListFiles,
  getGetProfileByUsernameQueryKey,
  getListFilesQueryKey,
} from "@workspace/api-client-react";
import { User, FileBox, Shield, Download, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusColors: Record<string, string> = {
  clean: "text-green-400 bg-green-400/10 border-green-400/20",
  malicious: "text-red-400 bg-red-400/10 border-red-400/20",
  scanning: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  pending: "text-muted-foreground bg-muted/30 border-border",
  error: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  skipped: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

export default function UserProfilePage() {
  const [, params] = useRoute("/u/:username");
  const username = params?.username ?? "";

  const { data: profile, isLoading, isError } = useGetProfileByUsername(username, {
    query: { queryKey: getGetProfileByUsernameQueryKey(username), enabled: !!username },
  });

  const { data: allFiles } = useListFiles(
    {},
    { query: { queryKey: getListFilesQueryKey(), enabled: !!profile } },
  );

  const userFiles = allFiles?.filter((f) => f.uploadedBy === profile?.userId) ?? [];

  if (isLoading) {
    return (
      <div className="p-8 max-w-2xl space-y-4">
        <div className="w-20 h-20 rounded-full bg-muted animate-pulse" />
        <div className="h-6 w-48 bg-muted animate-pulse" />
        <div className="h-4 w-72 bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="p-8 max-w-2xl">
        <div className="border border-border p-6 text-center space-y-3">
          <User className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="font-semibold">المستخدم غير موجود</p>
          <p className="text-sm text-muted-foreground">لا يوجد حساب بهذا المعرّف</p>
          <Link href="/" className="inline-block mt-2 text-xs text-primary hover:underline">
            ← الرجوع للرئيسية
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-5 mb-8 p-5 border border-border bg-card"
      >
        <div className="w-16 h-16 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center border border-border flex-shrink-0">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">
            {profile.displayName || profile.username}
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">@{profile.username}</p>
          {profile.bio && (
            <p className="text-sm text-foreground/80 mt-2 leading-relaxed">{profile.bio}</p>
          )}
          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
            <FileBox className="w-3.5 h-3.5" />
            <span>{userFiles.length} ملف مرفوع</span>
          </div>
        </div>
      </motion.div>

      {/* Files */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1 } }}>
        <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-semibold mb-3 flex items-center gap-2">
          <FileBox className="w-3.5 h-3.5" />
          الملفات المرفوعة
        </h2>

        {userFiles.length === 0 ? (
          <div className="border border-border p-6 text-center text-sm text-muted-foreground">
            لا توجد ملفات بعد
          </div>
        ) : (
          <div className="space-y-2">
            {userFiles.map((file) => (
              <Link key={file.id} href={`/files/${file.id}`}>
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 border border-border p-3 hover:border-primary/50 hover:bg-card transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.originalName}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="capitalize">{file.edition}</span>
                      <span>·</span>
                      <span className="capitalize">{file.type}</span>
                      <span>·</span>
                      <span>{formatBytes(file.size)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 border uppercase tracking-wide",
                      statusColors[file.scanStatus] ?? statusColors.pending,
                    )}>
                      {file.scanStatus === "clean" ? (
                        <span className="flex items-center gap-1">
                          <Shield className="w-2.5 h-2.5" />
                          نظيف
                        </span>
                      ) : file.scanStatus === "malicious" ? "خطير" : file.scanStatus === "skipped" ? "لم يُفحص" : file.scanStatus}
                    </span>
                    <a
                      href={`${basePath}/api/files/${file.id}/download`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
