import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey, getGetFileStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Upload, Package, Map, CheckCircle, AlertCircle, X, FileUp, Loader2, Cpu, Pickaxe, LogIn, Lock,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/hooks/use-auth-context";

type Edition = "java" | "bedrock";
type FileType = "mod" | "map";
type UploadState = "idle" | "uploading" | "success" | "error";

// Per-edition accepted extensions — prevents mobile from offering camera/gallery
const EDITION_ACCEPT: Record<Edition, string> = {
  java: ".jar,.zip",
  bedrock: ".mcpack,.mcworld,.mcaddon,.mctemplate",
};

const EDITION_HINT: Record<Edition, string> = {
  java: ".jar, .zip — Java mods and world exports",
  bedrock: ".mcpack · .mcworld · .mcaddon · .mctemplate",
};

export default function UploadPage() {
  const { isAdmin, isLoading: authLoading, login } = useAdminAuth();
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState<Edition>("java");
  const [fileType, setFileType] = useState<FileType>("mod");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When edition changes, clear selected file (it might be invalid for new edition)
  function handleEditionChange(e: Edition) {
    setEdition(e);
    setSelectedFile(null);
    setUploadState("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file);
    setUploadState("idle");
    setErrorMessage("");
  }, []);

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragging(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploadState("uploading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("type", fileType);
      formData.append("edition", edition);

      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/api/files/upload`, { method: "POST", body: formData });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Upload failed (${response.status})`);
      }

      setUploadState("success");
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetFileStatsQueryKey() });

      setTimeout(() => {
        setSelectedFile(null);
        setUploadState("idle");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }, 2500);
    } catch (err) {
      setUploadState("error");
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function handleClearFile() {
    setSelectedFile(null);
    setUploadState("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Show auth gate for non-admins
  if (!authLoading && !isAdmin) {
    return (
      <div className="p-6 md:p-8 max-w-2xl">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Upload File</h1>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-border p-8 flex flex-col items-center gap-4 text-center"
        >
          <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm">Admin access required</p>
            <p className="text-xs text-muted-foreground mt-1">
              Sign in to upload mods and maps
            </p>
          </div>
          <Button onClick={login} data-testid="button-login-upload">
            <LogIn className="w-4 h-4 mr-2" />
            Sign in with Replit
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Upload File</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select an edition and file type, then upload directly from your device.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-6">
        {/* Step 1: Edition */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">1 — Edition</p>
          <div className="grid grid-cols-2 gap-3">
            {([ { id: "java" as Edition, label: "Java Edition", sub: ".jar, .zip", Icon: Cpu }, { id: "bedrock" as Edition, label: "Bedrock Edition", sub: ".mcpack, .mcworld", Icon: Pickaxe } ] as const).map(({ id, label, sub, Icon }) => (
              <button
                key={id}
                data-testid={`button-edition-${id}`}
                onClick={() => handleEditionChange(id)}
                className={cn(
                  "flex items-center gap-3 p-4 border text-left transition-colors",
                  edition === id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50"
                )}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0", edition === id && "text-primary")} />
                <div><p className="font-semibold text-sm">{label}</p><p className="text-xs opacity-70">{sub}</p></div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Type */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">2 — File Type</p>
          <div className="grid grid-cols-2 gap-3">
            {([ { id: "mod" as FileType, label: "Mod", sub: "Game modification", Icon: Package }, { id: "map" as FileType, label: "Map", sub: "World or adventure map", Icon: Map } ] as const).map(({ id, label, sub, Icon }) => (
              <button
                key={id}
                data-testid={`button-type-${id}`}
                onClick={() => setFileType(id)}
                className={cn(
                  "flex items-center gap-3 p-4 border text-left transition-colors",
                  fileType === id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50"
                )}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0", fileType === id && "text-primary")} />
                <div><p className="font-semibold text-sm">{label}</p><p className="text-xs opacity-70">{sub}</p></div>
              </button>
            ))}
          </div>
        </div>

        {/* Step 3: File */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">3 — Select File</p>
          <div
            data-testid="drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed p-10 flex flex-col items-center gap-4 transition-colors",
              !selectedFile && "cursor-pointer",
              isDragging ? "border-primary bg-primary/5" : selectedFile ? "border-border bg-card" : "border-border hover:border-primary/50 bg-card"
            )}
          >
            {/* accept changes with edition — no capture attr to prevent camera on mobile */}
            <input
              ref={fileInputRef}
              type="file"
              accept={EDITION_ACCEPT[edition]}
              className="hidden"
              onChange={handleInputChange}
              data-testid="input-file"
            />

            <AnimatePresence mode="wait">
              {!selectedFile ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 border-2 border-dashed border-primary/40 flex items-center justify-center">
                    <FileUp className="w-6 h-6 text-primary/60" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Tap to browse files</p>
                    <p className="text-xs text-muted-foreground mt-1">{EDITION_HINT[edition]} · Max 500 MB</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="file" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-4 w-full">
                  <div className="w-10 h-10 bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {fileType === "mod" ? <Package className="w-5 h-5 text-primary" /> : <Map className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate" data-testid="text-selected-filename" title={selectedFile.name}>{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{formatBytes(selectedFile.size)}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={(e) => { e.stopPropagation(); handleClearFile(); }} data-testid="button-clear-file">
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <p className="text-xs text-muted-foreground mt-2 font-mono">
            {edition === "java" ? "Java Edition: .jar · .zip" : "Bedrock Edition: .mcpack · .mcworld · .mcaddon · .mctemplate"}
          </p>
        </div>

        <AnimatePresence>
          {uploadState === "success" && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Uploaded successfully. Scan pending.</span>
            </motion.div>
          )}
          {uploadState === "error" && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          data-testid="button-upload"
          onClick={handleUpload}
          disabled={!selectedFile || uploadState === "uploading" || uploadState === "success"}
          className="w-full h-11"
        >
          {uploadState === "uploading" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
            : uploadState === "success" ? <><CheckCircle className="w-4 h-4 mr-2" />Uploaded</>
            : <><Upload className="w-4 h-4 mr-2" />Upload {fileType === "mod" ? "Mod" : "Map"}</>}
        </Button>
      </motion.div>
    </div>
  );
}
