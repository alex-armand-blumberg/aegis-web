/**
 * Infer flag / operating country from vessel name prefixes (naval/commercial patterns).
 */

export function countryFromNavalOrCommercialName(name: string | undefined | null): string | undefined {
  if (!name) return undefined;
  const u = name.toUpperCase();
  if (/\bUSS\b|\bUSNS\b|\bUSCGC\b/.test(u)) return "United States";
  if (/\bHMS\b|\bRFA\b|\bRMAS\b/.test(u)) return "United Kingdom";
  if (/\bHMCS\b/.test(u)) return "Canada";
  if (/\bHMAS\b/.test(u)) return "Australia";
  if (/\bHMNZS\b/.test(u)) return "New Zealand";
  if (/\bROKS\b/.test(u)) return "South Korea";
  if (/\bINS\b/.test(u)) return "India";
  if (/\bBNS\b/.test(u)) return "Belgium";
  if (/\bHDMS\b/.test(u)) return "Denmark";
  if (/\bHNLMS\b/.test(u)) return "Netherlands";
  if (/\bHSwMS\b/.test(u)) return "Sweden";
  if (/\bKNM\b/.test(u)) return "Norway";
  if (/\bFS\b|\bFrench\s+Navy\b/.test(u)) return "France";
  if (/\bPLAN\b|\bChinese\s+Navy\b/.test(u)) return "China";
  if (/\bJDS\b|\bJS\b\s/.test(u) && /\bDDG\b|\bDDH\b/.test(u)) return "Japan";
  if (/\bRFS\b|\bRussian\s+Navy\b/.test(u)) return "Russia";
  return undefined;
}
