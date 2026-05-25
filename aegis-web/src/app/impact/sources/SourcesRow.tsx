"use client";

import type { SourceRole } from "./sourcesRegistry";
import type { SourceRowModel } from "./sourcesUtils";
import {
  formatAbsoluteTime,
  formatRelativeTime,
  rolesLabel,
  statusDotClass,
  statusLabel,
} from "./sourcesUtils";

type RoleBadgeVariant = "map-backbone" | "corroboration" | "context";

function roleBadgeVariant(roles: SourceRole[]): RoleBadgeVariant | null {
  if (roles.includes("chat")) return null;
  if (roles.includes("map pin")) return "map-backbone";
  if (roles.includes("evidence")) return "corroboration";
  if (roles.includes("context") || roles.includes("db")) return "context";
  return null;
}

function roleBadgeLabel(variant: RoleBadgeVariant): string {
  switch (variant) {
    case "map-backbone":
      return "Map backbone";
    case "corroboration":
      return "Corroboration";
    case "context":
      return "Context";
  }
}

type Props = {
  row: SourceRowModel;
};

export function SourcesRow({ row }: Props) {
  const envLine =
    row.envVars && row.envVars.length > 0
      ? `${row.envOptional ? "Optional env" : "Required env"}: ${row.envVars.join(", ")}`
      : null;

  const badgeVariant = roleBadgeVariant(row.roles);

  return (
    <article className="iv-sources-row">
      <div className="iv-sources-row-main">
        <span className={statusDotClass(row.status)} aria-hidden />
        <div className="iv-sources-row-body">
          <div className="iv-sources-row-head">
            <h3 className="iv-sources-row-title">{row.name}</h3>
            {badgeVariant ? (
              <span
                className={`iv-sources-role-badge iv-sources-role-badge-${badgeVariant}`}
                title={`Role: ${roleBadgeLabel(badgeVariant)}`}
              >
                {roleBadgeLabel(badgeVariant)}
              </span>
            ) : null}
            <span className="iv-sources-row-status">{statusLabel(row.status)}</span>
          </div>
          <p className="iv-meta iv-sources-row-meta">
            {[
              `Role: ${rolesLabel(row.roles)}`,
              `Tier: ${row.tierLabel}${row.tierIsEstimate ? " (estimate)" : ""}`,
              `${row.pointCount} signal${row.pointCount === 1 ? "" : "s"}`,
              row.costNote,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {row.message ? (
            <p className="iv-meta iv-sources-row-message">{row.message}</p>
          ) : null}
          <p className="iv-meta iv-sources-row-fetch">
            Last fetch {formatRelativeTime(row.updatedAt)}
            {row.latencyMs !== undefined ? ` · ${row.latencyMs}ms` : ""}
            {" · "}
            {formatAbsoluteTime(row.updatedAt)}
          </p>
          {envLine ? <p className="iv-meta iv-sources-row-env">{envLine}</p> : null}
          {row.sample ? (
            <p className="iv-meta iv-sources-row-sample">
              Sample: {row.sample.title}
              {row.sample.url ? (
                <>
                  {" · "}
                  <a
                    href={row.sample.url}
                    className="iv-text-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View source
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="iv-meta iv-sources-row-sample iv-sources-row-sample-empty">
              No sample in current response
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
