import type { AssetImportance, AssetType, UserAsset } from "./types";

const ASSET_TYPES: AssetType[] = [
  "supplier",
  "facility",
  "office",
  "port",
  "route",
  "field_site",
  "school_program",
  "personnel",
  "region",
  "infrastructure",
  "other",
];

const ASSET_IMPORTANCE: AssetImportance[] = ["low", "medium", "high", "critical"];

const HEADERS = [
  "name",
  "type",
  "country",
  "city",
  "lat",
  "lon",
  "importance",
  "owner",
  "tags",
  "notes",
] as const;

type Row = string[];

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let buf = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        buf += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  result.push(buf);
  return result.map((c) => c.trim());
}

function parseRows(text: string): Row[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const rows: Row[] = [];
  for (const raw of lines) {
    if (!raw || !raw.trim()) continue;
    rows.push(splitCsvLine(raw));
  }
  return rows;
}

function normalizeAssetType(value: string | undefined): AssetType {
  const v = value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (v && (ASSET_TYPES as string[]).includes(v)) return v as AssetType;
  return "other";
}

function normalizeImportance(value: string | undefined): AssetImportance {
  const v = value?.trim().toLowerCase();
  if (v && (ASSET_IMPORTANCE as string[]).includes(v)) return v as AssetImportance;
  return "medium";
}

function parseTags(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(/[;,]/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function makeAssetId(name: string, country: string, lat: number, lon: number): string {
  const stem = slugify(`${name}-${country}`) || "asset";
  return `${stem}-${lat.toFixed(3)}-${lon.toFixed(3)}`.replace(/-+/g, "-");
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function findHeader(headerRow: Row, name: string): number {
  const idx = headerRow.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return idx;
}

export function parseAssetsCsv(csvText: string): { assets: UserAsset[]; errors: string[] } {
  const errors: string[] = [];
  const assets: UserAsset[] = [];

  if (typeof csvText !== "string" || !csvText.trim()) {
    return { assets, errors: ["CSV is empty."] };
  }

  const rows = parseRows(csvText);
  if (rows.length === 0) {
    return { assets, errors: ["CSV is empty."] };
  }

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const looksLikeHeader = HEADERS.some((h) => headerRow.includes(h));
  const headers = looksLikeHeader ? headerRow : (HEADERS as readonly string[]).slice();
  const dataRows = looksLikeHeader ? rows.slice(1) : rows;

  const idx = {
    name: findHeader(headers as Row, "name"),
    type: findHeader(headers as Row, "type"),
    country: findHeader(headers as Row, "country"),
    city: findHeader(headers as Row, "city"),
    lat: findHeader(headers as Row, "lat"),
    lon: findHeader(headers as Row, "lon"),
    importance: findHeader(headers as Row, "importance"),
    owner: findHeader(headers as Row, "owner"),
    tags: findHeader(headers as Row, "tags"),
    notes: findHeader(headers as Row, "notes"),
  };

  if (idx.name < 0 || idx.country < 0 || idx.lat < 0 || idx.lon < 0) {
    errors.push("Missing required columns. Required: name, country, lat, lon.");
    return { assets, errors };
  }

  const seenIds = new Set<string>();

  for (let r = 0; r < dataRows.length; r++) {
    const row = dataRows[r];
    const lineNumber = looksLikeHeader ? r + 2 : r + 1;

    const name = row[idx.name]?.trim();
    const country = row[idx.country]?.trim();
    const latRaw = row[idx.lat];
    const lonRaw = row[idx.lon];

    if (!name) {
      errors.push(`Line ${lineNumber}: missing name.`);
      continue;
    }
    if (!country) {
      errors.push(`Line ${lineNumber}: missing country.`);
      continue;
    }
    const lat = parseNumber(latRaw);
    const lon = parseNumber(lonRaw);
    if (lat === null || lon === null) {
      errors.push(`Line ${lineNumber}: lat/lon must be numbers.`);
      continue;
    }
    if (lat < -90 || lat > 90) {
      errors.push(`Line ${lineNumber}: lat must be between -90 and 90.`);
      continue;
    }
    if (lon < -180 || lon > 180) {
      errors.push(`Line ${lineNumber}: lon must be between -180 and 180.`);
      continue;
    }

    const type = normalizeAssetType(idx.type >= 0 ? row[idx.type] : undefined);
    const importance = normalizeImportance(idx.importance >= 0 ? row[idx.importance] : undefined);
    const city = idx.city >= 0 ? row[idx.city]?.trim() || undefined : undefined;
    const owner = idx.owner >= 0 ? row[idx.owner]?.trim() || undefined : undefined;
    const notes = idx.notes >= 0 ? row[idx.notes]?.trim() || undefined : undefined;
    const tags = idx.tags >= 0 ? parseTags(row[idx.tags]) : undefined;

    let id = makeAssetId(name, country, lat, lon);
    let suffix = 1;
    while (seenIds.has(id)) {
      id = `${makeAssetId(name, country, lat, lon)}-${suffix++}`;
    }
    seenIds.add(id);

    assets.push({
      id,
      name,
      type,
      country,
      city,
      lat,
      lon,
      importance,
      owner,
      notes,
      tags,
    });
  }

  return { assets, errors };
}
