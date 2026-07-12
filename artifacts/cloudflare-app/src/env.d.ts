export type Bindings = {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  DEEPAI_API_KEY?: string;
  VIRUSTOTAL_API_KEY?: string;
  NODE_ENV?: string;
};

export type Variables = {
  userId: string;
};
