"use client";

import { useEffect, useState } from "react";

const PICKIT_LOGO_ASPECT_RATIO = 1152.64 / 477.44;
const HEADER_LOGO_ACCENT_PATH = '<path class="cls-2"';
const HEADER_LOGO_SECONDARY_PATH = '<path class="cls-5"';

let themedHeaderLogoCache: string | null = null;

type ThemedPickItLogoProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  sizes?: string;
  src?: string;
};

export function ThemedPickItLogo({
  alt = "PICK-IT! World Cup 2026",
  className,
  priority = false,
  sizes,
  src = "/images/pickit-header-logo-v4.svg"
}: ThemedPickItLogoProps) {
  const [inlineSvg, setInlineSvg] = useState<string | null>(themedHeaderLogoCache);

  useEffect(() => {
    if (inlineSvg) {
      return;
    }

    let isMounted = true;

    async function loadThemedLogo() {
      const response = await fetch(src);
      if (!response.ok) {
        return;
      }

      const svg = themeHeaderLogoSvg(await response.text());
      themedHeaderLogoCache = svg;

      if (isMounted) {
        setInlineSvg(svg);
      }
    }

    void loadThemedLogo();

    return () => {
      isMounted = false;
    };
  }, [inlineSvg, src]);

  return (
    <span
      aria-label={alt}
      className={`relative inline-block overflow-hidden ${className ?? ""}`}
      role="img"
      style={{ aspectRatio: String(PICKIT_LOGO_ASPECT_RATIO) }}
      data-priority={priority ? "true" : undefined}
      data-sizes={sizes}
    >
      {inlineSvg ? (
        <span
          aria-hidden
          className="absolute inset-0 h-full w-full"
          dangerouslySetInnerHTML={{ __html: inlineSvg }}
        />
      ) : null}
    </span>
  );
}

function replacePathOccurrence(source: string, token: string, replacement: string, occurrence: number) {
  let seen = 0;

  return source.replaceAll(token, (match) => {
    seen += 1;
    return seen === occurrence ? replacement : match;
  });
}

function themeHeaderLogoSvg(svg: string) {
  let nextSvg = svg
    .replace('<?xml version="1.0" encoding="UTF-8"?>', "")
    .replace("<svg ", '<svg aria-hidden="true" focusable="false" class="h-full w-full" ');

  nextSvg = replacePathOccurrence(
    nextSvg,
    HEADER_LOGO_SECONDARY_PATH,
    '<path class="cls-5" style="fill:var(--app-logo-secondary-accent)"',
    1
  );
  nextSvg = replacePathOccurrence(
    nextSvg,
    HEADER_LOGO_ACCENT_PATH,
    '<path class="cls-2" style="fill:var(--app-accent)"',
    1
  );
  nextSvg = replacePathOccurrence(
    nextSvg,
    HEADER_LOGO_ACCENT_PATH,
    '<path class="cls-2" style="fill:var(--app-logo-check-accent)"',
    2
  );

  return nextSvg;
}
