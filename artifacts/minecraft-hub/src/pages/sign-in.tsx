import { SignIn, useAuth } from "@clerk/react";
import { Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  const { isLoaded } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {!isLoaded ? (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-7 h-7 animate-spin" />
          <p className="text-xs">Loading…</p>
        </div>
      ) : (
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={basePath || "/"}
        />
      )}
    </div>
  );
}
