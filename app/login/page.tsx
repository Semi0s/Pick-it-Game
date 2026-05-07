import Image from "next/image";
import { LoginForm } from "@/components/LoginForm";

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

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
          />
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href="https://www.semiosdesign.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-col items-center gap-2 text-center text-xs font-normal tracking-wide text-gray-500 transition hover:text-accent-dark"
          >
            <span>Game Developed by semi0s</span>
            <Image
              src="/images/semios-orange-icon.png"
              alt="semi0s"
              width={24}
              height={24}
              className="h-5 w-5 rounded-sm"
            />
          </a>
        </div>
      </section>
    </main>
  );
}
