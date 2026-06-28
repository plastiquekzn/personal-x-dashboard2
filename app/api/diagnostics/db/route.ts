import { NextResponse } from "next/server";

import { getAppEnv, isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function getSupabaseRef(supabaseUrl: string) {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

async function getTableCount(table: "projects" | "posts") {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { count: null, error: "Supabase is not configured." };
  }

  try {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

    return {
      count: count ?? null,
      error: error?.message ?? null
    };
  } catch (error) {
    return {
      count: null,
      error: error instanceof Error ? error.message : "Unknown Supabase error."
    };
  }
}

export async function GET() {
  const env = getAppEnv();
  const [projects, posts] = await Promise.all([getTableCount("projects"), getTableCount("posts")]);

  return NextResponse.json(
    {
      ok: !projects.error && !posts.error,
      supabase: {
        configured: isSupabaseConfigured(),
        ref: getSupabaseRef(env.supabaseUrl),
        hasUrl: Boolean(env.supabaseUrl),
        hasServiceRoleKey: Boolean(env.supabaseServiceRoleKey),
        bucket: env.bucket
      },
      counts: {
        projects: projects.count,
        posts: posts.count
      },
      errors: {
        projects: projects.error,
        posts: posts.error
      }
    },
    { status: projects.error || posts.error ? 500 : 200 }
  );
}
