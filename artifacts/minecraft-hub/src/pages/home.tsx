import { useRef, useState } from "react";
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
import { useUser } from "@clerk/react";
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
  Search,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UploadedFile } from "@workspace/api-client-react";
import { useLanguage } from "@/contexts/language-context";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };

function ScanStatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: t.scan.pending, className: "bg-muted text-muted-foreground" },
    scanning: { label: t.scan.scanning, className: "bg-yellow-500/20 text-yellow-400 animate-pulse" },
    clean: { label: t.scan.clean, className: "bg-green-500/20 text-green-400" },
    malicious: { label: t.scan.malicious, className: "bg-red-500/20 text-red-400" },
    error: { label: t.scan.unverified, className: "bg-muted text-muted-foreground" },
    skipped: { label: t.scan.skipped, className: "bg-blue-500/20 text-blue-400" },
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

function FileThumbnail({ coverImage, images, originalName }: { coverImage?: string | null; images: unknown; originalName: string }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const imageList = Array.isArray(images) ? (images as string[]) : [];
  const thumb = coverImage || imageList[0];
  if (!thumb) return null;

  return (
    <div className="w-12 h-12 flex-shrink-0 overflow-hidden border border-border bg-card">
      <img
        src={`${base}/api/uploads/images/${thumb}`}
        alt={originalName}
        className="w-full h-full object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}

function FileRow({ file }: { file: UploadedFile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const deleteMutation = useDeleteFile();
  const { user } = useUser();
  const { t } = useLanguage();

  const isOwner = !!user && file.uploadedBy === user.id;

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
  const hasThumbnail = !!file.coverImage || (Array.isArray(file.images) && (file.images as string[]).length > 0);
  const fileWithCustomId = file as UploadedFile & { customId?: string | null };
  const displayName = file.title || file.originalName;

  return (
    <motion.div
      variants={item}
      data-testid={`card-file-${file.id}`}
      onClick={() => navigate(`/files/${file.id}`)}
      className="bg-card border border-card-border p-3 flex items-center gap-3 hover:border-primary/50 transition-colors cursor-pointer"
    >
      {hasThumbnail && (
        <FileThumbnail coverImage={file.coverImage} images={file.images} originalName={displayName} />
      )}

      <div className="flex-1 min-w-0">
        <p
          className="font-medium text-sm truncate"
          data-testid={`text-filename-${file.id}`}
          title={displayName}
        >
          {displayName}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <ScanStatusBadge status={file.scanStatus} />
          {fileWithCustomId.customId && (
            <span className="inline-flex items-center gap-0.5 text-xs font-mono text-primary/70 bg-primary/8 px-1.5 py-0.5 border border-primary/20">
              #{fileWithCustomId.customId}
            </span>
          )}
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
          <Button variant="ghost" size="icon" className="h-7 w-7" title={t.fileDetail.download}>
            <Download className="w-3.5 h-3.5" />
          </Button>
        </a>

        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:text-destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            data-testid={`button-delete-${file.id}`}
            title={t.fileDetail.deleteFile}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}

        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
    </motion.div>
  );
}

function SubSection({ title, icon: Icon, files, loading, emptyLabel }: { title: string; icon: React.ElementType; files: UploadedFile[]; loading: boolean; emptyLabel: string }) {
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
          <span>{emptyLabel}</span>
        </div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-1.5">
          {files.map((f) => <FileRow key={f.id} file={f} />)}
        </motion.div>
      )}
    </div>
  );
}

function EditionSection({
  id,
  edition,
  icon: EditionIcon,
  color,
  files,
  loading,
}: {
  id: string;
  edition: string;
  icon: React.ElementType;
  color: string;
  files: UploadedFile[];
  loading: boolean;
}) {
  const { t } = useLanguage();
  const mods = files.filter((f) => f.type === "mod");
  const maps = files.filter((f) => f.type === "map");
  const label = edition === "java" ? t.home.javaEdition : t.home.bedrockEdition;

  return (
    <motion.div id={id} variants={item} className="border border-border scroll-mt-4">
      <div className={cn("flex items-center gap-3 px-5 py-3 border-b border-border", color)}>
        <EditionIcon className="w-4 h-4" />
        <h2 className="font-bold text-sm tracking-tight">{label}</h2>
        <span className="ml-auto text-xs font-mono opacity-70">{loading ? "..." : files.length} {t.home.files}</span>
      </div>
      <div className="p-5 space-y-5">
        <SubSection title={t.home.mods} icon={Package} files={mods} loading={loading} emptyLabel={t.home.noMods} />
        <SubSection title={t.home.maps} icon={Map} files={maps} loading={loading} emptyLabel={t.home.noMaps} />
      </div>
    </motion.div>
  );
}

function SectionJumpNav({
  javaRef,
  bedrockRef,
}: {
  javaRef: React.RefObject<HTMLDivElement | null>;
  bedrockRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useLanguage();

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2">
      <button
        onClick={() => scrollTo(javaRef)}
        title={t.home.javaEdition}
        className="group flex items-center gap-2 bg-sidebar border border-sidebar-border px-2.5 py-2 text-xs font-semibold hover:border-primary/60 hover:text-primary transition-colors shadow-lg"
      >
        <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden group-hover:inline whitespace-nowrap">Java</span>
      </button>
      <button
        onClick={() => scrollTo(bedrockRef)}
        title={t.home.bedrockEdition}
        className="group flex items-center gap-2 bg-sidebar border border-sidebar-border px-2.5 py-2 text-xs font-semibold hover:border-primary/60 hover:text-primary transition-colors shadow-lg"
      >
        <Pickaxe className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden group-hover:inline whitespace-nowrap">Bedrock</span>
      </button>
    </div>
  );
}

function filterFiles(files: UploadedFile[], query: string): UploadedFile[] {
  if (!query.trim()) return files;
  const q = query.trim().toLowerCase();
  return files.filter((f) => {
    const withCustomId = f as UploadedFile & { customId?: string | null };
    return (
      f.originalName.toLowerCase().includes(q) ||
      (withCustomId.customId && withCustomId.customId.toLowerCase().includes(q))
    );
  });
}

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useGetFileStats();
  const { data: allFiles, isLoading: filesLoading } = useListFiles();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");

  const javaRef = useRef<HTMLDivElement>(null);
  const bedrockRef = useRef<HTMLDivElement>(null);

  const filteredFiles = filterFiles(allFiles ?? [], searchQuery);
  const javaFiles = filteredFiles.filter((f) => f.edition === "java");
  const bedrockFiles = filteredFiles.filter((f) => f.edition === "bedrock");
  const isSearching = searchQuery.trim().length > 0;
  const noResults = isSearching && filteredFiles.length === 0 && !filesLoading;

  return (
    <div className="p-6 md:p-8">
      <SectionJumpNav javaRef={javaRef} bedrockRef={bedrockRef} />

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t.home.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.home.subtitle}</p>
      </motion.div>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {statsLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : (
          <>
            <StatCard icon={Cpu} label={t.home.javaFiles} value={(stats?.javaMods ?? 0) + (stats?.javaMaps ?? 0)} color="bg-primary/10 text-primary" />
            <StatCard icon={Pickaxe} label={t.home.bedrockFiles} value={(stats?.bedrockMods ?? 0) + (stats?.bedrockMaps ?? 0)} color="bg-primary/10 text-primary" />
            <StatCard icon={ShieldCheck} label={t.home.clean} value={stats?.cleanFiles ?? 0} color="bg-green-500/10 text-green-400" />
            <StatCard icon={ShieldAlert} label={t.home.malicious} value={stats?.maliciousFiles ?? 0} color="bg-red-500/10 text-red-400" />
          </>
        )}
      </motion.div>

      {stats && stats.totalSizeBytes > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-mono">
          <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" />{formatBytes(stats.totalSizeBytes)} {t.home.stored}</span>
          {stats.pendingFiles > 0 && (
            <span className="flex items-center gap-1.5 text-yellow-400"><Clock className="w-3.5 h-3.5" />{stats.pendingFiles} {t.home.awaitingScan}</span>
          )}
        </motion.div>
      )}

      {/* Search bar */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6 relative">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="w-4 h-4 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t.home.searchPlaceholder}
          className="w-full bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground pl-9 pr-9 py-2.5 focus:outline-none focus:border-primary/60 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </motion.div>

      {noResults ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border border-dashed border-border p-10 flex flex-col items-center gap-3 text-muted-foreground">
          <Search className="w-6 h-6 opacity-40" />
          <p className="text-sm">{t.home.noResults}</p>
          <button onClick={() => setSearchQuery("")} className="text-xs text-primary hover:underline">{t.home.searchPlaceholder.split("…")[0]}</button>
        </motion.div>
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          <div ref={javaRef}>
            <EditionSection id="section-java" edition="java" icon={Cpu} color="bg-primary/5" files={javaFiles} loading={filesLoading} />
          </div>
          <div ref={bedrockRef}>
            <EditionSection id="section-bedrock" edition="bedrock" icon={Pickaxe} color="bg-primary/5" files={bedrockFiles} loading={filesLoading} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
