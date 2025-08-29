// global.d.ts

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: string;
    FRONTEND_URL: string;

    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;

    // add other keys you use...
  }
}
