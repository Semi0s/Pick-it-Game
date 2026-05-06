import {
  isMissingAnyRelationError,
  isMissingColumnError,
  isMissingRelationError,
  isMissingStorageBucketError
} from "@/lib/schema-safety";

type SupabaseLikeError = {
  details?: string | null;
  message?: string | null;
  hint?: string | null;
  code?: string | null;
  stack?: string | null;
};

export function getSafeSupabaseErrorInfo(error: unknown, fallbackMessage = "Supabase request failed.") {
  if (error instanceof Error) {
    const candidate = error as Error & SupabaseLikeError;
    return {
      name: candidate.name || error.constructor?.name || "Error",
      message: candidate.message?.trim() || fallbackMessage,
      hint: candidate.hint?.trim() || null,
      code: candidate.code?.trim() || null,
      details: candidate.details?.trim() || null,
      stack:
        process.env.NODE_ENV !== "production" && typeof candidate.stack === "string" ? candidate.stack : null,
      constructorName: error.constructor?.name || "Error",
      stringValue: String(error),
      ownPropertyNames: Object.getOwnPropertyNames(error)
    };
  }

  if (error && typeof error === "object") {
    const candidate = error as SupabaseLikeError;
    return {
      name: candidate.constructor?.name || "Object",
      message: candidate.message?.trim() || fallbackMessage,
      hint: candidate.hint?.trim() || null,
      code: candidate.code?.trim() || null,
      details: candidate.details?.trim() || null,
      stack:
        process.env.NODE_ENV !== "production" && typeof candidate.stack === "string" ? candidate.stack : null,
      constructorName: candidate.constructor?.name || "Object",
      stringValue: String(error),
      ownPropertyNames: Object.getOwnPropertyNames(error)
    };
  }

  return {
    name: typeof error,
    message: fallbackMessage,
    hint: null,
    code: null,
    details: null,
    stack: null,
    constructorName: null,
    stringValue: String(error),
    ownPropertyNames: []
  };
}

export function formatSafeSupabaseError(error: unknown, fallbackMessage: string, context?: string) {
  const info = getSafeSupabaseErrorInfo(error, fallbackMessage);
  const prefix = context ? `${context}: ` : "";
  const hint = info.hint ? ` Hint: ${info.hint}` : "";
  return new Error(`${prefix}${info.message}${hint}`);
}

export function logSafeSupabaseError(context: string, error: unknown, extras?: Record<string, unknown>) {
  const info = getSafeSupabaseErrorInfo(error);
  const payload = {
    ...extras,
    constructorName: info.constructorName,
    code: info.code,
    details: info.details,
    hint: info.hint,
    message: info.message,
    name: info.name,
    ownPropertyNames: info.ownPropertyNames,
    stringValue: info.stringValue,
    ...(info.stack ? { stack: info.stack } : {})
  };

  if (extras?.recoverable) {
    console.warn(`[supabase:${context}]`, payload);
    return;
  }

  console.error(`[supabase:${context}]`, payload);
}

export function isLikelySchemaDriftError(error: unknown, relations: string[] = []) {
  const info = getSafeSupabaseErrorInfo(error);
  const combined = `${info.message} ${info.hint ?? ""}`.trim();

  if (
    isMissingAnyRelationError(combined, relations) ||
    relations.some((relation) => isMissingRelationError(combined, relation)) ||
    relations.some((relation) => isMissingColumnError(combined, relation, "id")) ||
    isMissingStorageBucketError(combined, "avatars")
  ) {
    return true;
  }

  const normalized = combined.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table") ||
    normalized.includes("missing column")
  );
}
