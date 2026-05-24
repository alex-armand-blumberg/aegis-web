import type { ImpactRangeOption } from "./useImpactMapData";
import { IMPACT_RANGE_OPTIONS } from "./useImpactMapData";

export function parseRangeParam(value: string | null): ImpactRangeOption | null {
  if (!value) return null;
  return IMPACT_RANGE_OPTIONS.includes(value as ImpactRangeOption)
    ? (value as ImpactRangeOption)
    : null;
}

export function buildImpactSearchParams(opts: {
  assetId?: string | null;
  range?: ImpactRangeOption;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.assetId) params.set("asset", opts.assetId);
  if (opts.range) params.set("range", opts.range);
  return params;
}
