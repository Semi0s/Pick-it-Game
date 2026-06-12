export const SIDE_PICKS_ICON_SRC = "/images/nav/side-picks.png";

type SidePicksIconProps = {
  className?: string;
  "aria-hidden"?: boolean;
};

export function SidePicksIcon({ className = "h-5 w-5", "aria-hidden": ariaHidden = true }: SidePicksIconProps) {
  return (
    <span
      aria-hidden={ariaHidden}
      className={`relative inline-block shrink-0 overflow-visible ${className}`}
    >
      <span
        className="absolute inset-0 bg-current"
        style={{
          WebkitMaskImage: `url(${SIDE_PICKS_ICON_SRC})`,
          maskImage: `url(${SIDE_PICKS_ICON_SRC})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          transform: "translate(6%, -4%) scale(1.02)",
          transformOrigin: "center"
        }}
      />
    </span>
  );
}
