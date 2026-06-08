import { useState } from "react";
import { motion } from "framer-motion";
import {
  useListFiles,
  useGetFileStats,
  getListFilesQueryKey,
  getGetFileStatsQueryKey,
  useDeleteFile,
  useScanFile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package,
  Map,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Trash2,
  ScanSearch,
  ExternalLink,
  HardDrive,
  FileX,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "@workspace/api-client-react";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

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
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-mono font-semibold",
        s.className
      )}
    >
      {s.label}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <motion.div
      variants={item}
      className="bg-card border border-card-border p-4 flex items-center gap-4"
    >
      <div className={cn("w-10 h-10 flex items-center justify-center", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold font-mono">{value}</p>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">{label}</p>
      </div>
    </motion.div>
  );
}

function FileCard({ file }: { file: UploadedFile }) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteFile();
  const scanMutation = useScanFile();

  function handleDelete() {
    deleteMutation.mutate(
      { id: file.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetFileStatsQueryKey() });
        },
      }
    );
  }

  function handleScan() {
    scanMutation.mutate(
      { id: file.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
        },
      }
    );
  }

  const canScan = file.scanStatus === "pending" || file.scanStatus === "error";
  const date = new Date(file.uploadedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      variants={item}
      data-testid={`card-file-${file.id}`}
      className="bg-card border border-card-border p-4 flex items-start justify-between gap-4 hover:border-primary/50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p
          className="font-medium text-sm truncate text-foreground"
          data-testid={`text-filename-${file.id}`}
          title={file.originalName}
        >
          {file.originalName}
        </p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <ScanStatusBadge status={file.scanStatus} />
          <span className="text-xs text-muted-foreground font-mono">
            {formatBytes(file.size)}
          </span>
          <span className="text-xs text-muted-foreground">{date}</span>
        </div>
        {file.detectionRatio && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {file.detectionRatio} engines
          </p>
        )}
        {file.scanDetails && (
          <p
            className={cn(
              "text-xs mt-1",
              file.scanStatus === "malicious" ? "text-red-400" : "text-muted-foreground"
            )}
          >
            {file.scanDetails}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {file.virusTotalLink && (
          <a
            href={file.virusTotalLink}
            target="_blank"
            rel="noreferrer"
            data-testid={`link-vt-${file.id}`}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        )}
        {canScan && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleScan}
            disabled={scanMutation.isPending}
            data-testid={`button-scan-${file.id}`}
          >
            <ScanSearch className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:text-destructive"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          data-testid={`button-delete-${file.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </motion.div>
  );
}

function FileSection({
  title,
  icon: Icon,
  files,
  loading,
}: {
  title: string;
  icon: React.ElementType;
  files: UploadedFile[];
  loading: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <span className="ml-auto text-xs font-mono text-muted-foreground">
          {loading ? "..." : files.length} files
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="border border-dashed border-border p-8 flex flex-col items-center gap-2 text-center">
          <FileX className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No {title.toLowerCase()} uploaded yet
          </p>
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-2"
        >
          {files.map((f) => (
            <FileCard key={f.id} file={f} />
          ))}
        </motion.div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useGetFileStats();
  const { data: allFiles, isLoading: filesLoading } = useListFiles();

  const mods = allFiles?.filter((f) => f.type === "mod") ?? [];
  const maps = allFiles?.filter((f) => f.type === "map") ?? [];

  return (
    <div className="p-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your Minecraft mods and maps
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8"
      >
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </>
        ) : (
          <>
            <StatCard
              icon={Package}
              label="Total Mods"
              value={stats?.totalMods ?? 0}
              color="bg-primary/10 text-primary"
            />
            <StatCard
              icon={Map}
              label="Total Maps"
              value={stats?.totalMaps ?? 0}
              color="bg-primary/10 text-primary"
            />
            <StatCard
              icon={ShieldCheck}
              label="Clean"
              value={stats?.cleanFiles ?? 0}
              color="bg-green-500/10 text-green-400"
            />
            <StatCard
              icon={ShieldAlert}
              label="Malicious"
              value={stats?.maliciousFiles ?? 0}
              color="bg-red-500/10 text-red-400"
            />
          </>
        )}
      </motion.div>

      {/* Storage info */}
      {stats && stats.totalSizeBytes > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-8 flex items-center gap-2 text-xs text-muted-foreground font-mono"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Total storage: {formatBytes(stats.totalSizeBytes)}</span>
          {stats.pendingFiles > 0 && (
            <>
              <span className="mx-1">·</span>
              <Clock className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-yellow-400">{stats.pendingFiles} pending scan</span>
            </>
          )}
        </motion.div>
      )}

      {/* File sections */}
      <div className="space-y-8">
        <FileSection
          title="Mods"
          icon={Package}
          files={mods}
          loading={filesLoading}
        />
        <FileSection
          title="Maps"
          icon={Map}
          files={maps}
          loading={filesLoading}
        />
      </div>
    </div>
  );
}
