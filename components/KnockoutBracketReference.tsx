"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { TeamFlag } from "@/components/TeamFlag";
import type { KnockoutBracketEditorView } from "@/lib/bracket-predictions";
import { t } from "@/lib/strings";

type ReferencePreviewSide = {
  teamId: string | null;
  shortLabel: string;
  flagEmoji: string | null;
};

type ReferencePreviewMatch = {
  matchId: string;
  home: ReferencePreviewSide;
  away: ReferencePreviewSide;
};

function formatProjectedSeedLabel(sourceLabel: string | null | undefined) {
  if (!sourceLabel) {
    return "TBD";
  }

  const normalized = sourceLabel.trim();
  const compactSourceMatch = normalized.match(/^([123])([A-L])$/i);
  if (compactSourceMatch) {
    const rank = compactSourceMatch[1] === "1" ? "1st" : compactSourceMatch[1] === "2" ? "2nd" : "3rd";
    return `${compactSourceMatch[2].toUpperCase()}-${rank}`;
  }

  const groupMatch = normalized.match(/^Group\s+([A-Z])\s+(Winner|Runner-up)$/i);
  if (groupMatch) {
    return `${groupMatch[1].toUpperCase()}-${groupMatch[2].toLowerCase() === "winner" ? "1st" : "2nd"}`;
  }

  const bestThirdFromMatch = normalized.match(/^Best\s+3(?:rd)?\s+from\s+([A-L](?:\/[A-L])*)$/i);
  if (bestThirdFromMatch) {
    return `3rd ${bestThirdFromMatch[1].toUpperCase()}`;
  }

  return normalized;
}

function getBracketLayout(matchCount: number) {
  const rowHeight = 22;
  const teamGap = 0;
  const setGap = 18;
  const matchBlockHeight = rowHeight * 2 + teamGap + setGap;
  if (matchCount <= 0) {
    return {
      matchBlockHeight,
      totalHeight: 0,
      rounds: [] as number[][]
    };
  }

  const positions = Array.from({ length: matchCount }, (_, index) => index * matchBlockHeight);
  const rounds: number[][] = [];
  let current = positions.map((position) => position + rowHeight / 2 + 2);

  while (current.length > 1) {
    rounds.push(current);
    const nextRound: number[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const leftPosition = current[index] ?? current[index - 1] ?? 0;
      const rightPosition = current[index + 1] ?? leftPosition;
      nextRound.push((leftPosition + rightPosition) / 2);
    }
    current = nextRound;
  }

  return {
    matchBlockHeight,
    totalHeight: matchCount * matchBlockHeight - setGap,
    rounds
  };
}

function buildReferencePreviewMatches(referenceView: KnockoutBracketEditorView | null | undefined): ReferencePreviewMatch[] {
  const roundOf32Matches = referenceView?.stages.find((stage) => stage.stage === "r32")?.matches ?? [];
  return roundOf32Matches.map((match) => ({
    matchId: match.matchId,
    home: {
      teamId: match.homeTeam?.id ?? null,
      shortLabel: match.homeTeam?.shortName ?? formatProjectedSeedLabel(match.homeSourceLabel),
      flagEmoji: match.homeTeam?.flagEmoji ?? null
    },
    away: {
      teamId: match.awayTeam?.id ?? null,
      shortLabel: match.awayTeam?.shortName ?? formatProjectedSeedLabel(match.awaySourceLabel),
      flagEmoji: match.awayTeam?.flagEmoji ?? null
    }
  }));
}

function BracketPreviewColumn({
  matches,
  side
}: {
  matches: ReferencePreviewMatch[];
  side: "left" | "right";
}) {
  const layout = getBracketLayout(matches.length);
  const connectorViewBoxWidth = 120;
  const innerSegmentWidth = 18;
  const outerSegmentWidth = 10;
  const roundGap = 4;
  const roundOffset = innerSegmentWidth + outerSegmentWidth + roundGap;
  const xStartBase = side === "left" ? 40 : 80;

  return (
    <div className="relative w-[9.75rem]" style={{ height: `${layout.totalHeight}px` }}>
      {layout.totalHeight > 0 ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-y-0 h-full w-[4.75rem] overflow-visible"
          style={side === "left" ? { right: 0 } : { left: 0 }}
          viewBox={`0 0 ${connectorViewBoxWidth} ${layout.totalHeight}`}
          preserveAspectRatio="none"
        >
          {layout.rounds.map((round, roundIndex) => {
            if (roundIndex === layout.rounds.length - 1) {
              return null;
            }
            const xStart = side === "left"
              ? xStartBase + roundIndex * roundOffset
              : xStartBase - roundIndex * roundOffset;
            const xJoin = side === "left" ? xStart + innerSegmentWidth : xStart - innerSegmentWidth;
            const xEnd = side === "left" ? xJoin + outerSegmentWidth : xJoin - outerSegmentWidth;
            const nextRound = layout.rounds[roundIndex + 1] ?? [];
            return round.map((y, index) => {
              const pairIndex = Math.floor(index / 2);
              const targetY = nextRound[pairIndex] ?? y;
              return (
                <g key={`${side}-${roundIndex}-${index}`} className="stroke-gray-300">
                  <line x1={xStart} y1={y} x2={xJoin} y2={y} strokeWidth="1.8" />
                  <line x1={xJoin} y1={Math.min(y, targetY)} x2={xJoin} y2={Math.max(y, targetY)} strokeWidth="1.8" />
                  <line x1={xJoin} y1={targetY} x2={xEnd} y2={targetY} strokeWidth="1.8" />
                </g>
              );
            });
          })}
        </svg>
      ) : null}
      {matches.map((match, index) => (
        <div
          key={match.matchId}
          className="absolute left-0 right-0 block space-y-0 rounded-md px-0.5 py-0"
          style={{ top: `${index * layout.matchBlockHeight}px` }}
        >
          {[match.home, match.away].map((slot, slotIndex) => (
            <div
              key={`${match.matchId}-${slotIndex}`}
              className={
                side === "left"
                  ? `grid min-h-[20px] grid-cols-[1rem_minmax(0,1fr)] items-center gap-1.5 rounded-md px-0.5 py-0 pr-[2.8rem] ${slot.teamId ? "text-gray-900" : "text-gray-400"}`
                  : `grid min-h-[20px] grid-cols-[minmax(0,1fr)_1rem] items-center gap-1.5 rounded-md px-0.5 py-0 pl-[2.8rem] text-right ${slot.teamId ? "text-gray-900" : "text-gray-400"}`
              }
            >
              {side === "left" ? (
                <>
                  <span aria-hidden className="text-xs">
                    <TeamFlag
                      flagEmoji={slot.flagEmoji}
                      teamId={slot.teamId}
                      shortName={slot.shortLabel}
                      className="text-xs"
                      emojiClassName="text-[1em]"
                    />
                  </span>
                  <span className="truncate text-[11px] font-black">{slot.shortLabel}</span>
                </>
              ) : (
                <>
                  <span className="truncate text-[11px] font-black">{slot.shortLabel}</span>
                  <span aria-hidden className="text-xs">
                    <TeamFlag
                      flagEmoji={slot.flagEmoji}
                      teamId={slot.teamId}
                      shortName={slot.shortLabel}
                      className="text-xs"
                      emojiClassName="text-[1em]"
                    />
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function KnockoutBracketReference({
  referenceView,
  language
}: {
  referenceView?: KnockoutBracketEditorView | null;
  language?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const previewMatches = useMemo(() => buildReferencePreviewMatches(referenceView), [referenceView]);
  const leftBracketMatches = previewMatches.slice(0, 8);
  const rightBracketMatches = previewMatches.slice(8, 16);
  const previewBaseWidth = 314;
  const previewBaseHeight = Math.max(
    getBracketLayout(leftBracketMatches.length).totalHeight,
    getBracketLayout(rightBracketMatches.length).totalHeight,
    0
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const element = previewViewportRef.current;
    if (!element) {
      return;
    }

    const updateScale = () => {
      const nextScale = Math.min(1, Math.max(0.88, element.clientWidth / previewBaseWidth));
      setPreviewScale(nextScale);
    };

    updateScale();

    const observer = new ResizeObserver(() => updateScale());
    observer.observe(element);
    return () => observer.disconnect();
  }, [isOpen, previewBaseWidth]);

  return (
    <>
      <div className="mt-4 flex items-center justify-center px-4 pb-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-gray-700 transition hover:border-accent hover:text-accent-dark"
          aria-label={t(language, "knockout.openMyBracketReference")}
        >
          {t(language, "knockout.myBracket")}
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/35 px-0 pb-0 pt-0 sm:items-center sm:px-4 sm:py-4">
          <button
            type="button"
            aria-label={t(language, "common.close")}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t(language, "knockout.myGroupStageBracket")}
            className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-slate-950 sm:h-[92vh] sm:max-w-6xl sm:rounded-[1.5rem] sm:border sm:border-slate-200 sm:shadow-2xl"
          >
            <div className="relative border-b border-slate-200 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-5 sm:pt-4">
              <h2 className="text-center text-sm font-black uppercase tracking-[0.16em] text-slate-950">
                {t(language, "knockout.myBracket")}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={t(language, "common.close")}
                className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700 sm:right-5 sm:top-3"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-4 sm:pb-5">
              {previewMatches.length > 0 ? (
                <div className="mx-auto max-w-xl rounded-[1.25rem] border border-gray-200 bg-white px-1 py-2 shadow-soft sm:px-2 sm:py-3">
                  <div ref={previewViewportRef} className="w-full overflow-hidden">
                    <div
                      className="mx-auto origin-top"
                      style={{
                        width: `${previewBaseWidth}px`,
                        height: `${Math.max(previewBaseHeight * previewScale, previewBaseHeight * 0.58)}px`,
                        transform: `scale(${previewScale})`,
                        transformOrigin: "top center"
                      }}
                    >
                      <div className="grid w-[314px] grid-cols-[9.75rem_0.125rem_9.75rem] gap-0">
                        <BracketPreviewColumn matches={leftBracketMatches} side="left" />
                        <div aria-hidden />
                        <BracketPreviewColumn matches={rightBracketMatches} side="right" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-5 py-6 text-sm font-semibold text-slate-600">
                  {t(language, "knockout.noLockedBracketYet")}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
