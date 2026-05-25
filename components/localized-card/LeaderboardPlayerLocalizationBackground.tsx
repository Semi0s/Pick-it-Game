import type { CSSProperties } from "react";
import { LocalizedEmblem } from "@/components/localized-card/LocalizedEmblem";
import type { LocalizedCardTheme } from "@/lib/localized-card-themes";

type LeaderboardPlayerLocalizationBackgroundProps = {
  theme: LocalizedCardTheme;
};

const LEADERBOARD_PATTERN_PATHS = [
  { fill: "var(--leaderboard-card-accent-1)", d: "M419.82,5.2c-9.21,2.78-19.23,4.31-29.71,4.31h29.71v60.41c-4.92,1.48-10.06,2.61-15.39,3.34-1.71.07-3.42.1-5.15.1h-100.89c-1.71,0-3.42-.03-5.11-.1-8.62-1.17-16.77-3.39-24.25-6.48-2.03-.84-4-1.74-5.92-2.71-1.5-.75-2.97-1.54-4.4-2.36-1.94-1.12-3.81-2.29-5.61-3.54-2.16-1.49-4.23-3.07-6.18-4.72-2.2-1.87-4.26-3.84-6.17-5.9-2.09-2.25-4-4.61-5.71-7.08-1.84-2.65-3.45-5.4-4.81-8.26-3.37-7.06-5.21-14.7-5.21-22.71V0h194.8v5.2Z" },
  { fill: "var(--leaderboard-card-accent-2)", d: "M409.01,12.37c-.32.47-.66.94-1,1.4-.36.48-.74.96-1.12,1.43-.15.18-.3.36-.45.54-2.68,3.15-5.91,5.98-9.59,8.41-2.2,1.46-4.55,2.77-7.05,3.92-7.64,3.53-16.55,5.56-26.09,5.56h45.3v19c-.06.09-.12.18-.18.27-1.06,1.53-2.25,3-3.55,4.4-1.19,1.28-2.48,2.51-3.85,3.67-1.21,1.03-2.5,2.01-3.84,2.94-1.12.77-2.28,1.51-3.49,2.2-.89.51-1.8,1-2.73,1.47-1.2.6-2.43,1.16-3.69,1.68-4.64,1.92-9.7,3.3-15.06,4.03-1.06.04-2.13.07-3.21.07h-62.78c-1.06,0-2.13-.02-3.18-.07-5.36-.73-10.44-2.11-15.09-4.03-1.26-.52-2.49-1.09-3.68-1.68-.93-.47-1.85-.96-2.74-1.47-1.21-.7-2.37-1.43-3.49-2.2-1.35-.93-2.63-1.91-3.85-2.94-1.37-1.16-2.65-2.39-3.84-3.67-1.3-1.4-2.49-2.87-3.55-4.4-1.14-1.65-2.15-3.36-2.99-5.14-2.1-4.39-3.24-9.15-3.24-14.13V0h148.03v12.37Z" },
  { fill: "var(--leaderboard-card-accent-3)", d: "M380.95,26.21c.05-.55.07-1.1.07-1.65,0-1.2-.11-2.38-.32-3.54-.03-.18-.07-.36-.1-.53-.12-.58-.27-1.15-.45-1.72-.05-.17-.1-.34-.16-.51-3.55-10.51-15.77-18.27-30.29-18.27h-31.33c-17.29,0-31.33,11-31.33,24.56v24.56c0,3.04.7,5.94,1.98,8.62.52,1.08,1.13,2.13,1.83,3.14.65.94,1.37,1.83,2.17,2.69.72.78,1.51,1.53,2.34,2.24.74.63,1.52,1.23,2.35,1.79.69.47,1.4.92,2.13,1.34.54.31,1.1.61,1.67.89.73.37,1.48.71,2.25,1.03,2.84,1.17,5.93,2.02,9.2,2.46.64.03,1.29.04,1.94.04h38.29c.66,0,1.31-.01,1.95-.04,3.27-.45,6.36-1.29,9.19-2.46.77-.32,1.52-.66,2.25-1.03.57-.28,1.12-.58,1.67-.89.74-.42,1.45-.87,2.13-1.34.82-.57,1.6-1.16,2.34-1.79.84-.71,1.62-1.46,2.35-2.24.79-.86,1.52-1.75,2.17-2.69.7-1,1.31-2.05,1.83-3.14,1.28-2.68,1.98-5.59,1.98-8.62h-31.33c5.82,0,11.26-1.24,15.92-3.39,1.52-.7,2.96-1.5,4.3-2.39,2.24-1.48,4.21-3.21,5.85-5.13.09-.11.18-.22.27-.33.24-.29.46-.58.69-.87.79-1.05,1.49-2.16,2.07-3.31.07-.14.14-.28.21-.42.35-.73.66-1.47.92-2.22.22-.62.4-1.26.56-1.9.09-.36.16-.72.23-1.09.11-.61.19-1.22.24-1.84Z" }
];

export function LeaderboardPlayerLocalizationBackground({
  theme
}: LeaderboardPlayerLocalizationBackgroundProps) {
  if (theme.id === "generic") {
    return null;
  }

  const patternColors = getLeaderboardPatternColors(theme);
  const fadeMask =
    "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 18%, rgba(0,0,0,0.86) 58%, rgba(0,0,0,1) 100%)";

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={
        {
          "--leaderboard-card-accent-1": patternColors[0],
          "--leaderboard-card-accent-2": patternColors[1],
          "--leaderboard-card-accent-3": patternColors[2]
        } as CSSProperties
      }
    >
      <div
        className="absolute inset-y-0 right-0 w-[36%] min-w-[8rem]"
        style={{
          WebkitMaskImage: fadeMask,
          maskImage: fadeMask,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat"
        }}
      >
        <svg
          viewBox="0 0 309.6 73.36"
          className="absolute right-[-5%] top-[-7%] h-[108%] w-[114%]"
          preserveAspectRatio="xMidYMid slice"
        >
          <LocalizedEmblem theme={theme} variant="leaderboard" accentPrefix="leaderboard-card" />
          <g transform="translate(-92 0)">
            {LEADERBOARD_PATTERN_PATHS.map((path) => (
              <path key={path.d} d={path.d} fill={path.fill} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

function getLeaderboardPatternColors(theme: LocalizedCardTheme) {
  switch (theme.id) {
    case "usa":
      return ["#243C8F", "#FFFFFF", "#D32F2F"];
    case "france":
      return ["#283B8F", "#FFFFFF", "#E3342F"];
    case "ecuador":
      return ["#FCD116", "#1F3A93", "#CE1126"];
    case "colombia":
      return ["#FCD116", "#003893", "#CE1126"];
    case "mexico":
      return ["#006847", "#FFFFFF", "#CE1126"];
    case "canada":
      return ["#D80621", "#FFFFFF", "#D80621"];
    case "england":
      return ["#1F3A93", "#FFFFFF", "#CE1126"];
    case "belgium":
      return ["#000000", "#ED2939", "#FCD116"];
    case "spain":
      return ["#F1BF00", "#AA151B", "#F1BF00"];
    case "japan":
      return ["#FFFFFF", "#FFFFFF", "#BC002D"];
    case "korea":
      return ["#FFFFFF", "#0047A0", "#CD2E3A"];
    case "portugal":
      return ["#046A38", "#DA291C", "#FFCD00"];
    case "brazil":
      return ["#009B3A", "#002776", "#FFDF00"];
    case "argentina":
      return ["#74ACDF", "#FFFFFF", "#74ACDF"];
    case "uruguay":
      return ["#75AADB", "#FFFFFF", "#75AADB"];
    case "germany":
      return ["#000000", "#DD0000", "#FFCE00"];
    default:
      return [
        theme.colors[0] ?? theme.mainBackground,
        theme.colors[1] ?? theme.colors[0] ?? theme.mainBackground,
        theme.colors[2] ?? theme.colors[1] ?? theme.colors[0] ?? theme.mainBackground
      ];
  }
}
