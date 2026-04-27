const warnedKeys = new Set<string>();

export function normalizeSupabaseErrorMessage(message?: string | null) {
  return message?.toLowerCase().trim() ?? "";
}

export function isMissingRelationError(message: string | undefined | null, relation: string) {
  const normalized = normalizeSupabaseErrorMessage(message);
  if (!normalized) {
    return false;
  }

  const relationName = relation.toLowerCase();
  return (
    normalized.includes(`could not find the table 'public.${relationName}'`) ||
    normalized.includes(`relation "public.${relationName}" does not exist`) ||
    normalized.includes(`relation "${relationName}" does not exist`) ||
    (normalized.includes(relationName) && normalized.includes("schema cache"))
  );
}

export function isMissingAnyRelationError(message: string | undefined | null, relations: string[]) {
  return relations.some((relation) => isMissingRelationError(message, relation));
}

export function isMissingColumnError(
  message: string | undefined | null,
  relation: string,
  column: string
) {
  const normalized = normalizeSupabaseErrorMessage(message);
  if (!normalized) {
    return false;
  }

  const relationName = relation.toLowerCase();
  const columnName = column.toLowerCase();
  return (
    normalized.includes(`column ${relationName}.${columnName} does not exist`) ||
    normalized.includes(`column public.${relationName}.${columnName} does not exist`) ||
    (normalized.includes(columnName) &&
      (normalized.includes(relationName) || normalized.includes("schema cache")) &&
      normalized.includes("does not exist"))
  );
}

export function isMissingStorageBucketError(message: string | undefined | null, bucketName: string) {
  const normalized = normalizeSupabaseErrorMessage(message);
  if (!normalized) {
    return false;
  }

  const bucket = bucketName.toLowerCase();
  return normalized.includes(bucket) && normalized.includes("bucket") && normalized.includes("not found");
}

export function warnOptionalFeatureOnce(key: string, message: string, details?: string | null) {
  if (warnedKeys.has(key)) {
    return;
  }

  warnedKeys.add(key);
  console.warn(details ? `${message} ${details}` : message);
}
