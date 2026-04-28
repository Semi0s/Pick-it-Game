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
        <div className="mb-8">
          <div className="mx-auto mb-6 w-full max-w-72 sm:max-w-80">
            <Image
              src="/images/pickit-logo.png"
              alt="PICK-IT! Bracket Challenge World Cup 2026"
              width={648}
              height={649}
              priority
              className="h-auto w-full rounded-lg"
            />
          </div>
          <p className="mt-3 text-center text-base leading-7 text-gray-600">
            Sign in, make your group picks, and get ready for a friendly family table with real bragging rights.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <LoginForm
            confirmed={confirmed}
            reset={reset}
            initialMode={mode === "signup" ? "signup" : "login"}
            flow={flow}
            language={language}
            callbackError={callbackError}
            nextPath={next}
          />
        </div>
      </section>
    </main>
  );
}
