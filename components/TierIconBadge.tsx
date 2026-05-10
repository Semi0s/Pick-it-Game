"use client";

import Image from "next/image";
import { getAccessLevelDisplayLabel, type AccessLevel } from "@/lib/tier-access";

const TIER_ICON_MAP: Record<AccessLevel, string> = {
  player: "/images/tier-icons/PlayerLevel_icon.png",
  captain: "/images/tier-icons/CaptainLevel_icon.png",
  manager: "/images/tier-icons/ManagerLevel_icon.png",
  director: "/images/tier-icons/DirectorLevel_icon.png",
  managing_director: "/images/tier-icons/ManagingDirectorLevel_icon.png",
  super_admin: "/images/tier-icons/captain-pass-icon.png"
};

export function getTierBadgeLabel(accessLevel: AccessLevel) {
  return accessLevel === "super_admin" ? "Admin" : getAccessLevelDisplayLabel(accessLevel);
}

export function TierIconBadge({
  accessLevel,
  size = 24,
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

  return (
    <span
      className={className ?? "inline-flex shrink-0 items-center justify-center"}
      title={label}
      aria-label={label}
    >
      <Image
        src={TIER_ICON_MAP[accessLevel]}
        alt={label}
        width={size}
        height={size}
        className="h-auto w-auto object-contain"
      />
    </span>
  );
}
