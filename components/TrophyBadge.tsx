"use client";

type TrophyTier = "bronze" | "silver" | "gold" | "special";

const SIZE_CLASSES: Record<"sm" | "md" | "lg", string> = {
  sm: "h-7 w-7 text-sm",
  md: "h-10 w-10 text-xl",
  lg: "h-14 w-14 text-2xl"
};

const TIER_CLASSES: Record<TrophyTier, string> = {
  bronze: "border-amber-300 bg-amber-100 text-amber-800",
  silver: "border-gray-300 bg-gray-100 text-gray-700",
  gold: "border-yellow-300 bg-yellow-100 text-yellow-800",
  special: "border-accent-light bg-accent-light text-accent-dark"
};

export function TrophyBadge({
  icon,
  tier = "special",
  size = "md",
  className = ""
}: {
  icon: string;
  tier?: TrophyTier | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const normalizedTier = tier ?? "special";

  return (
    <span
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} ${TIER_CLASSES[normalizedTier]} inline-flex items-center justify-center rounded-full border shadow-sm ${className}`.trim()}
    >
      {icon}
    </span>
  );
}
