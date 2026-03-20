/**
 * Country names for autocomplete (ACLED-style / common English names).
 * Prefix-match is used to suggest as the user types.
 */
export const COUNTRY_NAMES: string[] = [
  "Afghanistan", "Albania", "Algeria", "Armenia", "Azerbaijan", "Bahrain", "Belarus", "Belize",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Burkina Faso", "Cameroon", "Central African Republic",
  "Chad", "China", "Colombia", "Costa Rica", "Côte d'Ivoire", "Democratic Republic of Congo", "Egypt",
  "El Salvador", "Ethiopia", "France", "Georgia", "Germany", "Greece", "Guatemala", "Haiti", "Honduras",
  "India", "Indonesia", "Iran", "Iraq", "Israel", "Italy", "Japan", "Jordan", "Kazakhstan", "Kenya",
  "Kosovo", "Kuwait", "Kyrgyzstan", "Lebanon", "Libya", "Malawi", "Mali", "Mexico", "Moldova", "Mongolia",
  "Morocco", "Mozambique", "Myanmar", "Nepal", "Nicaragua", "Niger", "Nigeria", "North Korea", "Pakistan",
  "Judea & Samaria / Palestine",
  "Panama",
  "Philippines",
  "Poland",
  "Republic of Congo",
  "Russia",
  "Rwanda",
  "Saudi Arabia",
  "Senegal", "Serbia", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sudan", "Syria",
  "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine",
  "United Arab Emirates", "United Kingdom", "United States of America", "Uzbekistan", "Venezuela", "Vietnam",
  "Yemen", "Zambia", "Zimbabwe",
].sort((a, b) => a.localeCompare(b));

export function suggestCountries(prefix: string, max = 12): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return COUNTRY_NAMES.slice(0, max);
  return COUNTRY_NAMES.filter((c) => c.toLowerCase().startsWith(p)).slice(0, max);
}
