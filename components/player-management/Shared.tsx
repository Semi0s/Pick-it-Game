"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

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
  variant = "chip"
}: {
  isOpen: boolean;
  label?: string;
  onClick: () => void;
  variant?: "chip" | "subtle";
}) {
  const resolvedLabel =
    label ?? (variant === "subtle" ? (isOpen ? "Less" : "More") : isOpen ? "Close" : "Open");
  const className =
    variant === "subtle"
      ? "inline-flex items-center gap-1 px-0 py-0 text-[10px] font-semibold uppercase tracking-wide text-gray-700 transition hover:text-accent-dark"
      : "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-700 transition hover:border-accent hover:bg-accent-light hover:text-accent-dark";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className={className}
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
  prevLabel = "Show previous options",
  nextLabel = "Show more options"
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showControls?: boolean;
  prevLabel?: string;
  nextLabel?: string;
}) {
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
            aria-label={prevLabel}
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
            aria-label={nextLabel}
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
  prevLabel = "Show previous options",
  nextLabel = "Show more options",
  activeItemKey,
  onActiveItemChange
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  showControls?: boolean;
  prevLabel?: string;
  nextLabel?: string;
  activeItemKey?: string;
  onActiveItemChange?: (key: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const beltRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const minTotalOffsetRef = useRef(0);
  const centeredOffsetRef = useRef(0);
  const userOffsetRef = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [userOffsetX, setUserOffsetX] = useState(0);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const edgeControlWidth = 24;
  const beltGutterWidth = 40;
  const baseScrollerClassName = "flex min-w-max gap-1.5 px-0.5 pb-0.5";

  const clampUserOffset = useCallback((nextUserOffset: number) => {
    const minUserOffset = minTotalOffsetRef.current - centeredOffsetRef.current;
    const maxUserOffset = 0 - centeredOffsetRef.current;
    return Math.max(minUserOffset, Math.min(maxUserOffset, nextUserOffset));
  }, []);

  const updateUserOffset = useCallback(
    (nextUserOffset: number) => {
      const clampedOffset = clampUserOffset(nextUserOffset);
      userOffsetRef.current = clampedOffset;
      setUserOffsetX(clampedOffset);
    },
    [clampUserOffset]
  );

  useEffect(() => {
    updateUserOffset(0);
  }, [activeItemKey, updateUserOffset]);

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
      const minOffset = Math.min(0, viewportWidth - beltWidth);
      const desiredOffset = viewportWidth / 2 - (activeItem.offsetLeft + activeItem.offsetWidth / 2);
      const clampedOffset = Math.max(minOffset, Math.min(0, desiredOffset));
      minTotalOffsetRef.current = minOffset;
      centeredOffsetRef.current = clampedOffset;

      setOffsetX(clampedOffset);
      updateUserOffset(userOffsetRef.current);
      setHasOverflow(beltWidth > viewportWidth + 1);
      setCanScrollPrev(activeIndex > 0);
      setCanScrollNext(activeIndex < items.length - 1);
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
  }, [activeItemKey, children, updateUserOffset]);

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
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    isDraggingRef.current = false;
    setDragOffsetX(0);
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    if (!start) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    isDraggingRef.current = true;
    setDragOffsetX(deltaX);
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    if (!start) {
      setDragOffsetX(0);
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      setDragOffsetX(0);
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (!wasDragging || Math.abs(deltaX) <= Math.abs(deltaY)) {
      setDragOffsetX(0);
      return;
    }

    updateUserOffset(userOffsetRef.current + deltaX);
    setDragOffsetX(0);
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
            aria-label={prevLabel}
          >
            <span aria-hidden>‹</span>
          </button>
        ) : null}
        <div
          ref={viewportRef}
          className="min-w-0 overflow-hidden touch-pan-y select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            touchStartRef.current = null;
            isDraggingRef.current = false;
            setDragOffsetX(0);
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
            style={{
              transform: `translateX(${offsetX + userOffsetX + dragOffsetX}px)`,
              transition: hasOverflow ? (dragOffsetX !== 0 ? "none" : "transform 180ms ease-out") : undefined,
              willChange: "transform"
            }}
          >
            {showControls ? <div aria-hidden="true" className="shrink-0" style={{ width: beltGutterWidth }} /> : null}
            {children}
            {showControls ? <div aria-hidden="true" className="shrink-0" style={{ width: beltGutterWidth }} /> : null}
          </div>
        </div>
        {showControls ? (
          <button
            type="button"
            onClick={() => nudge("next")}
            disabled={!canScrollNext}
            className="absolute inset-y-0 right-0 z-10 inline-flex w-6 items-center justify-center bg-white text-gray-700 transition active:scale-95 hover:bg-accent-light hover:text-accent-dark disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-white"
            style={{ width: edgeControlWidth }}
            aria-label={nextLabel}
          >
            <span aria-hidden>›</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function normalizeInviteTokenInput(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const inviteToken = parsedUrl.searchParams.get("invite");
    return inviteToken?.trim() || null;
  } catch {
    return trimmedValue;
  }
}

export function ManagementIntro({
  eyebrow,
  title,
  description,
  statusChip,
  secondaryNote,
  disclosureStorageKey,
  disclosureVariant = "subtle",
  disclosurePlacement = "below-title",
  statusChipPlacement = "top-right"
}: {
  eyebrow?: string;
  title: string;
  description: string;
  statusChip?: string | null;
  secondaryNote?: string | null;
  disclosureStorageKey?: string;
  disclosureVariant?: "chip" | "subtle";
  disclosurePlacement?: "top-right" | "below-title";
  statusChipPlacement?: "top-right" | "below-title";
}) {
  const [isMoreOpen, setIsMoreOpen] = useSessionDisclosureState(
    disclosureStorageKey ??
      `management-intro:${(eyebrow ?? title).toLowerCase().replace(/\s+/g, "-")}`,
    false
  );

  return (
    <section className="rounded-lg bg-gray-100 p-5">
      <div className="flex items-start justify-between gap-3">
        {eyebrow ? <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">{eyebrow}</p> : <div />}
        {disclosurePlacement === "top-right" ? (
          <InlineDisclosureButton
            isOpen={isMoreOpen}
            variant={disclosureVariant}
            onClick={() => setIsMoreOpen((current) => !current)}
          />
        ) : statusChip && statusChipPlacement === "top-right" ? (
          <div className="shrink-0 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
            {statusChip}
          </div>
        ) : null}
      </div>
      <div className="mt-3 min-w-0">
        <h2 className="text-xl font-black leading-tight sm:text-2xl">{title}</h2>
        {statusChip && statusChipPlacement === "below-title" ? (
          <div className="mt-3 flex justify-start">
            <div className="shrink-0 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 sm:px-3 sm:py-2">
              {statusChip}
            </div>
          </div>
        ) : null}
        {disclosurePlacement === "below-title" ? (
          <div className="mt-3 flex justify-start">
            <InlineDisclosureButton
              isOpen={isMoreOpen}
              variant={disclosureVariant}
              onClick={() => setIsMoreOpen((current) => !current)}
            />
          </div>
        ) : null}
        {isMoreOpen ? (
          <div className="mt-3">
            <p className="text-sm leading-6 text-gray-600">{description}</p>
            {secondaryNote ? (
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">{secondaryNote}</p>
            ) : null}
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
  activeLevel?: "super_admin" | "manager" | "player";
  activeDetails?: string[];
}) {
  return (
    <section className="space-y-3">
      <p className="text-sm font-bold uppercase tracking-wide text-accent-dark">LEVELS</p>
      <div className="grid gap-3 md:grid-cols-3">
        <HierarchyCard
          title={
            <>
              Player {activeLevel === "player" ? <span className="text-sm font-black text-green-700">(YOU)</span> : null}
            </>
          }
          badge="Participant"
          copy="Can join groups, make predictions, and view scores and leaderboards."
          tone="success"
          isActive={activeLevel === "player"}
          detailLines={activeLevel === "player" ? activeDetails : undefined}
        />
        <HierarchyCard
          title={
            <>
              Manager {activeLevel === "manager" ? <span className="text-sm font-black text-amber-700">(YOU)</span> : null}
            </>
          }
          badge="Limited by assigned permissions"
          copy="Can manage assigned groups only. Can invite players and manage membership within the limits set by a super admin."
          tone="warning"
          isActive={activeLevel === "manager"}
          detailLines={activeLevel === "manager" ? activeDetails : undefined}
        />
        <HierarchyCard
          title={
            <>
              Director {activeLevel === "super_admin" ? <span className="text-sm font-black text-accent-dark">(YOU)</span> : null}
            </>
          }
          badge="Full access"
          copy="Can create and manage groups, players and managers with some limits."
          tone="accent"
          isActive={activeLevel === "super_admin"}
          detailLines={activeLevel === "super_admin" ? activeDetails : undefined}
        />
      </div>
    </section>
  );
}

export function ManagementToolbar({
  searchValue,
  onSearchChange,
  filterValue,
  onFilterChange,
  filters,
  trailing
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filters: Array<{ value: string; label: string }>;
  trailing?: ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
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
    <div className={`rounded-lg border border-gray-200 p-4 ${className ?? "bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
      <div className="mt-4">{children}</div>
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
  fullWidth = false
}: {
  label: string;
  value: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "col-span-2" : undefined}>
      <dt className="font-bold text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900">{value}</dd>
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
    <span className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${className}`}>
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
      ? "border-accent bg-accent text-white hover:bg-accent-dark"
      : tone === "danger"
        ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "border-gray-300 bg-gray-50 text-gray-800 hover:border-accent hover:bg-accent-light";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${fullWidth ? "w-full" : ""} rounded-md border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500 ${className}`}
    >
      {children}
    </button>
  );
}

export function ManagementEmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-600">
      {message}
    </p>
  );
}

export function InviteEntryForm({
  value,
  onValueChange,
  onSubmit,
  submitLabel = "Open Invite",
  isPending = false,
  description = "Paste a full invite link or just the invite token."
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  isPending?: boolean;
  description?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-black text-gray-950">Use an invite link</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">{description}</p>
      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Invite link or token</span>
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="Paste a link or token"
          className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent-light"
        />
      </label>
      <div className="mt-4">
        <ActionButton onClick={onSubmit} disabled={isPending} tone="accent" fullWidth>
          {isPending ? "Opening..." : submitLabel}
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
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
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
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
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
  tone: "accent" | "warning" | "success";
  isActive?: boolean;
  detailLines?: string[];
}) {
  const activeClasses =
    tone === "accent"
      ? "border-accent-light bg-accent-light/40"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : "border-green-200 bg-green-50";

  return (
    <div className={`rounded-lg border p-4 transition-colors ${isActive ? activeClasses : "border-gray-200 bg-gray-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={`text-lg font-black ${isActive ? "text-gray-950" : "text-gray-500"}`}>{title}</h3>
        <ManagementBadge label={badge} tone={isActive ? tone : "neutral"} />
      </div>
      <p className={`mt-3 text-sm font-semibold leading-6 ${isActive ? "text-gray-700" : "text-gray-500"}`}>{copy}</p>
      {isActive && detailLines && detailLines.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs font-semibold text-gray-700">
          {detailLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
