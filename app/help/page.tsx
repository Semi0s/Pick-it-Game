import { AppShell } from "@/components/AppShell";
import { HelpOnboardingReplay } from "@/components/HelpOnboardingReplay";
import helpDe from "@/content/help/de.json";
import helpEn from "@/content/help/en.json";
import helpEs from "@/content/help/es.json";
import helpFr from "@/content/help/fr.json";
import helpPt from "@/content/help/pt.json";
import { normalizeLanguage, type AppLanguage } from "@/lib/i18n";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { t } from "@/lib/strings";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type HelpContent = typeof helpEn;

const HELP_CONTENT: Record<AppLanguage, HelpContent> = {
  en: helpEn,
  es: helpEs,
  fr: helpFr,
  pt: helpPt,
  de: helpDe
};

export default async function HelpPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let language: AppLanguage = "en";

  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
    const { data: profile } = await supabase
      .from("users")
      .select("preferred_language")
      .eq("id", user.id)
      .maybeSingle();
    language = normalizeLanguage((profile as { preferred_language?: string | null } | null)?.preferred_language);
  }

  const content = HELP_CONTENT[language] ?? HELP_CONTENT.en;

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-[1.15rem] bg-gray-100 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{t(language, "help.title")}</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">
            {t(language, "help.welcome")} <span aria-hidden="true">⚽</span>
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">{t(language, "help.intro")}</p>
        </section>

        <HelpOnboardingReplay language={language} />

        <div className="space-y-3">
          {content.sections.map((section, index) => (
            <section key={section.title} className="ui-card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {index + 1}. {section.title}
              </p>
              <div className="mt-3 space-y-2">
                {section.bullets.map((bullet) => (
                  <p key={bullet} className="text-sm font-semibold leading-6 text-gray-800">
                    • {bullet}
                  </p>
                ))}
              </div>
              {"tip" in section && section.tip ? (
                <p className="mt-3 rounded-md bg-accent-light px-3 py-2 text-sm font-semibold text-accent-dark">
                  {t(language, "help.tipPrefix", { tip: section.tip })}
                </p>
              ) : null}
            </section>
          ))}
        </div>

        <section className="ui-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{t(language, "help.quickTips")}</p>
          <div className="mt-3 space-y-2">
            {content.quickTips.map((tip) => (
              <p key={tip} className="text-sm font-semibold leading-6 text-gray-800">
                • {tip}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-[1.15rem] bg-gray-100 p-4">
          <p className="text-sm font-semibold leading-6 text-gray-800">
            {t(language, "help.closing")} <span aria-hidden="true">⚽🔥</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
