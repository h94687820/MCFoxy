export type Bindings = {
  ASSETS: Fetcher;
  UPLOADS: R2Bucket;
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
