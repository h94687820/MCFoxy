export type Bindings = {
  ASSETS: Fetcher;
  /** Service Binding to baas-platform Worker — preferred over HTTPS fetch on Cloudflare */
  BAAS_SERVICE?: Fetcher;
  /** Fallback: full base URL for BaaS when Service Binding is unavailable (e.g. local dev) */
  BAAS_BASE_URL?: string;
  BAAS_API_KEY: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  DEEPAI_API_KEY?: string;
  VIRUSTOTAL_API_KEY?: string;
  NODE_ENV?: string;
};

export type Variables = {
  userId: string;
};
