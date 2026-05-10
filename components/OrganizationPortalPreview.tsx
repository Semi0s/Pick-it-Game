import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";
import {
  ORGANIZATION_BACKGROUND_DEFAULT_SRC,
  ORGANIZATION_LOGO_DEFAULT_SRC
} from "@/lib/organization-branding";

type OrganizationPortalPreviewProps = {
  organizationName: string;
  welcomeHeadline: string;
  welcomeMessage: string;
  sponsorPrizeMessage?: string | null;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  mode?: "compact" | "full";
  previewLabel?: string | null;
};

export function OrganizationPortalPreview({
  organizationName,
  welcomeHeadline,
  welcomeMessage,
  sponsorPrizeMessage,
  logoUrl,
  backgroundUrl,
  mode = "compact",
  previewLabel
}: OrganizationPortalPreviewProps) {
  const isCompact = mode === "compact";

  return (
    <section className={`relative overflow-hidden rounded-lg border border-gray-200 ${isCompact ? "min-h-[18rem]" : "min-h-screen"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={backgroundUrl || ORGANIZATION_BACKGROUND_DEFAULT_SRC}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-neutral-950/45" aria-hidden />
      <div className={`relative z-10 flex h-full flex-col justify-between ${isCompact ? "p-4" : "min-h-screen p-6 sm:p-10"}`}>
        <div className="space-y-3">
          {previewLabel ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">{previewLabel}</p>
          ) : null}
          <div className={`rounded-lg border border-white/40 bg-white/90 ${isCompact ? "max-w-sm p-4" : "max-w-xl p-5 sm:p-6"}`}>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl || ORGANIZATION_LOGO_DEFAULT_SRC}
                alt={`${organizationName} logo`}
                className={`${isCompact ? "h-12 w-12" : "h-16 w-16"} rounded-md object-cover`}
              />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">{APP_NAME}</p>
                <h1 className={`${isCompact ? "text-xl" : "text-3xl"} font-black leading-tight text-gray-950`}>
                  {welcomeHeadline}
                </h1>
              </div>
            </div>
            <p className={`mt-4 ${isCompact ? "text-sm leading-6" : "text-base leading-7"} font-semibold text-gray-700`}>
              {welcomeMessage}
            </p>
            {sponsorPrizeMessage ? (
              <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">{sponsorPrizeMessage}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-md bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-700">
                {organizationName}
              </span>
              <span className="rounded-md bg-accent-light px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-dark">
                {APP_TAGLINE}
              </span>
            </div>
          </div>
        </div>

        {isCompact ? null : (
          <div className="pt-6">
            <div className="max-w-xl rounded-lg border border-white/35 bg-white/90 p-4">
              <p className="text-sm font-semibold leading-6 text-gray-700">
                Sign in to make picks, follow your leaderboard, and keep your group moving through the tournament.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex rounded-md bg-accent px-4 py-3 text-sm font-bold text-white transition hover:bg-accent-dark"
                >
                  Sign in
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 transition hover:border-accent hover:bg-accent-light"
                >
                  Create account
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
