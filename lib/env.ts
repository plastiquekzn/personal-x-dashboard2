const FALLBACK_BUCKET = "tweet-screenshots";
const FALLBACK_AI_PROVIDER = "gemini";
const FALLBACK_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_METRICS_MODEL = "gemini-2.5-flash";
const FALLBACK_OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";
const FALLBACK_OPENROUTER_FALLBACK_MODEL = "google/gemini-2.5-flash";
const FALLBACK_OPENROUTER_METRICS_MODEL = "google/gemini-2.5-flash-lite";

function readEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

export function getAppEnv() {
  const aiProvider = (readEnv("AI_PROVIDER") || FALLBACK_AI_PROVIDER).toLowerCase();
  const geminiApiKeys = [readEnv("GEMINI_API_KEY"), readEnv("GEMINI_API_KEY_2"), readEnv("GEMINI_API_KEY_3")].filter(Boolean);

  return {
    supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: readEnv("NEXT_PUBLIC_SUPABASE_BUCKET") || FALLBACK_BUCKET,
    aiProvider,
    geminiApiKey: readEnv("GEMINI_API_KEY"),
    geminiApiKeys,
    geminiModel: readEnv("GEMINI_MODEL") || FALLBACK_GEMINI_MODEL,
    geminiFallbackModel: readEnv("GEMINI_FALLBACK_MODEL") || FALLBACK_GEMINI_FALLBACK_MODEL,
    geminiMetricsModel: readEnv("GEMINI_METRICS_MODEL") || FALLBACK_GEMINI_METRICS_MODEL,
    openRouterApiKey: readEnv("OPENROUTER_API_KEY"),
    openRouterModel: readEnv("OPENROUTER_MODEL") || FALLBACK_OPENROUTER_MODEL,
    openRouterFallbackModel: readEnv("OPENROUTER_FALLBACK_MODEL") || FALLBACK_OPENROUTER_FALLBACK_MODEL,
    openRouterMetricsModel: readEnv("OPENROUTER_METRICS_MODEL") || FALLBACK_OPENROUTER_METRICS_MODEL
  };
}

export function isSupabaseConfigured() {
  const env = getAppEnv();
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isGeminiConfigured() {
  const env = getAppEnv();
  return env.geminiApiKeys.length > 0;
}

export function isAiConfigured() {
  const env = getAppEnv();

  if (env.aiProvider === "openrouter") {
    return Boolean(env.openRouterApiKey);
  }

  return env.geminiApiKeys.length > 0;
}
