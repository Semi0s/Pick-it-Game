"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  APP_LANGUAGE_COOKIE_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  HELPER_LANGUAGE_CHANGED_EVENT,
  PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  resolveAppLanguage,
  type AppLanguage
} from "@/lib/i18n";
import type { UserProfile } from "@/lib/types";

type AppLanguageContextValue = {
  activeLanguage: AppLanguage;
  setActiveLanguage: (language: string) => AppLanguage;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

export function AppLanguageProvider({
  activeLanguage,
  setActiveLanguage,
  children
}: AppLanguageContextValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      activeLanguage,
      setActiveLanguage
    }),
    [activeLanguage, setActiveLanguage]
  );

  return (
    <AppLanguageContext.Provider value={value}>
      <div data-active-language={process.env.NODE_ENV === "production" ? undefined : activeLanguage}>{children}</div>
    </AppLanguageContext.Provider>
  );
}

export function useAppLanguage() {
  const value = useContext(AppLanguageContext);
  if (!value) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("useAppLanguage was called outside AppLanguageProvider. Falling back to English.");
    }

    return {
      activeLanguage: "en" as AppLanguage,
      setActiveLanguage: (language: string) => normalizeLanguage(language)
    };
  }

  return value;
}

export function useResolvedAppLanguage(user: UserProfile | null, isUserLoading: boolean) {
  const [optimisticLanguage, setOptimisticLanguage] = useState<AppLanguage | null>(null);
  const [storedLanguage, setStoredLanguage] = useState<AppLanguage>(() =>
    typeof window === "undefined"
      ? "en"
      : readPersistedLanguage() ??
        resolveAppLanguage({
          browserLanguage: window.navigator.language
        })
  );
  const userLanguage = user?.preferredLanguage ? normalizeLanguage(user.preferredLanguage) : null;
  const activeLanguage = resolveAppLanguage({
    userLanguage: optimisticLanguage ?? (userLanguage && !isUserLoading ? userLanguage : null),
    storedLanguage: optimisticLanguage || userLanguage ? null : storedLanguage
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (userLanguage) {
      persistLanguage(userLanguage);
      setStoredLanguage(userLanguage);
      if (optimisticLanguage === userLanguage) {
        setOptimisticLanguage(null);
      }
      return;
    }

    const nextLanguage = readPersistedLanguage() ?? resolveAppLanguage({ browserLanguage: window.navigator.language });
    setStoredLanguage(nextLanguage);
  }, [optimisticLanguage, userLanguage]);

  function setActiveLanguage(language: string) {
    const nextLanguage = normalizeLanguage(language);
    setOptimisticLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
    persistLanguage(nextLanguage);
    return nextLanguage;
  }

  return {
    activeLanguage,
    setActiveLanguage
  };
}

function readPersistedLanguage(): AppLanguage | null {
  try {
    const rawLanguage =
      window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY) ??
      window.localStorage.getItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY);
    return rawLanguage ? normalizeLanguage(rawLanguage) : null;
  } catch (error) {
    console.warn("Could not read persisted app language.", error);
    return null;
  }
}

function persistLanguage(language: AppLanguage) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
    window.localStorage.setItem(PLAY_EXPLAINER_LANGUAGE_STORAGE_KEY, language);
    window.document.cookie = `${APP_LANGUAGE_COOKIE_KEY}=${language}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new CustomEvent(HELPER_LANGUAGE_CHANGED_EVENT));
  } catch (error) {
    console.warn("Could not persist app language.", error);
  }
}
