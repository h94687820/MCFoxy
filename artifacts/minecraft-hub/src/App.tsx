import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/hooks/use-auth-context";
import Layout from "@/components/Layout";
import HomePage from "@/pages/home";
import UploadPage from "@/pages/upload";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { useTheme } from "@/hooks/use-theme";

const queryClient = new QueryClient();

function AppContent() {
  useTheme();
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/upload" component={UploadPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppContent />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
