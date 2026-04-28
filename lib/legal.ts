import { createAdminClient } from "@/lib/supabase/admin";
import { defaultLanguage, normalizeLanguage, supportedLanguages, type SupportedLanguage } from "@/lib/i18n";

export const DEFAULT_LEGAL_DOCUMENT_TYPE = "eula";

export type LegalDocument = {
  id: string;
  documentType: string;
  language: SupportedLanguage;
  requiredVersion: string;
  title: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
};

export type UserLegalAcceptanceStatus = {
  documentType: string;
  requiredLanguage: SupportedLanguage | null;
  requiredVersion: string | null;
  acceptedLanguage: SupportedLanguage | null;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  title: string | null;
  body: string | null;
  needsAcceptance: boolean;
};

type LegalDocumentRow = {
  id: string;
  document_type: string;
  language: string;
  required_version: string;
  title: string;
  body: string;
  is_active: boolean;
  updated_at: string;
};

type LegalAcceptanceRow = {
  language: string;
  document_version: string;
  accepted_at: string;
};

export async function getRequiredLegalDocument(
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE,
  language?: string | null
): Promise<LegalDocument | null> {
  const adminSupabase = createAdminClient();
  const requestedLanguage = normalizeLanguage(language);
  const candidateLanguages = requestedLanguage === defaultLanguage ? [defaultLanguage] : [requestedLanguage, defaultLanguage];

  for (const candidateLanguage of candidateLanguages) {
    const { data, error } = await adminSupabase
      .from("legal_documents")
      .select("id,document_type,language,required_version,title,body,is_active,updated_at")
      .eq("document_type", documentType)
      .eq("language", candidateLanguage)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      if (isMissingLegalRelationError(error.message)) {
        return null;
      }

      throw new Error(error.message);
    }

    if (data) {
      return mapLegalDocumentRow(data as LegalDocumentRow);
    }
  }

  return null;
}

export async function getLegalDocuments(
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE,
  languages: readonly string[] = supportedLanguages
): Promise<LegalDocument[]> {
  const adminSupabase = createAdminClient();
  const normalizedLanguages = Array.from(new Set(languages.map((language) => normalizeLanguage(language))));
  const { data, error } = await adminSupabase
    .from("legal_documents")
    .select("id,document_type,language,required_version,title,body,is_active,updated_at")
    .eq("document_type", documentType)
    .eq("is_active", true)
    .in("language", normalizedLanguages)
    .order("language", { ascending: true });

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      return [];
    }

    throw new Error(error.message);
  }

  return ((data as LegalDocumentRow[] | null) ?? []).map(mapLegalDocumentRow);
}

export async function getUserLegalAcceptanceStatus(
  userId: string,
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE,
  preferredLanguage?: string | null
): Promise<UserLegalAcceptanceStatus> {
  const requiredDocument = await getRequiredLegalDocument(documentType, preferredLanguage);
  const latestAcceptance = requiredDocument
    ? await getLatestUserLegalAcceptance(userId, documentType, requiredDocument.language)
    : null;

  return {
    documentType,
    requiredLanguage: requiredDocument?.language ?? null,
    requiredVersion: requiredDocument?.requiredVersion ?? null,
    acceptedLanguage: latestAcceptance ? normalizeLanguage(latestAcceptance.language) : null,
    acceptedVersion: latestAcceptance?.document_version ?? null,
    acceptedAt: latestAcceptance?.accepted_at ?? null,
    title: requiredDocument?.title ?? null,
    body: requiredDocument?.body ?? null,
    needsAcceptance: Boolean(
      requiredDocument &&
        (!latestAcceptance ||
          latestAcceptance.document_version !== requiredDocument.requiredVersion ||
          normalizeLanguage(latestAcceptance.language) !== requiredDocument.language)
    )
  };
}

export async function requireCurrentLegalAcceptance(
  userId: string,
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE,
  preferredLanguage?: string | null
): Promise<UserLegalAcceptanceStatus> {
  const status = await getUserLegalAcceptanceStatus(userId, documentType, preferredLanguage);
  if (status.needsAcceptance) {
    throw new Error("You must accept the current terms before continuing.");
  }

  return status;
}

export async function acceptLegalDocument(
  userId: string,
  documentType: string,
  language?: string | null,
  metadata?: {
    acceptedIp?: string | null;
    acceptedUserAgent?: string | null;
  }
): Promise<UserLegalAcceptanceStatus> {
  const requiredDocument = await getRequiredLegalDocument(documentType, language);
  if (!requiredDocument) {
    throw new Error("The current terms are not available right now.");
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("user_legal_acceptances").upsert(
    {
      user_id: userId,
      document_type: documentType,
      document_version: requiredDocument.requiredVersion,
      language: requiredDocument.language,
      accepted_ip: metadata?.acceptedIp ?? null,
      accepted_user_agent: metadata?.acceptedUserAgent ?? null
    },
    { onConflict: "user_id,document_type,document_version,language" }
  );

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      throw new Error("Legal acceptance storage is not available yet. Apply the legal migration first.");
    }

    throw new Error(error.message);
  }

  return getUserLegalAcceptanceStatus(userId, documentType, requiredDocument.language);
}

export async function upsertRequiredLegalDocument(input: {
  documentType: string;
  language?: string | null;
  requiredVersion: string;
  title: string;
  body: string;
  isActive?: boolean;
}): Promise<LegalDocument> {
  const adminSupabase = createAdminClient();
  const normalizedLanguage = normalizeLanguage(input.language);
  const { data, error } = await adminSupabase
    .from("legal_documents")
    .upsert(
      {
        document_type: input.documentType,
        language: normalizedLanguage,
        required_version: input.requiredVersion,
        title: input.title,
        body: input.body,
        is_active: input.isActive ?? true
      },
      { onConflict: "document_type,language" }
    )
    .select("id,document_type,language,required_version,title,body,is_active,updated_at")
    .single();

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      throw new Error("Legal documents are not available yet. Apply the legal migration first.");
    }

    throw new Error(error.message);
  }

  return mapLegalDocumentRow(data as LegalDocumentRow);
}

async function getLatestUserLegalAcceptance(userId: string, documentType: string, language: SupportedLanguage) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("user_legal_acceptances")
    .select("language,document_version,accepted_at")
    .eq("user_id", userId)
    .eq("document_type", documentType)
    .eq("language", language)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      return null;
    }

    throw new Error(error.message);
  }

  return (data as LegalAcceptanceRow | null) ?? null;
}

function mapLegalDocumentRow(row: LegalDocumentRow): LegalDocument {
  return {
    id: row.id,
    documentType: row.document_type,
    language: normalizeLanguage(row.language),
    requiredVersion: row.required_version,
    title: row.title,
    body: row.body,
    isActive: row.is_active,
    updatedAt: row.updated_at
  };
}

export function isMissingLegalRelationError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("legal_documents") ||
    normalized.includes("user_legal_acceptances")
  ) && (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find the table")
  );
}
