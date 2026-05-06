type SupabaseClientEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

type SupabaseAdminEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

function isLegacyJwtKey(value: string) {
  return value.trim().startsWith("eyJ");
}

function isPublishableKey(value: string) {
  return value.trim().startsWith("sb_publishable_");
}

function isSecretKey(value: string) {
  return value.trim().startsWith("sb_secret_");
}

function assertConfigured(name: string, value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new Error(`Missing required Supabase environment variable: ${name}.`);
  }

  return trimmed;
}

export function getSupabaseClientEnv(): SupabaseClientEnv {
  const supabaseUrl = assertConfigured("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = assertConfigured("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (isLegacyJwtKey(supabaseAnonKey)) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY. Legacy JWT-style Supabase keys are disabled; use the new sb_publishable_ key."
    );
  }

  if (!isPublishableKey(supabaseAnonKey)) {
    throw new Error(
      "Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY. Expected the new Supabase publishable key format starting with sb_publishable_."
    );
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error("Invalid public Supabase configuration. Service-role keys must never be exposed through NEXT_PUBLIC variables.");
  }

  return {
    supabaseUrl,
    supabaseAnonKey
  };
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv {
  const supabaseUrl = assertConfigured("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = assertConfigured("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (isLegacyJwtKey(serviceRoleKey)) {
    throw new Error(
      "Invalid SUPABASE_SERVICE_ROLE_KEY. Legacy JWT-style Supabase keys are disabled; use the new sb_secret_ service-role key."
    );
  }

  if (!isSecretKey(serviceRoleKey)) {
    throw new Error(
      "Invalid SUPABASE_SERVICE_ROLE_KEY. Expected the new Supabase secret key format starting with sb_secret_."
    );
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() && isSecretKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error("Invalid public Supabase configuration. NEXT_PUBLIC_SUPABASE_ANON_KEY must not contain a service-role secret.");
  }

  return {
    supabaseUrl,
    serviceRoleKey
  };
}
