import type { CSSProperties, ReactNode } from "react";
import type { LocalizedCardTheme } from "@/lib/localized-card-themes";

type LocalizedEmblemVariant = "card" | "leaderboard";
type AccentPrefix = "localized-card" | "leaderboard-card";

type LocalizedEmblemProps = {
  theme: LocalizedCardTheme;
  variant: LocalizedEmblemVariant;
  accentPrefix?: AccentPrefix;
};

type EmblemSpec = {
  node: ReactNode;
  opacity?: number;
  scale?: number;
  strokeWidth?: number;
  xOffset?: number;
  yOffset?: number;
  leaderboardOpacity?: number;
  leaderboardScale?: number;
  leaderboardXOffset?: number;
  leaderboardYOffset?: number;
};

const VARIANT_CONFIG = {
  card: {
    centerX: 352,
    centerY: 72,
    baseScale: 1,
    assetX: 308,
    assetY: 24,
    assetWidth: 112,
    assetHeight: 124,
    assetOpacity: 0.3
  },
  leaderboard: {
    centerX: 66,
    centerY: 45,
    baseScale: 0.375,
    assetX: 47.75,
    assetY: 16.5,
    assetWidth: 34.5,
    assetHeight: 39,
    assetOpacity: 0.72
  }
} as const;

const STAR_POINTS = "0,-14 4,-4 14,-4 6,2 8,12 0,6 -8,12 -6,2 -14,-4 -4,-4";
const SHIELD_PATH =
  "M0-29c14.5 0 24 7.8 24 22.8 0 18.2-9.4 31.2-24 39-14.6-7.8-24-20.8-24-39C-24-21.2-14.5-29 0-29Z";

export function LocalizedEmblem({
  theme,
  variant,
  accentPrefix = "localized-card"
}: LocalizedEmblemProps) {
  const config = VARIANT_CONFIG[variant];

  const shouldUseEmblemAsset = theme.emblemAsset && !(theme.id === "france" && variant === "leaderboard");

  if (shouldUseEmblemAsset) {
    return (
      <image
        href={theme.emblemAsset}
        x={config.assetX}
        y={config.assetY}
        width={config.assetWidth}
        height={config.assetHeight}
        opacity={config.assetOpacity}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }

  const spec = getLocalizedEmblemSpec(theme, accentPrefix);
  if (!spec) {
    return null;
  }

  const scale =
    config.baseScale *
    (variant === "leaderboard" ? spec.leaderboardScale ?? spec.scale ?? 1 : spec.scale ?? 1);
  const opacity =
    variant === "leaderboard"
      ? spec.leaderboardOpacity ?? Math.min((spec.opacity ?? 0.16) * 2.35, 0.58)
      : spec.opacity ?? 0.16;
  const strokeWidth =
    variant === "leaderboard"
      ? Math.max(0.55, (spec.strokeWidth ?? 0.9) * 0.88)
      : spec.strokeWidth ?? 0.9;
  const x =
    config.centerX +
    (variant === "leaderboard" ? spec.leaderboardXOffset ?? spec.xOffset ?? 0 : spec.xOffset ?? 0);
  const y =
    config.centerY +
    (variant === "leaderboard" ? spec.leaderboardYOffset ?? spec.yOffset ?? 0 : spec.yOffset ?? 0);

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} style={getEmblemStyle(opacity, strokeWidth)}>
      {spec.node}
    </g>
  );
}

function getLocalizedEmblemSpec(
  theme: LocalizedCardTheme,
  accentPrefix: AccentPrefix
): EmblemSpec | null {
  const a1 = accentVar(accentPrefix, 1);
  const a2 = accentVar(accentPrefix, 2);
  const a3 = accentVar(accentPrefix, 3);
  const a4 = accentVar(accentPrefix, 4);
  const a5 = accentVar(accentPrefix, 5);
  const shadow = "var(--localized-card-shadow)";
  const highlight = "var(--localized-card-highlight)";

  switch (theme.emblemKind) {
    case "usa":
      const usaStarFill = accentPrefix === "leaderboard-card" ? "rgba(255,255,255,0.94)" : a1;
      return {
        opacity: 0.15,
        leaderboardOpacity: 0.78,
        leaderboardScale: 2.05,
        leaderboardYOffset: -7,
        node: (
          <g fill={usaStarFill}>
            <Star x={-24} y={-12} size={8.6} fill={usaStarFill} />
            <Star x={0} y={-22} size={8.8} fill={usaStarFill} />
            <Star x={24} y={-12} size={8.6} fill={usaStarFill} />
            <Star x={-12} y={10} size={7.6} fill={usaStarFill} />
            <Star x={12} y={10} size={7.6} fill={usaStarFill} />
          </g>
        )
      };
    case "argentina":
      return {
        opacity: 0.23,
        scale: 1.16,
        leaderboardOpacity: 0.72,
        leaderboardScale: 1.62,
        leaderboardYOffset: -8,
        node: (
          <>
            {Array.from({ length: 16 }, (_, index) => {
              const isLongRay = index % 2 === 0;
              return (
                <path
                  key={index}
                  d={isLongRay ? "M0-33 3.5-17h-7Z" : "M0-27 2.7-16h-5.4Z"}
                  fill="#F6B40E"
                  transform={`rotate(${index * 22.5})`}
                />
              );
            })}
            <circle r="15" fill="#F6B40E" />
            <circle r="10.5" fill="#FFD36A" />
            <path
              d="M-5-2.5c1.5-1.2 3-1.2 4.5 0M4.5-2.5c1.5-1.2 3-1.2 4.5 0M-4.5 5.5c2.6 2.1 6.4 2.1 9 0"
              fill="none"
              stroke="#8A5A00"
              strokeLinecap="round"
              strokeWidth="1.45"
            />
            <path
              d="M0-1.2c1.7 2.4 1.4 4.3-.9 5.8"
              fill="none"
              stroke="#8A5A00"
              strokeLinecap="round"
              strokeWidth="1.25"
            />
          </>
        )
      };
    case "uruguay":
      return {
        opacity: 0.17,
        leaderboardOpacity: 0.58,
        leaderboardScale: 1.35,
        node: (
          <>
            {[-16, -8, 0, 8, 16].map((rowY) => (
              <rect key={rowY} x="-34" y={rowY - 2} width="68" height="4" rx="2" fill={a1} />
            ))}
            <circle cx="-14" cy="-14" r="9" fill={a2} />
            {Array.from({ length: 8 }, (_, index) => (
              <rect
                key={index}
                x="-14.8"
                y="-30"
                width="1.6"
                height="8"
                rx="0.8"
                fill={a2}
                transform={`rotate(${index * 45} -14 -14)`}
              />
            ))}
          </>
        )
      };
    case "ecuador":
      return null;
    case "brazil":
      return {
        opacity: 0.18,
        scale: 1.42,
        leaderboardOpacity: 0.78,
        leaderboardScale: 2.1,
        leaderboardYOffset: -8,
        node: (
          <>
            <path d="M0-28 34 0 0 28-34 0Z" fill={a1} />
            <circle r="15" fill={a2} />
            <path d="M-17-3.5c8.2-5 19-5.9 34-1.1" fill="none" stroke={highlight} strokeWidth="3.1" strokeLinecap="round" />
          </>
        )
      };
    case "japan":
      const japanSunFill = accentPrefix === "leaderboard-card" ? "rgba(255,255,255,0.96)" : a1;
      return {
        opacity: 1,
        scale: 1.18,
        yOffset: -8,
        leaderboardOpacity: 1,
        leaderboardScale: 1.5,
        leaderboardYOffset: 0,
        node: (
          <>
            <circle r="22" fill={japanSunFill} />
          </>
        )
      };
    case "portugal":
      return {
        opacity: 0.17,
        node: (
          <>
            <circle r="24" fill={a1} />
            <circle r="18" fill="none" stroke={a2} strokeWidth="4" />
            <path d="M-10-8h20v16h-20Z" fill={a3} />
            <circle cx="-4" cy="-2" r="1.5" fill={highlight} />
            <circle cx="4" cy="-2" r="1.5" fill={highlight} />
            <circle cx="0" cy="4" r="1.5" fill={highlight} />
          </>
        )
      };
    case "mexico":
      return {
        opacity: 0.2,
        scale: 0.97,
        node: (
          <>
            <circle r="24" fill="rgba(255,255,255,0.72)" />
            <path d="M-14 4c4-9 10-14 14-14s10 5 14 14c-4.2-1.6-8.8-2.4-14-2.4S-9.8 2.4-14 4Z" fill={a2} />
            <path d="M-10 8c2.8-4 6.2-6 10-6s7.2 2 10 6c-2.9 5.7-6.2 9.6-10 11.8C-3.8 17.6-7.1 13.7-10 8Z" fill={a3} />
            <path d="M-14 16c4 1.8 7 2.7 9 2.7-1.6 2.1-3.6 3.8-6 5-1.4-2.1-2.4-4.6-3-7.7Z" fill={a3} />
            <path d="M14 16c-.6 3.1-1.6 5.6-3 7.7-2.4-1.2-4.4-2.9-6-5 2 0 5-1 9-2.7Z" fill={a2} />
          </>
        )
      };
    case "france":
      const francePrimaryFill = accentPrefix === "leaderboard-card" ? "#D8DDE6" : "rgba(255,255,255,0.92)";
      const franceSecondaryFill = accentPrefix === "leaderboard-card" ? "#AAB2C0" : a2;
      return {
        opacity: 0.2,
        leaderboardOpacity: 0.52,
        leaderboardScale: 1.2,
        scale: 1.02,
        node: (
          <>
            <path
              d="M0-30c5.8 0 10.2 4.8 10.2 11.4 0 4.9-2.4 9.5-6.7 13.7 6.4-1.2 13.6-5.6 13.6-14.2 0-6-4.4-10.8-10.1-10.8-3.2 0-5.5 1.4-7 4.1-1.5-2.7-3.8-4.1-7-4.1-5.7 0-10.1 4.8-10.1 10.8 0 8.6 7.2 13 13.6 14.2-4.3-4.2-6.7-8.8-6.7-13.7C-10.2-25.2-5.8-30 0-30Z"
              fill={francePrimaryFill}
            />
            <path d="M-8 6 0 13 8 6 5 18l8 6H4l-4 12-4-12h-9l8-6Z" fill={franceSecondaryFill} />
          </>
        )
      };
    case "england":
      const englandPanelFill = accentPrefix === "leaderboard-card" ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.84)";
      const englandStarFill = accentPrefix === "leaderboard-card" ? "#D8DDE6" : "rgba(107,114,128,0.78)";
      return {
        opacity: 0.2,
        scale: 1.08,
        leaderboardOpacity: 0.64,
        leaderboardScale: 1.42,
        node: (
          <>
            <rect x="-30" y="-21" width="60" height="42" rx="10" fill={englandPanelFill} />
            <rect x="-3.7" y="-21" width="7.4" height="42" rx="2.5" fill={a1} />
            <rect x="-30" y="-3.7" width="60" height="7.4" rx="2.5" fill={a1} />
            <Star x="0" y="-28" size={5.4} fill={englandStarFill} />
          </>
        )
      };
    case "belgium":
      return {
        opacity: 0.16,
        scale: 0.95,
        leaderboardOpacity: 0.58,
        leaderboardScale: 1.25,
        node: (
          <>
            <path
              d="M0-26 14-12h-6v10c0 5.2-3.1 9.5-8 12.2-4.9-2.7-8-7-8-12.2v-10h-6L0-26Z"
              fill={a1}
            />
            <circle cx="-6" cy="-8" r="2.4" fill={a2} />
            <circle cx="0" cy="-10.5" r="2.4" fill={a3} />
            <circle cx="6" cy="-8" r="2.4" fill={a2} />
          </>
        )
      };
    case "spain":
      return {
        opacity: 0.17,
        node: (
          <>
            <rect x="-28" y="-18" width="56" height="36" rx="8" fill={a1} />
            <rect x="-8" y="-24" width="16" height="12" rx="4" fill={a2} />
            <rect x="-4" y="-32" width="8" height="8" rx="2" fill={a5} />
          </>
        )
      };
    case "korea":
      return {
        opacity: 0.16,
        leaderboardOpacity: 0.56,
        leaderboardScale: 1.22,
        node: (
          <>
            <circle r="24" fill="rgba(255,255,255,0.92)" />
            <path d="M0-14a14 14 0 0 1 0 28 7 7 0 0 0 0-14 7 7 0 0 1 0-14Z" fill={a2} />
            <path d="M0 14a14 14 0 0 1 0-28 7 7 0 0 0 0 14 7 7 0 0 1 0 14Z" fill={a3} />
            <g fill={a4}>
              <rect x="-34" y="-24" width="16" height="3" rx="1.5" />
              <rect x="-34" y="-18" width="16" height="3" rx="1.5" />
              <rect x="-34" y="-12" width="16" height="3" rx="1.5" />
              <rect x="18" y="10" width="16" height="3" rx="1.5" />
              <rect x="18" y="16" width="16" height="3" rx="1.5" />
              <rect x="18" y="22" width="16" height="3" rx="1.5" />
            </g>
          </>
        )
      };
    case "canada":
      return {
        opacity: 0.24,
        scale: 1.06,
        leaderboardOpacity: 0.52,
        leaderboardScale: 0.78,
        node: (
          <>
            <path
              d="M0-31c2.4 7.4 5.8 11.7 10.3 14 3.3-4.9 8.1-7.4 14.1-8-1.2 5.8-3.5 10.4-7.2 14.1 6.3.9 11.8 3 16.6 6.7-5.2 3.5-11.6 5.5-18.8 5.8 2.4 4.8 4.2 9.6 5 15-4.5-2.2-8.7-5.7-12.8-10.7v20.6h-7.2V5.9c-4.1 5-8.4 8.5-12.8 10.7.8-5.4 2.6-10.2 5-15-7.2-.3-13.6-2.3-18.8-5.8 4.8-3.7 10.3-5.8 16.6-6.7-3.7-3.7-6-8.3-7.2-14.1 6 0.6 10.8 3.1 14.1 8C-5.8-19.3-2.4-23.6 0-31Z"
              fill={a2}
            />
            <path d="M-2.5 15.5h5v18.8h-5Z" fill={a2} />
          </>
        )
      };
    case "colombia":
      return {
        opacity: 0.18,
        scale: 1.04,
        yOffset: 2,
        node: (
          <>
            <path d="M-28-4c6.8-11 17-18 28-20 11 2 21 9 28 20-5.8-1.5-11.6-2.3-17.6-2.3-3.5 0-6.9.3-10.4 1-3.5-.7-6.9-1-10.4-1C-16.3-6.3-22.2-5.5-28-4Z" fill={shadow} />
            <circle cx="0" cy="-11" r="5.2" fill={a2} />
            <path d={SHIELD_PATH} fill="rgba(255,255,255,0.74)" />
            <path d="M-17-1c4.6-8.2 10.3-12.3 17-12.3S12.4-9.2 17-1v4.8h-34V-1Z" fill={a3} />
            <path d="M-17 4h34v18.5c-5.3 4.3-11 7.6-17 9.9-6-2.3-11.7-5.6-17-9.9V4Z" fill={a1} />
            <path d="M-7.5 7.5 0 0l7.5 7.5" fill="none" stroke={a2} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M-2 12h4v11h-4Z" fill={a2} />
          </>
        )
      };
    case "germany":
      return {
        opacity: 0.17,
        scale: 1.02,
        node: (
          <>
            <path d="M-34-5c10-13 22-20 34-20s24 7 34 20c-7.6-1.5-14.8-2.3-22-2.3-4.2 0-8.3.3-12 1-3.7-.7-7.8-1-12-1-7.2 0-14.4.8-22 2.3Z" fill={a1} />
            <path d="M-10 5c3.3-6.3 6.7-9.4 10-9.4S6.7-1.3 10 5c-2.8 3.1-6.1 4.7-10 4.7S-7.2 8.1-10 5Z" fill={a2} />
            <path d="M-12 12c4 3.2 8 4.8 12 4.8s8-1.6 12-4.8c-2.6 5.7-6.6 10.1-12 13.3-5.4-3.2-9.4-7.6-12-13.3Z" fill={a3} />
          </>
        )
      };
    case "southafrica":
      return {
        opacity: 0.17,
        scale: 1.08,
        node: (
          <>
            <path d="M-34-24-2 0-34 24Z" fill={a1} />
            <path d="M-34-16 8 0-34 16Z" fill={a2} />
            <path d="M-34-8 18 0-34 8Z" fill={a3} />
            <path d="M-6 0 34-24v12L10 0l24 12v12Z" fill={a4} />
            <path d="M2 0 34-19v7L12 0l22 12v7Z" fill={a5} />
          </>
        )
      };
    case "czechia":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d={SHIELD_PATH} fill="rgba(255,255,255,0.76)" />
            <path d="M-21-18 5 0-21 18Z" fill={a1} />
            <path d="M-2 0h23v19c-6.6 5.1-13.6 8.9-21 11.4V0Z" fill={a2} />
          </>
        )
      };
    case "bosnia":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d="M-24 25 12-26 24 25Z" fill={a1} />
            {[-18, -10, -2, 6, 14].map((offsetY, index) => (
              <Star key={index} x={12 + index * 1.2} y={offsetY} size={5.6} fill={a2} rotation={18} />
            ))}
          </>
        )
      };
    case "qatar":
      return {
        opacity: 0.18,
        scale: 1.05,
        node: (
          <>
            <path d="M-30-22H4l14 5-14 5 14 5-14 5 14 5-14 5 14 5H-30Z" fill={a1} />
            <path d="M4-22h24v44H4l14-5-14-5 14-5-14-5 14-5-14-5Z" fill="rgba(255,255,255,0.7)" />
          </>
        )
      };
    case "switzerland":
      return {
        opacity: 0.18,
        node: (
          <>
            <rect x="-24" y="-24" width="48" height="48" rx="14" fill={a1} />
            <rect x="-6" y="-16" width="12" height="32" rx="3" fill="rgba(255,255,255,0.9)" />
            <rect x="-16" y="-6" width="32" height="12" rx="3" fill="rgba(255,255,255,0.9)" />
          </>
        )
      };
    case "morocco":
      return {
        opacity: 0.18,
        node: (
          <>
            <circle r="24" fill="rgba(255,255,255,0.1)" />
            <polygon
              points="0,-24 7,-6 26,-6 11,6 16,24 0,13 -16,24 -11,6 -26,-6 -7,-6"
              fill="none"
              stroke={a2}
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </>
        )
      };
    case "haiti":
      return {
        opacity: 0.18,
        scale: 1.02,
        node: (
          <>
            <rect x="-22" y="10" width="44" height="10" rx="4" fill={a2} />
            <rect x="-3" y="-18" width="6" height="28" rx="3" fill={shadow} />
            <path d="M0-21c8 1.8 13 6.3 15.6 14.2C8.5-5.7 3.8-10.3 0-21Z" fill={a1} />
            <path d="M0-21c-8 1.8-13 6.3-15.6 14.2C-8.5-5.7-3.8-10.3 0-21Z" fill={a1} />
            <Star x="-10" y="3" size={5} fill={a2} />
            <Star x="10" y="3" size={5} fill={a2} />
          </>
        )
      };
    case "scotland":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d={SHIELD_PATH} fill={a1} />
            <path d="M-19-19 19 19M19-19-19 19" stroke="rgba(255,255,255,0.9)" strokeWidth="6" strokeLinecap="round" />
          </>
        )
      };
    case "paraguay":
      return {
        opacity: 0.18,
        node: (
          <>
            <circle r="25" fill="rgba(255,255,255,0.76)" />
            <circle r="18" fill="none" stroke={a1} strokeWidth="4" />
            <Star x="0" y="0" size={8} fill={a2} />
          </>
        )
      };
    case "australia":
      return {
        opacity: 0.16,
        node: (
          <>
            <Star x="-16" y="-12" size={8.5} fill="rgba(255,255,255,0.92)" />
            <Star x="10" y="-17" size={6} fill="rgba(255,255,255,0.92)" />
            <Star x="18" y="-1" size={5.5} fill="rgba(255,255,255,0.92)" />
            <Star x="4" y="11" size={6.4} fill="rgba(255,255,255,0.92)" />
            <Star x="-14" y="17" size={5.4} fill="rgba(255,255,255,0.92)" />
          </>
        )
      };
    case "turkiye":
      return {
        opacity: 0.18,
        node: (
          <>
            <circle cx="-2" cy="0" r="20" fill="rgba(255,255,255,0.85)" />
            <circle cx="4" cy="0" r="16" fill={a1} />
            <Star x="19" y="0" size={7.2} fill="rgba(255,255,255,0.9)" />
          </>
        )
      };
    case "curacao":
      return {
        opacity: 0.17,
        node: (
          <>
            <Star x="-8" y="-10" size={9} fill={a2} />
            <Star x="12" y="6" size={6.2} fill="rgba(255,255,255,0.9)" />
            <path d="M-30 20h60" stroke="rgba(255,255,255,0.75)" strokeWidth="4" strokeLinecap="round" />
          </>
        )
      };
    case "ivorycoast":
      return {
        opacity: 0.18,
        scale: 1.04,
        node: (
          <>
            <path d="M-16 14c0-12.5 7.2-21 16-21s16 8.5 16 21c-4-4.4-8.4-6.7-13-6.7-4.6 0-9 2.3-13 6.7Z" fill="rgba(255,255,255,0.76)" />
            <path d="M-10 0c-5-3.4-8.2-8-9.6-14.4 5 1.3 9 4.6 11.6 9.8" fill="none" stroke={a2} strokeWidth="3" strokeLinecap="round" />
            <path d="M10 0c5-3.4 8.2-8 9.6-14.4-5 1.3-9 4.6-11.6 9.8" fill="none" stroke={a2} strokeWidth="3" strokeLinecap="round" />
            <path d="M-5 4h10v19H-5Z" fill={a1} />
          </>
        )
      };
    case "netherlands":
      return {
        opacity: 0.17,
        node: (
          <>
            <path d="M0-25 16-12h-8v9c0 4.7-3 8.7-8 11.6C-5-3.3-8-7.3-8-12v-9h-8L0-25Z" fill={a1} />
            <circle cx="-6" cy="-8" r="2.2" fill="rgba(255,255,255,0.85)" />
            <circle cx="0" cy="-10" r="2.2" fill={a2} />
            <circle cx="6" cy="-8" r="2.2" fill="rgba(255,255,255,0.85)" />
          </>
        )
      };
    case "sweden":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d={SHIELD_PATH} fill={a1} />
            <rect x="-6" y="-24" width="10" height="48" rx="3" fill={a2} />
            <rect x="-24" y="-5" width="48" height="10" rx="3" fill={a2} />
          </>
        )
      };
    case "tunisia":
      return {
        opacity: 0.18,
        node: (
          <>
            <circle r="25" fill="rgba(255,255,255,0.88)" />
            <circle cx="-2" cy="0" r="12" fill={a1} />
            <circle cx="1" cy="0" r="10" fill="rgba(255,255,255,0.88)" />
            <Star x="11" y="0" size={5.8} fill={a1} />
          </>
        )
      };
    case "iran":
      return {
        opacity: 0.18,
        scale: 1.02,
        node: (
          <>
            <path d="M0-24c4.4 0 7.3 3.2 7.3 7.4 0 2.7-1.1 4.8-3 6.7h5.9v6.3H4.6c1.5 1.8 2.5 4 2.5 6.4 0 4.2-2.9 7.4-7.1 7.4-4.2 0-7.1-3.2-7.1-7.4 0-2.4 1-4.6 2.5-6.4h-5.7v-6.3H-4c-1.9-1.9-3-4-3-6.7C-7-20.8-4.1-24 0-24Z" fill={a2} />
            <rect x="-2.4" y="-16" width="4.8" height="32" rx="2.4" fill={a1} />
          </>
        )
      };
    case "egypt":
      return {
        opacity: 0.18,
        scale: 1.02,
        node: (
          <>
            <path d="M-30-4c7.4-12.4 18-19.4 30-19.4s22.6 7 30 19.4c-7.3-2-14.3-3-21.2-3-3 0-5.9.3-8.8.8-2.9-.5-5.8-.8-8.8-.8-6.9 0-13.9 1-21.2 3Z" fill={a2} />
            <path d="M-10 4c2.8-5 6.2-7.6 10-7.6s7.2 2.6 10 7.6c-2.5 2.6-5.8 4-10 4s-7.5-1.4-10-4Z" fill={a3} />
            <path d="M-8 11h16v14H-8Z" fill={a2} />
          </>
        )
      };
    case "newzealand":
      return {
        opacity: 0.17,
        node: (
          <>
            <Star x="-8" y="-16" size={5.8} fill={a2} />
            <Star x="12" y="-6" size={5.4} fill={a2} />
            <Star x="2" y="10" size={6.1} fill={a2} />
            <Star x="-16" y="4" size={5.2} fill={a2} />
          </>
        )
      };
    case "caboverde":
      return {
        opacity: 0.17,
        scale: 1.02,
        node: (
          <>
            <circle r="26" fill="rgba(255,255,255,0.06)" />
            {Array.from({ length: 10 }, (_, index) => {
              const angle = (index / 10) * Math.PI * 2 - Math.PI / 3;
              return (
                <Star
                  key={index}
                  x={Math.cos(angle) * 18}
                  y={Math.sin(angle) * 18}
                  size={4.4}
                  fill={a2}
                />
              );
            })}
          </>
        )
      };
    case "saudiarabia":
      return {
        opacity: 0.17,
        scale: 1.06,
        node: (
          <>
            <path d="M0-22c8 1.8 13 6.4 15.6 14.3C8.7-6.7 3.9-11.4 0-22Z" fill="rgba(255,255,255,0.86)" />
            <path d="M0-22c-8 1.8-13 6.4-15.6 14.3C-8.7-6.7-3.9-11.4 0-22Z" fill="rgba(255,255,255,0.86)" />
            <rect x="-3" y="-18" width="6" height="24" rx="3" fill="rgba(255,255,255,0.86)" />
            <path d="M-24 16c9.4 2.2 18.8 2.2 28.2 0 3.5-.8 7-.8 10.5 0" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" strokeLinecap="round" />
          </>
        )
      };
    case "senegal":
      return {
        opacity: 0.18,
        node: <Star x="0" y="0" size={14} fill={a1} />
      };
    case "iraq":
      return {
        opacity: 0.17,
        scale: 1.05,
        node: (
          <>
            <rect x="-28" y="12" width="56" height="8" rx="4" fill={a3} />
            <rect x="-2.6" y="-18" width="5.2" height="30" rx="2.6" fill={a2} />
            <path d="M0-20c7.5 1.7 12 6 14.6 13.2C8.2-5.9 3.7-10.1 0-20Z" fill={a2} />
            <path d="M0-20c-7.5 1.7-12 6-14.6 13.2C-8.2-5.9-3.7-10.1 0-20Z" fill={a2} />
          </>
        )
      };
    case "norway":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d={SHIELD_PATH} fill={a1} />
            <rect x="-8" y="-24" width="14" height="48" rx="3" fill="rgba(255,255,255,0.9)" />
            <rect x="-24" y="-7" width="48" height="14" rx="3" fill="rgba(255,255,255,0.9)" />
            <rect x="-5" y="-24" width="8" height="48" rx="2.5" fill={a2} />
            <rect x="-24" y="-4" width="48" height="8" rx="2.5" fill={a2} />
          </>
        )
      };
    case "algeria":
      return {
        opacity: 0.18,
        node: (
          <>
            <circle cx="-1" cy="0" r="18" fill={a2} />
            <circle cx="4" cy="0" r="14" fill={a1} />
            <Star x="17" y="0" size={6.4} fill={a2} />
          </>
        )
      };
    case "austria":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d={SHIELD_PATH} fill={a1} />
            <rect x="-24" y="-6" width="48" height="12" rx="3" fill="rgba(255,255,255,0.92)" />
          </>
        )
      };
    case "jordan":
      return {
        opacity: 0.18,
        node: <Star x="0" y="0" size={14} fill="rgba(255,255,255,0.92)" />
      };
    case "congodr":
      return {
        opacity: 0.18,
        scale: 1.06,
        node: (
          <>
            <path d="M-30 18 18-30 30-18-18 30Z" fill={a2} />
            <path d="M-30 12 12-30 30-12-12 30Z" fill={a3} />
            <Star x="-14" y="-14" size={7.4} fill={a1} />
          </>
        )
      };
    case "uzbekistan":
      return {
        opacity: 0.17,
        scale: 1.02,
        node: (
          <>
            <circle cx="-10" cy="-7" r="9" fill="rgba(255,255,255,0.88)" />
            <circle cx="-7" cy="-7" r="7.2" fill={a1} />
            {[-2, 4, 10, 16, 1, 7, 13].map((starX, index) => (
              <Star key={index} x={starX} y={index < 4 ? -14 : -7} size={3.8} fill="rgba(255,255,255,0.88)" />
            ))}
          </>
        )
      };
    case "croatia":
      return {
        opacity: 0.18,
        node: (
          <>
            <path d={SHIELD_PATH} fill="rgba(255,255,255,0.78)" />
            {[-12, -4, 4, 12].flatMap((rowY, rowIndex) =>
              [-8, 0, 8].map((colX, colIndex) => (
                <rect
                  key={`${rowY}-${colX}`}
                  x={colX - 4}
                  y={rowY - 4}
                  width="8"
                  height="8"
                  rx="1.8"
                  fill={(rowIndex + colIndex) % 2 === 0 ? a2 : "rgba(255,255,255,0.92)"}
                />
              ))
            )}
          </>
        )
      };
    case "ghana":
      return {
        opacity: 0.18,
        node: <Star x="0" y="0" size={14} fill={a4} />
      };
    case "panama":
      return {
        opacity: 0.18,
        node: (
          <>
            <rect x="-22" y="-22" width="44" height="44" rx="12" fill="rgba(255,255,255,0.82)" />
            <path d="M0-22h22v22H0Z" fill={a2} />
            <Star x="-9" y="-9" size={6.8} fill={a1} />
            <Star x="9" y="9" size={6.8} fill={a2} />
          </>
        )
      };
    default:
      return null;
  }
}

function accentVar(prefix: AccentPrefix, index: 1 | 2 | 3 | 4 | 5) {
  return `var(--${prefix}-accent-${index})`;
}

function getEmblemStyle(opacity: number, strokeWidth: number): CSSProperties {
  return {
    opacity,
    stroke: "var(--localized-card-emblem-outline)",
    strokeWidth,
    paintOrder: "stroke fill markers",
    vectorEffect: "non-scaling-stroke"
  };
}

function Star({
  x = 0,
  y = 0,
  size = 10,
  rotation = 0,
  fill
}: {
  x?: number | string;
  y?: number | string;
  size?: number;
  rotation?: number;
  fill: string;
}) {
  const scale = size / 14;
  return (
    <polygon
      points={STAR_POINTS}
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}
      fill={fill}
      stroke="none"
    />
  );
}
