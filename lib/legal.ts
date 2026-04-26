import { createAdminClient } from "@/lib/supabase/admin";

export const DEFAULT_LEGAL_DOCUMENT_TYPE = "eula";

export type LegalDocument = {
  id: string;
  documentType: string;
  requiredVersion: string;
  title: string;
  body: string;
  isActive: boolean;
  updatedAt: string;
};

export type UserLegalAcceptanceStatus = {
  documentType: string;
  requiredVersion: string | null;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  title: string | null;
  body: string | null;
  needsAcceptance: boolean;
};

type LegalDocumentRow = {
  id: string;
  document_type: string;
  required_version: string;
  title: string;
  body: string;
  is_active: boolean;
  updated_at: string;
};

type LegalAcceptanceRow = {
  document_version: string;
  accepted_at: string;
};

export async function getRequiredLegalDocument(
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE
): Promise<LegalDocument | null> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("legal_documents")
    .select("id,document_type,required_version,title,body,is_active,updated_at")
    .eq("document_type", documentType)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      return null;
    }

    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mapLegalDocumentRow(data as LegalDocumentRow);
}

export async function getUserLegalAcceptanceStatus(
  userId: string,
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE
): Promise<UserLegalAcceptanceStatus> {
  const [requiredDocument, latestAcceptance] = await Promise.all([
    getRequiredLegalDocument(documentType),
    getLatestUserLegalAcceptance(userId, documentType)
  ]);

  return {
    documentType,
    requiredVersion: requiredDocument?.requiredVersion ?? null,
    acceptedVersion: latestAcceptance?.document_version ?? null,
    acceptedAt: latestAcceptance?.accepted_at ?? null,
    title: requiredDocument?.title ?? null,
    body: requiredDocument?.body ?? null,
    needsAcceptance: Boolean(
      requiredDocument &&
        (!latestAcceptance || latestAcceptance.document_version !== requiredDocument.requiredVersion)
    )
  };
}

export async function requireCurrentLegalAcceptance(
  userId: string,
  documentType = DEFAULT_LEGAL_DOCUMENT_TYPE
): Promise<UserLegalAcceptanceStatus> {
  const status = await getUserLegalAcceptanceStatus(userId, documentType);
  if (status.needsAcceptance) {
    throw new Error("You must accept the current terms before continuing.");
  }

  return status;
}

export async function acceptLegalDocument(
  userId: string,
  documentType: string,
  metadata?: {
    acceptedIp?: string | null;
    acceptedUserAgent?: string | null;
  }
): Promise<UserLegalAcceptanceStatus> {
  const requiredDocument = await getRequiredLegalDocument(documentType);
  if (!requiredDocument) {
    throw new Error("The current terms are not available right now.");
  }

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("user_legal_acceptances").upsert(
    {
      user_id: userId,
      document_type: documentType,
      document_version: requiredDocument.requiredVersion,
      accepted_ip: metadata?.acceptedIp ?? null,
      accepted_user_agent: metadata?.acceptedUserAgent ?? null
    },
    { onConflict: "user_id,document_type,document_version" }
  );

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      throw new Error("Legal acceptance storage is not available yet. Apply the legal migration first.");
    }

    throw new Error(error.message);
  }

  return getUserLegalAcceptanceStatus(userId, documentType);
}

export async function upsertRequiredLegalDocument(input: {
  documentType: string;
  requiredVersion: string;
  title: string;
  body: string;
  isActive?: boolean;
}): Promise<LegalDocument> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("legal_documents")
    .upsert(
      {
        document_type: input.documentType,
        required_version: input.requiredVersion,
        title: input.title,
        body: input.body,
        is_active: input.isActive ?? true
      },
      { onConflict: "document_type" }
    )
    .select("id,document_type,required_version,title,body,is_active,updated_at")
    .single();

  if (error) {
    if (isMissingLegalRelationError(error.message)) {
      throw new Error("Legal documents are not available yet. Apply the legal migration first.");
    }

    throw new Error(error.message);
  }

  return mapLegalDocumentRow(data as LegalDocumentRow);
}

async function getLatestUserLegalAcceptance(userId: string, documentType: string) {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("user_legal_acceptances")
    .select("document_version,accepted_at")
    .eq("user_id", userId)
    .eq("document_type", documentType)
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
