"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LocalizedCardBackground } from "@/components/localized-card/LocalizedCardBackground";
import {
  getLocalizedCardCssVars,
  getLocalizedCardThemeForUserSurface,
  type LocalizedCardThemeInput
} from "@/lib/localized-card-themes";
import { useAppLanguage } from "@/lib/app-language";
import { t, type TranslationParams } from "@/lib/strings";
import type { AccessLevel } from "@/lib/tier-access";
import { useCurrentUser } from "@/lib/use-current-user";

export { normalizeInviteTokenInput } from "@/lib/group-join-input";

export type PlayerManagementPermissions = {
  canViewAllPlayers: boolean;
  canInvitePlayers: boolean;
  canResetPasswords: boolean;
  canEditRoles: boolean;
  canAssignManagers: boolean;
  canEditManagerLimits: boolean;
  canCreateUnlimitedGroups: boolean;
};

export function InlineDisclosureButton({
  isOpen,
  label,
  onClick,
  variant = "chip",
  className = ""
}: {
  isOpen: boolean;
  label?: string;
  onClick: () => void;
  variant?: "chip" | "subtle";
  className?: string;
}) {
  const { activeLanguage } = useAppLanguage();
  const resolvedLabel =
    label ??
    (variant === "subtle"
      ? isOpen
        ? t(activeLanguage, "common.less")
        : t(activeLanguage, "common.more")
      : isOpen
        ? t(activeLanguage, "common.close")
        : t(activeLanguage, "common.open"));
  const baseClassName =
    variant === "subtle"
      ? "inline-flex items-center gap-1 px-0 py-0 text-[10px] font-semibold uppercase tracking-wide text-gray-700 transition hover:text-accent-dark"
      : "ui-chip-sm border border-gray-300 bg-gray-50 font-bold uppercase tracking-[0.14em] text-gray-700 transition hover:border-accent hover:bg-accent-light hover:text-accent-dark";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className={`${baseClassName} ${className}`.trim()}
    >
      {isOpen ? <ChevronUp aria-hidden className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden className="h-3.5 w-3.5" />}
      {resolvedLabel}
    </button>
  );
}

export function useSessionDisclosureState(
  storageKey: string,
  defaultOpen = false
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const storedValue = window.sessionStorage.getItem(storageKey);
      if (storedValue) {
        setIsOpen(storedValue === "open");
      }
    } catch (caughtError) {
      console.warn(`Could not restore disclosure state for ${storageKey}.`, caughtError);
    } finally {
      setHasHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    try {
      window.sessionStorage.setItem(storageKey, isOpen ? "open" : "closed");
    } catch (caughtError) {
      console.warn(`Could not save disclosure state for ${storageKey}.`, caughtError);
    }
  }, [hasHydrated, isOpen, storageKey]);

  return [isOpen, setIsOpen];
}

export function useSessionJsonState<T>(
  storageKey: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>, { hasHydrated: boolean; hasStoredValue: boolean }] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hasStoredValue, setHasStoredValue] = useState(false);

  useEffect(() => {
    try {
      const storedValue = window.sessionStorage.getItem(storageKey);
      if (storedValue) {
        setValue(JSON.parse(storedValue) as T);
        setHasStoredValue(true);
      }
    } catch (caughtError) {
      console.warn(`Could not restore session state for ${storageKey}.`, caughtError);
    } finally {
      setHasHydrated(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch (caughtError) {
      console.warn(`Could not save session state for ${storageKey}.`, caughtError);
    }
  }, [hasHydrated, storageKey, value]);

  return [value, setValue, { hasHydrated, hasStoredValue }];
}

export function HorizontalChoiceRail({
  children,
  className,
  contentClassName,
  showControls = true,
  prevLabel,
  nextLabel
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showControls?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const { activeLanguage } = useAppLanguage();
  const resolvedPrevLabel = prevLabel ?? t(activeLanguage, "common.previous");
  const resolvedNextLabel = nextLabel ?? t(activeLanguage, "common.next");
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const baseScrollerClassName =
    "flex min-w-max gap-1.5 px-0.5 pb-0.5 snap-x snap-proximity scroll-px-1 touch-pan-x overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]";

  function nudge(direction: "prev" | "next") {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    const delta = Math.max(scroller.clientWidth * 0.55, 140);
    scroller.scrollBy({
      left: direction === "next" ? delta : -delta,
      behavior: "smooth"
    });
  }

  return (
    <div className={className ?? ""}>
      <div className="flex min-w-0 items-stretch gap-1">
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("prev")}
            className="inline-flex w-5 shrink-0 self-stretch items-center justify-center px-0 text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark"
            aria-label={resolvedPrevLabel}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            ref={scrollerRef}
            className={
              contentClassName
                ? `${baseScrollerClassName} overflow-x-auto ${contentClassName}`
                : `${baseScrollerClassName} overflow-x-auto`
            }
          >
            {children}
          </div>
        </div>
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("next")}
            className="inline-flex w-5 shrink-0 self-stretch items-center justify-center px-0 text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark"
            aria-label={resolvedNextLabel}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function WindowChoiceRail({
  children,
  className,
  contentClassName,
  showControls = true,
  prevLabel,
  nextLabel,
  activeItemKey,
  onActiveItemChange,
  motionMode = "floating",
  allowAnchoredTouchScroll = true
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showControls?: boolean;
  prevLabel?: string;
  nextLabel?: string;
  activeItemKey?: string;
  onActiveItemChange?: (key: string) => void;
  motionMode?: "floating" | "anchored";
  allowAnchoredTouchScroll?: boolean;
}) {
  const { activeLanguage } = useAppLanguage();
  const resolvedPrevLabel = prevLabel ?? t(activeLanguage, "common.previous");
  const resolvedNextLabel = nextLabel ?? t(activeLanguage, "common.next");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const beltRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const edgeControlWidth = 24;
  const beltGutterWidth = 40;
  const anchoredEdgeGutterWidth = edgeControlWidth + 10;
  const isAnchored = motionMode === "anchored";
  const baseScrollerClassName = isAnchored
    ? "flex min-w-max gap-1.5 px-0.5 pb-0.5 [&>button]:snap-center"
    : "flex min-w-max gap-1.5 px-0.5 pb-0.5";

  useEffect(() => {
    const viewport = viewportRef.current;
    const belt = beltRef.current;
    if (!viewport || !belt || !activeItemKey) {
      return;
    }

    const updateLayout = () => {
      const items = Array.from(belt.querySelectorAll<HTMLElement>("[data-choice-key]"));
      const activeIndex = items.findIndex((item) => item.dataset.choiceKey === activeItemKey);
      const activeItem = activeIndex >= 0 ? items[activeIndex] : null;

      if (!activeItem) {
        setOffsetX(0);
        setHasOverflow(false);
        setCanScrollPrev(false);
        setCanScrollNext(false);
        return;
      }

      const viewportWidth = viewport.clientWidth;
      const beltWidth = belt.scrollWidth;
      setHasOverflow(beltWidth > viewportWidth + 1);
      setCanScrollPrev(activeIndex > 0);
      setCanScrollNext(activeIndex < items.length - 1);

      if (isAnchored) {
        setOffsetX(0);
        const maxScrollLeft = Math.max(0, beltWidth - viewportWidth);
        const desiredScrollLeft = activeItem.offsetLeft + activeItem.offsetWidth / 2 - viewportWidth / 2;
        const clampedScrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredScrollLeft));

        if (Math.abs(viewport.scrollLeft - clampedScrollLeft) > 1) {
          viewport.scrollTo({
            left: clampedScrollLeft,
            behavior: "auto"
          });
        }
        return;
      }

      const minOffset = Math.min(0, viewportWidth - beltWidth);
      const desiredOffset = viewportWidth / 2 - (activeItem.offsetLeft + activeItem.offsetWidth / 2);
      const clampedOffset = Math.max(minOffset, Math.min(0, desiredOffset));
      setOffsetX(clampedOffset);
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateLayout);
      resizeObserver.observe(viewport);
      resizeObserver.observe(belt);
    }

    return () => {
      window.removeEventListener("resize", updateLayout);
      resizeObserver?.disconnect();
    };
  }, [activeItemKey, children, isAnchored]);

  function nudge(direction: "prev" | "next") {
    const belt = beltRef.current;
    if (!belt || !onActiveItemChange) {
      return;
    }

    const items = Array.from(belt.querySelectorAll<HTMLElement>("[data-choice-key]"));
    const activeIndex = activeItemKey ? items.findIndex((item) => item.dataset.choiceKey === activeItemKey) : -1;
    const targetIndex =
      direction === "next"
        ? Math.min(activeIndex >= 0 ? activeIndex + 1 : 0, items.length - 1)
        : Math.max(activeIndex >= 0 ? activeIndex - 1 : 0, 0);
    const targetKey = items[targetIndex]?.dataset.choiceKey;
    if (targetKey) {
      onActiveItemChange(targetKey);
    }
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (isAnchored) {
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove() {
    if (isAnchored) {
      return;
    }
    return;
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    if (isAnchored) {
      return;
    }
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const horizontalIntent = Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= 28;
    if (!horizontalIntent) {
      return;
    }

    nudge(deltaX < 0 ? "next" : "prev");
  }

  return (
    <div className={className ?? ""}>
      <div className="relative min-w-0">
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("prev")}
            disabled={!canScrollPrev}
            className="absolute inset-y-0 left-0 z-10 inline-flex w-6 items-center justify-center bg-white text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
            style={{ width: edgeControlWidth }}
            aria-label={resolvedPrevLabel}
          >
            <span aria-hidden>‹</span>
          </button>
        ) : null}
        <div
          ref={viewportRef}
          className={`min-w-0 select-none ${
            isAnchored
              ? allowAnchoredTouchScroll
                ? "touch-pan-x snap-x snap-mandatory scroll-smooth overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-px-10 [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch]"
                : "overflow-x-hidden overflow-y-hidden"
              : "touch-pan-y overflow-hidden"
          }`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            touchStartRef.current = null;
          }}
        >
          {showControls ? (
            <>
              <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-6 top-0 z-[11] w-px bg-gray-200" />
              <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-6 top-0 z-[11] w-px bg-gray-200" />
            </>
          ) : null}
          <div
            ref={beltRef}
            className={contentClassName ? `${baseScrollerClassName} ${contentClassName}` : baseScrollerClassName}
            style={
              isAnchored
                ? undefined
                : {
                    transform: `translateX(${offsetX}px)`,
                    transition: hasOverflow ? "transform 180ms ease-out" : undefined,
                    willChange: "transform"
                  }
            }
          >
            {showControls ? (
              <div
                aria-hidden="true"
                className="shrink-0"
                style={{ width: isAnchored ? anchoredEdgeGutterWidth : beltGutterWidth }}
              />
            ) : null}
            {children}
            {showControls ? (
              <div
                aria-hidden="true"
                className="shrink-0"
                style={{ width: isAnchored ? anchoredEdgeGutterWidth : beltGutterWidth }}
              />
            ) : null}
          </div>
        </div>
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("next")}
            disabled={!canScrollNext}
            className="absolute inset-y-0 right-0 z-10 inline-flex w-6 items-center justify-center bg-white text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
            style={{ width: edgeControlWidth }}
            aria-label={resolvedNextLabel}
          >
            <span aria-hidden>›</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ManagementIntro({
  eyebrow,
  eyebrowKey,
  eyebrowParams,
  title,
  titleKey,
  titleParams,
  statusChip,
  statusChipKey,
  statusChipParams,
  statusChipPlacement = "top-right",
  localizedThemeInput
}: {
  eyebrow?: string;
  eyebrowKey?: string;
  eyebrowParams?: TranslationParams;
  title?: string;
  titleKey?: string;
  titleParams?: TranslationParams;
  description: string;
  statusChip?: string | null;
  statusChipKey?: string;
  statusChipParams?: TranslationParams;
  secondaryNote?: string | null;
  disclosureStorageKey?: string;
  disclosureVariant?: "chip" | "subtle";
  disclosurePlacement?: "top-right" | "below-title" | "bottom-right";
  statusChipPlacement?: "top-right" | "below-title";
  collapseBodyWhenClosed?: boolean;
  localizedThemeInput?: LocalizedCardThemeInput;
}) {
  const { user } = useCurrentUser();
  const { activeLanguage } = useAppLanguage();
  const localizedTheme = getLocalizedCardThemeForUserSurface({
    visualThemeId: localizedThemeInput?.visualThemeId ?? user?.visualThemeId,
    homeTeamId: localizedThemeInput?.homeTeamId ?? user?.homeTeamId,
    countryCode: localizedThemeInput?.countryCode,
    marketCode: localizedThemeInput?.marketCode,
    preferredLanguage: localizedThemeInput?.preferredLanguage ?? user?.preferredLanguage
  });
  const localizedCardVars = getLocalizedCardCssVars(localizedTheme);
  const resolvedEyebrow = eyebrowKey ? t(activeLanguage, eyebrowKey, eyebrowParams) : eyebrow;
  const resolvedTitle = titleKey ? t(activeLanguage, titleKey, titleParams) : title;
  const resolvedStatusChip = statusChipKey ? t(activeLanguage, statusChipKey, statusChipParams) : statusChip;
  const shouldShowTopRightChip = Boolean(resolvedStatusChip) && statusChipPlacement === "top-right";
  const controlSurfaceStyle = {
    backgroundColor: "var(--localized-card-control-surface)",
    color: "var(--localized-card-control-text)"
  } as const;

  return (
    <section
      className="relative overflow-hidden rounded-[1.15rem] p-5"
      style={{
        ...localizedCardVars,
        backgroundColor: "var(--localized-card-bg)",
        borderColor: "var(--localized-card-border)",
        color: "var(--localized-card-text)"
      }}
    >
      <LocalizedCardBackground theme={localizedTheme} preserveRightControlZone={shouldShowTopRightChip} />
      <div className="flex items-start justify-between gap-3">
        {resolvedEyebrow ? (
          <p className="relative text-sm font-bold uppercase tracking-wide text-[color:var(--localized-card-secondary-text)]">
            {resolvedEyebrow}
          </p>
        ) : (
          <div />
        )}
        {shouldShowTopRightChip ? (
          <div
            className="ui-chip-sm relative shrink-0 font-semibold"
            style={controlSurfaceStyle}
          >
            {resolvedStatusChip}
          </div>
        ) : null}
      </div>
      <div className="relative mt-1 min-w-0">
        <h2 className="text-xl font-black leading-tight text-[color:var(--localized-card-text)] sm:text-2xl">{resolvedTitle}</h2>
        {resolvedStatusChip && statusChipPlacement === "below-title" ? (
          <div className="mt-3 flex justify-start">
            <div
              className="ui-chip-sm shrink-0 font-semibold"
              style={controlSurfaceStyle}
            >
              {resolvedStatusChip}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function HierarchyPanel({
  activeLevel,
  activeDetails
}: {
  activeLevel?: AccessLevel;
  activeDetails?: string[];
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState("my-groups:levels-section", false);
  const { activeLanguage } = useAppLanguage();
  const gt = (key: string, params?: TranslationParams) => t(activeLanguage, `groups.${key}`, params);
  const levels: Array<{
    key: AccessLevel;
    title: string;
    badge: string;
    copy: string;
    tone: "success" | "warning" | "accent" | "neutral";
  }> = [
    {
      key: "player",
      title: gt("levelPlayerTitle"),
      badge: gt("levelPlayerBadge"),
      copy: gt("levelPlayerCopy"),
      tone: "success"
    },
    {
      key: "captain",
      title: gt("levelCaptainTitle"),
      badge: gt("levelCaptainBadge"),
      copy: gt("levelCaptainCopy"),
      tone: "neutral"
    },
    {
      key: "manager",
      title: gt("levelManagerTitle"),
      badge: gt("levelManagerBadge"),
      copy: gt("levelManagerCopy"),
      tone: "warning"
    },
    {
      key: "director",
      title: gt("levelLeagueTitle"),
      badge: gt("levelLeagueBadge"),
      copy: gt("levelLeagueCopy"),
      tone: "warning"
    },
    {
      key: "managing_director",
      title: gt("levelLeaguePlusTitle"),
      badge: gt("levelLeaguePlusBadge"),
      copy: gt("levelLeaguePlusCopy"),
      tone: "warning"
    }
  ];

  return (
    <section className="space-y-3">
      <div className="ui-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-accent-dark">{gt("levels")}</p>
          <InlineDisclosureButton
            isOpen={isOpen}
            variant="subtle"
            onClick={() => setIsOpen((current) => !current)}
          />
        </div>
      </div>
      {isOpen ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {levels.map((level) => {
            const isActive = activeLevel === level.key;
            const accentClass =
              level.key === "super_admin"
                ? "text-accent-dark"
                : level.key === "manager" || level.key === "director" || level.key === "managing_director"
                  ? "text-amber-700"
                  : "text-accent-dark";

            return (
              <HierarchyCard
                key={level.key}
                title={
                  <>
                    {level.title}{" "}
                    {isActive ? <span className={`text-sm font-black ${accentClass}`}>({gt("levelYou")})</span> : null}
                  </>
                }
                badge={level.badge}
                copy={level.copy}
                tone={level.tone}
                isActive={isActive}
                detailLines={isActive ? activeDetails : undefined}
              />
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

export function ManagementToolbar({
  searchValue,
  onSearchChange,
  filterValue,
  onFilterChange,
  filters,
  trailing,
  className
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filters: Array<{ value: string; label: string }>;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ui-card grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end ${className ?? ""}`}>
      <label className="block">
        <span className="text-sm font-bold text-gray-800">Search</span>
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or email"
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
        />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-gray-800">Filter</span>
        <select
          value={filterValue}
          onChange={(event) => onFilterChange(event.target.value)}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
        >
          {filters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </label>
      <div className="md:justify-self-end">{trailing}</div>
    </div>
  );
}

export function ManagementSection({
  title,
  description,
  storageKey,
  defaultOpen = true,
  badge,
  children
}: {
  title: string;
  description?: string;
  storageKey: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useSessionDisclosureState(storageKey, defaultOpen);

  return (
    <section className="space-y-3">
      <div className="ui-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black">{title}</h3>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {badge}
            <InlineDisclosureButton
              isOpen={isOpen}
              variant="subtle"
              onClick={() => setIsOpen((current) => !current)}
            />
          </div>
        </div>
        {isOpen && description ? <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{description}</p> : null}
      </div>
      {isOpen ? children : null}
    </section>
  );
}

export function ManagementCard({
  title,
  subtitle,
  badges,
  children,
  actions,
  titleClassName,
  headerActions,
  className
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  titleClassName?: string;
  headerActions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[1.15rem] border border-gray-200 p-4 ${className ?? "bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={titleClassName ?? "text-base"}>{title}</div>
          {subtitle ? <div className="truncate text-sm font-semibold text-gray-600">{subtitle}</div> : null}
        </div>
        {badges || headerActions ? (
          <div className="flex flex-wrap items-start justify-end gap-2">
            {badges ? <div className="flex flex-wrap justify-end gap-2">{badges}</div> : null}
            {headerActions}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function ManagementGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-3 text-sm">{children}</dl>;
}

export function ManagementDatum({
  label,
  value,
  note,
  fullWidth = false
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : undefined}>
      <dt className="font-bold text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
      {note ? <p className="mt-0.5 text-xs font-semibold text-gray-500">{note}</p> : null}
    </div>
  );
}

export function ManagementBadge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const className =
    tone === "accent"
      ? "bg-accent-light text-accent-dark"
      : tone === "success"
        ? "bg-green-50 text-green-700"
        : tone === "warning"
          ? "bg-amber-50 text-amber-700"
          : tone === "danger"
            ? "bg-red-50 text-red-700"
            : "bg-gray-100 text-gray-700";

  return (
    <span className={`ui-chip-sm border border-transparent font-bold uppercase tracking-[0.14em] ${className}`}>
      {label}
    </span>
  );
}

export function ActionButton({
  children,
  onClick,
  disabled,
  tone = "neutral",
  fullWidth = false,
  type = "button"
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "accent" | "danger";
  fullWidth?: boolean;
  type?: "button" | "submit";
}) {
  const className =
    tone === "accent"
      ? "ui-button-accent"
      : tone === "danger"
        ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "ui-button-neutral-accent";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`ui-action-button ${fullWidth ? "w-full" : ""} inline-flex min-h-11 min-w-0 items-center justify-center rounded-md border px-4 py-3 text-center text-sm font-bold leading-tight [overflow-wrap:anywhere] transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
    >
      {children}
    </button>
  );
}

export function ManagementEmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-[1.15rem] bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
      {message}
    </p>
  );
}

export function InviteEntryForm({
  language,
  value,
  onValueChange,
  onSubmit,
  submitLabel,
  isPending = false,
  description
}: {
  language?: string | null;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  isPending?: boolean;
  description?: string;
}) {
  const resolvedSubmitLabel = submitLabel ?? t(language, "groups.openInvite");
  const resolvedDescription = description ?? t(language, "groups.inviteDescription");

  return (
    <div className="ui-card p-4">
      <p className="text-sm font-black text-gray-950">{t(language, "groups.useInviteLink")}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{resolvedDescription}</p>
      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{t(language, "groups.inviteLinkOrToken")}</span>
        <input
          autoFocus
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={t(language, "groups.pasteLinkOrToken")}
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
        />
      </label>
      <div className="mt-4">
        <ActionButton onClick={onSubmit} disabled={isPending} tone="accent" fullWidth>
          {isPending ? t(language, "onboarding.opening") : resolvedSubmitLabel}
        </ActionButton>
      </div>
    </div>
  );
}

export function InlineConfirmation({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isPending = false,
  tone = "danger"
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  tone?: "danger" | "neutral";
}) {
  return (
    <div className="ui-card-soft p-4">
      <p className="text-sm font-black text-gray-950">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton onClick={onConfirm} disabled={isPending} tone={tone === "danger" ? "danger" : "accent"}>
          {isPending ? "Working..." : confirmLabel}
        </ActionButton>
        <ActionButton onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </ActionButton>
      </div>
    </div>
  );
}

export function InlineTextConfirmation({
  title,
  description,
  confirmLabel,
  expectedValue,
  inputLabel,
  inputPlaceholder,
  value,
  onValueChange,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isPending = false,
  tone = "danger"
}: {
  title: string;
  description: string;
  confirmLabel: string;
  expectedValue: string;
  inputLabel: string;
  inputPlaceholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  tone?: "danger" | "neutral";
}) {
  const matches = value.trim() === expectedValue.trim();

  return (
    <div className="rounded-[1.15rem] border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-black text-gray-950">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">{description}</p>
      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{inputLabel}</span>
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={inputPlaceholder}
          className="mt-2 w-full rounded-md border border-red-200 bg-white px-3 py-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
      </label>
      <p className="mt-2 text-xs font-semibold text-gray-600">
        Type <span className="font-black text-gray-950">{expectedValue}</span> to continue.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton onClick={onConfirm} disabled={isPending || !matches} tone={tone === "danger" ? "danger" : "accent"}>
          {isPending ? "Working..." : confirmLabel}
        </ActionButton>
        <ActionButton onClick={onCancel} disabled={isPending}>
          {cancelLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function HierarchyCard({
  title,
  badge,
  copy,
  tone,
  isActive = false,
  detailLines
}: {
  title: ReactNode;
  badge: string;
  copy: string;
  tone: "accent" | "warning" | "success" | "neutral";
  isActive?: boolean;
  detailLines?: string[];
}) {
  const activeClasses =
    tone === "accent"
      ? "border-accent-light bg-accent-light/40"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : tone === "neutral"
          ? "border-gray-300 bg-gray-100"
          : "border-green-200 bg-green-50";

  return (
    <div className={`rounded-[1rem] border p-2 transition-colors ${isActive ? activeClasses : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`text-xs font-black ${isActive ? "text-gray-950" : "text-gray-500"}`}>{title}</h3>
        <div className="flex items-center gap-2">
          <ManagementBadge label={badge} tone={isActive ? tone : "neutral"} />
        </div>
      </div>
      <>
        <p className={`mt-1.5 text-[11px] font-semibold leading-4 ${isActive ? "text-gray-700" : "text-gray-500"}`}>{copy}</p>
        {isActive && detailLines && detailLines.length > 0 ? (
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] font-semibold text-gray-700">
            {detailLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </>
    </div>
  );
}
