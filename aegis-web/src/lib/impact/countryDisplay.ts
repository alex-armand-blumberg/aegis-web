const COUNTRY_FLAG: Record<string, string> = {
  Israel: "🇮🇱",
  Taiwan: "🇹🇼",
  Greece: "🇬🇷",
  Kenya: "🇰🇪",
  Yemen: "🇾🇪",
  Ukraine: "🇺🇦",
  Philippines: "🇵🇭",
  Turkey: "🇹🇷",
  "United States": "🇺🇸",
  "United Kingdom": "🇬🇧",
  Germany: "🇩🇪",
  France: "🇫🇷",
  Poland: "🇵🇱",
  Syria: "🇸🇾",
  Iraq: "🇮🇶",
  Iran: "🇮🇷",
  India: "🇮🇳",
  China: "🇨🇳",
  Japan: "🇯🇵",
  Egypt: "🇪🇬",
  Lebanon: "🇱🇧",
  Jordan: "🇯🇴",
};

export function countryDisplay(country: string): { flag: string; label: string } {
  const trimmed = country.trim();
  const flag = COUNTRY_FLAG[trimmed];
  if (flag) return { flag, label: trimmed };
  const initials = trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return { flag: initials, label: trimmed };
}
