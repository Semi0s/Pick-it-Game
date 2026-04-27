"use client";

import { Trophy, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { HomeTeamBadge } from "@/components/HomeTeamBadge";
import { TrophyBadge } from "@/components/TrophyBadge";

type AwardableTrophy = {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier?: "bronze" | "silver" | "gold" | "special" | null;
  awardSource?: "system" | "manager";
};

type AwardableMember = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  homeTeamId?: string | null;
  trophies: Array<{ id: string }>;
};

type ManagedTrophyAwardSheetProps = {
  open: boolean;
  groupName: string;
  member: AwardableMember | null;
  trophies: AwardableTrophy[];
  pendingTrophyId?: string | null;
  onAward: (trophyId: string) => void;
  onClose: () => void;
};

export function ManagedTrophyAwardSheet({
  open,
  groupName,
  member,
  trophies,
  pendingTrophyId,
  onAward,
  onClose
}: ManagedTrophyAwardSheetProps) {
  if (!open || !member) {
    return null;
  }

  const availableTrophies = trophies.filter(
    (trophy) =>
      trophy.awardSource === "manager" &&
      !member.trophies.some((awardedTrophy) => awardedTrophy.id === trophy.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/35 md:items-center md:justify-center md:p-6">
      <button type="button" aria-label="Close trophy sheet" onClick={onClose} className="absolute inset-0" />
      <div className="relative w-full rounded-t-2xl bg-white p-4 shadow-2xl md:max-w-2xl md:rounded-2xl md:p-5">
        <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-gray-200" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">Award Trophy</p>
            <div className="mt-2 flex items-start gap-3">
              <Avatar name={member.name} avatarUrl={member.avatarUrl} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-base font-black text-gray-950">{member.name}</p>
                <p className="truncate text-sm font-semibold text-gray-600">{groupName}</p>
                {member.homeTeamId ? (
                  <div className="mt-2">
                    <HomeTeamBadge teamId={member.homeTeamId} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
            aria-label="Close trophy sheet"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-black uppercase tracking-wide text-gray-700">Select Trophy</h4>
            <Trophy className="h-4 w-4 text-accent-dark" aria-hidden />
          </div>

          <TrophyAwardSection
            emptyState="No preset trophies are available right now."
            trophies={availableTrophies}
            pendingTrophyId={pendingTrophyId}
            onAward={onAward}
          />
        </div>
      </div>
    </div>
  );
}

function TrophyAwardSection({
  emptyState,
  trophies,
  pendingTrophyId,
  onAward
}: {
  emptyState: string;
  trophies: AwardableTrophy[];
  pendingTrophyId?: string | null;
  onAward: (trophyId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {trophies.length > 0 ? (
        <div className="grid gap-2">
          {trophies.map((trophy) => (
            <button
              key={trophy.id}
              type="button"
              onClick={() => onAward(trophy.id)}
              disabled={pendingTrophyId === trophy.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-left transition hover:border-accent hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-gray-950">
                  {trophy.icon} {trophy.name}
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  {trophy.description || "Preset manager trophy"}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <TrophyBadge icon={trophy.icon} tier={trophy.tier} size="sm" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">{emptyState}</p>
      )}
    </div>
  );
}
