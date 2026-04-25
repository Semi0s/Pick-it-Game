"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";

type AvatarProps = {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl"
};

export function Avatar({ name, avatarUrl, size = "md", className = "" }: AvatarProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const initials = useMemo(() => getInitials(name), [name]);
  const showImage = Boolean(avatarUrl && !hasImageError);

  if (showImage) {
    return (
      <img
        src={avatarUrl ?? undefined}
        alt=""
        onError={() => setHasImageError(true)}
        className={`${SIZE_CLASSES[size]} rounded-full border border-gray-200 bg-white object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-full bg-accent-light font-black text-accent-dark ${className}`.trim()}
    >
      {initials}
    </div>
  );
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "?";
  }

  return parts.map((part) => part.slice(0, 1).toUpperCase()).join("");
}
