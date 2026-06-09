import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CheckEmailClient } from "@/components/CheckEmailClient";
import { APP_LANGUAGE_COOKIE_KEY, normalizeLanguage } from "@/lib/i18n";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

function readSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function CheckEmailPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const cookieStore = await cookies();
  const language = normalizeLanguage(
    readSearchParam(resolvedSearchParams.lang) ?? cookieStore.get(APP_LANGUAGE_COOKIE_KEY)?.value
  );

  if (hasSupabaseConfig()) {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-4 py-8">
      <Image
        src="/images/signin-stadium.jpeg"
        alt=""
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-black/30" aria-hidden />
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-[19rem] flex-col justify-center">
        <CheckEmailClient language={language} />
      </section>
    </main>
  );
}
