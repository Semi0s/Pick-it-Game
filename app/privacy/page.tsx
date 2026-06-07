import type { Metadata } from "next";
import {
  getPublicSupportEmail,
  InlineLegalLink,
  PolicyBullets,
  PolicySection,
  PUBLIC_PRIVACY_EFFECTIVE_DATE,
  PUBLIC_PRIVACY_VERSION,
  PublicLegalShell
} from "@/components/PublicLegalPage";
import { getPublicLegalCopy } from "@/lib/public-legal-copy";
import { getPublicLegalAccentStyle } from "@/lib/public-legal-theme";

export const metadata: Metadata = {
  title: "Privacy Policy | PICK-IT!",
  description: "PICK-IT! privacy policy for account, prediction, group, leaderboard, and notification data."
};

export default async function PrivacyPage({
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
  const pageCopy = copy.privacy;

  return (
    <PublicLegalShell
      eyebrow={pageCopy.eyebrow}
      title={pageCopy.title}
      intro={pageCopy.intro}
      routeKey="privacy"
      language={language}
      copy={copy.nav}
      accentStyle={accentStyle}
    >
      <PolicySection title={pageCopy.effectiveTitle}>
        <p>{pageCopy.effectiveDateLabel}: {PUBLIC_PRIVACY_EFFECTIVE_DATE}</p>
        <p>{pageCopy.versionLabel}: {PUBLIC_PRIVACY_VERSION}</p>
      </PolicySection>

      <PolicySection title={pageCopy.dataTitle}>
        <PolicyBullets items={pageCopy.dataItems} />
      </PolicySection>

      <PolicySection title={pageCopy.useTitle}>
        <PolicyBullets items={pageCopy.useItems} />
      </PolicySection>

      <PolicySection title={pageCopy.visibleTitle}>
        <PolicyBullets items={pageCopy.visibleItems} />
        <p>{pageCopy.privateDataText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.notificationsTitle}>
        <p>{pageCopy.notificationsText}</p>
      </PolicySection>

      <PolicySection title={pageCopy.deletionTitle}>
        <p>{pageCopy.deletionText}</p>
        <p>
          {pageCopy.deletionHelpPrefix}
          <InlineLegalLink href={`/support?lang=${language}#account-deletion`}>{pageCopy.deletionHelpLink}</InlineLegalLink>
          {pageCopy.deletionHelpSuffix}
        </p>
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
