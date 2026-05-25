"use client";

import { getAccessLevelDisplayLabel, type AccessLevel } from "@/lib/tier-access";

const TIER_CODE_MAP: Record<AccessLevel, string> = {
  player: "P",
  captain: "C",
  manager: "M",
  director: "L",
  managing_director: "L+",
  super_admin: "A"
};

export function getTierBadgeLabel(accessLevel: AccessLevel) {
  return accessLevel === "super_admin" ? "Admin" : getAccessLevelDisplayLabel(accessLevel);
}

export function TierIconBadge({
  accessLevel,
  size = 18,
  className,
  title
}: {
  accessLevel: AccessLevel;
  size?: number;
  className?: string;
  title?: string;
}) {
  const defaultLabel = getTierBadgeLabel(accessLevel);
  const label = title ?? defaultLabel;
  const code = TIER_CODE_MAP[accessLevel];
  const toneClass =
    accessLevel === "super_admin"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-accent/30 bg-accent-light/40 text-accent-dark";
  const compactWidth = code.length > 1 ? 24 : 18;
  const compactHeight = 18;

  return (
    <span
      className={
        className ??
        `ui-chip-sm shrink-0 border font-black ${toneClass}`
      }
      title={label}
      aria-label={label}
      style={{
        minWidth: `${Math.max(compactWidth, Math.round(size * 0.75))}px`,
        minHeight: `${Math.max(compactHeight, Math.round(size * 0.75))}px`
      }}
    >
      {code}
    </span>
  );
}
