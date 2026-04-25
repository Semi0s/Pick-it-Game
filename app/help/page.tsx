import { AppShell } from "@/components/AppShell";

const HELP_SECTIONS = [
  {
    title: "Get Started",
    bullets: [
      "Check your email for an invite",
      "Tap the link and finish signing up",
      "Log in and you’re ready to play"
    ],
    tip: "Always use the invite link. It connects you to your group automatically."
  },
  {
    title: "Make Your Picks",
    bullets: [
      "Predict the score for each match",
      "That’s it. No extra steps",
      "Your picks lock when the match starts"
    ]
  },
  {
    title: "How You Score Points",
    bullets: [
      "Correct winner or draw: +3 points",
      "Exact score: +8 points total",
      "Close with the right goal difference: +1 bonus point"
    ],
    tip: "The closer your prediction, the more you earn."
  },
  {
    title: "Compete with Friends",
    bullets: [
      "You can join one group or multiple groups",
      "Each group has its own leaderboard",
      "See how you rank against your friends"
    ]
  },
  {
    title: "See the Big Picture",
    bullets: [
      "Check the global leaderboard",
      "Compare your performance with all players"
    ]
  },
  {
    title: "Track Your Progress",
    bullets: [
      "View your past picks and results",
      "Watch your score grow over time",
      "Aim for the top spot"
    ]
  },
  {
    title: "Your Profile",
    bullets: [
      "See your name and role",
      "Keep track of your activity"
    ]
  },
  {
    title: "Need Help?",
    bullets: [
      "Didn’t get in properly? Try the invite link again",
      "Still stuck? Ask your group admin for a new invite"
    ]
  }
] as const;

const QUICK_TIPS = [
  "Make your picks before a match starts",
  "Knockout rounds and Trophies are coming soon",
  "Create and manage groups to create different pools"
] as const;

export default function HelpPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-lg bg-gray-100 p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Help</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-gray-950">
            Welcome to PICK-IT! <span aria-hidden="true">⚽</span>
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-gray-600">
            Predict match scores, compete with friends, and climb the leaderboard.
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
            That’s it. Simple, competitive, and fun. Now go make your picks <span aria-hidden="true">⚽🔥</span>
          </p>
        </section>
      </div>
    </AppShell>
  );
}
