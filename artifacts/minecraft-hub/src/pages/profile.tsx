import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useUser, useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useUpdateMyProfile,
  useCheckUsername,
  getGetMyProfileQueryKey,
  getCheckUsernameQueryKey,
} from "@workspace/api-client-react";
import { CheckCircle, XCircle, Loader2, User, AtSign, FileText, Camera, AlertCircle, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/language-context";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { t } = useLanguage();

  const { data: profile, isLoading } = useGetMyProfile({
    query: { queryKey: getGetMyProfileQueryKey(), enabled: !!user },
  });

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (profile && !initialized.current) {
      setDisplayName(profile.displayName ?? "");
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
      setAvatarUrl(profile.avatarUrl ?? "");
      initialized.current = true;
    }
  }, [profile]);

  const debouncedUsername = useDebounce(username, 500);
  const usernameChanged = debouncedUsername !== (profile?.username ?? "");

  const checkParams = { username: debouncedUsername, excludeUserId: user?.id };
  const { data: usernameCheck, isFetching: checkingUsername } = useCheckUsername(checkParams, {
    query: {
      queryKey: getCheckUsernameQueryKey(checkParams),
      enabled: debouncedUsername.length >= 3 && usernameChanged,
    },
  });

  const updateMutation = useUpdateMyProfile();

  async function handleAvatarUpload(file: File) {
    setAvatarError("");
    setAvatarUploading(true);
    try {
      const token = await getToken();
      const fd = new FormData();
      fd.append("avatar", file);
      const resp = await fetch(`${import.meta.env.BASE_URL}api/profiles/avatar`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await resp.json() as { url?: string; error?: string };
      if (!resp.ok) throw new Error(data.error ?? "Upload failed");
      setAvatarUrl(data.url!);
      qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
    } catch (e: unknown) {
      setAvatarError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleSave() {
    setSaveError("");
    updateMutation.mutate(
      { data: { displayName, username, bio, avatarUrl } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          initialized.current = false;
        },
        onError: async (err: unknown) => {
          const msg =
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : "Failed to save";
          setSaveError(msg);
        },
      },
    );
  }

  const usernameValid = /^[a-zA-Z0-9_-]{3,20}$/.test(username);
  const usernameAvailable =
    !usernameChanged || (usernameCheck?.available === true && usernameCheck?.valid === true);
  const canSave =
    usernameValid && usernameAvailable && !checkingUsername && !updateMutation.isPending;

  useEffect(() => {
    if (isLoaded && !user) {
      setLocation("/sign-in");
    }
  }, [isLoaded, user, setLocation]);

  if (!isLoaded || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const avatarSrc = avatarUrl || user.imageUrl;

  return (
    <div className="p-6 md:p-8 max-w-xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.profile.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.profile.subtitle}</p>
        </div>
        {saved && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-1.5 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            {t.profile.saved}
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.05 } }}
        className="space-y-6"
      >
        {/* Avatar preview + upload */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center border border-border flex-shrink-0">
              {avatarUploading ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : avatarSrc ? (
                <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-muted-foreground" />
              )}
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
            >
              <Camera className="w-5 h-5 text-white" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
              }}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{profile?.displayName || profile?.username}</p>
            <p className="text-xs mt-0.5 font-mono" dir="ltr">@{profile?.username}</p>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="text-xs text-primary hover:underline mt-1 flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              {avatarUploading ? t.profile.uploading : t.profile.changePhoto}
            </button>
          </div>
        </div>
        {avatarError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {avatarError}
          </div>
        )}

        {/* Display name */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            <User className="w-3.5 h-3.5" />
            {t.profile.displayName}
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t.profile.displayNamePlaceholder}
            maxLength={50}
            className="w-full bg-card border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            <AtSign className="w-3.5 h-3.5" />
            {t.profile.usernameLabel}
          </label>
          <div className="relative">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, ""))}
              placeholder={t.profile.usernamePlaceholder}
              maxLength={20}
              dir="ltr"
              className={cn(
                "w-full bg-card border px-3 py-2.5 text-sm focus:outline-none transition-colors pr-9",
                usernameChanged && usernameCheck?.available === false
                  ? "border-red-500 focus:border-red-500"
                  : usernameChanged && usernameCheck?.available === true
                  ? "border-green-500 focus:border-green-500"
                  : "border-border focus:border-primary",
              )}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checkingUsername ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : usernameChanged && usernameCheck?.available === true ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : usernameChanged && usernameCheck?.available === false ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {usernameChanged && usernameCheck?.available === false
              ? t.profile.usernameTaken
              : usernameChanged && usernameCheck?.available === true
              ? t.profile.usernameAvailable
              : t.profile.usernameHint}
          </p>
          <p className="text-xs text-muted-foreground/60 font-mono" dir="ltr">
            {t.profile.profileUrlLabel}{username || "..."}
          </p>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest font-semibold">
            <FileText className="w-3.5 h-3.5" />
            {t.profile.bioLabel}
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t.profile.bioPlaceholder}
            rows={4}
            maxLength={300}
            className="w-full bg-card border border-border px-3 py-2.5 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
          />
          <p className="text-xs text-muted-foreground text-left">{bio.length}/300</p>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {saveError}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className={cn(
            "w-full py-2.5 text-sm font-semibold transition-colors",
            canSave
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
        >
          {updateMutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t.profile.saving}
            </span>
          ) : (
            t.profile.saveButton
          )}
        </button>
      </motion.div>
    </div>
  );
}
