"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type SVGProps, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { savePlayerStartModeAction } from "@/app/start-playing/actions";
import { showAppToast } from "@/lib/app-toast";

type StepVisual = "group-stage" | "third-place" | "knockout" | "leaderboard" | "groups";
type TutorialIcon = ComponentType<SVGProps<SVGSVGElement>>;

type OnboardingStep = {
  title: string;
  body: string;
  note?: string;
  icon: TutorialIcon;
  visual: StepVisual;
};

const SWIPE_THRESHOLD_PX = 40;

export function StartPlayingChoiceClient() {
  const router = useRouter();
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [animationEpoch, setAnimationEpoch] = useState(0);
  const [stepOpenEpoch, setStepOpenEpoch] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const lastAnimationRestartRef = useRef(0);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        title: "Group Stage predictions",
        body: "Start by predicting which teams will qualify to the Knockout Stage. Guess the order and earn more points the more accurate your prediction.",
        icon: GroupStagePredictionsIcon,
        visual: "group-stage"
      },
      {
        title: "Keep editing until the World Cup starts",
        body: "Predictions lock June 11 when the tournament starts. Final results for the Group Stage after June 27.",
        icon: TrophyBadgeIcon,
        visual: "third-place"
      },
      {
        title: "Predict every match during Knockout Stage",
        body: "Predict who wins and the final scores* and you can earn big.",
        note: "*Penalty shoot-outs excluded",
        icon: KnockoutScoreIcon,
        visual: "knockout"
      },
      {
        title: "Visit the Leaderboards",
        body: "See how you rank against everyone else and interact with players in real time during a live match.",
        icon: LeaderboardPodiumIcon,
        visual: "leaderboard"
      },
      {
        title: "Make your own group",
        body: "As a player you compete with everyone else but if you are a Manager you can make your own private groups to compare easily.",
        icon: MyGroupsFlagIcon,
        visual: "groups"
      }
    ],
    []
  );

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  async function handleStartGroupPhase() {
    setIsSavingMode(true);
    const result = await savePlayerStartModeAction("easy_bracket");
    setIsSavingMode(false);

    if (!result.ok) {
      showAppToast({ tone: "error", text: result.message });
      return;
    }

    router.push("/bracket-builder?onboarding=1");
  }

  function goToStep(nextIndex: number) {
    const clampedIndex = Math.max(0, Math.min(steps.length - 1, nextIndex));
    if (clampedIndex === stepIndex) {
      return;
    }

    setStepIndex(clampedIndex);
    setStepOpenEpoch((value) => value + 1);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    touchStartXRef.current = touch ? touch.clientX : null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (!touch || startX === null) {
      return;
    }

    const deltaX = touch.clientX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) {
      return;
    }

    goToStep(stepIndex + (deltaX < 0 ? 1 : -1));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToStep(stepIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToStep(stepIndex + 1);
    }
  }

  useEffect(() => {
    function restartAnimations() {
      const now = Date.now();
      if (now - lastAnimationRestartRef.current < 150) {
        return;
      }

      lastAnimationRestartRef.current = now;
      setAnimationEpoch((value) => value + 1);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }

      restartAnimations();
    }

    function handleWindowFocus() {
      restartAnimations();
    }

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pageshow", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pageshow", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <section className="mx-auto max-w-3xl space-y-4">
      <OnboardingIntroCard />

      <div
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.02)] sm:p-5"
        role="region"
        aria-roledescription="carousel"
        aria-label="PICK-IT onboarding tutorial"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="overflow-hidden">
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${stepIndex * 100}%)` }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {steps.map((item, index) => {
              const ItemIcon = item.icon;
              return (
                <article
                  key={item.title}
                  className="w-full shrink-0 px-0.5"
                  aria-hidden={index !== stepIndex}
                  aria-label={`${index + 1} of ${steps.length}: ${item.title}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#50aa5f] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                      <ItemIcon className="h-[30px] w-[30px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[1.45rem] font-black leading-[1.08] text-gray-950 sm:text-[1.65rem]">
                        {item.title}
                      </h2>
                      <p className="mt-2 text-sm font-normal leading-6 text-gray-600">{item.body}</p>
                      {item.note ? <p className="mt-1 text-xs font-normal leading-5 text-gray-500">{item.note}</p> : null}
                    </div>
                  </div>

                  <div className="mt-4">
                    <TutorialHelperStage
                      visual={item.visual}
                      animationEpoch={animationEpoch}
                      playbackEpoch={index === stepIndex ? stepOpenEpoch : 0}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {!isLastStep ? (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToStep(stepIndex - 1)}
              disabled={isFirstStep}
              aria-label="Go to previous onboarding step"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <p className="min-w-[3.5rem] text-center text-xs font-black uppercase tracking-[0.14em] text-gray-400" aria-live="polite">
              {stepIndex + 1} / {steps.length}
            </p>
            <button
              type="button"
              onClick={() => goToStep(stepIndex + 1)}
              aria-label="Go to next onboarding step"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
            >
              Next
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-center text-xs font-black uppercase tracking-[0.14em] text-gray-400" aria-live="polite">
              {stepIndex + 1} / {steps.length}
            </p>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_auto_1fr]">
              <button
                type="button"
                onClick={() => goToStep(stepIndex - 1)}
                aria-label="Go to previous onboarding step"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                aria-label="Go home"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-accent hover:bg-accent-light"
              >
                Home
              </button>
              <button
                type="button"
                disabled={isSavingMode}
                onClick={() => {
                  void handleStartGroupPhase();
                }}
                aria-label="Start Group Stage"
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-black text-white transition hover:bg-accent/95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingMode ? "Opening..." : "Start"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function OnboardingIntroCard() {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">WELCOME TO PIK•IT!</p>
      <h1 className="mt-2 text-[2rem] font-black leading-[1.05] text-gray-950 sm:text-[2.45rem]">
        Predict the 2026 World Cup winner.
      </h1>
      <p className="mt-3 text-sm font-normal leading-6 text-gray-600">Earn points, compete and have fun!</p>
    </section>
  );
}

function GroupStagePredictionsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M7 9h2.5" />
      <path d="M7 12h2.5" />
      <path d="M7 15h2.5" />
      <path d="M11.5 9h5" />
      <path d="M11.5 12h5" />
      <path d="M11.5 15h5" />
      <path d="m15.6 7.4 1.8 1.6-1.8 1.6" />
      <path d="m15.6 13.4 1.8 1.6-1.8 1.6" />
    </svg>
  );
}

function TrophyBadgeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4.5h6v2.7a3 3 0 0 1-3 3 3 3 0 0 1-3-3Z" />
      <path d="M9 5H6.5A2.5 2.5 0 0 0 9 8.5" />
      <path d="M15 5h2.5A2.5 2.5 0 0 1 15 8.5" />
      <path d="M12 10.2v3.3" />
      <path d="M9.3 17.3h5.4" />
      <path d="M10 13.5h4v3.8h-4z" />
      <path d="M7.2 19.2h9.6" />
    </svg>
  );
}

function KnockoutScoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3.5" y="4.5" width="17" height="10" rx="2.5" />
      <path d="M9 14.5v4" />
      <path d="M15 14.5v4" />
      <path d="M6.5 18.5h11" />
      <path d="M7.2 10h2.4" />
      <path d="M14.4 10h2.4" />
      <path d="M10.9 10H13" />
      <path d="M8.4 8v4" />
      <path d="M15.6 8v4" />
    </svg>
  );
}

function LeaderboardPodiumIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 3.7h4" />
      <path d="M10.4 3.7v2.2A1.7 1.7 0 0 0 12 7.5a1.7 1.7 0 0 0 1.6-1.6V3.7" />
      <path d="M8.7 3.8H7.2a2.1 2.1 0 0 0 2.2 2.7" />
      <path d="M15.3 3.8h1.5A2.1 2.1 0 0 1 14.6 6.5" />
      <path d="M11.1 8.1h1.8v2h-1.8z" />
      <path d="M4 18.7v-3.2A1.5 1.5 0 0 1 5.5 14H10v4.7Z" />
      <path d="M10 18.7V11.8h4v6.9" />
      <path d="M14 18.7V14h4.5a1.5 1.5 0 0 1 1.5 1.5v3.2Z" />
      <path d="M4 18.7h16" />
    </svg>
  );
}

function MyGroupsFlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="6.2" cy="10.2" r="1.6" />
      <circle cx="12" cy="11" r="1.9" />
      <circle cx="17.8" cy="10.2" r="1.6" />
      <path d="M4.8 18.8v-2a2 2 0 0 1 2-2h.7" />
      <path d="M9.2 18.8v-2.3A2.4 2.4 0 0 1 11.6 14h.8a2.4 2.4 0 0 1 2.4 2.5v2.3" />
      <path d="M16.5 14.8h.7a2 2 0 0 1 2 2v2" />
      <path d="M10.5 4.2v5" />
      <path d="M10.6 4.6c1.8-.8 3.1-.8 4.8-.2l-.2 2.8c-1.5-.6-2.9-.5-4.5.2Z" />
    </svg>
  );
}

function TutorialHelperStage({
  visual,
  animationEpoch,
  playbackEpoch
}: {
  visual: StepVisual;
  animationEpoch: number;
  playbackEpoch: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
      <div key={`${visual}-${animationEpoch}-${playbackEpoch}`} className="flex h-[316px] items-center justify-center sm:h-[338px]">
        {visual === "group-stage" ? <GroupStageHelperMock /> : null}
        {visual === "third-place" ? <ThirdPlaceHelperMock /> : null}
        {visual === "knockout" ? <KnockoutHelperMock /> : null}
        {visual === "leaderboard" ? <LeaderboardHelperMock /> : null}
        {visual === "groups" ? <GroupsHelperMock /> : null}
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/92 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-500 shadow-sm animate-pulse">
        <ArrowLeftRight className="h-3 w-3" />
        Swipe
      </div>
    </div>
  );
}

function MockPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[170px] rounded-[22px] border border-gray-300 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-gray-200" />
      <div className="min-h-[238px] rounded-[16px] border border-gray-100 bg-gray-50 px-2 py-2">{children}</div>
    </div>
  );
}

function GroupStageHelperMock() {
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <MockPhoneFrame>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-dark">Group A</p>
        <div className="relative mt-2 h-[106px]">
          {["1st", "2nd", "3rd", "4th"].map((rank, index) => (
            <div
              key={rank}
              className="absolute left-0 right-0 flex items-center justify-between rounded-lg border border-transparent px-1.5 py-1"
              style={{ top: `${index * 28}px` }}
            >
              <span className="text-[10px] font-bold text-gray-400">{rank}</span>
            </div>
          ))}

          <div className="gs-team gs-team-x absolute left-10 right-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-black text-gray-700">
            TEAM X
          </div>
          <div className="gs-team gs-team-y absolute left-10 right-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-black text-gray-700">
            TEAM Y
          </div>
          <div className="gs-team absolute left-10 right-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-black text-gray-700" style={{ top: "56px" }}>
            TEAM Z
          </div>
          <div className="gs-team absolute left-10 right-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-black text-gray-700" style={{ top: "84px" }}>
            TEAM L
          </div>

          <span className="gs-hand pointer-events-none absolute -right-1 top-3 z-20 inline-flex h-12 w-12 items-center justify-center text-gray-400" aria-hidden>
            <MiniHandTapIcon className="h-12 w-12" />
          </span>
        </div>
        <style jsx>{`
          .gs-team {
            top: 0;
          }

          .gs-team-x {
            animation: gs-team-x 8.6s ease-in-out infinite;
          }

          .gs-team-y {
            top: 28px;
            animation: gs-team-y 8.6s ease-in-out infinite;
          }

          .gs-hand {
            animation: gs-hand 8.6s linear infinite;
            transform-origin: 12% 12%;
          }

          @keyframes gs-team-x {
            0%,
            18% {
              transform: translateY(0);
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
            24% {
              transform: translateY(10px);
            }
            32%,
            80% {
              transform: translateY(28px);
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
            88%,
            100% {
              transform: translateY(0);
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
          }

          @keyframes gs-team-y {
            0%,
            12% {
              transform: translateY(0);
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
            18% {
              transform: translateY(0);
              background: #ecfdf3;
              border-color: #86efac;
              color: #166534;
            }
            32%,
            80% {
              transform: translateY(-28px);
              background: #ecfdf3;
              border-color: #86efac;
              color: #166534;
            }
            88%,
            100% {
              transform: translateY(0);
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
          }

          @keyframes gs-hand {
            0% {
              transform: translate(82px, 28px);
              opacity: 0;
            }
            8% {
              transform: translate(62px, 22px);
              opacity: 0.45;
            }
            16% {
              transform: translate(18px, 18px);
              opacity: 1;
            }
            20% {
              transform: translate(6px, 22px) scale(0.93);
              opacity: 1;
            }
            26% {
              transform: translate(-2px, 4px);
              opacity: 1;
            }
            32% {
              transform: translate(-6px, -24px) scale(0.94);
              opacity: 1;
            }
            40% {
              transform: translate(4px, -18px);
              opacity: 0.98;
            }
            54%,
            80% {
              transform: translate(16px, -8px);
              opacity: 0;
            }
            88%,
            100% {
              transform: translate(82px, 28px);
              opacity: 0;
            }
          }
        `}</style>
      </MockPhoneFrame>
    </div>
  );
}

function ThirdPlaceHelperMock() {
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <MockPhoneFrame>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-dark">Pick 3rd Place</p>
        <div className="relative mt-2 space-y-1.5">
          {["Group A 3rd", "Group C 3rd", "Group F 3rd", "Group H 3rd"].map((item, index) => (
            <div
              key={item}
              className={`tp-row flex items-center justify-between rounded-lg border px-2 py-1 ${
                index < 2 ? "border-emerald-200 bg-emerald-50" : "border-gray-200 bg-white"
              } ${index === 2 ? "tp-row-three" : index === 3 ? "tp-row-four" : ""}`}
            >
              <span className="text-[10px] font-black text-gray-700">{item}</span>
              <span className={`text-[10px] font-bold text-gray-400 ${index === 2 ? "tp-slot-three" : index === 3 ? "tp-slot-four" : ""}`}>
                #{index + 1}
              </span>
            </div>
          ))}
          <span className="tp-hand pointer-events-none absolute -right-1 top-6 z-20 inline-flex h-12 w-12 items-center justify-center text-gray-400" aria-hidden>
            <MiniHandTapIcon className="h-12 w-12" />
          </span>
        </div>
        <div className="tp-finish mt-2 rounded-lg bg-accent px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wide text-white">
          Finish Bracket
        </div>
        <style jsx>{`
          .tp-row-three,
          .tp-row-four,
          .tp-slot-three,
          .tp-slot-four,
          .tp-finish,
          .tp-hand {
            animation-duration: 8.8s;
            animation-iteration-count: infinite;
          }

          .tp-row-three,
          .tp-row-four {
            animation-timing-function: ease-in-out;
          }

          .tp-slot-three,
          .tp-slot-four {
            animation-timing-function: steps(1, end);
          }

          .tp-row-three {
            animation-name: tp-row-three;
          }

          .tp-row-four {
            animation-name: tp-row-four;
          }

          .tp-slot-three {
            animation-name: tp-slot-three;
          }

          .tp-slot-four {
            animation-name: tp-slot-four;
          }

          .tp-finish {
            animation-name: tp-finish;
            animation-timing-function: ease-in-out;
          }

          .tp-hand {
            animation-name: tp-hand;
            animation-timing-function: linear;
            transform-origin: 12% 12%;
          }

          @keyframes tp-row-three {
            0%,
            24%,
            90%,
            100% {
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
            30%,
            82% {
              background: #ecfdf3;
              border-color: #86efac;
              color: #166534;
            }
          }

          @keyframes tp-row-four {
            0%,
            44%,
            90%,
            100% {
              background: #ffffff;
              border-color: #e5e7eb;
              color: #374151;
            }
            50%,
            82% {
              background: #ecfdf3;
              border-color: #86efac;
              color: #166534;
            }
          }

          @keyframes tp-slot-three {
            0%,
            24% {
              opacity: 0.24;
            }
            25%,
            82% {
              opacity: 1;
            }
            90%,
            100% {
              opacity: 0.24;
            }
          }

          @keyframes tp-slot-four {
            0%,
            44% {
              opacity: 0.24;
            }
            45%,
            82% {
              opacity: 1;
            }
            90%,
            100% {
              opacity: 0.24;
            }
          }

          @keyframes tp-finish {
            0%,
            60%,
            100% {
              transform: scale(1);
              filter: brightness(1);
            }
            66% {
              transform: scale(0.97);
              filter: brightness(1.08);
            }
            70% {
              transform: scale(1.03);
              filter: brightness(1.14);
            }
          }

          @keyframes tp-hand {
            0% {
              transform: translate(82px, 24px);
              opacity: 0;
            }
            10% {
              transform: translate(56px, 18px);
              opacity: 0.6;
            }
            22% {
              transform: translate(10px, 48px);
              opacity: 1;
            }
            26% {
              transform: translate(0, 42px) scale(0.93);
              opacity: 1;
            }
            34% {
              transform: translate(6px, 60px);
              opacity: 0.98;
            }
            46% {
              transform: translate(8px, 70px);
              opacity: 1;
            }
            50% {
              transform: translate(0, 72px) scale(0.93);
              opacity: 1;
            }
            60% {
              transform: translate(12px, 90px);
              opacity: 0.98;
            }
            68% {
              transform: translate(0, 100px) scale(0.93);
              opacity: 1;
            }
            74%,
            82% {
              transform: translate(10px, 108px);
              opacity: 0;
            }
            90%,
            100% {
              transform: translate(82px, 24px);
              opacity: 0;
            }
          }
        `}</style>
      </MockPhoneFrame>
    </div>
  );
}

function KnockoutHelperMock() {
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <MockPhoneFrame>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-dark">Knockout</p>
        <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-center">
            <div className="mx-auto grid w-fit grid-cols-[auto_1fr] items-center gap-1">
              <div className="flex flex-col items-center justify-center gap-0.5 text-[7px] font-black leading-none text-gray-300">
                <span>▲</span>
                <span>▼</span>
              </div>
              <div className="text-xl font-black leading-none text-gray-800">0</div>
            </div>
          </div>
          <div className="text-[10px] font-black uppercase tracking-wide text-gray-400">v.</div>
          <div className="ko-team-b rounded-xl border border-gray-200 bg-white px-2 py-2 text-center">
            <div className="mx-auto grid w-fit grid-cols-[1fr_auto] items-center gap-1">
              <div className="relative h-[20px] overflow-hidden text-xl font-black leading-none text-gray-800">
                <div className="ko-score-roll">
                  <div>0</div>
                  <div>1</div>
                  <div>2</div>
                </div>
              </div>
              <div className="ko-team-b-arrows flex flex-col items-center justify-center gap-0.5 text-[7px] font-black leading-none text-gray-300">
                <span>▲</span>
                <span>▼</span>
              </div>
            </div>
          </div>
          <span className="ko-hand pointer-events-none absolute -right-1 top-2 z-20 inline-flex h-12 w-12 items-center justify-center text-gray-400" aria-hidden>
            <MiniHandTapIcon className="h-12 w-12" />
          </span>
        </div>
        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[10px] font-black text-gray-600">
          <div className="text-center">TEAM A</div>
          <div className="text-center text-gray-300"> </div>
          <div className="text-center">TEAM B</div>
        </div>
        <style jsx>{`
          .ko-score-roll,
          .ko-team-b,
          .ko-team-b-arrows,
          .ko-hand {
            animation-duration: 8.6s;
            animation-iteration-count: infinite;
          }

          .ko-score-roll {
            animation-name: ko-score-roll;
            animation-timing-function: ease-in-out;
          }

          .ko-team-b {
            animation-name: ko-team-b;
            animation-timing-function: ease-in-out;
          }

          .ko-team-b-arrows {
            animation-name: ko-team-b-arrows;
            animation-timing-function: ease-in-out;
          }

          .ko-hand {
            animation-name: ko-hand;
            animation-timing-function: linear;
            transform-origin: 12% 12%;
          }

          @keyframes ko-score-roll {
            0%,
            18% {
              transform: translateY(0);
            }
            26%,
            34% {
              transform: translateY(-20px);
            }
            42%,
            80% {
              transform: translateY(-40px);
            }
            88%,
            100% {
              transform: translateY(0);
            }
          }

          @keyframes ko-team-b {
            0%,
            18%,
            88%,
            100% {
              border-color: #e5e7eb;
              background: #ffffff;
            }
            24%,
            80% {
              border-color: #86efac;
              background: #ecfdf3;
            }
          }

          @keyframes ko-team-b-arrows {
            0%,
            18%,
            88%,
            100% {
              color: #d1d5db;
            }
            24%,
            80% {
              color: #16a34a;
            }
          }

          @keyframes ko-hand {
            0% {
              transform: translate(82px, 18px);
              opacity: 0;
            }
            10% {
              transform: translate(58px, 14px);
              opacity: 0.55;
            }
            22% {
              transform: translate(18px, 10px);
              opacity: 1;
            }
            26% {
              transform: translate(0, 6px) scale(0.93);
              opacity: 1;
            }
            34% {
              transform: translate(8px, 6px);
              opacity: 0.98;
            }
            42% {
              transform: translate(0, 6px) scale(0.93);
              opacity: 1;
            }
            56% {
              transform: translate(14px, 10px);
              opacity: 0.95;
            }
            68%,
            80% {
              transform: translate(30px, 14px);
              opacity: 0;
            }
            88%,
            100% {
              transform: translate(82px, 18px);
              opacity: 0;
            }
          }
        `}</style>
      </MockPhoneFrame>
    </div>
  );
}

function LeaderboardHelperMock() {
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <MockPhoneFrame>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-dark">Leaderboard</p>
        <div className="relative mt-2 space-y-1">
          {["PLAYER A", "PLAYER B", "PLAYER C", "PLAYER D", "PLAYER E", "PLAYER F", "PLAYER G"].map((name, index) => (
            <div key={name} className="relative flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1">
              <span className="w-6 text-[10px] font-bold text-gray-400">#{index + 1}</span>
              <span className="flex-1 text-left text-[10px] font-black text-gray-700">{name}</span>
              <span
                className={`inline-flex h-4 w-4 items-center justify-center text-gray-300 ${
                  index === 0 ? "leaderboard-target-a" : index === 3 ? "leaderboard-target-d" : ""
                }`}
                aria-hidden
              >
                <MiniOutlineTrophyIcon className="h-4 w-4" />
              </span>
            </div>
          ))}
          <span
            className="leaderboard-hand-tap pointer-events-none absolute -right-1 top-2 z-20 inline-flex h-12 w-12 items-center justify-center text-gray-400"
            aria-hidden
          >
            <MiniHandTapIcon className="h-12 w-12" />
          </span>
        </div>
        <style jsx>{`
          .leaderboard-target-a,
          .leaderboard-target-d {
            transform-origin: center;
            animation-duration: 9s;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
          }

          .leaderboard-target-a {
            animation-name: leaderboard-target-a;
          }

          .leaderboard-target-d {
            animation-name: leaderboard-target-d;
          }

          .leaderboard-hand-tap {
            animation: leaderboard-hand-tap 9s linear infinite;
            transform-origin: 12% 12%;
          }

          @keyframes leaderboard-target-a {
            0%,
            14% {
              color: #d1d5db;
              transform: scale(1);
              opacity: 0.9;
            }
            18% {
              color: #f4c84d;
              transform: scale(1.22);
              opacity: 1;
            }
            21% {
              color: #f4c84d;
              transform: scale(0.96);
              opacity: 1;
            }
            24%,
            82% {
              color: #f4c84d;
              transform: scale(1);
              opacity: 1;
            }
            90%,
            100% {
              color: #d1d5db;
              transform: scale(1);
              opacity: 0.9;
            }
          }

          @keyframes leaderboard-target-d {
            0%,
            56% {
              color: #d1d5db;
              transform: scale(1);
              opacity: 0.9;
            }
            61% {
              color: #f4c84d;
              transform: scale(1.22);
              opacity: 1;
            }
            64% {
              color: #f4c84d;
              transform: scale(0.96);
              opacity: 1;
            }
            67%,
            82% {
              color: #f4c84d;
              transform: scale(1);
              opacity: 1;
            }
            90%,
            100% {
              color: #d1d5db;
              transform: scale(1);
              opacity: 0.9;
            }
          }

          @keyframes leaderboard-hand-tap {
            0% {
              transform: translate(92px, 40px) scale(1);
              opacity: 0;
            }
            5% {
              transform: translate(78px, 34px) scale(1);
              opacity: 0.25;
            }
            10% {
              transform: translate(58px, 24px) scale(1);
              opacity: 0.65;
            }
            15% {
              transform: translate(28px, 10px) scale(1);
              opacity: 1;
            }
            19% {
              transform: translate(8px, 2px) scale(1);
              opacity: 1;
            }
            22% {
              transform: translate(0, 0) scale(0.92);
              opacity: 1;
            }
            25% {
              transform: translate(4px, 2px) scale(1);
              opacity: 0.96;
            }
            37% {
              transform: translate(4px, 12px) scale(1);
              opacity: 0.98;
            }
            48% {
              transform: translate(4px, 34px) scale(1);
              opacity: 1;
            }
            58% {
              transform: translate(6px, 62px) scale(1);
              opacity: 1;
            }
            61% {
              transform: translate(4px, 78px) scale(0.92);
              opacity: 1;
            }
            65% {
              transform: translate(7px, 77px) scale(1);
              opacity: 0.94;
            }
            69%,
            82% {
              transform: translate(16px, 84px) scale(1);
              opacity: 0;
            }
            90%,
            100% {
              transform: translate(92px, 40px) scale(1);
              opacity: 0;
            }
          }
        `}</style>
      </MockPhoneFrame>
    </div>
  );
}

function MiniOutlineTrophyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 4.5h6v2.7a3 3 0 0 1-3 3 3 3 0 0 1-3-3Z" />
      <path d="M9 5H6.5A2.5 2.5 0 0 0 9 8.5" />
      <path d="M15 5h2.5A2.5 2.5 0 0 1 15 8.5" />
      <path d="M12 10.2v3.3" />
      <path d="M10 13.5h4v3.8h-4z" />
      <path d="M7.2 19.2h9.6" />
    </svg>
  );
}

function MiniHandTapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 56.86 79.34" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        fill="#ffffff"
        d="M6.46,33.24c-1.17,0-2.46.49-3.13,1.18-1.09,1.14-1.27,3.34-.39,4.91l6.45,11.58c2.39,4.28,5.32,8.13,8.16,11.86,1,1.31,2,2.62,2.98,3.96,1.14,1.54,1.16,3.6,1.18,5.77.02,1.29.03,2.62.29,3.88l.12.58,25.15.02.28-9.49c.41-.62,1.16-1.27,1.89-1.9.63-.55,1.29-1.11,1.77-1.71,2.15-2.63,3.32-6.39,3.29-10.6l-.08-15.47c0-1.61-1.39-3.34-2.57-3.75-.41-.14-.9-.17-1.25-.17-.52,0-2.26.08-2.84,1.07l-.09.15-.17,4.19c-.03.69-.56,1.28-1.16,1.29-.5,0-1.17-.62-1.17-1.25l-.02-6.59c0-1.44-1.38-2.97-2.38-3.53-.44-.25-1.06-.3-1.5-.3-1.21,0-2.7.38-2.88,1.45-.15,1.24-.19,2.29-.23,3.39l-.04,1.04c-.02.47-.66,1-1.21,1-.04,0-.07,0-.11,0-.41-.07-.97-.72-.98-1.28l-.1-6.65c-.02-1.52-1.56-3.04-2.66-3.46-.26-.1-.6-.15-.99-.15-1.17,0-2.94.45-3.01,1.67l-.25,4.41c-.02.27-.71.87-1.21.87-.36-.03-1.08-.69-1.08-1.15l-.05-23.68c0-2.29-1.64-4.02-3.81-4.02-2.27,0-3.83,1.67-3.83,4.04l.06,30.03c0,5.88-.87,7.19-1.61,7.26h0c-.3,0-1-.35-1.23-.66l-.26-.36c-2.3-3.11-4.47-6.04-7.21-8.68-.53-.51-1.28-.78-2.16-.78Z"
      />
      <path
        fill="#939598"
        d="M20.94,79.34c-1.37,0-1.52-1.61-1.52-5.04,0-2.11,0-4.51-.78-6.34l-.04-.1-.07-.08c-3.67-4.42-7.89-9.78-11.41-16.09L.93,40.61c-1.03-1.84-1.22-4.29-.49-6.09.93-2.28,3.23-3.35,4.91-3.57.29-.04.58-.06.87-.06,1.92,0,3.7.82,5.03,2.3l5.26,5.89.02-33.32c0-3.45,3.18-5.77,6.14-5.77.09,0,.18,0,.27,0,3.42.17,5.92,2.87,5.94,6.44l.07,15.97.9-.25c.66-.18,1.32-.27,1.96-.27,2.79,0,5.05,1.69,6.04,4.53l.23.66.67-.21c.75-.24,1.51-.36,2.25-.36,2.88,0,5.31,1.83,6.35,4.77l.2.57.59-.09c.67-.11,1.56-.23,2.43-.23,1.4,0,2.49.31,3.42.98,1.32.95,2.73,2.95,2.75,4.78l.13,16.33c.04,4.6-1.69,11.14-6.67,14.46l-.31.21-.18,9.86c-.01.59-.64,1.21-1.23,1.21h-27.54ZM6.46,33.24c-1.17,0-2.46.49-3.13,1.18-1.09,1.14-1.27,3.34-.39,4.91l6.45,11.58c2.39,4.28,5.32,8.13,8.16,11.86,1,1.31,2,2.62,2.98,3.96,1.14,1.54,1.16,3.6,1.18,5.77.02,1.29.03,2.62.29,3.88l.12.58,25.15.02.28-9.49c.41-.62,1.16-1.27,1.89-1.9.63-.55,1.29-1.11,1.77-1.71,2.15-2.63,3.32-6.39,3.29-10.6l-.08-15.47c0-1.61-1.39-3.34-2.57-3.75-.41-.14-.9-.17-1.25-.17-.52,0-2.26.08-2.84,1.07l-.09.15-.17,4.19c-.03.69-.56,1.28-1.16,1.29-.5,0-1.17-.62-1.17-1.25l-.02-6.59c0-1.44-1.38-2.97-2.38-3.53-.44-.25-1.06-.3-1.5-.3-1.21,0-2.7.38-2.88,1.45-.15,1.24-.19,2.29-.23,3.39l-.04,1.04c-.02.47-.66,1-1.21,1-.04,0-.07,0-.11,0-.41-.07-.97-.72-.98-1.28l-.1-6.65c-.02-1.52-1.56-3.04-2.66-3.46-.26-.1-.6-.15-.99-.15-1.17,0-2.94.45-3.01,1.67l-.25,4.41c-.02.27-.71.87-1.21.87-.36-.03-1.08-.69-1.08-1.15l-.05-23.68c0-2.29-1.64-4.02-3.81-4.02-2.27,0-3.83,1.67-3.83,4.04l.06,30.03c0,5.88-.87,7.19-1.61,7.26h0c-.3,0-1-.35-1.23-.66l-.26-.36c-2.3-3.11-4.47-6.04-7.21-8.68-.53-.51-1.28-.78-2.16-.78Z"
      />
    </svg>
  );
}

function GroupsHelperMock() {
  return (
    <div className="flex w-full items-center justify-center gap-3">
      <MockPhoneFrame>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-accent-dark">My Groups</p>
        <div className="mt-2 rounded-lg border border-gray-200 bg-white px-2 py-1">
          <p className="text-[10px] font-black text-gray-700">1. The Family</p>
        </div>
        <div className="groups-add mt-1.5 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
          <span className="groups-add-text">Add John</span>
        </div>
        <div className="groups-list relative mt-1.5 space-y-1">
          {["Mom", "Dad"].map((name) => (
            <div key={name} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-700">
              {name}
            </div>
          ))}
          <div className="groups-john rounded-lg border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-700">
            John
          </div>
          <span className="groups-hand pointer-events-none absolute -right-1 -top-8 z-20 inline-flex h-12 w-12 items-center justify-center text-gray-400" aria-hidden>
            <MiniHandTapIcon className="h-12 w-12" />
          </span>
        </div>
        <style jsx>{`
          .groups-add,
          .groups-add-text,
          .groups-john,
          .groups-hand {
            animation-duration: 9s;
            animation-iteration-count: infinite;
          }

          .groups-add {
            animation-name: groups-add;
            animation-timing-function: ease-in-out;
          }

          .groups-add-text {
            display: inline-block;
            overflow: hidden;
            white-space: nowrap;
            width: 0;
            animation-name: groups-add-text;
            animation-timing-function: steps(8, end);
          }

          .groups-john {
            opacity: 0;
            animation-name: groups-john;
            animation-timing-function: ease-in-out;
          }

          .groups-hand {
            animation-name: groups-hand;
            animation-timing-function: linear;
            transform-origin: 12% 12%;
          }

          @keyframes groups-add {
            0%,
            18%,
            90%,
            100% {
              background: #ecfdf3;
              border-color: #86efac;
              opacity: 1;
            }
            44%,
            82% {
              background: #dcfce7;
              border-color: #22c55e;
              opacity: 1;
            }
          }

          @keyframes groups-add-text {
            0%,
            14%,
            90%,
            100% {
              width: 0;
              opacity: 0;
            }
            30%,
            53% {
              width: 8ch;
              opacity: 1;
            }
            54%,
            82% {
              width: 8ch;
              opacity: 0;
            }
          }

          @keyframes groups-john {
            0%,
            46%,
            90%,
            100% {
              opacity: 0;
              transform: translateY(4px);
            }
            54%,
            82% {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes groups-hand {
            0% {
              transform: translate(82px, 12px);
              opacity: 0;
            }
            14% {
              transform: translate(60px, 10px);
              opacity: 0.45;
            }
            28% {
              transform: translate(18px, 4px);
              opacity: 1;
            }
            36% {
              transform: translate(0, 0) scale(0.93);
              opacity: 1;
            }
            42% {
              transform: translate(6px, 2px);
              opacity: 0.98;
            }
            52% {
              transform: translate(12px, 24px);
              opacity: 0.95;
            }
            64%,
            82% {
              transform: translate(22px, 42px);
              opacity: 0;
            }
            90%,
            100% {
              transform: translate(82px, 12px);
              opacity: 0;
            }
          }
        `}</style>
      </MockPhoneFrame>
    </div>
  );
}
