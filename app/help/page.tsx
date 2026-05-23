import { AppShell } from "@/components/AppShell";
import { redirectIfLaunchOnboardingRequired } from "@/lib/launch-onboarding-gate";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

const HELP_SECTIONS = [
  {
    title: "Start with Group Stage",
    bullets: [
      "Rank each group and pick the teams you believe will reach the Round of 32",
      "Set the top two finishers in every group",
      "Choose the qualifying third-place teams to finish the bracket",
      "You can keep editing until the tournament starts"
    ],
    tip: "Group Stage is the default launch path for regular players."
  },
  {
    title: "Group Stage Scoring",
    bullets: [
      "Each group is worth up to 14 points",
      "Correct winner: 5 points",
      "Correct runner-up: 3 points",
      "Correct third-place team: 2 points",
      "Correct top two teams in any order: 1 point",
      "Correct third-place qualification status: 1 point",
      "Correct complete group order: 2 points"
    ],
    tip: "Twelve groups at 14 points each gives Group Stage a 168-point max."
  },
  {
    title: "Projected Round of 32",
    bullets: [
      "Your Group Stage ladder creates a projected Round of 32 bracket",
      "Before official seeding, the projected side shows the teams your ladder sends forward",
      "Once official qualifiers are known, Round of 32 lets you compare your projected path with the real bracket",
      "After Round of 32, Knockout Stage uses the standard match-pick cards only"
    ],
    tip: "This is the bridge between Group Stage and Knockout Stage."
  },
  {
    title: "Knockout Stage Scoring",
    bullets: [
      "Knockout Stage opens once the official bracket is seeded",
      "You predict winners and scores match by match",
      "Round of 32: 3 winner + 5 Perfect Pick = 8",
      "Round of 16: 5 winner + 5 Perfect Pick = 10",
      "Quarterfinals: 8 winner + 5 Perfect Pick = 13",
      "Semifinals: 10 winner + 5 Perfect Pick = 15",
      "Third-place: 5 winner + 5 Perfect Pick = 10",
      "Final: 15 winner + 10 Perfect Pick = 25"
    ],
    tip: "Later rounds are worth more, so staying alive in Knockout matters."
  },
  {
    title: "Leaderboards",
    bullets: [
      "Group Stage Leaderboard compares ladder prediction scores",
      "Knockout Stage Leaderboard compares knockout match scores",
      "Global Top 10 is the compact prestige board",
      "Your group leaderboards still compare you directly with friends in each group"
    ]
  },
  {
    title: "Play in Groups",
    bullets: [
      "You can join one group or multiple groups",
      "Each group has its own leaderboard",
      "Invite friends and compete inside your own pool"
    ]
  },
  {
    title: "See Your Results",
    bullets: [
      "Check Group Stage, Knockout Stage, and Global leaderboard views",
      "Open the selector to move between Global, Managed, and Invited boards"
    ]
  },
  {
    title: "Your Profile",
    bullets: [
      "See your name, role, and home team",
      "Manage notifications and password settings"
    ]
  },
  {
    title: "Need Another Invite?",
    bullets: [
      "Didn’t get in properly? Try the invite link again",
      "Still stuck? Ask your group admin for a new invite"
    ]
  }
] as const;

const QUICK_TIPS = [
  "Finish your Group Stage ladder before tournament kickoff",
  "Use the projected Round of 32 to check who your ladder sends into Knockout",
  "Knockout Stage opens after official qualifiers are seeded",
  "Leaderboard chips and rows now reflect the current phase score",
  "Create and manage groups to build different pools"
] as const;

export default async function HelpPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    await redirectIfLaunchOnboardingRequired({ userId: user.id });
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-lg bg-gray-100 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Help</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">
            Welcome to PICK-IT! <span aria-hidden="true">⚽</span>
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
            Start with Group Stage, then keep playing through Knockout Stage and the leaderboards.
          </p>
        </section>

        <div className="space-y-3">
          {HELP_SECTIONS.map((section, index) => (
            <section key={section.title} className="rounded-lg border border-gray-200 bg-white p-4">
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
                  Tip: {section.tip}
                </p>
              ) : null}
            </section>
          ))}
        </div>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Quick Tips</p>
          <div className="mt-3 space-y-2">
            {QUICK_TIPS.map((tip) => (
              <p key={tip} className="text-sm font-semibold leading-6 text-gray-800">
                • {tip}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-lg bg-gray-100 p-4">
          <p className="text-sm font-semibold leading-6 text-gray-800">
            That’s it. Build your Group Stage first, then come back for Knockout Stage when the bracket is official. <span aria-hidden="true">⚽🔥</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
