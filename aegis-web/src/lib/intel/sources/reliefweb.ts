import type { IntelPoint, IntelSeverity } from "@/lib/intel/types";
import {
  type AdapterResult,
  fetchJsonWithTimeout,
  isValidLatLon,
  isWithinRangeHours,
  makeErrorHealth,
  makeOkHealth,
  makeSkippedHealth,
} from "./_shared";

const RELIEFWEB_URL = "https://api.reliefweb.int/v2/reports";
const RELIEFWEB_CAP = 200;
const PROVIDER = "ReliefWeb";

const HUMANITARIAN_STRESS_TERMS = [
  "displacement",
  "displaced",
  "refugee",
  "civilian",
  "violence",
  "conflict",
  "security",
  "siege",
  "famine",
  "humanitarian",
  "evacuation",
  "attack",
  "killed",
  "wounded",
];

type ReliefWebCountryEntry = {
  name?: string;
  iso3?: string;
  location?: { lat?: number; lon?: number };
};

type ReliefWebReport = {
  id?: string;
  fields?: {
    title?: string;
    "date.created"?: { original?: string };
    url?: string;
    source?: Array<{ name?: string }>;
    country?: ReliefWebCountryEntry[];
    primary_country?: ReliefWebCountryEntry;
    disaster?: Array<{ name?: string }>;
    theme?: Array<{ name?: string }>;
  };
};

type ReliefWebResponse = {
  data?: ReliefWebReport[];
  totalCount?: number;
};

function severityFromTitle(title: string): IntelSeverity {
  const lower = title.toLowerCase();
  let hits = 0;
  for (const t of HUMANITARIAN_STRESS_TERMS) if (lower.includes(t)) hits += 1;
  if (hits >= 2) return "high";
  if (hits === 1) return "medium";
  return "low";
}

function readAppname(): string | null {
  const v = process.env.RELIEFWEB_APPNAME?.trim();
  return v ? v : null;
}

export async function fetchReliefWebSignals(rangeHours: number): Promise<AdapterResult> {
  const appname = readAppname();
  if (!appname) {
    return {
      points: [],
      health: makeSkippedHealth(PROVIDER, "RELIEFWEB_APPNAME not set"),
    };
  }

  const startedAt = Date.now();
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - Math.max(1, rangeHours) * 3_600_000);
  const body = {
    appname,
    limit: 200,
    profile: "list",
    fields: {
      include: [
        "title",
        "date.created",
        "url",
        "source",
        "country",
        "primary_country",
        "disaster",
        "theme",
      ],
    },
    sort: ["date.created:desc"],
    filter: {
      operator: "AND",
      conditions: [
        {
          field: "date.created",
          value: {
            from: startDate.toISOString(),
            to: endDate.toISOString(),
          },
        },
      ],
    },
  };

  const res = await fetchJsonWithTimeout<ReliefWebResponse>({
    url: RELIEFWEB_URL,
    timeoutMs: 9_000,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  });

  if (!res.ok || !res.data || !Array.isArray(res.data.data)) {
    return {
      points: [],
      health: makeErrorHealth(PROVIDER, res.message ?? "ReliefWeb fetch failed", res.latencyMs),
    };
  }

  const points: IntelPoint[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < res.data.data.length; i += 1) {
    if (points.length >= RELIEFWEB_CAP) break;
    const report = res.data.data[i];
    const fields = report.fields ?? {};
    const title = typeof fields.title === "string" ? fields.title.trim() : "";
    if (!title) continue;
    const created = fields["date.created"]?.original;
    if (!created) continue;
    if (!isWithinRangeHours(created, rangeHours)) continue;

    const candidates: ReliefWebCountryEntry[] = [];
    if (fields.primary_country) candidates.push(fields.primary_country);
    if (Array.isArray(fields.country)) candidates.push(...fields.country);
    const located = candidates.find(
      (c) => c.location && isValidLatLon(c.location.lat, c.location.lon)
    );
    if (!located || !located.location) continue;
    const lat = located.location.lat;
    const lon = located.location.lon;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (!isValidLatLon(lat, lon)) continue;

    const dedupeKey = `${title}|${located.iso3 ?? located.name ?? ""}|${created.slice(0, 10)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const sourceName = fields.source?.[0]?.name?.trim() || "ReliefWeb";
    const sourceTag = sourceName.toLowerCase().includes("reliefweb")
      ? sourceName
      : `ReliefWeb (${sourceName})`;
    const url = typeof fields.url === "string" ? fields.url : null;
    const disasterName = fields.disaster?.[0]?.name?.trim() ?? null;
    const themes = (fields.theme ?? []).map((t) => t?.name).filter(Boolean).join(", ");

    points.push({
      id: `reliefweb-${report.id ?? i}-${created}`,
      layer: "news",
      title,
      subtitle: disasterName
        ? `${disasterName}${located.name ? ` · ${located.name}` : ""}`
        : located.name,
      lat,
      lon,
      country: located.name,
      severity: severityFromTitle(title),
      source: sourceTag,
      timestamp: new Date(created).toISOString(),
      confidence: 0.78,
      metadata: {
        source_url: url,
        reliefweb_id: report.id ?? null,
        reliefweb_disaster: disasterName,
        reliefweb_themes: themes || null,
        reliefweb_iso3: located.iso3 ?? null,
        geo_precision: "country",
      },
    });
  }

  return {
    points,
    health: makeOkHealth(
      PROVIDER,
      `ReliefWeb returned ${points.length} reports in last ${rangeHours}h (cap ${RELIEFWEB_CAP})`,
      Date.now() - startedAt
    ),
  };
}
