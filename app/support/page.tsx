import Link from "next/link";
import type { Metadata } from "next";
import {
  getPublicSupportEmail,
  getSupportMailtoHref,
  PolicyBullets,
  PolicySection,
  PublicLegalShell
} from "@/components/PublicLegalPage";
import { getPublicLegalCopy } from "@/lib/public-legal-copy";
import { getPublicLegalAccentStyle } from "@/lib/public-legal-theme";

export const metadata: Metadata = {
  title: "Support | PICK-IT!",
  description: "PICK-IT! support, privacy, terms, report a problem, and account deletion help."
};

export default async function SupportPage({
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
  const pageCopy = copy.support;

  return (
    <PublicLegalShell
      eyebrow={pageCopy.eyebrow}
      title={pageCopy.title}
      intro={pageCopy.intro}
      routeKey="support"
      language={language}
      copy={copy.nav}
      accentStyle={accentStyle}
    >
      <PolicySection title={pageCopy.contactTitle}>
        <p>
          {pageCopy.contactPrefix}
          <a className="font-black text-accent underline-offset-4 hover:underline" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>
          {pageCopy.contactSuffix}
        </p>
        <a
          className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light"
          href={getSupportMailtoHref(pageCopy.reportProblemSubject)}
        >
          {pageCopy.reportProblem}
        </a>
      </PolicySection>

      <PolicySection title={pageCopy.helpfulLinksTitle}>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light"
            href={`/privacy?lang=${language}`}
          >
            {pageCopy.privacyPolicy}
          </Link>
          <Link
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light"
            href={`/terms?lang=${language}`}
          >
            {pageCopy.terms}
          </Link>
          <a
            className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-800 transition hover:border-accent hover:bg-accent-light"
            href={getSupportMailtoHref(pageCopy.accountDeletionSubject)}
          >
            {pageCopy.accountDeletionHelp}
          </a>
        </div>
      </PolicySection>

      <PolicySection title={pageCopy.deletionTitle}>
        <div id="account-deletion" />
        <PolicyBullets items={pageCopy.deletionItems} />
      </PolicySection>

      <PolicySection title={pageCopy.groupOwnershipTitle}>
        <p>{pageCopy.groupOwnershipText}</p>
      </PolicySection>
    </PublicLegalShell>
  );
}
