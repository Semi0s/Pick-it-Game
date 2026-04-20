import type { Invite, Match, Team, UserProfile } from "@/lib/types";

export const demoInvites: Invite[] = [
  {
    email: "alex@example.com",
    displayName: "Alex Rivera",
    role: "player",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Alex"
  },
  {
    email: "jamie@example.com",
    displayName: "Jamie Chen",
    role: "player",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Jamie"
  },
  {
    email: "morgan@example.com",
    displayName: "Morgan Patel",
    role: "player",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Morgan"
  },
  {
    email: "admin@example.com",
    displayName: "Admin Captain",
    role: "admin",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Admin"
  }
];

export const demoUsers: UserProfile[] = demoInvites.map((invite, index) => ({
  id: `user-${index + 1}`,
  name: invite.displayName,
  email: invite.email,
  avatarUrl: invite.avatarUrl,
  role: invite.role,
  totalPoints: 0
}));

export const teams: Team[] = [
  { id: "mex", name: "Mexico", shortName: "MEX", groupName: "A", fifaRank: 15, flagEmoji: "🇲🇽" },
  { id: "rsa", name: "South Africa", shortName: "RSA", groupName: "A", fifaRank: 60, flagEmoji: "🇿🇦" },
  { id: "kor", name: "Korea Republic", shortName: "KOR", groupName: "A", fifaRank: 25, flagEmoji: "🇰🇷" },
  { id: "cze", name: "Czechia", shortName: "CZE", groupName: "A", fifaRank: 41, flagEmoji: "🇨🇿" },
  { id: "can", name: "Canada", shortName: "CAN", groupName: "B", fifaRank: 30, flagEmoji: "🇨🇦" },
  { id: "bih", name: "Bosnia-Herzegovina", shortName: "BIH", groupName: "B", fifaRank: 65, flagEmoji: "🇧🇦" },
  { id: "qat", name: "Qatar", shortName: "QAT", groupName: "B", fifaRank: 55, flagEmoji: "🇶🇦" },
  { id: "sui", name: "Switzerland", shortName: "SUI", groupName: "B", fifaRank: 19, flagEmoji: "🇨🇭" },
  { id: "bra", name: "Brazil", shortName: "BRA", groupName: "C", fifaRank: 6, flagEmoji: "🇧🇷" },
  { id: "mar", name: "Morocco", shortName: "MAR", groupName: "C", fifaRank: 8, flagEmoji: "🇲🇦" },
  { id: "hai", name: "Haiti", shortName: "HAI", groupName: "C", fifaRank: 83, flagEmoji: "🇭🇹" },
  { id: "sco", name: "Scotland", shortName: "SCO", groupName: "C", fifaRank: 43, flagEmoji: "🏴" },
  { id: "usa", name: "United States", shortName: "USA", groupName: "D", fifaRank: 16, flagEmoji: "🇺🇸" },
  { id: "par", name: "Paraguay", shortName: "PAR", groupName: "D", fifaRank: 40, flagEmoji: "🇵🇾" },
  { id: "aus", name: "Australia", shortName: "AUS", groupName: "D", fifaRank: 27, flagEmoji: "🇦🇺" },
  { id: "tur", name: "Türkiye", shortName: "TUR", groupName: "D", fifaRank: 22, flagEmoji: "🇹🇷" },
  { id: "ger", name: "Germany", shortName: "GER", groupName: "E", fifaRank: 10, flagEmoji: "🇩🇪" },
  { id: "cuw", name: "Curaçao", shortName: "CUW", groupName: "E", fifaRank: 82, flagEmoji: "🇨🇼" },
  { id: "civ", name: "Côte d'Ivoire", shortName: "CIV", groupName: "E", fifaRank: 34, flagEmoji: "🇨🇮" },
  { id: "ecu", name: "Ecuador", shortName: "ECU", groupName: "E", fifaRank: 23, flagEmoji: "🇪🇨" },
  { id: "ned", name: "Netherlands", shortName: "NED", groupName: "F", fifaRank: 7, flagEmoji: "🇳🇱" },
  { id: "jpn", name: "Japan", shortName: "JPN", groupName: "F", fifaRank: 18, flagEmoji: "🇯🇵" },
  { id: "swe", name: "Sweden", shortName: "SWE", groupName: "F", fifaRank: 38, flagEmoji: "🇸🇪" },
  { id: "tun", name: "Tunisia", shortName: "TUN", groupName: "F", fifaRank: 44, flagEmoji: "🇹🇳" },
  { id: "bel", name: "Belgium", shortName: "BEL", groupName: "G", fifaRank: 9, flagEmoji: "🇧🇪" },
  { id: "irn", name: "IR Iran", shortName: "IRN", groupName: "G", fifaRank: 21, flagEmoji: "🇮🇷" },
  { id: "egy", name: "Egypt", shortName: "EGY", groupName: "G", fifaRank: 29, flagEmoji: "🇪🇬" },
  { id: "nzl", name: "New Zealand", shortName: "NZL", groupName: "G", fifaRank: 85, flagEmoji: "🇳🇿" },
  { id: "esp", name: "Spain", shortName: "ESP", groupName: "H", fifaRank: 2, flagEmoji: "🇪🇸" },
  { id: "cpv", name: "Cabo Verde", shortName: "CPV", groupName: "H", fifaRank: 69, flagEmoji: "🇨🇻" },
  { id: "ksa", name: "Saudi Arabia", shortName: "KSA", groupName: "H", fifaRank: 61, flagEmoji: "🇸🇦" },
  { id: "uru", name: "Uruguay", shortName: "URU", groupName: "H", fifaRank: 17, flagEmoji: "🇺🇾" },
  { id: "fra", name: "France", shortName: "FRA", groupName: "I", fifaRank: 1, flagEmoji: "🇫🇷" },
  { id: "sen", name: "Senegal", shortName: "SEN", groupName: "I", fifaRank: 14, flagEmoji: "🇸🇳" },
  { id: "irq", name: "Iraq", shortName: "IRQ", groupName: "I", fifaRank: 57, flagEmoji: "🇮🇶" },
  { id: "nor", name: "Norway", shortName: "NOR", groupName: "I", fifaRank: 31, flagEmoji: "🇳🇴" },
  { id: "arg", name: "Argentina", shortName: "ARG", groupName: "J", fifaRank: 3, flagEmoji: "🇦🇷" },
  { id: "alg", name: "Algeria", shortName: "ALG", groupName: "J", fifaRank: 28, flagEmoji: "🇩🇿" },
  { id: "aut", name: "Austria", shortName: "AUT", groupName: "J", fifaRank: 24, flagEmoji: "🇦🇹" },
  { id: "jor", name: "Jordan", shortName: "JOR", groupName: "J", fifaRank: 63, flagEmoji: "🇯🇴" },
  { id: "por", name: "Portugal", shortName: "POR", groupName: "K", fifaRank: 5, flagEmoji: "🇵🇹" },
  { id: "cod", name: "Congo DR", shortName: "COD", groupName: "K", fifaRank: 46, flagEmoji: "🇨🇩" },
  { id: "uzb", name: "Uzbekistan", shortName: "UZB", groupName: "K", fifaRank: 50, flagEmoji: "🇺🇿" },
  { id: "col", name: "Colombia", shortName: "COL", groupName: "K", fifaRank: 13, flagEmoji: "🇨🇴" },
  { id: "eng", name: "England", shortName: "ENG", groupName: "L", fifaRank: 4, flagEmoji: "🏴" },
  { id: "cro", name: "Croatia", shortName: "CRO", groupName: "L", fifaRank: 11, flagEmoji: "🇭🇷" },
  { id: "gha", name: "Ghana", shortName: "GHA", groupName: "L", fifaRank: 74, flagEmoji: "🇬🇭" },
  { id: "pan", name: "Panama", shortName: "PAN", groupName: "L", fifaRank: 33, flagEmoji: "🇵🇦" }
];

const kickoff = (date: string, time: string) => `${date}T${time}:00-04:00`;

function groupMatch(
  matchNumber: number,
  groupName: string,
  date: string,
  time: string,
  homeTeamId: string,
  awayTeamId: string
): Match {
  return {
    id: `g-${matchNumber.toString().padStart(2, "0")}`,
    stage: "group",
    groupName,
    homeTeamId,
    awayTeamId,
    kickoffTime: kickoff(date, time),
    status: "scheduled"
  };
}

export const matches: Match[] = [
  groupMatch(1, "A", "2026-06-11", "15:00", "mex", "rsa"),
  groupMatch(2, "A", "2026-06-11", "22:00", "kor", "cze"),
  groupMatch(3, "B", "2026-06-12", "15:00", "can", "bih"),
  groupMatch(4, "D", "2026-06-12", "21:00", "usa", "par"),
  groupMatch(5, "C", "2026-06-13", "18:00", "bra", "mar"),
  groupMatch(6, "D", "2026-06-13", "00:00", "aus", "tur"),
  groupMatch(7, "C", "2026-06-13", "21:00", "hai", "sco"),
  groupMatch(8, "B", "2026-06-13", "15:00", "qat", "sui"),
  groupMatch(9, "E", "2026-06-14", "13:00", "ger", "cuw"),
  groupMatch(10, "E", "2026-06-14", "19:00", "civ", "ecu"),
  groupMatch(11, "F", "2026-06-14", "16:00", "ned", "jpn"),
  groupMatch(12, "F", "2026-06-14", "22:00", "swe", "tun"),
  groupMatch(13, "H", "2026-06-15", "12:00", "esp", "cpv"),
  groupMatch(14, "H", "2026-06-15", "18:00", "ksa", "uru"),
  groupMatch(15, "G", "2026-06-15", "21:00", "bel", "egy"),
  groupMatch(16, "G", "2026-06-15", "15:00", "irn", "nzl"),
  groupMatch(17, "I", "2026-06-16", "15:00", "fra", "sen"),
  groupMatch(18, "I", "2026-06-16", "18:00", "irq", "nor"),
  groupMatch(19, "J", "2026-06-16", "21:00", "arg", "alg"),
  groupMatch(20, "J", "2026-06-16", "00:00", "aut", "jor"),
  groupMatch(21, "L", "2026-06-17", "19:00", "eng", "cro"),
  groupMatch(22, "L", "2026-06-17", "16:00", "gha", "pan"),
  groupMatch(23, "K", "2026-06-17", "13:00", "por", "cod"),
  groupMatch(24, "K", "2026-06-17", "22:00", "uzb", "col"),
  groupMatch(25, "A", "2026-06-18", "12:00", "cze", "rsa"),
  groupMatch(26, "B", "2026-06-18", "15:00", "sui", "bih"),
  groupMatch(27, "B", "2026-06-18", "18:00", "can", "qat"),
  groupMatch(28, "A", "2026-06-18", "21:00", "mex", "kor"),
  groupMatch(29, "C", "2026-06-19", "21:00", "bra", "hai"),
  groupMatch(30, "C", "2026-06-19", "18:00", "sco", "mar"),
  groupMatch(31, "D", "2026-06-19", "00:00", "tur", "par"),
  groupMatch(32, "D", "2026-06-19", "15:00", "usa", "aus"),
  groupMatch(33, "E", "2026-06-20", "16:00", "ger", "civ"),
  groupMatch(34, "E", "2026-06-20", "20:00", "ecu", "cuw"),
  groupMatch(35, "F", "2026-06-20", "13:00", "ned", "swe"),
  groupMatch(36, "F", "2026-06-20", "00:00", "tun", "jpn"),
  groupMatch(37, "H", "2026-06-21", "12:00", "esp", "ksa"),
  groupMatch(38, "H", "2026-06-21", "18:00", "uru", "cpv"),
  groupMatch(39, "G", "2026-06-21", "15:00", "bel", "irn"),
  groupMatch(40, "G", "2026-06-21", "21:00", "nzl", "egy"),
  groupMatch(41, "I", "2026-06-22", "17:00", "fra", "irq"),
  groupMatch(42, "I", "2026-06-22", "20:00", "nor", "sen"),
  groupMatch(43, "J", "2026-06-22", "13:00", "arg", "aut"),
  groupMatch(44, "J", "2026-06-22", "23:00", "jor", "alg"),
  groupMatch(45, "L", "2026-06-23", "16:00", "eng", "gha"),
  groupMatch(46, "L", "2026-06-23", "19:00", "pan", "cro"),
  groupMatch(47, "K", "2026-06-23", "13:00", "por", "uzb"),
  groupMatch(48, "K", "2026-06-23", "22:00", "col", "cod"),
  groupMatch(49, "C", "2026-06-24", "18:00", "sco", "bra"),
  groupMatch(50, "C", "2026-06-24", "18:00", "mar", "hai"),
  groupMatch(51, "B", "2026-06-24", "15:00", "can", "sui"),
  groupMatch(52, "B", "2026-06-24", "15:00", "bih", "qat"),
  groupMatch(53, "A", "2026-06-24", "21:00", "mex", "cze"),
  groupMatch(54, "A", "2026-06-24", "21:00", "kor", "rsa"),
  groupMatch(55, "E", "2026-06-25", "16:00", "ecu", "ger"),
  groupMatch(56, "E", "2026-06-25", "16:00", "cuw", "civ"),
  groupMatch(57, "F", "2026-06-25", "19:00", "tun", "ned"),
  groupMatch(58, "F", "2026-06-25", "19:00", "jpn", "swe"),
  groupMatch(59, "D", "2026-06-25", "22:00", "usa", "tur"),
  groupMatch(60, "D", "2026-06-25", "22:00", "par", "aus"),
  groupMatch(61, "I", "2026-06-26", "15:00", "nor", "fra"),
  groupMatch(62, "I", "2026-06-26", "15:00", "sen", "irq"),
  groupMatch(63, "G", "2026-06-26", "23:00", "nzl", "bel"),
  groupMatch(64, "G", "2026-06-26", "23:00", "egy", "irn"),
  groupMatch(65, "H", "2026-06-26", "20:00", "uru", "esp"),
  groupMatch(66, "H", "2026-06-26", "20:00", "cpv", "ksa"),
  groupMatch(67, "L", "2026-06-27", "17:00", "pan", "eng"),
  groupMatch(68, "L", "2026-06-27", "17:00", "cro", "gha"),
  groupMatch(69, "J", "2026-06-27", "22:00", "jor", "arg"),
  groupMatch(70, "J", "2026-06-27", "22:00", "alg", "aut"),
  groupMatch(71, "K", "2026-06-27", "19:30", "col", "por"),
  groupMatch(72, "K", "2026-06-27", "19:30", "cod", "uzb")
];

export function getTeam(teamId?: string) {
  return teams.find((team) => team.id === teamId);
}

export function getGroupMatches() {
  return matches.filter((match) => match.stage === "group");
}
