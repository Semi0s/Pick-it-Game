import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { normalizeLanguage } from "@/lib/i18n";
import { t } from "@/lib/strings";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const language = normalizeLanguage(Array.isArray(resolvedSearchParams.lang) ? resolvedSearchParams.lang[0] : resolvedSearchParams.lang);

  return (
    <main className="min-h-screen min-h-[100dvh] bg-white px-4 py-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "auth.passwordResetTitle")}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">{t(language, "auth.setNewPassword")}</h1>
          <p className="mt-3 text-base leading-7 text-gray-600">
            {t(language, "auth.resetPasswordIntro")}
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <ResetPasswordForm />
        </div>
      </section>
    </main>
  );
}
