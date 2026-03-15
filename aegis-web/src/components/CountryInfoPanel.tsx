"use client";

import type { CountrySummary } from "@/lib/mapUtils";

type CountryInfoPanelProps = {
  country: string;
  summary: CountrySummary;
  onClose: () => void;
};

function InfoRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span
        style={{
          color: "rgba(255,255,255,0.55)",
          fontSize: "11px",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color,
          fontWeight: 700,
          fontSize: "13px",
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

export default function CountryInfoPanel({
  country,
  summary,
  onClose,
}: CountryInfoPanelProps) {
  return (
    <div
      className="map-infopanel"
      style={{
        position: "absolute",
        top: 56,
        right: 16,
        width: 220,
        background:
          "linear-gradient(160deg, rgba(2,8,25,0.97), rgba(8,18,45,0.97))",
        border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 10,
        padding: 14,
        color: "white",
        zIndex: 1000,
        boxShadow: "0 0 30px rgba(96,165,250,0.12)",
        fontFamily: "var(--font-barlow), Inter, Arial, sans-serif",
      }}
    >
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 9,
          right: 11,
          cursor: "pointer",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.35)",
          fontSize: 15,
          lineHeight: 1,
          padding: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "white";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.35)";
        }}
      >
        &#10005;
      </button>
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          marginBottom: 1,
          paddingRight: 18,
        }}
      >
        {country}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "1.2px",
          marginBottom: 10,
        }}
      >
        ACLED CONFLICT DATA
      </div>
      <InfoRow color="#ef4444" label="FATALITIES" value={summary.fatalities} />
      <InfoRow color="#f87171" label="BATTLES" value={summary.battles} />
      <InfoRow color="#f59e0b" label="EXPLOSIONS" value={summary.explosions} />
      <InfoRow
        color="#fde047"
        label="CIV. VIOLENCE"
        value={summary.civ_violence}
      />
      <InfoRow color="#60a5fa" label="STRATEGIC" value={summary.strategic} />
      <InfoRow color="#a78bfa" label="PROTESTS" value={summary.protests} />
      <InfoRow color="#f472b6" label="RIOTS" value={summary.riots} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "5px 0 0",
        }}
      >
        <span
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 10,
          }}
        >
          EVENTS (TOTAL)
        </span>
        <span
          style={{
            color: "white",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {summary.metric_total.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          fontSize: 9,
          color: "rgba(255,255,255,0.28)",
          letterSpacing: "0.04em",
        }}
      >
        Source:{" "}
        <a
          href="https://acleddata.com"
          target="_blank"
          rel="noreferrer"
          style={{
            color: "rgba(255,255,255,0.38)",
            textDecoration: "underline",
          }}
        >
          ACLED (acleddata.com)
        </a>
      </div>
    </div>
  );
}
