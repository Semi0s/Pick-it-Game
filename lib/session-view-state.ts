"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

export const SESSION_VIEW_STATE_NAMESPACE = "bracket2026:view-state";
export const DEFAULT_SESSION_VIEW_STATE_TOURNAMENT_ID = "wc2026";

type SessionViewStateEnvelope<T> = {
  version: number;
  updatedAt: number;
  value: T;
};

export type SessionViewStateValidator<T> = (value: unknown) => T | null;

export type UseSessionViewStateOptions<T> = {
  key: string;
  defaultValue: T;
  validate?: SessionViewStateValidator<T>;
  debounceMs?: number;
  namespace?: string;
  tournamentId?: string | null;
  userId?: string | null;
  version?: number;
};

export type SessionViewStateMeta = {
  hasHydrated: boolean;
  hasStoredValue: boolean;
  storageKey: string;
};

export function buildSessionViewStateStorageKey({
  key,
  namespace = SESSION_VIEW_STATE_NAMESPACE,
  tournamentId = DEFAULT_SESSION_VIEW_STATE_TOURNAMENT_ID,
  userId = "anonymous",
  version = 1
}: {
  key: string;
  namespace?: string;
  tournamentId?: string | null;
  userId?: string | null;
  version?: number;
}) {
  return [
    namespace,
    `v${version}`,
    normalizeStorageSegment(userId, "anonymous"),
    normalizeStorageSegment(tournamentId, DEFAULT_SESSION_VIEW_STATE_TOURNAMENT_ID),
    normalizeStorageSegment(key, "default")
  ].join(":");
}

export function parseSessionViewStateValue<T>({
  rawValue,
  defaultValue,
  validate,
  version = 1
}: {
  rawValue: string | null;
  defaultValue: T;
  validate?: SessionViewStateValidator<T>;
  version?: number;
}): { value: T; hasStoredValue: boolean } {
  if (!rawValue) {
    return { value: defaultValue, hasStoredValue: false };
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SessionViewStateEnvelope<unknown>> | null;
    if (!parsed || typeof parsed !== "object" || parsed.version !== version || !("value" in parsed)) {
      return { value: defaultValue, hasStoredValue: false };
    }

    const validatedValue = validate ? validate(parsed.value) : (parsed.value as T);
    if (validatedValue === null) {
      return { value: defaultValue, hasStoredValue: false };
    }

    return { value: validatedValue, hasStoredValue: true };
  } catch {
    return { value: defaultValue, hasStoredValue: false };
  }
}

export function useSessionViewState<T>({
  key,
  defaultValue,
  validate,
  debounceMs = 0,
  namespace = SESSION_VIEW_STATE_NAMESPACE,
  tournamentId = DEFAULT_SESSION_VIEW_STATE_TOURNAMENT_ID,
  userId = "anonymous",
  version = 1
}: UseSessionViewStateOptions<T>): [T, Dispatch<SetStateAction<T>>, SessionViewStateMeta] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [hasStoredValue, setHasStoredValue] = useState(false);
  const validateRef = useRef(validate);
  const storageKey = useMemo(
    () => buildSessionViewStateStorageKey({ key, namespace, tournamentId, userId, version }),
    [key, namespace, tournamentId, userId, version]
  );

  useEffect(() => {
    validateRef.current = validate;
  }, [validate]);

  useEffect(() => {
    setHasHydrated(false);

    try {
      const restored = parseSessionViewStateValue({
        rawValue: window.sessionStorage.getItem(storageKey),
        defaultValue,
        validate: validateRef.current,
        version
      });
      setValue(restored.value);
      setHasStoredValue(restored.hasStoredValue);
    } catch (caughtError) {
      console.warn(`Could not restore session view state for ${storageKey}.`, caughtError);
      setValue(defaultValue);
      setHasStoredValue(false);
    } finally {
      setHasHydrated(true);
    }
  }, [defaultValue, storageKey, version]);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const writeValue = () => {
      try {
        const envelope: SessionViewStateEnvelope<T> = {
          version,
          updatedAt: Date.now(),
          value
        };
        window.sessionStorage.setItem(storageKey, JSON.stringify(envelope));
      } catch (caughtError) {
        console.warn(`Could not save session view state for ${storageKey}.`, caughtError);
      }
    };

    if (debounceMs > 0) {
      const timeoutId = window.setTimeout(writeValue, debounceMs);
      return () => window.clearTimeout(timeoutId);
    }

    writeValue();
  }, [debounceMs, hasHydrated, storageKey, value, version]);

  return [value, setValue, { hasHydrated, hasStoredValue, storageKey }];
}

function normalizeStorageSegment(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).replace(/[:\s]+/g, "_");
}
