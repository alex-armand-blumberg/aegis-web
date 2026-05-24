"use client";

import { useCallback, useRef, useState } from "react";
import { parseAssetsCsv } from "@/lib/impact/csv";
import { SAMPLE_ASSETS, SAMPLE_ASSETS_CSV } from "@/lib/impact/sampleAssets";
import { saveAssets } from "@/lib/impact/storage";
import type { OnboardingSource } from "./onboardingStorage";
import type { UserAsset } from "@/lib/impact/types";

type Props = {
  onContinue: (source: OnboardingSource, assets: UserAsset[]) => void;
};

export function StepSource({ onContinue }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  const handleSample = useCallback(() => {
    saveAssets(SAMPLE_ASSETS);
    onContinue("sample", SAMPLE_ASSETS);
  }, [onContinue]);

  const handleFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setIsParsing(true);
      setErrors([]);
      try {
        const text = await file.text();
        const { assets, errors: parseErrors } = parseAssetsCsv(text);
        if (assets.length === 0) {
          setErrors(parseErrors.length > 0 ? parseErrors : ["No assets found in CSV."]);
          return;
        }
        saveAssets(assets);
        onContinue("csv", assets);
      } catch {
        setErrors(["Failed to read the file."]);
      } finally {
        setIsParsing(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [onContinue]
  );

  const handleDownloadSample = useCallback(() => {
    const blob = new Blob([SAMPLE_ASSETS_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aegis-impact-sample-assets.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="iv-onboard-step">
      <h1 className="iv-display">What assets do you want to monitor?</h1>
      <p className="iv-meta iv-onboard-lead">
        We use this list to focus the dashboard on what matters to you.
      </p>

      <div className="iv-onboard-actions">
        <button
          type="button"
          className="iv-btn iv-btn-primary iv-btn-lg"
          onClick={handleSample}
        >
          Use sample portfolio
        </button>
        <label className="iv-btn iv-btn-secondary iv-btn-lg iv-file-label">
          Upload my own CSV
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFile}
            className="iv-file-input"
            disabled={isParsing}
          />
        </label>
      </div>

      <details className="iv-details">
        <summary>CSV format</summary>
        <div className="iv-details-body">
          <code className="iv-code-line">
            name,type,country,city,lat,lon,importance,owner,tags,notes
          </code>
          <p className="iv-meta">
            Required columns: name, country, lat, lon.{" "}
            <button type="button" className="iv-text-link" onClick={handleDownloadSample}>
              Download sample CSV
            </button>
          </p>
        </div>
      </details>

      {errors.length > 0 ? (
        <div className="iv-inline-errors" role="alert">
          {errors.map((error, index) => (
            <p key={`${index}-${error}`}>{error}</p>
          ))}
        </div>
      ) : null}

      <p className="iv-privacy-note">
        Privacy: assets stay in your browser. Do not upload sensitive lists into this prototype.
      </p>
    </div>
  );
}
