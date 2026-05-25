import type { CSSProperties } from "react";
import { LocalizedEmblem } from "@/components/localized-card/LocalizedEmblem";
import type { LocalizedCardTheme } from "@/lib/localized-card-themes";

type LeaderboardPlayerLocalizationBackgroundProps = {
  theme: LocalizedCardTheme;
};

const LEADERBOARD_PATTERN_PATHS = [
  {
    fill: "var(--leaderboard-card-secondary-1)",
    d: "M0,0v9.5c0,8,1.57,15.65,4.46,22.71,1.16,2.86,2.54,5.61,4.12,8.26,1.47,2.47,3.1,4.83,4.89,7.08,1.64,2.06,3.4,4.03,5.29,5.9,1.67,1.66,3.44,3.23,5.29,4.72,1.55,1.24,3.15,2.42,4.81,3.54,1.23.82,2.48,1.61,3.76,2.36,1.64.96,3.34,1.87,5.07,2.71,6.4,3.09,13.38,5.31,20.76,6.48,1.45.07,2.91.1,4.38.1h8.32V0H0Z"
  },
  {
    fill: "var(--leaderboard-card-secondary-2)",
    d: "M19.26,0v33.63c0,4.98,1.11,9.74,3.15,14.13.82,1.78,1.8,3.49,2.91,5.14,1.04,1.53,2.19,3,3.45,4.4,1.15,1.28,2.4,2.51,3.73,3.67,1.18,1.03,2.43,2.01,3.74,2.94,1.09.77,2.22,1.51,3.39,2.2.86.51,1.75,1,2.66,1.47,1.16.6,2.36,1.16,3.58,1.68,4.52,1.92,9.45,3.3,14.66,4.03,1.02.04,2.06.07,3.09.07h7.51V0H19.26Z"
  },
  {
    fill: "var(--leaderboard-card-primary)",
    d: "M62.28,0c-.57,0-1.14.01-1.71.04-2.88.44-5.61,1.29-8.11,2.46-.68.32-1.34.66-1.98,1.03-.5.28-.99.58-1.47.89-.65.42-1.27.87-1.88,1.34-.72.57-1.41,1.16-2.07,1.79-.74.71-1.43,1.46-2.06,2.24-.7.85-1.34,1.75-1.91,2.69-.61,1-1.15,2.05-1.61,3.14-1.13,2.68-1.74,5.58-1.74,8.62v24.56c0,13.56,12.36,24.56,27.6,24.56h260.64V0H62.28Z"
  },
  {
    fill: "var(--leaderboard-card-neutral)",
    d: "M171.07,45.53c1.33-.61,2.59-1.3,3.78-2.06,2.44-1.55,4.58-3.38,6.33-5.43h0c.17-.2.34-.4.5-.61.99-1.23,1.84-2.54,2.54-3.91,0,0,0,0,0,0,.43-.85.81-1.72,1.12-2.61.22-.63.41-1.26.56-1.9.06-.25.11-.5.16-.75,0-.03.01-.06.02-.09.14-.71.24-1.43.3-2.16v-.09c.04-.48.06-.98.06-1.47,0-1.2-.11-2.37-.32-3.52-.03-.18-.07-.36-.11-.53-.1-.47-.21-.93-.35-1.38,0-.03-.02-.06-.02-.09-.06-.21-.12-.41-.19-.61,0-.03-.02-.06-.03-.08-3.5-10.49-15.64-18.23-30.17-18.23h-31.19c-5.16,0-10.03.98-14.32,2.72-.55.22-1.09.46-1.62.7,0,0,0,0,0,0-5.15,2.4-9.34,5.93-12.02,10.16-1.79,2.83-2.9,5.98-3.17,9.3-.04.52-.06,1.04-.06,1.56h31.19c-15.76,0-28.8,9.14-30.89,21.08-.2,1.1-.3,2.23-.3,3.38v24.45h93.57v-24.45h-31.19c5.77,0,11.18-1.23,15.81-3.38Z"
  },
  {
    fill: "var(--leaderboard-card-neutral)",
    d: "M283.82,47.26c.05.54.07,1.09.07,1.64,0,1.2-.11,2.37-.32,3.52-.03.18-.07.35-.1.53-.12.58-.27,1.15-.45,1.71-.05.17-.1.34-.16.5-3.53,10.47-15.7,18.19-30.15,18.19h-31.19c-17.22,0-31.19-10.95-31.19-24.45v-24.45c0-3.02.69-5.91,1.97-8.58.51-1.08,1.12-2.12,1.82-3.12.65-.93,1.37-1.82,2.16-2.67.72-.78,1.5-1.52,2.33-2.23.74-.63,1.52-1.22,2.34-1.78.68-.47,1.39-.91,2.12-1.34.54-.31,1.1-.61,1.66-.89.73-.36,1.47-.7,2.24-1.02,2.82-1.17,5.91-2.01,9.16-2.45.64-.03,1.28-.04,1.93-.04h38.12c.65,0,1.3.01,1.95.04,3.25.44,6.33,1.28,9.14,2.45.77.32,1.52.66,2.24,1.02.57.28,1.12.58,1.66.89.73.42,1.44.87,2.12,1.34.82.56,1.6,1.16,2.33,1.78.83.7,1.61,1.45,2.34,2.23.79.85,1.51,1.74,2.16,2.67.69,1,1.3,2.04,1.82,3.12,1.27,2.67,1.97,5.56,1.97,8.58h-31.19c5.79,0,11.21,1.23,15.84,3.38,1.51.7,2.94,1.5,4.28,2.38,2.23,1.48,4.2,3.2,5.82,5.11.09.11.18.22.27.33.23.28.46.57.68.87.79,1.05,1.48,2.15,2.06,3.3.07.14.14.28.21.42.35.72.66,1.46.92,2.21.22.62.4,1.26.56,1.9.09.36.16.72.23,1.08.11.61.19,1.22.24,1.84Z"
  }
];

export function LeaderboardPlayerLocalizationBackground({
  theme
}: LeaderboardPlayerLocalizationBackgroundProps) {
  if (theme.id === "generic") {
    return null;
  }

  const patternColors = getLeaderboardPatternColors(theme);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={
        {
          "--leaderboard-card-primary": patternColors.primary,
          "--leaderboard-card-secondary-1": patternColors.secondaryOne,
          "--leaderboard-card-secondary-2": patternColors.secondaryTwo,
          "--leaderboard-card-neutral": patternColors.neutral,
          "--leaderboard-card-accent-1": patternColors.primary,
          "--leaderboard-card-accent-2": patternColors.secondaryOne,
          "--leaderboard-card-accent-3": patternColors.secondaryTwo,
          "--leaderboard-card-accent-4": patternColors.neutral,
          "--leaderboard-card-accent-5": patternColors.primary
        } as CSSProperties
      }
    >
      <div
        className="absolute -bottom-1 -top-1 right-0 w-[32%] min-w-[7.75rem] sm:w-[40%] md:w-[44%] lg:w-[48%]"
      >
        <svg
          viewBox="0 0 325.99 73.36"
          className="absolute left-[26%] top-[-30%] h-[160%] w-[300%] sm:left-auto sm:right-[-36%] sm:top-[-24%] sm:h-[148%] sm:w-[142%] md:right-[-46%] lg:right-[-54%]"
          preserveAspectRatio="xMinYMid meet"
        >
          {LEADERBOARD_PATTERN_PATHS.map((path) => (
            <path key={path.d} d={path.d} fill={path.fill} />
          ))}
          <LocalizedEmblem theme={theme} variant="leaderboard" accentPrefix="leaderboard-card" />
        </svg>
      </div>
    </div>
  );
}

function getLeaderboardPatternColors(theme: LocalizedCardTheme) {
  const fallbackPrimary = theme.patternColors?.[0] ?? theme.colors[0] ?? theme.mainBackground;
  const fallbackSecondaryOne = theme.patternColors?.[1] ?? theme.colors[1] ?? fallbackPrimary;
  const fallbackSecondaryTwo = theme.patternColors?.[2] ?? theme.colors[2] ?? fallbackSecondaryOne;

  switch (theme.id) {
    case "usa":
      return createLeaderboardPatternPalette("#D32F2F", "#243C8F", "#FFFFFF");
    case "france":
      return createLeaderboardPatternPalette("#E3342F", "#283B8F", "#FFFFFF");
    case "ecuador":
      return createLeaderboardPatternPalette("#FCD116", "#CE1126", "#1F3A93");
    case "colombia":
      return createLeaderboardPatternPalette("#FCD116", "#CE1126", "#003893");
    case "mexico":
      return createLeaderboardPatternPalette("#CE1126", "#006847", "#FFFFFF");
    case "canada":
      return createLeaderboardPatternPalette("#D80621", "#D80621", "#F1F3F5");
    case "england":
      return createLeaderboardPatternPalette("#CE1126", "#1F3A93", "#FFFFFF");
    case "belgium":
      return createLeaderboardPatternPalette("#FCD116", "#ED2939", "#000000");
    case "spain":
      return createLeaderboardPatternPalette("#F1BF00", "#AA151B", "#F1BF00");
    case "japan":
      return createLeaderboardPatternPalette("#BC002D", "#F1F3F5", "#E6E9EE");
    case "korea":
      return createLeaderboardPatternPalette("#CD2E3A", "#0047A0", "#FFFFFF");
    case "portugal":
      return createLeaderboardPatternPalette("#DA291C", "#046A38", "#FFCD00");
    case "brazil":
      return createLeaderboardPatternPalette("#009B3A", "#002776", "#FFDF00");
    case "argentina":
      return createLeaderboardPatternPalette("#74ACDF", "#74ACDF", "#FFFFFF");
    case "uruguay":
      return createLeaderboardPatternPalette("#75AADB", "#75AADB", "#FFFFFF");
    case "germany":
      return createLeaderboardPatternPalette("#FFCE00", "#DD0000", "#000000");
    default:
      return createLeaderboardPatternPalette(fallbackPrimary, fallbackSecondaryOne, fallbackSecondaryTwo);
  }
}

function createLeaderboardPatternPalette(
  primary: string,
  secondaryOne: string,
  secondaryTwo: string,
  neutral = "#F0F0F1"
) {
  return {
    primary,
    secondaryOne,
    secondaryTwo,
    neutral
  };
}
