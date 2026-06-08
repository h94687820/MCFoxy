import { createContext, useContext } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import type { AuthUser } from "@workspace/replit-auth-web";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  // Any authenticated user is an admin (the site owner).
  // Unauthenticated visitors can only view and download.
  const isAdmin = auth.isAuthenticated;

  return (
    <AuthContext.Provider value={{ ...auth, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AuthContext);
}
