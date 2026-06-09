import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import Layout from "@/components/Layout";
import HomePage from "@/pages/home";
import UploadPage from "@/pages/upload";
import SettingsPage from "@/pages/settings";
import FileDetailPage from "@/pages/file-detail";
import ProfilePage from "@/pages/profile";
import UserProfilePage from "@/pages/user-profile";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import NotFound from "@/pages/not-found";
import { useTheme } from "@/hooks/use-theme";
import { LanguageProvider } from "@/contexts/language-context";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  baseTheme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#f97316",
    colorForeground: "#f1f5f9",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#ef4444",
    colorBackground: "#0f172a",
    colorInput: "#1e293b",
    colorInputForeground: "#f1f5f9",
    colorNeutral: "#334155",
    fontFamily: "Outfit, sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#0f172a] border border-[#1e293b] rounded-none w-[440px] max-w-full overflow-hidden shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#f1f5f9] font-bold",
    headerSubtitle: "text-[#94a3b8]",
    socialButtonsBlockButtonText: "text-[#f1f5f9] font-medium",
    formFieldLabel: "text-[#94a3b8] text-xs uppercase tracking-widest font-semibold",
    footerActionLink: "text-[#f97316] hover:text-[#fb923c]",
    footerActionText: "text-[#64748b]",
    dividerText: "text-[#475569]",
    identityPreviewEditButton: "text-[#f97316]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#f1f5f9]",
    logoBox: "mb-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border border-[#1e293b] bg-[#1e293b] hover:bg-[#334155] transition-colors",
    formButtonPrimary: "bg-[#f97316] hover:bg-[#fb923c] text-white font-semibold",
    formFieldInput: "bg-[#1e293b] border border-[#334155] text-[#f1f5f9] focus:border-[#f97316] rounded-none",
    footerAction: "border-t border-[#1e293b]",
    dividerLine: "bg-[#1e293b]",
    alert: "border border-[#334155] bg-[#1e293b]",
    otpCodeFieldInput: "bg-[#1e293b] border border-[#334155] text-[#f1f5f9]",
    formFieldRow: "",
    main: "",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function AppContent() {
  useTheme();
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/upload" component={UploadPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/u/:username" component={UserProfilePage} />
        <Route path="/files/:id" component={FileDetailPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={AppContent} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <LanguageProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </LanguageProvider>
  );
}

export default App;
