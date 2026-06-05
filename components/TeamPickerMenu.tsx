"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useViewportAwarePopoverPlacement } from "@/lib/use-viewport-aware-popover-placement";

type TeamPickerOption = {
  id: string;
  name: string;
  groupName: string;
  flagEmoji?: string | null;
};

type TeamPickerMenuProps = {
  value: string;
  options: TeamPickerOption[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function TeamPickerMenu({
  value,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  onChange
}: TeamPickerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value]);
  const popoverPlacement = useViewportAwarePopoverPlacement({
    isOpen,
    anchorRef: menuRef,
    maxHeight: 288,
    minUsefulHeight: 180
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-left text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="inline-flex h-5 w-6 shrink-0 items-center justify-center text-base leading-none">
            {selectedOption?.flagEmoji ?? ""}
          </span>
          <span className={`truncate ${selectedOption ? "font-bold text-gray-900" : "font-semibold text-gray-500"}`}>
            {selectedOption ? `${selectedOption.groupName} · ${selectedOption.name}` : placeholder}
          </span>
        </span>
        <span aria-hidden className="text-xs font-black text-gray-400">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div
          role="listbox"
          style={popoverPlacement.style}
          className={`absolute left-0 right-0 z-30 overflow-y-auto rounded-[1rem] border border-gray-200 bg-white p-1 shadow-xl shadow-gray-950/10 ${popoverPlacement.className}`}
        >
          <button
            type="button"
            role="option"
            aria-selected={!selectedOption}
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-[0.75rem] px-2.5 py-2 text-left text-sm font-semibold transition ${
              !selectedOption ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="inline-flex h-5 w-6 shrink-0" aria-hidden />
            <span className="truncate">{placeholder}</span>
          </button>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={option.id === value}
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-[0.75rem] px-2.5 py-2 text-left text-sm font-semibold transition ${
                option.id === value ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span aria-hidden className="inline-flex h-5 w-6 shrink-0 items-center justify-center text-base leading-none">
                {option.flagEmoji ?? ""}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {option.groupName} · {option.name}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
