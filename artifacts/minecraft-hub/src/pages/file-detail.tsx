import { useState, useRef } from "react";
import { useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useGetFile, getListFilesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Map,
  Download,
  ArrowLeft,
  Edit2,
  Check,
  X,
  ImagePlus,
  Cpu,
  Pickaxe,
  HardDrive,
  Calendar,
  FileX,
  Loader2,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNavigate } from "@/hooks/use-navigate";
import type { UploadedFile } from "@workspace/api-client-react";

function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending Scan", className: "bg-muted text-muted-foreground" },
    scanning: { label: "Scanning...", className: "bg-yellow-500/20 text-yellow-400 animate-pulse" },
    clean: { label: "Clean", className: "bg-green-500/20 text-green-400" },
    malicious: { label: "Malicious", className: "bg-red-500/20 text-red-400" },
    error: { label: "Scan Error", className: "bg-orange-500/20 text-orange-400" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={cn("inline-flex items-center px-2.5 py-1 text-xs font-mono font-semibold rounded-sm", s.className)}>
      {s.label}
    </span>
  );
}

interface ImageGalleryProps {
  images: string[];
  fileId: number;
  onImagesUpdated: () => void;
}

function ImageGallery({ images, fileId, onImagesUpdated }: ImageGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleAddImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("images", f));
      const res = await fetch(`${base}/api/files/${fileId}`, {
        method: "PATCH",
        body: formData,
      });
      if (res.ok) onImagesUpdated();
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Screenshots</p>
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
          Add images
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp"
          multiple
          className="hidden"
          onChange={handleAddImages}
        />
      </div>

      {images.length === 0 ? (
        <div className="border border-dashed border-border p-6 flex flex-col items-center gap-2 text-center">
          <ImagePlus className="w-5 h-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No screenshots yet</p>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="text-xs text-primary hover:underline mt-1"
          >
            Add the first screenshot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((imgName, i) => (
            <button
              key={i}
              onClick={() => setLightbox(`${base}/api/uploads/images/${imgName}`)}
              className="aspect-video bg-card border border-border overflow-hidden hover:border-primary/50 transition-colors"
            >
              <img
                src={`${base}/api/uploads/images/${imgName}`}
                alt={`Screenshot ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 w-8 h-8 bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <img
              src={lightbox}
              alt="Screenshot"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DescriptionEditorProps {
  fileId: number;
  initialDescription: string | null | undefined;
  onUpdated: () => void;
}

function DescriptionEditor({ fileId, initialDescription, onUpdated }: DescriptionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleSave() {
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("description", value);
      const res = await fetch(`${base}/api/files/${fileId}`, {
        method: "PATCH",
        body: formData,
      });
      if (res.ok) {
        onUpdated();
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setValue(initialDescription ?? "");
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Description</p>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a description for this file..."
            rows={4}
            autoFocus
            className="w-full bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground p-3 resize-none focus:outline-none focus:border-primary/60 transition-colors"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs px-3">
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs px-3">
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      ) : value ? (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{value}</p>
      ) : (
        <div className="border border-dashed border-border p-4 flex items-center justify-center">
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + Add a description
          </button>
        </div>
      )}
    </div>
  );
}

export default function FileDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileId = Number(params.id);
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: file, isLoading, error, refetch } = useGetFile(fileId);

  function handleUpdated() {
    refetch();
    queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
  }

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <Skeleton className="h-6 w-32 mb-8" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-48 mb-8" />
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-14" />)}
        </div>
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="border border-dashed border-border p-12 flex flex-col items-center gap-3 text-center">
          <FileX className="w-8 h-8 text-muted-foreground" />
          <p className="font-medium">File not found</p>
          <p className="text-xs text-muted-foreground">This file may have been deleted</p>
        </div>
      </div>
    );
  }

  const TypeIcon = file.type === "mod" ? Package : Map;
  const EditionIcon = file.edition === "java" ? Cpu : Pickaxe;
  const date = new Date(file.uploadedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const images = (file.images as string[] | null) ?? [];

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Back */}
      <motion.button
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </motion.button>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary/10 flex items-center justify-center flex-shrink-0">
            <TypeIcon className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold tracking-tight truncate" title={file.originalName}>
              {file.originalName}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <ScanStatusBadge status={file.scanStatus} />
              <span className="text-xs text-muted-foreground capitalize font-medium">{file.type}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <EditionIcon className="w-3 h-3" />
                {file.edition === "java" ? "Java Edition" : "Bedrock Edition"}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="space-y-6">
        {/* Meta info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-card-border p-3 flex items-center gap-3">
            <HardDrive className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">File size</p>
              <p className="text-sm font-mono font-medium">{formatBytes(file.size)}</p>
            </div>
          </div>
          <div className="bg-card border border-card-border p-3 flex items-center gap-3">
            <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Uploaded</p>
              <p className="text-sm font-medium">{date}</p>
            </div>
          </div>
        </div>

        {/* Download */}
        <a
          href={`${base}/api/files/${file.id}/download`}
          download={file.originalName}
          className="w-full"
        >
          <Button className="w-full h-11">
            <Download className="w-4 h-4 mr-2" />
            Download {file.originalName}
          </Button>
        </a>

        {/* Description */}
        <div className="bg-card border border-card-border p-5">
          <DescriptionEditor
            fileId={file.id}
            initialDescription={file.description}
            onUpdated={handleUpdated}
          />
        </div>

        {/* Images */}
        <div className="bg-card border border-card-border p-5">
          <ImageGallery
            images={images}
            fileId={file.id}
            onImagesUpdated={handleUpdated}
          />
        </div>

        {/* File info */}
        <div className="border border-border p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">File Info</p>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Internal name</span>
            <span className="font-mono text-foreground truncate max-w-[60%] text-right">{file.name}</span>
          </div>
          {file.mimeType && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">MIME type</span>
              <span className="font-mono text-foreground">{file.mimeType}</span>
            </div>
          )}
          {file.detectionRatio && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Detection ratio</span>
              <span className="font-mono text-foreground">{file.detectionRatio} engines</span>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
