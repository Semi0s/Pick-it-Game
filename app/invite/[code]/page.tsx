import Image from "next/image";
import Link from "next/link";
import { PickItLogo } from "@/components/PickItLogo";
import { PromoInviteStateMessage, PromoManagerInviteClaimClient } from "@/components/PromoManagerInviteClaimClient";
import { fetchPromoManagerInvitePreviewAction } from "@/app/invite/[code]/actions";
import { normalizeLanguage } from "@/lib/i18n";
import { t } from "@/lib/strings";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export default async function PromoManagerInvitePage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ code }, rawSearchParams] = await Promise.all([
    params,
    searchParams ? searchParams : Promise.resolve({})
  ]);
  const resolvedSearchParams = rawSearchParams as Record<string, string | string[] | undefined>;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("preferred_language").eq("id", user.id).maybeSingle()
    : { data: null };
  const language = normalizeLanguage(
    (profile as { preferred_language?: string | null } | null)?.preferred_language ??
      (typeof resolvedSearchParams.lang === "string" ? resolvedSearchParams.lang : null)
  );
  const preview = await fetchPromoManagerInvitePreviewAction(code);
  const utm = {
    utm_source: getSearchParam(resolvedSearchParams.utm_source),
    utm_medium: getSearchParam(resolvedSearchParams.utm_medium),
    utm_campaign: getSearchParam(resolvedSearchParams.utm_campaign),
    utm_content: getSearchParam(resolvedSearchParams.utm_content)
  };
  const nextPath = buildInvitePath(code, resolvedSearchParams);
  const title = preview.invite?.publicTitle || t(language, "promoInvite.defaultTitle");
  const description = preview.invite?.publicDescription || t(language, "promoInvite.defaultDescription");

  return (
    <main className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-neutral-950 px-4 py-8">
      <Image
        src="/images/signin-stadium.jpeg"
        alt=""
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0 bg-black/35" aria-hidden />
      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] min-h-[calc(100dvh-4rem)] max-w-[22rem] flex-col justify-center">
        <div className="rounded-lg border border-white/60 bg-white/90 p-4 shadow-2xl shadow-black/25 backdrop-blur">
          <div className="mx-auto mb-6 max-w-[16rem]">
            <PickItLogo
              alt="PICK-IT! World Cup 2026"
              sizes="256px"
              priority
              className="mx-auto w-full max-w-[14rem]"
              imageClassName="object-contain"
            />
          </div>

          <div className="space-y-4 text-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-accent-dark">
                {t(language, "promoInvite.eyebrow")}
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">{title}</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">{description}</p>
            </div>

            {!preview.ok ? (
              <PromoInviteStateMessage language={language} reason={preview.reason} />
            ) : user ? (
              <PromoManagerInviteClaimClient code={code} language={language} utm={utm} />
            ) : (
              <div className="space-y-3">
                <PromoInviteStateMessage language={language} reason="auth_required" />
                <Link
                  href={`/login?mode=signup&flow=promo-manager&promoCode=${encodeURIComponent(code)}&next=${encodeURIComponent(nextPath)}&lang=${language}`}
                  className="inline-flex w-full items-center justify-center rounded-md bg-orange-500 px-4 py-3 text-base font-bold text-white transition hover:bg-orange-500/95"
                >
                  {t(language, "promoInvite.createAccountToClaim")}
                </Link>
                <Link
                  href={`/login?mode=login&flow=promo-manager&next=${encodeURIComponent(nextPath)}&lang=${language}`}
                  className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  {t(language, "promoInvite.signInToClaim")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function buildInvitePath(code: string, searchParams: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "lang"]) {
    const value = getSearchParam(searchParams[key]);
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return `/invite/${encodeURIComponent(code)}${query ? `?${query}` : ""}`;
}
