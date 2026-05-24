import { useId, type CSSProperties } from "react";
import type { LocalizedCardTheme } from "@/lib/localized-card-themes";

type LocalizedCardBackgroundProps = {
  theme: LocalizedCardTheme;
  className?: string;
  preserveRightControlZone?: boolean;
};

const PATTERN_PATHS = [
  "M587.16.1h-179.68c-1.62 3.05-3 6.21-4.06 9.46-.03.08-.05.16-.08.25-1.81 5.59-2.77 11.45-2.77 17.49h90.27c-6.18 0-12.21.48-18.04 1.41 0 0 0 0-.01 0-18.34 2.9-34.66 10.17-47.13 20.36-11.57 9.45-19.8 21.44-23.26 34.8-17.98 2.37-33.25 6.45-42.35 10.22-3.76 1.56-7.43 3.24-11 5.03-2.78 1.39-5.51 2.85-8.17 4.37-3.6 2.07-7.07 4.26-10.42 6.57-4.02 2.77-7.85 5.69-11.48 8.77-4.09 3.46-7.92 7.12-11.47 10.96-3.88 4.18-7.43 8.56-10.61 13.14-3.41 4.92-6.41 10.04-8.93 15.34-.81 1.69-1.55 3.41-2.26 5.13h301.43V.1Z",
  "M587.16 81.87H440.53c-27.11 0-52.34 5.8-64.74 10.93-3.36 1.4-6.64 2.9-9.83 4.49-2.48 1.24-4.92 2.55-7.3 3.91-3.22 1.85-6.32 3.81-9.32 5.87-3.59 2.48-7.01 5.09-10.26 7.84-3.65 3.1-7.08 6.37-10.25 9.79-3.47 3.74-6.64 7.65-9.48 11.75-3.05 4.39-5.73 8.97-7.98 13.71-2.05 4.29-3.75 8.72-5.09 13.25h280.87V81.87Z",
  "M587.16 157.63c-10.24-3.09-21.37-4.79-33.03-4.79h33.03V85.69c-5.46-1.65-11.18-2.91-17.1-3.72-1.9-.08-3.8-.12-5.73-.12H452.17c-1.9 0-3.8.04-5.68.12-9.58 1.3-18.65 3.77-26.95 7.21-2.25.94-4.45 1.94-6.58 3.01-1.66.83-3.3 1.71-4.89 2.62-2.15 1.24-4.23 2.55-6.24 3.93-2.4 1.66-4.7 3.41-6.87 5.25-2.45 2.07-4.74 4.26-6.86 6.56-2.32 2.5-4.45 5.13-6.35 7.87-2.04 2.94-3.84 6.01-5.35 9.18-3.74 7.84-5.79 16.35-5.79 25.24v10.57h216.55v-5.78Z",
  "M587.16 0H414.75c-2.03 3.47-3.69 7.1-4.92 10.87-.02.08-.05.15-.07.23-1.68 5.18-2.57 10.61-2.57 16.21h83.65c-5.73 0-11.32.45-16.72 1.31 0 0 0 0-.01 0-16.99 2.69-32.12 9.42-43.68 18.86-11.89 9.72-19.99 22.31-22.45 36.35-.04.23-.07.45-.11.68 9.99-1.6 21.15-2.64 32.66-2.64h146.63V0Z",
  "M587.16 78.68h-30.79c11.13 0 21.61-2.18 30.79-6.03V0H435.31c-3.53 4.4-6.24 9.25-7.93 14.43-.02.06-.04.12-.06.18-1.32 4.06-2.01 8.31-2.01 12.7h65.53c-4.49 0-8.87.35-13.1 1.03 0 0 0 0 0 0-13.31 2.11-25.16 7.38-34.22 14.78-9.31 7.61-15.66 17.48-17.59 28.48-.41 2.32-.62 4.69-.62 7.09v3.78c4.96-.38 10.06-.59 15.23-.59h146.63v-3.19Z",
  "M563.42 59.85c1.98-.92 3.87-1.94 5.65-3.06 1.1-.69 2.16-1.42 3.18-2.18.04-.03.08-.06.12-.09 2.5-1.88 4.73-3.97 6.66-6.23.67-.78 1.3-1.58 1.89-2.4.04-.05.07-.1.11-.15.24-.33.47-.66.69-1 .02-.03.04-.06.06-.09.71-1.08 1.36-2.19 1.94-3.32.44-.87.85-1.75 1.21-2.65.02-.04.03-.08.04-.11.17-.42.33-.85.48-1.28.34-.97.63-1.94.86-2.94.1-.41.19-.81.27-1.22 0-.03.01-.06.02-.1.02-.07.03-.14.04-.21 0-.03.01-.06.02-.1.18-1 .32-2.02.4-3.05 0-.03 0-.07 0-.1 0-.05 0-.1.01-.14 0-.03 0-.07 0-.1.04-.66.07-1.33.07-2.01 0-1.84-.17-3.66-.49-5.43-.05-.28-.1-.55-.16-.82-.1-.47-.21-.94-.34-1.41 0-.03-.02-.07-.03-.1-.15-.57-.32-1.13-.5-1.69-.01-.03-.02-.06-.03-.1-1.06-3.2-2.64-6.23-4.67-9.04-.02-.04-.05-.07-.08-.1 0 0 0 0 0 0-.02-.03-.05-.07-.08-.1C578.47 5.35 575.58 2.49 572.25 0h-114.7c-2.53 1.89-4.8 4-6.75 6.29-.03.04-.06.07-.09.1-2.93 3.46-5.16 7.31-6.51 11.45-.01.04-.03.09-.04.13-.97 2.98-1.48 6.11-1.48 9.33h48.16c-3.3 0-6.51.26-9.62.75 0 0 0 0 0 0-9.78 1.55-18.49 5.42-25.15 10.86-6.84 5.59-11.51 12.85-12.93 20.93-.3 1.7-.46 3.44-.46 5.21v16.81h144.48v-16.81h-48.16c8.56 0 16.59-1.75 23.56-4.83.29-.13.58-.26.86-.39Z"
];

export function LocalizedCardBackground({
  theme,
  className,
  preserveRightControlZone = true
}: LocalizedCardBackgroundProps) {
  const clipPathId = useId();
  const patternOpacities = getPatternOpacities(theme.patternVariant);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`.trim()} aria-hidden>
      <div className="absolute inset-0 bg-[var(--localized-card-bg)]" />
      <div className="absolute inset-0 opacity-[0.98]">
        <svg
          viewBox="0 0 587.16 163.41"
          className="absolute inset-x-0 top-1/2 h-[116%] w-full -translate-y-1/2"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <clipPath id={clipPathId}>
              <rect x="22" y="12" width="497" height="139" rx="10" ry="10" />
            </clipPath>
          </defs>
          <g
            clipPath={`url(#${clipPathId})`}
            style={getPatternFadeStyle(preserveRightControlZone)}
          >
            <path d={PATTERN_PATHS[0]} fill="var(--localized-card-accent-1)" opacity={patternOpacities[0]} />
            <path d={PATTERN_PATHS[1]} fill="var(--localized-card-accent-2)" opacity={patternOpacities[1]} />
            <path d={PATTERN_PATHS[2]} fill="var(--localized-card-accent-3)" opacity={patternOpacities[2]} />
            <path d={PATTERN_PATHS[3]} fill="var(--localized-card-accent-4)" opacity={patternOpacities[3]} />
            <path d={PATTERN_PATHS[4]} fill="var(--localized-card-accent-5)" opacity={patternOpacities[4]} />
            <path d={PATTERN_PATHS[5]} fill="var(--localized-card-accent-1)" opacity={patternOpacities[5]} />
            {theme.patternVariant === "emblem" ? (
              <g opacity="0.24">
                <circle cx="152" cy="82" r="38" fill="rgba(255,255,255,0.16)" />
                <circle cx="152" cy="82" r="30" fill="var(--localized-card-accent-2)" />
                <circle cx="152" cy="82" r="10" fill="var(--localized-card-accent-3)" />
              </g>
            ) : null}
            {theme.patternVariant === "minimal" ? (
              <g opacity="0.18">
                <circle cx="170" cy="84" r="34" fill="var(--localized-card-accent-2)" />
                <circle cx="170" cy="84" r="12" fill="var(--localized-card-bg)" />
              </g>
            ) : null}
          </g>
        </svg>
      </div>
      {preserveRightControlZone ? (
        <div
          className="absolute inset-y-0 right-0 w-[32%]"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.015) 66%, var(--localized-card-control-zone-tint) 88%, rgba(255,255,255,0.09) 100%)"
          }}
        />
      ) : null}
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -24px 48px rgba(0,0,0,0.06)"
        }}
      />
    </div>
  );
}

function getPatternOpacities(variant: LocalizedCardTheme["patternVariant"]) {
  switch (variant) {
    case "minimal":
      return [0.12, 0.18, 0.12, 0.08, 0.18, 0.08];
    case "emblem":
      return [0.48, 0.88, 0.72, 0.76, 0.58, 0.18];
    case "ribbons":
      return [0.42, 0.9, 0.68, 0.74, 0.52, 0.22];
    case "bands":
    default:
      return [0.44, 0.92, 0.7, 0.78, 0.58, 0.2];
  }
}

function getPatternFadeStyle(preserveRightControlZone: boolean): CSSProperties | undefined {
  if (!preserveRightControlZone) {
    return undefined;
  }

  return {
    WebkitMaskImage:
      "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 78%, rgba(0,0,0,0.96) 88%, rgba(0,0,0,0.88) 100%)",
    maskImage:
      "linear-gradient(90deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 78%, rgba(0,0,0,0.96) 88%, rgba(0,0,0,0.88) 100%)"
  };
}
