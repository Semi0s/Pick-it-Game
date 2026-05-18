import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";

function extractInviteTokenFromNextPath(nextPath?: string) {
  if (!nextPath?.startsWith("/")) {
    return null;
  }

  try {
    const url = new URL(nextPath, "https://example.test");
    const inviteToken = url.searchParams.get("invite");
    return inviteToken?.trim() || null;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const confirmed = resolvedSearchParams.confirmed === "1";
  const reset = resolvedSearchParams.reset === "1";
  const mode = typeof resolvedSearchParams.mode === "string" ? resolvedSearchParams.mode : undefined;
  const flow = typeof resolvedSearchParams.flow === "string" ? resolvedSearchParams.flow : undefined;
  const language = typeof resolvedSearchParams.lang === "string" ? resolvedSearchParams.lang : undefined;
  const callbackError = typeof resolvedSearchParams.error === "string" ? resolvedSearchParams.error : undefined;
  const next = typeof resolvedSearchParams.next === "string" ? resolvedSearchParams.next : undefined;
  const inviteToken = extractInviteTokenFromNextPath(next);

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-8">
      <Image
        src="/images/signin-stadium.jpeg"
        alt="Soccer stadium background"
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-[17.85rem] flex-col justify-center">
        <div className="mb-8 rounded-lg border border-white/60 bg-white/90 p-4 shadow-2xl shadow-black/25">
          <div className="mx-auto mb-6 max-w-[30rem]">
            <Image
              src="/images/pickit-signin-logo.png"
              alt="PICK-IT! World Cup 2026"
              width={2048}
              height={1101}
              priority
              className="h-auto w-full object-contain"
            />
          </div>

          <LoginForm
            confirmed={confirmed}
            reset={reset}
            initialMode={mode === "signup" || (!mode && flow === "invite") ? "signup" : "login"}
            flow={flow}
            language={language}
            callbackError={callbackError}
            nextPath={next}
            inviteToken={inviteToken}
          />
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href="https://www.semiosdesign.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-col items-center justify-center gap-2 text-center text-base font-semibold tracking-wide text-white transition hover:text-white/80"
          >
            <Image
              src="/images/semios-orange-icon-auth.png"
              alt="semi0s"
              width={40}
              height={40}
              className="h-8 w-8 rounded-sm"
            />
            <span>by semi0s</span>
          </a>
        </div>
      </section>
    </main>
  );
}
