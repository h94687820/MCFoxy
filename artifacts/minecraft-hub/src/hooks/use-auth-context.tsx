export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useAdminAuth() {
  return {
    user: null,
    isLoading: false,
    isAuthenticated: false,
    isAdmin: false,
    login: () => {},
    logout: () => {},
  };
}
