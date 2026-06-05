"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

type PopoverPlacement = "bottom" | "top";

type UseViewportAwarePopoverPlacementOptions<T extends HTMLElement> = {
  isOpen: boolean;
  anchorRef: RefObject<T | null>;
  maxHeight?: number;
  minUsefulHeight?: number;
  viewportPadding?: number;
};

export function useViewportAwarePopoverPlacement<T extends HTMLElement>({
  isOpen,
  anchorRef,
  maxHeight = 288,
  minUsefulHeight = 160,
  viewportPadding = 16
}: UseViewportAwarePopoverPlacementOptions<T>) {
  const [placement, setPlacement] = useState<PopoverPlacement>("bottom");
  const [availableHeight, setAvailableHeight] = useState(maxHeight);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePlacement() {
      const anchor = anchorRef.current;
      if (!anchor || typeof window === "undefined") {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, rect.top - viewportPadding);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
      const bottomCannotFitDesiredHeight = spaceBelow < maxHeight;
      const topProvidesMoreRoom = spaceAbove > spaceBelow;
      const bottomIsTooConstrained = spaceBelow < minUsefulHeight;
      const nextPlacement =
        topProvidesMoreRoom && (bottomCannotFitDesiredHeight || bottomIsTooConstrained) ? "top" : "bottom";
      const nextAvailableHeight = Math.max(
        96,
        Math.min(maxHeight, nextPlacement === "top" ? spaceAbove : spaceBelow)
      );

      setPlacement(nextPlacement);
      setAvailableHeight(nextAvailableHeight);
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [anchorRef, isOpen, maxHeight, minUsefulHeight, viewportPadding]);

  const className = placement === "top" ? "bottom-full mb-2" : "top-full mt-2";
  const style: CSSProperties = { maxHeight: `${availableHeight}px` };

  return { placement, className, style };
}
