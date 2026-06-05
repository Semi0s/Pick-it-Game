import { redirect } from "next/navigation";

function readSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function readSafeNextPath(value: string | string[] | undefined) {
  const nextPath = readSearchParam(value);
  return nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
}

export default async function JoinPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const code =
    readSearchParam(resolvedSearchParams.code) ||
    readSearchParam(resolvedSearchParams.accessCode) ||
    readSearchParam(resolvedSearchParams.inviteCode);
  const nextPath = readSafeNextPath(resolvedSearchParams.next);
  const params = new URLSearchParams({
    mode: "signup",
    next: nextPath
  });

  if (code) {
    params.set("accessCode", code);
  }

  redirect(`/login?${params.toString()}`);
}
