import { motion } from "framer-motion";
import { useNavigate } from "@/hooks/use-navigate";
import {
  useListFiles,
  useGetFileStats,
  getListFilesQueryKey,
  getGetFileStatsQueryKey,
  useDeleteFile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Package,
  Map,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  HardDrive,
  Clock,
  FileX,
  Cpu,
  Pickaxe,
  Download,
  ChevronRight,
  Image,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "@workspace/api-client-react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
    scanning: { label: "Scanning", className: "bg-yellow-500/20 text-yellow-400 animate-pulse" },
    clean: { label: "Clean", className: "bg-green-500/20 text-green-400" },
    malicious: { label: "Malicious", className: "bg-red-500/20 text-red-400" },
    error: { label: "Error", className: "bg-orange-500/20 text-orange-400" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 text-xs font-mono font-semibold", s.className)}>
      {s.label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <motion.div variants={item} className="bg-card border border-card-border p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 flex items-center justify-center flex-shrink-0", color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold font-mono leading-none">{value}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

function FileRow({ file }: { file: UploadedFile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteFile();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteMutation.mutate({ id: file.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFileStatsQueryKey() });
      },
    });
  }

  const date = new Date(file.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const hasImages = Array.isArray(file.images) && file.images.length > 0;

  return (
    <motion.div
      variants={item}
      data-testid={`card-file-${file.id}`}
      onClick={() => navigate(`/files/${file.id}`)}
      className="bg-card border border-card-border p-3 flex items-center justify-between gap-3 hover:border-primary/50 transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="font-medium text-sm truncate"
            data-testid={`text-filename-${file.id}`}
            title={file.originalName}
          >
            {file.originalName}
          </p>
          {hasImages && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground flex-shrink-0">
              <Image className="w-3 h-3" />
              {(file.images as string[]).length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <ScanStatusBadge status={file.scanStatus} />
          <span className="text-xs text-muted-foreground font-mono">{formatBytes(file.size)}</span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
        {file.description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{file.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <a
          href={`${base}/api/files/${file.id}/download`}
          download={file.originalName}
          data-testid={`link-download-${file.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Download file">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </a>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:text-destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          data-testid={`button-delete-${file.id}`}
          title="Delete file"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </motion.div>
  );
}

function SubSection({ title, icon: Icon, files, loading }: { title: string; icon: React.ElementType; files: UploadedFile[]; loading: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 text-primary/70" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
        <span className="ml-auto text-xs font-mono text-muted-foreground">{loading ? "..." : files.length}</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : files.length === 0 ? (
        <div className="border border-dashed border-border p-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <FileX className="w-3.5 h-3.5" />
          <span>No {title.toLowerCase()} yet</span>
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-1.5">
          {files.map((f) => <FileRow key={f.id} file={f} />)}
        </motion.div>
      )}
    </div>
  );
}

function EditionSection({ edition, icon: EditionIcon, color, files, loading }: { edition: string; icon: React.ElementType; color: string; files: UploadedFile[]; loading: boolean }) {
  const mods = files.filter((f) => f.type === "mod");
  const maps = files.filter((f) => f.type === "map");
  const label = edition === "java" ? "Java Edition" : "Bedrock Edition";

  return (
    <motion.div variants={item} className="border border-border">
      <div className={cn("flex items-center gap-3 px-5 py-3 border-b border-border", color)}>
        <EditionIcon className="w-4 h-4" />
        <h2 className="font-bold text-sm tracking-tight">{label}</h2>
        <span className="ml-auto text-xs font-mono opacity-70">{loading ? "..." : files.length} files</span>
      </div>
      <div className="p-5 space-y-5">
        <SubSection title="Mods" icon={Package} files={mods} loading={loading} />
        <SubSection title="Maps" icon={Map} files={maps} loading={loading} />
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useGetFileStats();
  const { data: allFiles, isLoading: filesLoading } = useListFiles();

  const javaFiles = allFiles?.filter((f) => f.edition === "java") ?? [];
  const bedrockFiles = allFiles?.filter((f) => f.edition === "bedrock") ?? [];

  return (
    <div className="p-6 md:p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your Minecraft mods and maps</p>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {statsLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : (
          <>
            <StatCard icon={Cpu} label="Java Files" value={(stats?.javaMods ?? 0) + (stats?.javaMaps ?? 0)} color="bg-primary/10 text-primary" />
            <StatCard icon={Pickaxe} label="Bedrock Files" value={(stats?.bedrockMods ?? 0) + (stats?.bedrockMaps ?? 0)} color="bg-primary/10 text-primary" />
            <StatCard icon={ShieldCheck} label="Clean" value={stats?.cleanFiles ?? 0} color="bg-green-500/10 text-green-400" />
            <StatCard icon={ShieldAlert} label="Malicious" value={stats?.maliciousFiles ?? 0} color="bg-red-500/10 text-red-400" />
          </>
        )}
      </motion.div>

      {stats && stats.totalSizeBytes > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" />{formatBytes(stats.totalSizeBytes)} stored</span>
          {stats.pendingFiles > 0 && (
            <span className="flex items-center gap-1.5 text-yellow-400"><Clock className="w-3.5 h-3.5" />{stats.pendingFiles} awaiting scan</span>
          )}
        </motion.div>
      )}

      <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
        <EditionSection edition="java" icon={Cpu} color="bg-primary/5" files={javaFiles} loading={filesLoading} />
        <EditionSection edition="bedrock" icon={Pickaxe} color="bg-primary/5" files={bedrockFiles} loading={filesLoading} />
      </motion.div>
    </div>
  );
}
