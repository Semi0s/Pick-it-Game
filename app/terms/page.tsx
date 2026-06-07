import type { Metadata } from "next";
import {
  getPublicSupportEmail,
  PolicyBullets,
  PolicySection,
  PUBLIC_TERMS_EFFECTIVE_DATE,
  PUBLIC_TERMS_VERSION,
  PublicLegalShell
} from "@/components/PublicLegalPage";
import { getPublicLegalCopy } from "@/lib/public-legal-copy";
import { getPublicLegalAccentStyle } from "@/lib/public-legal-theme";

export const metadata: Metadata = {
  title: "Terms / EULA | PICK-IT!",
  description: "PICK-IT! terms and EULA for the World Cup prediction game."
};

export default async function TermsPage({
  searchParams
}: {
  searchParams?: Promise<{ lang?: string | string[] }>;
}) {
  const supportEmail = getPublicSupportEmail();
  const [resolvedSearchParams, accentStyle] = await Promise.all([searchParams, getPublicLegalAccentStyle()]);
  const requestedLanguage = Array.isArray(resolvedSearchParams?.lang)
    ? resolvedSearchParams?.lang[0]
    : resolvedSearchParams?.lang;
  const { language, copy } = getPublicLegalCopy(requestedLanguage);
  const pageCopy = copy.terms;

  return (
    <PublicLegalShell
      eyebrow={pageCopy.eyebrow}
      title={pageCopy.title}
      intro={pageCopy.intro}
      routeKey="terms"
      language={language}
      copy={copy.nav}
      accentStyle={accentStyle}
    >
      <PolicySection title={pageCopy.effectiveTitle}>
        <p>{pageCopy.effectiveDateLabel}: {PUBLIC_TERMS_EFFECTIVE_DATE}</p>
        <p>{pageCopy.versionLabel}: {PUBLIC_TERMS_VERSION}</p>
        <p>{pageCopy.reacceptanceText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.noGamblingTitle}>
        <p>{pageCopy.noGamblingText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.scoringTitle}>
        <p>{pageCopy.scoringText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.acceptableUseTitle}>
        <PolicyBullets items={pageCopy.acceptableUseItems} />
      </PolicySection>

      <PolicySection title={pageCopy.moderationTitle}>
        <p>{pageCopy.moderationText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.responsibilityTitle}>
        <p>{pageCopy.responsibilityText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.availabilityTitle}>
        <p>{pageCopy.availabilityText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.supportTitle}>
        <p>
          {pageCopy.supportTextPrefix}
          <a className="font-black text-accent underline-offset-4 hover:underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          .
        </p>
      </PolicySection>
    </PublicLegalShell>
  );
}
