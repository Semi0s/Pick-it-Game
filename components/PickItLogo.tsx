import Image from "next/image";
import { useEffect, useState } from "react";

const PICKIT_LOGO_VIEWBOX = "0 0 1152.64 477.44";
const PICKIT_LOGO_ASPECT_RATIO = 1152.64 / 477.44;
const HEADER_LOGO_ACCENT_PATH = '<path class="cls-2"';
const HEADER_LOGO_SECONDARY_PATH = '<path class="cls-5"';

let themedHeaderLogoCache: string | null = null;

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

type PickItLogoProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
  inlineThemed?: boolean;
  priority?: boolean;
  sizes?: string;
  src?: string;
};

export function PickItLogo({
  alt = "PICK-IT! World Cup 2026",
  className,
  imageClassName = "object-contain",
  inlineThemed = false,
  priority = false,
  sizes,
  src = "/images/pickit-logo.svg"
}: PickItLogoProps) {
  const [inlineSvg, setInlineSvg] = useState<string | null>(inlineThemed ? themedHeaderLogoCache : null);

  useEffect(() => {
    if (!inlineThemed || inlineSvg) {
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
  }, [inlineThemed, inlineSvg, src]);

  return (
    <span
      aria-label={alt}
      className={`relative inline-block overflow-hidden ${className ?? ""}`}
      role="img"
      style={{ aspectRatio: String(PICKIT_LOGO_ASPECT_RATIO) }}
    >
      {inlineSvg ? (
        <span
          aria-hidden
          className="absolute inset-0 h-full w-full"
          dangerouslySetInnerHTML={{ __html: inlineSvg }}
        />
      ) : (
        <Image
          src={src}
          alt=""
          aria-hidden
          fill
          priority={priority}
          sizes={sizes}
          className={imageClassName}
        />
      )}
      {!inlineThemed ? (
      <svg
        aria-hidden
        viewBox={PICKIT_LOGO_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <path
          fill="var(--app-logo-secondary-accent)"
          d="M343.63,89.11c-3.46-1.74-7.09-2.62-10.79-2.62-10.16,0-18.58,6.47-26.02,12.18l-17.43,13.39c-18.01-15.64-41.94-24.25-67.53-24.25-21.32,0-51.58,4.24-74.7,24.45-20,17.48-29.52,44.43-34.58,80.1-2.38,16.76-7.48,65.81-12.1,99.93-.57,4.19,4.46,6.42,7.47,3.3,12.68-13.12,35.2-34.43,48.12-34.43,5.65,0,15.41.39,21.01,1.15,17.47,2.38,33.77,3.64,47.13,3.64,3.01,0,5.89-.06,8.55-.19,24.11-1.15,46.46-11.8,62.93-29.99,16.08-17.76,24.28-40.37,23.09-63.65-.31-6.09-1.2-11.73-2.52-16.95.41-.37.64-.58.64-.58l12.23-11.18,18.63-16.9c3.51-3.18,9.36-9.78,9.14-18.2-.25-9.37-7.31-16.2-13.28-19.2Z"
        />
        <path
          fill="var(--app-accent)"
          d="M1057.81,350.66c-23.18-1.97-44.48-12.12-54.84-33.63-3.96-8.22-6.28-21.72-5.07-31.2l8.56-66.86,5.86-43.86-21.42-.23c-6.08-.07-10-5.36-9.34-10.93l.92-7.74,3.7-28.26c1.04-7.98,7.11-13.34,15.23-13.48l19.9-.34,5.19-37.42c1.22-8.78,8.82-14.19,17.04-15.99l57.83-12.65c2.48-.54,5.74,1.21,7.09,2.54,1.8,1.76,2.48,4.62,2.29,7.3l-3.92,24.81-4.64,31.61,42.12.02c4.87,0,8.53,4.3,8.33,8.84l-5.04,36.89c-.96,8.17-7.26,14.7-15.82,14.75l-40.01.25-13.26,94.59c-1.27,9.05,5.3,16.53,13.9,16.63l31.03.35c5.71.06,10.4,4.72,9.63,10.57l-4.21,32.08c-1.05,8.02-4.98,14.99-13.61,17.17-18.63,4.7-38.09,5.85-57.43,4.2ZM926.02,347.04c7.11,0,12.64-6.24,13.49-12.8l4.01-30.89,12.3-92.2,11.54-85.14c.82-6.07-3.39-11.07-9.34-11.46-6.25-.4-12.34-.02-18.65-.07-11.59-.08-22.69.58-33.75,3.68-9.3,2.61-16.47,8.86-17.87,18.92l-11.27,81.09-7.79,57.61-8.06,60.69c-.71,5.33,2.96,10.6,9.07,10.6l56.33-.04ZM951.8,22.91c-17.64-4.72-36.17.24-48.61,13.45-9.42,9.99-13.92,23.57-11.08,36.94,2.65,12.48,11.09,22.25,22.84,27.01,20.19,8.18,43.89,1.31,56.4-16.4,8.73-12.35,12.14-28.05,4.65-41.99-5.06-9.42-13.9-16.26-24.2-19.02Z"
        />
        <path
          fill="var(--app-logo-check-accent)"
          d="M170.44,214.76l-16.97-21.13c-4.11-5.12-7.79-10.51-12.13-15.34-6.36-7.05-9.04-16.02-3.39-24.73,4.64-7.15,12.6-12.38,21.38-13.57,7.74-1.04,15.1,1.55,20.19,7.29l29.46,33.21c8.9-5.53,14.95-11.4,22.63-17.3l77.59-59.59c8.98-6.89,18.48-14.27,29.08-8.94,4.27,2.15,9.02,6.78,9.18,12.74.13,4.77-3.28,9.38-6.7,12.48l-18.63,16.9-12.25,11.2-69.44,63.45-24.43,21.68c-8.75,7.76-22.36,7.42-30.93-1-5.34-5.24-9.67-11.17-14.63-17.35Z"
        />
      </svg>
      ) : null}
    </span>
  );
}
