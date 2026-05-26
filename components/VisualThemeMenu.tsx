"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VisualThemeSelectOption } from "@/lib/visual-theme-options";

type VisualThemeMenuProps = {
  value: string;
  options: VisualThemeSelectOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function VisualThemeMenu({
  value,
  options,
  placeholder,
  disabled = false,
  onChange
}: VisualThemeMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

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
    <div ref={menuRef} className="relative mt-2">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-[0.9rem] border border-gray-300 bg-white px-3 py-3 text-left text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent-light disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selectedOption ? <VisualThemeOptionIcon option={selectedOption} /> : null}
          <span className="truncate">{selectedOption?.label ?? placeholder}</span>
        </span>
        <span aria-hidden className="text-xs font-black text-gray-400">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto rounded-[1rem] border border-gray-200 bg-white p-1 shadow-xl shadow-gray-950/10"
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
            <span className="inline-flex h-3.5 w-5 shrink-0 rounded-[3px] border border-gray-300 bg-white" aria-hidden />
            <span className="truncate">{placeholder}</span>
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-[0.75rem] px-2.5 py-2 text-left text-sm font-semibold transition ${
                option.value === value ? "bg-accent-light text-accent-dark" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <VisualThemeOptionIcon option={option} />
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VisualThemeOptionIcon({ option }: { option: VisualThemeSelectOption }) {
  if (option.kind === "visual" && option.id === "oranjekoorts") {
    return (
      <span
        aria-hidden
        className="inline-flex h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] border border-gray-300 bg-[#ff7900] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
      >
        <span className="h-full flex-1 bg-[#ff7900]" />
        <span className="h-full w-[28%] bg-white" />
        <span className="h-full w-[14%] bg-[#21468b]" />
      </span>
    );
  }

  return (
    <span aria-hidden className="inline-flex h-3.5 w-5 shrink-0 items-center justify-center text-base leading-none">
      {option.icon}
    </span>
  );
}
