import type { CSSProperties } from "react";
import type { SupportedLanguage } from "@/lib/i18n";

export type LocalizedCardPatternVariant = "bands" | "ribbons" | "emblem" | "minimal";
export type LocalizedCardEmblemKind =
  | "none"
  | "colombia"
  | "germany"
  | "usa"
  | "argentina"
  | "uruguay"
  | "ecuador"
  | "brazil"
  | "japan"
  | "portugal"
  | "spain"
  | "korea"
  | "canada"
  | "england"
  | "france"
  | "mexico"
  | "belgium"
  | "southafrica"
  | "czechia"
  | "bosnia"
  | "qatar"
  | "switzerland"
  | "morocco"
  | "haiti"
  | "scotland"
  | "paraguay"
  | "australia"
  | "turkiye"
  | "curacao"
  | "ivorycoast"
  | "netherlands"
  | "sweden"
  | "tunisia"
  | "iran"
  | "egypt"
  | "newzealand"
  | "caboverde"
  | "saudiarabia"
  | "senegal"
  | "iraq"
  | "norway"
  | "algeria"
  | "austria"
  | "jordan"
  | "congodr"
  | "uzbekistan"
  | "croatia"
  | "ghana"
  | "panama";

export type LocalizedCardTheme = {
  id: string;
  label: string;
  colors: string[];
  patternColors?: string[];
  accent: string;
  accentLight: string;
  accentDark: string;
  accentText: string;
  flagAccent?: string;
  useNeutralAccent?: boolean;
  mainBackground: string;
  textColor: string;
  secondaryTextColor?: string;
  controlSurface?: string;
  controlText?: string;
  borderColor?: string;
  controlZoneTint?: string;
  surfaceTone?: "light" | "dark";
  patternVariant?: LocalizedCardPatternVariant;
  emblemKind?: LocalizedCardEmblemKind;
  emblemAsset?: string;
};

export type LocalizedCardThemeInput = {
  homeTeamId?: string | null;
  countryCode?: string | null;
  marketCode?: string | null;
  preferredLanguage?: SupportedLanguage | string | null;
};

type LocalizedCardThemeSeed = {
  id: string;
  label: string;
  colors: string[];
  patternColors?: string[];
  accent: string;
  accentLight: string;
  accentDark: string;
  accentText: string;
  flagAccent?: string;
  useNeutralAccent?: boolean;
  mainBackground: string;
  textColor?: string;
  secondaryTextColor?: string;
  controlSurface?: string;
  controlText?: string;
  borderColor?: string;
  controlZoneTint?: string;
  surfaceTone?: "light" | "dark";
  patternVariant?: LocalizedCardPatternVariant;
  emblemKind?: LocalizedCardEmblemKind;
  emblemAsset?: string;
};

function createDarkFlagTheme(seed: LocalizedCardThemeSeed): LocalizedCardTheme {
  return {
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "bands",
    ...seed,
    emblemKind: seed.emblemKind ?? (seed.id as LocalizedCardEmblemKind),
    surfaceTone: seed.surfaceTone ?? "dark"
  };
}

export const localizedCardThemes = {
  generic: {
    id: "generic",
    label: "Generic",
    colors: ["#F3F4F6", "#E5E7EB", "#D1D5DB"],
    accent: "#56A24F",
    accentLight: "#DCEFD8",
    accentDark: "#3F8C39",
    accentText: "#FFFFFF",
    mainBackground: "#F3F4F6",
    textColor: "#111827",
    secondaryTextColor: "#4B5563",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#374151",
    borderColor: "#E5E7EB",
    controlZoneTint: "rgba(255,255,255,0.08)",
    patternVariant: "minimal",
    emblemKind: "none"
  },
  colombia: {
    id: "colombia",
    label: "Colombia",
    colors: ["#FCD116", "#CE1126", "#003893"],
    patternColors: ["#003893", "#CE1126", "#003893", "#003893", "#CE1126"],
    accent: "#003893",
    accentLight: "#E3ECFF",
    accentDark: "#002B6E",
    accentText: "#FFFFFF",
    flagAccent: "#CE1126",
    mainBackground: "#FCD116",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.9)",
    controlText: "#1F2937",
    borderColor: "#EAB308",
    controlZoneTint: "rgba(255,255,255,0.08)",
    surfaceTone: "light",
    patternVariant: "bands",
    emblemKind: "none"
  },
  ecuador: {
    id: "ecuador",
    label: "Ecuador",
    colors: ["#FCD116", "#CE1126", "#003893"],
    patternColors: ["#003893", "#CE1126", "#003893", "#003893", "#CE1126"],
    accent: "#003893",
    accentLight: "#E3ECFF",
    accentDark: "#002B6E",
    accentText: "#FFFFFF",
    flagAccent: "#CE1126",
    mainBackground: "#FCD116",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.9)",
    controlText: "#1F2937",
    borderColor: "#EAB308",
    controlZoneTint: "rgba(255,255,255,0.08)",
    surfaceTone: "light",
    patternVariant: "emblem",
    emblemKind: "ecuador",
    emblemAsset: "/patterns/Ecuador-Seal.svg"
  },
  germany: {
    id: "germany",
    label: "Germany",
    colors: ["#000000", "#DD0000", "#FFCE00"],
    accent: "#DD0000",
    accentLight: "#FFE3E0",
    accentDark: "#A90A00",
    accentText: "#FFFFFF",
    mainBackground: "#1D1718",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.86)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#3F3F46",
    controlZoneTint: "rgba(255,255,255,0.1)",
    patternVariant: "bands",
    emblemKind: "none"
  },
  japan: {
    id: "japan",
    label: "Japan",
    colors: ["#F1F3F5", "#D0002F"],
    accent: "#D0002F",
    accentLight: "#FFF4F6",
    accentDark: "#990022",
    accentText: "#FFFFFF",
    flagAccent: "#D0002F",
    useNeutralAccent: true,
    mainBackground: "#F7F8FA",
    textColor: "#111111",
    secondaryTextColor: "#3F3F46",
    controlSurface: "rgba(255,255,255,0.94)",
    controlText: "#1F2937",
    borderColor: "#E2E5EA",
    controlZoneTint: "rgba(255,255,255,0.06)",
    patternColors: ["#D0002F", "#8F001F", "#E4E7EC", "#D0002F", "#F1F3F5"],
    patternVariant: "minimal",
    emblemKind: "japan"
  },
  usa: {
    id: "usa",
    label: "United States",
    colors: ["#FFFFFF", "#B22234", "#3C3B6E"],
    accent: "#243C8F",
    accentLight: "#DCE7FF",
    accentDark: "#162A6A",
    accentText: "#FFFFFF",
    flagAccent: "#B22234",
    mainBackground: "#3C3B6E",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#4F46E5",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "ribbons",
    emblemKind: "usa"
  },
  mexico: {
    id: "mexico",
    label: "Mexico",
    colors: ["#FFFFFF", "#CE1126", "#006847"],
    accent: "#006847",
    accentLight: "#DDF2E8",
    accentDark: "#04543A",
    accentText: "#FFFFFF",
    flagAccent: "#CE1126",
    mainBackground: "#006847",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#047857",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "mexico",
    emblemAsset: "/patterns/Mexico-Coat-of-Arms.svg"
  },
  canada: {
    id: "canada",
    label: "Canada",
    colors: ["#FFFFFF", "#D80621"],
    accent: "#D80621",
    accentLight: "#FFF4F5",
    accentDark: "#A80519",
    accentText: "#FFFFFF",
    flagAccent: "#D80621",
    useNeutralAccent: true,
    mainBackground: "#FFFDFB",
    textColor: "#111111",
    secondaryTextColor: "#374151",
    controlSurface: "rgba(255,255,255,0.94)",
    controlText: "#1F2937",
    borderColor: "#F3C3CB",
    controlZoneTint: "rgba(255,255,255,0.06)",
    patternVariant: "emblem",
    emblemKind: "canada",
    emblemAsset: "/patterns/Canada-Maple-Leaf.png"
  },
  portugal: {
    id: "portugal",
    label: "Portugal",
    colors: ["#FF0000", "#FFD100", "#006600"],
    accent: "#006600",
    accentLight: "#D6F0D6",
    accentDark: "#004D00",
    accentText: "#FFFFFF",
    flagAccent: "#FFD100",
    mainBackground: "#006600",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#047857",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "portugal",
    emblemAsset: "/patterns/Portugal-Coat-of-Arms.svg"
  },
  brazil: {
    id: "brazil",
    label: "Brazil",
    colors: ["#FFDF00", "#002776", "#009B3A"],
    accent: "#56A24F",
    accentLight: "#DCEFD8",
    accentDark: "#3F8C39",
    accentText: "#FFFFFF",
    flagAccent: "#009B3A",
    mainBackground: "#009B3A",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#10B981",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "brazil"
  },
  argentina: {
    id: "argentina",
    label: "Argentina",
    colors: ["#FFFFFF", "#F6B40E", "#74ACDF"],
    accent: "#74ACDF",
    accentLight: "#E5F3FF",
    accentDark: "#3E84C4",
    accentText: "#FFFFFF",
    flagAccent: "#F6B40E",
    mainBackground: "#74ACDF",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#60A5FA",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "argentina"
  },
  uruguay: {
    id: "uruguay",
    label: "Uruguay",
    colors: ["#FFFFFF", "#F6B40E", "#75AADB"],
    accent: "#75AADB",
    accentLight: "#E6F3FF",
    accentDark: "#3D82B8",
    accentText: "#FFFFFF",
    flagAccent: "#F6B40E",
    mainBackground: "#75AADB",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#60A5FA",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "uruguay"
  },
  france: {
    id: "france",
    label: "France",
    colors: ["#FFFFFF", "#EF4135", "#0055A4"],
    accent: "#0055A4",
    accentLight: "#DCEBFF",
    accentDark: "#013C73",
    accentText: "#FFFFFF",
    flagAccent: "#EF4135",
    mainBackground: "#0055A4",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.88)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#2563EB",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "france",
    emblemAsset: "/patterns/France-Fleur-de-lis.png"
  },
  england: {
    id: "england",
    label: "England",
    colors: ["#FFFFFF", "#CE1126", "#012169"],
    accent: "#012169",
    accentLight: "#D9E3FF",
    accentDark: "#01164A",
    accentText: "#FFFFFF",
    flagAccent: "#CE1126",
    mainBackground: "#012169",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#1E3A8A",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "bands",
    emblemKind: "england"
  },
  spain: {
    id: "spain",
    label: "Spain",
    colors: ["#F1BF00", "#AA151B", "#F1BF00"],
    accent: "#AA151B",
    accentLight: "#FBE0E1",
    accentDark: "#7E1014",
    accentText: "#FFFFFF",
    flagAccent: "#AA151B",
    mainBackground: "#AA151B",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#991B1B",
    controlZoneTint: "rgba(255,255,255,0.12)",
    patternVariant: "emblem",
    emblemKind: "spain",
    emblemAsset: "/patterns/Spain-Coat-of-Arms.svg"
  },
  korea: {
    id: "korea",
    label: "Korea Republic",
    colors: ["#FFFFFF", "#CD2E3A", "#0047A0", "#111111"],
    accent: "#CD2E3A",
    accentLight: "#FFF4F5",
    accentDark: "#991F29",
    accentText: "#FFFFFF",
    flagAccent: "#CD2E3A",
    useNeutralAccent: true,
    mainBackground: "#FFFDFB",
    textColor: "#111111",
    secondaryTextColor: "#374151",
    controlSurface: "rgba(255,255,255,0.94)",
    controlText: "#1F2937",
    borderColor: "#F2C0C6",
    controlZoneTint: "rgba(255,255,255,0.06)",
    patternVariant: "emblem",
    emblemKind: "korea"
  },
  belgium: {
    id: "belgium",
    label: "Belgium",
    colors: ["#FCD116", "#ED2939", "#000000"],
    accent: "#ED2939",
    accentLight: "#FFE3E8",
    accentDark: "#B51D29",
    accentText: "#FFFFFF",
    flagAccent: "#ED2939",
    mainBackground: "#111111",
    textColor: "#FFFFFF",
    secondaryTextColor: "rgba(255,255,255,0.9)",
    controlSurface: "rgba(255,255,255,0.92)",
    controlText: "#1F2937",
    borderColor: "#27272A",
    controlZoneTint: "rgba(255,255,255,0.1)",
    patternVariant: "bands",
    emblemKind: "belgium"
  },
  southafrica: createDarkFlagTheme({
    id: "southafrica",
    label: "South Africa",
    colors: ["#007A4D", "#FFB612", "#000000", "#DE3831", "#002395"],
    accent: "#007A4D",
    accentLight: "#D9F0E5",
    accentDark: "#005A38",
    accentText: "#FFFFFF",
    flagAccent: "#FFB612",
    mainBackground: "#007A4D",
    borderColor: "#0F766E"
  }),
  czechia: createDarkFlagTheme({
    id: "czechia",
    label: "Czechia",
    colors: ["#11457E", "#D7141A", "#FFFFFF"],
    accent: "#11457E",
    accentLight: "#DCEBFF",
    accentDark: "#0B3561",
    accentText: "#FFFFFF",
    flagAccent: "#D7141A",
    mainBackground: "#11457E",
    borderColor: "#1D4ED8",
    emblemKind: "none"
  }),
  bosnia: createDarkFlagTheme({
    id: "bosnia",
    label: "Bosnia and Herzegovina",
    colors: ["#002F6C", "#FECB00", "#FFFFFF"],
    accent: "#002F6C",
    accentLight: "#DCE8FF",
    accentDark: "#00234F",
    accentText: "#FFFFFF",
    flagAccent: "#002F6C",
    mainBackground: "#002F6C",
    borderColor: "#1D4ED8"
  }),
  qatar: createDarkFlagTheme({
    id: "qatar",
    label: "Qatar",
    colors: ["#8A1538", "#FFFFFF"],
    accent: "#8A1538",
    accentLight: "#F3D7E0",
    accentDark: "#68102A",
    accentText: "#FFFFFF",
    mainBackground: "#8A1538",
    borderColor: "#9F1239"
  }),
  switzerland: createDarkFlagTheme({
    id: "switzerland",
    label: "Switzerland",
    colors: ["#D52B1E", "#FFFFFF"],
    accent: "#D52B1E",
    accentLight: "#FCE1DE",
    accentDark: "#A61F15",
    accentText: "#FFFFFF",
    useNeutralAccent: true,
    mainBackground: "#D52B1E",
    borderColor: "#F3C3CB"
  }),
  morocco: createDarkFlagTheme({
    id: "morocco",
    label: "Morocco",
    colors: ["#C1272D", "#006233"],
    accent: "#006233",
    accentLight: "#D8F0E5",
    accentDark: "#004A26",
    accentText: "#FFFFFF",
    flagAccent: "#C1272D",
    mainBackground: "#C1272D",
    borderColor: "#991B1B"
  }),
  haiti: createDarkFlagTheme({
    id: "haiti",
    label: "Haiti",
    colors: ["#00209F", "#D21034"],
    emblemKind: "none",
    accent: "#00209F",
    accentLight: "#DCE5FF",
    accentDark: "#001772",
    accentText: "#FFFFFF",
    flagAccent: "#D21034",
    mainBackground: "#00209F",
    borderColor: "#1D4ED8"
  }),
  scotland: createDarkFlagTheme({
    id: "scotland",
    label: "Scotland",
    colors: ["#005EB8", "#FFFFFF"],
    accent: "#005EB8",
    accentLight: "#D9ECFF",
    accentDark: "#004589",
    accentText: "#FFFFFF",
    mainBackground: "#005EB8",
    borderColor: "#2563EB"
  }),
  paraguay: createDarkFlagTheme({
    id: "paraguay",
    label: "Paraguay",
    colors: ["#0038A8", "#D52B1E", "#FFFFFF"],
    patternVariant: "emblem",
    emblemAsset: "/patterns/Paraguay-Coat-of-Arms.svg",
    accent: "#0038A8",
    accentLight: "#DDE8FF",
    accentDark: "#002A7C",
    accentText: "#FFFFFF",
    flagAccent: "#D52B1E",
    mainBackground: "#0038A8",
    borderColor: "#1D4ED8"
  }),
  australia: createDarkFlagTheme({
    id: "australia",
    label: "Australia",
    colors: ["#012169", "#E4002B", "#FFFFFF"],
    accent: "#012169",
    accentLight: "#DAE4FF",
    accentDark: "#01184C",
    accentText: "#FFFFFF",
    flagAccent: "#E4002B",
    mainBackground: "#012169",
    borderColor: "#1E3A8A"
  }),
  turkiye: createDarkFlagTheme({
    id: "turkiye",
    label: "Türkiye",
    colors: ["#E30A17", "#FFFFFF"],
    accent: "#E30A17",
    accentLight: "#FFDCDD",
    accentDark: "#B20812",
    accentText: "#FFFFFF",
    useNeutralAccent: true,
    mainBackground: "#E30A17",
    borderColor: "#F3C3CB"
  }),
  curacao: createDarkFlagTheme({
    id: "curacao",
    label: "Curaçao",
    colors: ["#002B7F", "#F9E814", "#FFFFFF"],
    accent: "#002B7F",
    accentLight: "#DDE8FF",
    accentDark: "#001F5C",
    accentText: "#FFFFFF",
    flagAccent: "#002B7F",
    mainBackground: "#002B7F",
    borderColor: "#1D4ED8"
  }),
  ivorycoast: createDarkFlagTheme({
    id: "ivorycoast",
    label: "Côte d'Ivoire",
    colors: ["#009E60", "#F77F00", "#FFFFFF"],
    accent: "#F77F00",
    accentLight: "#FFE1B4",
    accentDark: "#C96500",
    accentText: "#111111",
    flagAccent: "#009E60",
    mainBackground: "#009E60",
    borderColor: "#059669",
    emblemKind: "none"
  }),
  netherlands: createDarkFlagTheme({
    id: "netherlands",
    label: "Netherlands",
    colors: ["#21468B", "#AE1C28", "#FFFFFF"],
    accent: "#21468B",
    accentLight: "#DBE7FF",
    accentDark: "#173263",
    accentText: "#FFFFFF",
    flagAccent: "#AE1C28",
    mainBackground: "#21468B",
    borderColor: "#1D4ED8"
  }),
  sweden: createDarkFlagTheme({
    id: "sweden",
    label: "Sweden",
    colors: ["#006AA7", "#FECC00"],
    accent: "#FECC00",
    accentLight: "#FFEE94",
    accentDark: "#C99A00",
    accentText: "#111111",
    flagAccent: "#006AA7",
    mainBackground: "#006AA7",
    borderColor: "#2563EB"
  }),
  tunisia: createDarkFlagTheme({
    id: "tunisia",
    label: "Tunisia",
    colors: ["#E70013", "#FFFFFF"],
    accent: "#E70013",
    accentLight: "#FFDADF",
    accentDark: "#B80010",
    accentText: "#FFFFFF",
    useNeutralAccent: true,
    mainBackground: "#E70013",
    borderColor: "#F4C0C8"
  }),
  iran: createDarkFlagTheme({
    id: "iran",
    label: "IR Iran",
    colors: ["#239F40", "#DA0000", "#FFFFFF"],
    accent: "#239F40",
    accentLight: "#D9F3DF",
    accentDark: "#1A7630",
    accentText: "#FFFFFF",
    flagAccent: "#DA0000",
    mainBackground: "#239F40",
    borderColor: "#16A34A",
    emblemKind: "none"
  }),
  egypt: createDarkFlagTheme({
    id: "egypt",
    label: "Egypt",
    colors: ["#111111", "#CE1126", "#C09300", "#FFFFFF"],
    accent: "#C09300",
    accentLight: "#F4E1A2",
    accentDark: "#8F6D00",
    accentText: "#111111",
    flagAccent: "#CE1126",
    mainBackground: "#111111",
    borderColor: "#3F3F46",
    patternVariant: "emblem",
    emblemAsset: "/patterns/Egypt-Coat-of-Arms.svg"
  }),
  newzealand: createDarkFlagTheme({
    id: "newzealand",
    label: "New Zealand",
    colors: ["#00247D", "#CC142B", "#FFFFFF"],
    accent: "#00247D",
    accentLight: "#DDE5FF",
    accentDark: "#001A59",
    accentText: "#FFFFFF",
    flagAccent: "#CC142B",
    mainBackground: "#00247D",
    borderColor: "#1D4ED8"
  }),
  caboverde: createDarkFlagTheme({
    id: "caboverde",
    label: "Cabo Verde",
    colors: ["#003893", "#CF2027", "#F7D116", "#FFFFFF"],
    accent: "#003893",
    accentLight: "#DDEBFF",
    accentDark: "#002A6B",
    accentText: "#FFFFFF",
    flagAccent: "#003893",
    mainBackground: "#003893",
    borderColor: "#1D4ED8"
  }),
  saudiarabia: createDarkFlagTheme({
    id: "saudiarabia",
    label: "Saudi Arabia",
    colors: ["#006C35", "#FFFFFF"],
    accent: "#006C35",
    accentLight: "#D8F0E1",
    accentDark: "#004F27",
    accentText: "#FFFFFF",
    mainBackground: "#006C35",
    borderColor: "#15803D"
  }),
  senegal: createDarkFlagTheme({
    id: "senegal",
    label: "Senegal",
    colors: ["#00853F", "#FDEF42", "#E31B23"],
    accent: "#00853F",
    accentLight: "#D9F2E5",
    accentDark: "#00612E",
    accentText: "#FFFFFF",
    flagAccent: "#00853F",
    mainBackground: "#00853F",
    borderColor: "#16A34A"
  }),
  iraq: createDarkFlagTheme({
    id: "iraq",
    label: "Iraq",
    colors: ["#111111", "#007A3D", "#CE1126", "#FFFFFF"],
    accent: "#007A3D",
    accentLight: "#D8F0E3",
    accentDark: "#00592D",
    accentText: "#FFFFFF",
    flagAccent: "#CE1126",
    mainBackground: "#111111",
    borderColor: "#3F3F46",
    emblemKind: "none"
  }),
  norway: createDarkFlagTheme({
    id: "norway",
    label: "Norway",
    colors: ["#00205B", "#BA0C2F", "#FFFFFF"],
    accent: "#00205B",
    accentLight: "#DCE5FF",
    accentDark: "#001741",
    accentText: "#FFFFFF",
    flagAccent: "#BA0C2F",
    mainBackground: "#00205B",
    borderColor: "#1E3A8A"
  }),
  algeria: createDarkFlagTheme({
    id: "algeria",
    label: "Algeria",
    colors: ["#006233", "#D21034", "#FFFFFF"],
    accent: "#006233",
    accentLight: "#D8F0E4",
    accentDark: "#004824",
    accentText: "#FFFFFF",
    flagAccent: "#D21034",
    mainBackground: "#006233",
    borderColor: "#15803D"
  }),
  austria: createDarkFlagTheme({
    id: "austria",
    label: "Austria",
    colors: ["#ED2939", "#FFFFFF"],
    accent: "#ED2939",
    accentLight: "#FFDDE1",
    accentDark: "#B81E2B",
    accentText: "#FFFFFF",
    useNeutralAccent: true,
    mainBackground: "#ED2939",
    borderColor: "#F3C3CB"
  }),
  jordan: createDarkFlagTheme({
    id: "jordan",
    label: "Jordan",
    colors: ["#111111", "#007A3D", "#CE1126", "#FFFFFF"],
    accent: "#007A3D",
    accentLight: "#D8F0E3",
    accentDark: "#00592D",
    accentText: "#FFFFFF",
    flagAccent: "#CE1126",
    mainBackground: "#111111",
    borderColor: "#3F3F46"
  }),
  congodr: createDarkFlagTheme({
    id: "congodr",
    label: "Congo DR",
    colors: ["#007FFF", "#F7D618", "#CE1021"],
    accent: "#007FFF",
    accentLight: "#D8EFFF",
    accentDark: "#005BAF",
    accentText: "#FFFFFF",
    flagAccent: "#007FFF",
    mainBackground: "#007FFF",
    borderColor: "#2563EB"
  }),
  uzbekistan: createDarkFlagTheme({
    id: "uzbekistan",
    label: "Uzbekistan",
    colors: ["#0099B5", "#1EB53A", "#CE1126", "#FFFFFF"],
    accent: "#1EB53A",
    accentLight: "#D7F4DD",
    accentDark: "#178A2C",
    accentText: "#FFFFFF",
    flagAccent: "#0099B5",
    mainBackground: "#0099B5",
    borderColor: "#0891B2"
  }),
  croatia: createDarkFlagTheme({
    id: "croatia",
    label: "Croatia",
    colors: ["#171796", "#F00000", "#FFFFFF"],
    accent: "#171796",
    accentLight: "#DFE0FF",
    accentDark: "#10106E",
    accentText: "#FFFFFF",
    flagAccent: "#F00000",
    mainBackground: "#171796",
    borderColor: "#312E81",
    patternVariant: "emblem",
    emblemAsset: "/patterns/Croatia-Coat-of-Arms.svg"
  }),
  ghana: createDarkFlagTheme({
    id: "ghana",
    label: "Ghana",
    colors: ["#006B3F", "#FCD116", "#CE1126", "#111111"],
    accent: "#006B3F",
    accentLight: "#D8F0E3",
    accentDark: "#004B2C",
    accentText: "#FFFFFF",
    flagAccent: "#006B3F",
    mainBackground: "#006B3F",
    borderColor: "#15803D"
  }),
  panama: createDarkFlagTheme({
    id: "panama",
    label: "Panama",
    colors: ["#005293", "#D21034", "#FFFFFF"],
    accent: "#005293",
    accentLight: "#DDEBFF",
    accentDark: "#003B69",
    accentText: "#FFFFFF",
    flagAccent: "#D21034",
    mainBackground: "#005293",
    borderColor: "#1D4ED8"
  })
} satisfies Record<string, LocalizedCardTheme>;

const teamThemeById: Record<string, keyof typeof localizedCardThemes> = {
  rsa: "southafrica",
  cze: "czechia",
  bih: "bosnia",
  qat: "qatar",
  sui: "switzerland",
  mar: "morocco",
  hai: "haiti",
  sco: "scotland",
  par: "paraguay",
  aus: "australia",
  tur: "turkiye",
  cuw: "curacao",
  civ: "ivorycoast",
  ned: "netherlands",
  swe: "sweden",
  tun: "tunisia",
  irn: "iran",
  egy: "egypt",
  nzl: "newzealand",
  cpv: "caboverde",
  ksa: "saudiarabia",
  sen: "senegal",
  irq: "iraq",
  nor: "norway",
  alg: "algeria",
  aut: "austria",
  jor: "jordan",
  cod: "congodr",
  uzb: "uzbekistan",
  cro: "croatia",
  gha: "ghana",
  pan: "panama",
  col: "colombia",
  ecu: "ecuador",
  ger: "germany",
  jpn: "japan",
  usa: "usa",
  mex: "mexico",
  can: "canada",
  por: "portugal",
  bra: "brazil",
  arg: "argentina",
  uru: "uruguay",
  esp: "spain",
  kor: "korea",
  bel: "belgium",
  fra: "france",
  eng: "england"
};

const localeDefaultThemeByLanguage: Partial<Record<SupportedLanguage | string, keyof typeof localizedCardThemes>> = {
  en: "usa",
  es: "colombia",
  pt: "brazil",
  de: "germany",
  fr: "france"
};

const countryAliases: Record<string, keyof typeof localizedCardThemes> = {
  za: "southafrica",
  rsa: "southafrica",
  southafrica: "southafrica",
  cz: "czechia",
  cze: "czechia",
  czechia: "czechia",
  ba: "bosnia",
  bih: "bosnia",
  bosnia: "bosnia",
  bosniaherzegovina: "bosnia",
  qa: "qatar",
  qat: "qatar",
  qatar: "qatar",
  ch: "switzerland",
  sui: "switzerland",
  switzerland: "switzerland",
  ma: "morocco",
  mar: "morocco",
  morocco: "morocco",
  ht: "haiti",
  hai: "haiti",
  haiti: "haiti",
  sco: "scotland",
  scotland: "scotland",
  py: "paraguay",
  par: "paraguay",
  paraguay: "paraguay",
  au: "australia",
  aus: "australia",
  australia: "australia",
  tr: "turkiye",
  tur: "turkiye",
  turkey: "turkiye",
  turkiye: "turkiye",
  cw: "curacao",
  cuw: "curacao",
  curacao: "curacao",
  ci: "ivorycoast",
  civ: "ivorycoast",
  cotedivoire: "ivorycoast",
  ivorycoast: "ivorycoast",
  nl: "netherlands",
  ned: "netherlands",
  netherlands: "netherlands",
  se: "sweden",
  swe: "sweden",
  sweden: "sweden",
  tn: "tunisia",
  tun: "tunisia",
  tunisia: "tunisia",
  ir: "iran",
  irn: "iran",
  iran: "iran",
  eg: "egypt",
  egy: "egypt",
  egypt: "egypt",
  nz: "newzealand",
  nzl: "newzealand",
  newzealand: "newzealand",
  cv: "caboverde",
  cpv: "caboverde",
  caboverde: "caboverde",
  sa: "saudiarabia",
  ksa: "saudiarabia",
  saudiarabia: "saudiarabia",
  sn: "senegal",
  sen: "senegal",
  senegal: "senegal",
  iq: "iraq",
  irq: "iraq",
  iraq: "iraq",
  no: "norway",
  nor: "norway",
  norway: "norway",
  dz: "algeria",
  alg: "algeria",
  algeria: "algeria",
  at: "austria",
  aut: "austria",
  austria: "austria",
  jo: "jordan",
  jor: "jordan",
  jordan: "jordan",
  cd: "congodr",
  cod: "congodr",
  congodr: "congodr",
  drcongo: "congodr",
  uz: "uzbekistan",
  uzb: "uzbekistan",
  uzbekistan: "uzbekistan",
  hr: "croatia",
  cro: "croatia",
  croatia: "croatia",
  gh: "ghana",
  gha: "ghana",
  ghana: "ghana",
  pa: "panama",
  pan: "panama",
  panama: "panama",
  co: "colombia",
  col: "colombia",
  colombia: "colombia",
  ec: "ecuador",
  ecu: "ecuador",
  ecuador: "ecuador",
  de: "germany",
  ger: "germany",
  germany: "germany",
  jp: "japan",
  jpn: "japan",
  japan: "japan",
  kr: "korea",
  kor: "korea",
  korea: "korea",
  korearepublic: "korea",
  us: "usa",
  usa: "usa",
  unitedstates: "usa",
  ca: "canada",
  can: "canada",
  canada: "canada",
  mx: "mexico",
  mex: "mexico",
  mexico: "mexico",
  pt: "portugal",
  por: "portugal",
  portugal: "portugal",
  br: "brazil",
  bra: "brazil",
  brazil: "brazil",
  ar: "argentina",
  arg: "argentina",
  argentina: "argentina",
  uy: "uruguay",
  uru: "uruguay",
  uruguay: "uruguay",
  es: "spain",
  esp: "spain",
  spain: "spain",
  be: "belgium",
  bel: "belgium",
  belgium: "belgium",
  fr: "france",
  fra: "france",
  france: "france",
  eng: "england",
  england: "england"
};

export function resolveLocalizedCardThemeId(input: LocalizedCardThemeInput): keyof typeof localizedCardThemes {
  const normalizedHomeTeamId = normalizeKey(input.homeTeamId);
  if (normalizedHomeTeamId && teamThemeById[normalizedHomeTeamId]) {
    return teamThemeById[normalizedHomeTeamId];
  }

  const explicitCountryKey = normalizeKey(input.countryCode);
  if (explicitCountryKey && countryAliases[explicitCountryKey]) {
    return countryAliases[explicitCountryKey];
  }

  const explicitMarketKey = normalizeKey(input.marketCode);
  if (explicitMarketKey && countryAliases[explicitMarketKey]) {
    return countryAliases[explicitMarketKey];
  }

  const localeKey = normalizeKey(input.preferredLanguage);
  if (localeKey && localeDefaultThemeByLanguage[localeKey]) {
    return localeDefaultThemeByLanguage[localeKey] ?? "generic";
  }

  return "generic";
}

export function getLocalizedCardTheme(input: LocalizedCardThemeInput): LocalizedCardTheme {
  return localizedCardThemes[resolveLocalizedCardThemeId(input)] ?? localizedCardThemes.generic;
}

export function getLocalizedCardThemeForUserSurface(input: LocalizedCardThemeInput): LocalizedCardTheme {
  const hasExplicitVisualIdentity = Boolean(
    normalizeKey(input.homeTeamId) || normalizeKey(input.countryCode) || normalizeKey(input.marketCode)
  );

  if (!hasExplicitVisualIdentity) {
    return localizedCardThemes.generic;
  }

  return getLocalizedCardTheme(input);
}

export function isLightLocalizedCardTheme(theme: LocalizedCardTheme) {
  if (theme.surfaceTone) {
    return theme.surfaceTone === "light";
  }

  return theme.textColor.trim().toUpperCase() !== "#FFFFFF";
}

export function getLocalizedCardCssVars(theme: LocalizedCardTheme): CSSProperties {
  const accentPalette = normalizeThemeColors(theme.patternColors ?? theme.colors, theme.mainBackground);

  return {
    "--localized-card-bg": theme.mainBackground,
    "--localized-card-text": theme.textColor,
    "--localized-card-secondary-text": theme.secondaryTextColor ?? theme.textColor,
    "--localized-card-control-surface": theme.controlSurface ?? "rgba(255,255,255,0.92)",
    "--localized-card-control-text": theme.controlText ?? "#1F2937",
    "--localized-card-border": theme.id === "generic" ? theme.borderColor ?? "#E5E7EB" : "transparent",
    "--localized-card-control-zone-tint": theme.controlZoneTint ?? "rgba(255,255,255,0.22)",
    "--localized-card-accent-1": accentPalette[0],
    "--localized-card-accent-2": accentPalette[1],
    "--localized-card-accent-3": accentPalette[2],
    "--localized-card-accent-4": accentPalette[3],
    "--localized-card-accent-5": accentPalette[4],
    "--localized-card-shadow": getShadowColor(theme),
    "--localized-card-highlight": getHighlightColor(theme),
    "--localized-card-emblem-outline": getEmblemOutlineColor(theme)
  } as CSSProperties;
}

export function getAppAccentCssVars(theme: LocalizedCardTheme): CSSProperties {
  const fallbackTheme = localizedCardThemes.generic;
  const accent = getSafeAccentColor(theme, fallbackTheme);
  const accentLight = theme.accentLight ?? fallbackTheme.accentLight;
  const accentDark = theme.accentDark ?? fallbackTheme.accentDark;
  const preferredAccentText = theme.accentText ?? fallbackTheme.accentText;
  const accentText = getSafeAccentTextColor(accent, preferredAccentText);
  const accentFill = theme.useNeutralAccent
    ? accentLight
    : getPreferredFilledAccentColor(theme, accent, accentDark, preferredAccentText);
  const accentFillHover = theme.useNeutralAccent
    ? theme.borderColor ?? accentLight
    : getPreferredFilledAccentHoverColor(accentFill, accentDark, preferredAccentText);
  const accentFillText = theme.useNeutralAccent
    ? getSafeAccentTextColor(accentFill, theme.accentDark ?? accent)
    : getSafeAccentTextColor(accentFill, preferredAccentText);
  const accentFillHoverText = theme.useNeutralAccent
    ? getSafeAccentTextColor(accentFillHover, theme.accentDark ?? accent)
    : getSafeAccentTextColor(accentFillHover, preferredAccentText);
  const accentSoft = withAlpha(accent, theme.useNeutralAccent ? 0.06 : 0.12);
  const accentBorder = withAlpha(accent, theme.useNeutralAccent ? 0.42 : 0.28);
  const accentRing = withAlpha(accent, theme.useNeutralAccent ? 0.26 : 0.42);
  const logoSecondaryAccent = getLogoSecondaryAccentColor(theme, accent, fallbackTheme);

  return {
    "--app-accent": accent,
    "--app-accent-light": accentLight,
    "--app-accent-dark": accentDark,
    "--app-accent-text": accentText,
    "--app-accent-fill": accentFill,
    "--app-accent-fill-hover": accentFillHover,
    "--app-accent-fill-text": accentFillText,
    "--app-accent-fill-hover-text": accentFillHoverText,
    "--app-accent-soft": accentSoft,
    "--app-accent-border": accentBorder,
    "--app-accent-ring": accentRing,
    "--app-logo-secondary-accent": logoSecondaryAccent,
    "--app-accent-rgb": toRgbChannels(accent),
    "--app-accent-light-rgb": toRgbChannels(accentLight),
    "--app-accent-dark-rgb": toRgbChannels(accentDark),
    "--app-accent-text-rgb": toRgbChannels(accentText),
    "--app-accent-fill-rgb": toRgbChannels(accentFill),
    "--app-accent-fill-hover-rgb": toRgbChannels(accentFillHover),
    "--app-accent-fill-text-rgb": toRgbChannels(accentFillText),
    "--app-accent-fill-hover-text-rgb": toRgbChannels(accentFillHoverText),
    "--app-accent-soft-rgb": toRgbChannels(accentSoft),
    "--app-accent-border-rgb": toRgbChannels(accentBorder),
    "--app-accent-ring-rgb": toRgbChannels(accentRing)
  } as CSSProperties;
}

function normalizeThemeColors(colors: string[], mainBackground: string) {
  const filtered = colors.filter(Boolean);
  const palette = filtered.length > 0 ? filtered : [mainBackground];
  const normalized: string[] = [];

  while (normalized.length < 5) {
    normalized.push(palette[normalized.length % palette.length]);
  }

  return normalized;
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s_-]+/g, "") ?? "";
}

function getShadowColor(theme: LocalizedCardTheme) {
  if (theme.id === "japan") {
    return "rgba(226, 229, 234, 0.58)";
  }

  if (theme.id === "ecuador") {
    return "rgba(0, 56, 147, 0.24)";
  }

  return isLightLocalizedCardTheme(theme) ? withAlpha(getDarkAccentColor(theme), 0.18) : theme.mainBackground;
}

function getHighlightColor(theme: LocalizedCardTheme) {
  if (theme.id === "japan") {
    return "rgba(255, 255, 255, 0.82)";
  }

  if (theme.id === "ecuador") {
    return "rgba(255, 255, 255, 0.54)";
  }

  return isLightLocalizedCardTheme(theme) ? withAlpha(getPrimaryAccentColor(theme), 0.18) : "#FFFFFF";
}

function getEmblemOutlineColor(theme: LocalizedCardTheme) {
  return isLightLocalizedCardTheme(theme)
    ? withAlpha(getDarkAccentColor(theme), 0.24)
    : "rgba(255,255,255,0.24)";
}

function getPrimaryAccentColor(theme: LocalizedCardTheme) {
  const candidates = theme.colors.filter((color) => normalizeKey(color) !== normalizeKey(theme.mainBackground));
  return candidates.find((color) => getRelativeLuminance(color) < 0.96) ?? candidates[0] ?? theme.mainBackground;
}

function getDarkAccentColor(theme: LocalizedCardTheme) {
  const candidates = theme.colors.filter((color) => normalizeKey(color) !== normalizeKey(theme.mainBackground));
  const pool = candidates.length > 0 ? candidates : [theme.mainBackground];
  return [...pool].sort((left, right) => getRelativeLuminance(left) - getRelativeLuminance(right))[0] ?? theme.mainBackground;
}

function getSafeAccentColor(theme: LocalizedCardTheme, fallbackTheme: LocalizedCardTheme) {
  const accent = theme.accent ?? fallbackTheme.accent;
  if (getRelativeLuminance(accent) <= 0.94) {
    return accent;
  }

  const candidates = [theme.flagAccent, theme.accentDark, getDarkAccentColor(theme), fallbackTheme.accent].filter(
    Boolean
  ) as string[];

  return candidates.find((candidate) => getRelativeLuminance(candidate) <= 0.94) ?? fallbackTheme.accent;
}

function getSafeAccentTextColor(accent: string, preferredTextColor: string) {
  if (getContrastRatio(accent, preferredTextColor) >= 4.5) {
    return preferredTextColor;
  }

  const whiteContrast = getContrastRatio(accent, "#FFFFFF");
  const darkContrast = getContrastRatio(accent, "#111111");
  return whiteContrast >= darkContrast ? "#FFFFFF" : "#111111";
}

function getPreferredFilledAccentColor(
  theme: LocalizedCardTheme,
  accent: string,
  accentDark: string,
  preferredTextColor: string
) {
  if (!prefersWhiteAccentText(preferredTextColor)) {
    return accent;
  }

  const candidates = [accentDark, getDarkAccentColor(theme), theme.mainBackground, accent].filter(Boolean) as string[];
  const supportedCandidate = candidates.find((candidate) => getContrastRatio(candidate, "#FFFFFF") >= 4.5);
  if (supportedCandidate) {
    return supportedCandidate;
  }

  return darkenColorToContrast(accent, "#FFFFFF", 4.5) ?? accentDark ?? accent;
}

function getPreferredFilledAccentHoverColor(accentFill: string, accentDark: string, preferredTextColor: string) {
  const base =
    getRelativeLuminance(accentDark) < getRelativeLuminance(accentFill) ? accentDark : accentFill;

  if (!prefersWhiteAccentText(preferredTextColor)) {
    return base;
  }

  if (getContrastRatio(base, "#FFFFFF") >= 4.5) {
    return base;
  }

  return darkenColorToContrast(base, "#FFFFFF", 4.5) ?? base;
}

function getLogoSecondaryAccentColor(
  theme: LocalizedCardTheme,
  accent: string,
  fallbackTheme: LocalizedCardTheme
) {
  const accentKey = normalizeKey(accent);
  const candidates = [
    ...(theme.patternColors ?? []),
    ...theme.colors,
    theme.flagAccent,
    theme.mainBackground,
    fallbackTheme.textColor
  ].filter((color): color is string => {
    if (!color || normalizeKey(color) === accentKey) {
      return false;
    }

    return Boolean(parseCssColor(color));
  });

  if (candidates.length === 0) {
    return "#FFFFFF";
  }

  return [...new Set(candidates)].sort((left, right) => {
    const rightContrast = getContrastRatio(right, "#0F0F0F");
    const leftContrast = getContrastRatio(left, "#0F0F0F");
    return rightContrast - leftContrast;
  })[0] ?? "#FFFFFF";
}

function prefersWhiteAccentText(color: string) {
  const normalized = color.trim().toUpperCase();
  return normalized === "#FFF" || normalized === "#FFFFFF" || normalized === "WHITE";
}

function getRelativeLuminance(color: string) {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return 1;
  }

  const [r, g, b] = rgb.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(left: string, right: string) {
  const leftLuminance = getRelativeLuminance(left);
  const rightLuminance = getRelativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function withAlpha(color: string, alpha: number) {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return color;
  }

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function darkenColorToContrast(color: string, textColor: string, minimumContrast: number) {
  const rgb = parseCssColor(color);
  if (!rgb) {
    return null;
  }

  let [r, g, b] = rgb;
  for (let step = 0; step < 24; step += 1) {
    const candidate = toHexColor(r, g, b);
    if (getContrastRatio(candidate, textColor) >= minimumContrast) {
      return candidate;
    }

    r = Math.max(0, Math.round(r * 0.92));
    g = Math.max(0, Math.round(g * 0.92));
    b = Math.max(0, Math.round(b * 0.92));
  }

  return toHexColor(r, g, b);
}

function toRgbChannels(color: string) {
  const rgb = parseCssColor(color);
  if (!rgb) {
    return toRgbChannels(localizedCardThemes.generic.accent);
  }

  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

function toHexColor(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function parseHexColor(color: string) {
  const normalized = color.trim().replace("#", "");
  if (normalized.length !== 3 && normalized.length !== 6) {
    return null;
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) {
    return null;
  }

  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

function parseCssColor(color: string) {
  const hex = parseHexColor(color);
  if (hex) {
    return hex;
  }

  const match = color
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,\/]+[\d.]+)?\s*\)$/i);
  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1] ?? "", 10),
    Number.parseInt(match[2] ?? "", 10),
    Number.parseInt(match[3] ?? "", 10)
  ] as const;
}
