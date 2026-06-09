import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { getListFilesQueryKey, getGetFileStatsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Upload,
  Package,
  Map,
  CheckCircle,
  AlertCircle,
  X,
  FileUp,
  Loader2,
  Cpu,
  Pickaxe,
  ImagePlus,
  Hash,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/language-context";

type Edition = "java" | "bedrock";
type FileType = "mod" | "map";
type UploadState = "idle" | "uploading" | "success" | "error";

const CUSTOM_ID_REGEX = /^[a-z0-9-]{3,50}$/;

const EDITION_ACCEPT: Record<Edition, string> = {
  java: ".jar,.zip",
  bedrock: ".mcpack,.mcworld,.mcaddon,.mctemplate",
};

const EDITION_HINT: Record<Edition, string> = {
  java: ".jar, .zip — Java mods and world exports",
  bedrock: ".mcpack · .mcworld · .mcaddon · .mctemplate",
};

export default function UploadPage() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [edition, setEdition] = useState<Edition>("java");
  const [fileType, setFileType] = useState<FileType>("mod");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customId, setCustomId] = useState("");
  const [customIdError, setCustomIdError] = useState<string>("");
  const [description, setDescription] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function handleEditionChange(e: Edition) {
    setEdition(e);
    setSelectedFile(null);
    setUploadState("idle");
    setErrorMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCustomIdChange(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, "-");
    setCustomId(normalized);
    setCustomIdError("");
  }

  function validateCustomId(): boolean {
    if (!customId) {
      setCustomIdError(t.upload.customIdInvalid);
      return false;
    }
    if (!CUSTOM_ID_REGEX.test(customId)) {
      setCustomIdError(t.upload.customIdInvalid);
      return false;
    }
    return true;
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

  function handleImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setSelectedImages((prev) => [...prev, ...files].slice(0, 10));
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (!selectedFile) return;
    if (!validateCustomId()) return;

    setUploadState("uploading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("type", fileType);
      formData.append("edition", edition);
      formData.append("customId", customId);
      if (description.trim()) {
        formData.append("description", description.trim());
      }
      selectedImages.forEach((img) => formData.append("images", img));

      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/api/files/upload`, { method: "POST", body: formData });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const errMsg = (data as { error?: string }).error ?? `Upload failed (${response.status})`;
        if (response.status === 409 || errMsg.toLowerCase().includes("taken")) {
          setCustomIdError(t.upload.customIdTaken);
          setUploadState("idle");
          return;
        }
        throw new Error(errMsg);
      }

      setUploadState("success");
      queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetFileStatsQueryKey() });

      setTimeout(() => {
        setSelectedFile(null);
        setCustomId("");
        setCustomIdError("");
        setDescription("");
        setSelectedImages([]);
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

  const customIdValid = CUSTOM_ID_REGEX.test(customId);
  const canUpload = !!selectedFile && customIdValid && uploadState !== "uploading" && uploadState !== "success";

  const uploadBtnLabel = () => {
    if (uploadState === "uploading") return <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t.upload.uploadingButton}</>;
    if (uploadState === "success") return <><CheckCircle className="w-4 h-4 mr-2" />{t.upload.uploadedButton}</>;
    if (selectedImages.length > 0) {
      return <><Upload className="w-4 h-4 mr-2" />{t.upload.withImages} {selectedImages.length} {selectedImages.length === 1 ? t.upload.image : t.upload.images}</>;
    }
    return <><Upload className="w-4 h-4 mr-2" />{t.upload.uploadButton} {fileType === "mod" ? t.upload.mod : t.upload.map}</>;
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t.upload.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.upload.subtitle}</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="space-y-6">
        {/* Step 1: Edition */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t.upload.stepEdition}</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "java" as Edition, label: t.upload.javaEdition, sub: ".jar, .zip", Icon: Cpu },
              { id: "bedrock" as Edition, label: t.upload.bedrockEdition, sub: ".mcpack, .mcworld", Icon: Pickaxe },
            ] as const).map(({ id, label, sub, Icon }) => (
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t.upload.stepType}</p>
          <div className="grid grid-cols-2 gap-3">
            {([
              { id: "mod" as FileType, label: t.upload.mod, sub: t.upload.modSub, Icon: Package },
              { id: "map" as FileType, label: t.upload.map, sub: t.upload.mapSub, Icon: Map },
            ] as const).map(({ id, label, sub, Icon }) => (
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t.upload.stepFile}</p>
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
                    <p className="font-semibold text-sm">{t.upload.dropHint}</p>
                    <p className="text-xs text-muted-foreground mt-1">{EDITION_HINT[edition]} · {t.upload.maxSize}</p>
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

        {/* Step 4: Custom ID */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{t.upload.stepCustomId}</p>
          <p className="text-xs text-muted-foreground mb-3">{t.upload.stepCustomIdDesc}</p>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Hash className={cn("w-4 h-4", customId && customIdValid ? "text-primary" : "text-muted-foreground")} />
            </div>
            <input
              type="text"
              value={customId}
              onChange={(e) => handleCustomIdChange(e.target.value)}
              onBlur={() => customId && !customIdValid && setCustomIdError(t.upload.customIdInvalid)}
              placeholder={t.upload.customIdPlaceholder}
              maxLength={50}
              className={cn(
                "w-full bg-card border text-sm text-foreground placeholder:text-muted-foreground pl-9 pr-16 py-3 focus:outline-none transition-colors font-mono",
                customIdError ? "border-red-500/60 focus:border-red-500" : customId && customIdValid ? "border-primary/60 focus:border-primary" : "border-border focus:border-primary/60"
              )}
            />
            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-mono text-muted-foreground">
              {customId.length}/50
            </span>
          </div>
          {customIdError ? (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {customIdError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1.5 font-mono">{t.upload.customIdHint}</p>
          )}
        </div>

        {/* Step 5: Description */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {t.upload.stepDescription} <span className="normal-case font-normal">{t.upload.stepDescriptionOptional}</span>
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.upload.descriptionPlaceholder}
            rows={3}
            className="w-full bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground p-3 resize-none focus:outline-none focus:border-primary/60 transition-colors"
          />
        </div>

        {/* Step 6: Images */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {t.upload.stepImages} <span className="normal-case font-normal">{t.upload.stepImagesOptional}</span>
          </p>

          {selectedImages.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {selectedImages.map((img, i) => (
                <div key={i} className="relative group aspect-video bg-card border border-border overflow-hidden">
                  <img
                    src={URL.createObjectURL(img)}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedImages.length < 10 && (
            <button
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ImagePlus className="w-4 h-4" />
              {t.upload.addImages}
              <span className="text-xs font-mono">({selectedImages.length}/10)</span>
            </button>
          )}

          <input
            ref={imageInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp"
            multiple
            className="hidden"
            onChange={handleImagesChange}
          />
          <p className="text-xs text-muted-foreground mt-2 font-mono">JPG · PNG · GIF · WebP · max 10 MB each</p>
        </div>

        <AnimatePresence>
          {uploadState === "success" && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{t.upload.uploadSuccess}</span>
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
          disabled={!canUpload}
          className="w-full h-11"
        >
          {uploadBtnLabel()}
        </Button>
      </motion.div>
    </div>
  );
}
