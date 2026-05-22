"use client";

import { useCallback, useRef, useState } from "react";
import { parseAssetsCsv } from "@/lib/impact/csv";
import { SAMPLE_ASSETS, SAMPLE_ASSETS_CSV } from "@/lib/impact/sampleAssets";
import type { UserAsset } from "@/lib/impact/types";

type Props = {
  assetCount: number;
  onAssetsChange: (assets: UserAsset[]) => void;
};

export function AssetUploadPanel({ assetCount, onAssetsChange }: Props) {
  const [pasteValue, setPasteValue] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(
    (csv: string, label: string) => {
      const { assets, errors: parseErrors } = parseAssetsCsv(csv);
      setErrors(parseErrors);
      if (assets.length === 0) {
        setStatus(`No assets parsed from ${label}.`);
        return;
      }
      onAssetsChange(assets);
      setStatus(`Loaded ${assets.length} asset${assets.length === 1 ? "" : "s"} from ${label}.`);
    },
    [onAssetsChange]
  );

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        handleParse(text, file.name);
      } catch {
        setErrors(["Failed to read the file."]);
        setStatus(null);
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [handleParse]
  );

  const handlePaste = useCallback(() => {
    if (!pasteValue.trim()) {
      setErrors(["Paste a CSV before importing."]);
      return;
    }
    handleParse(pasteValue, "pasted CSV");
  }, [pasteValue, handleParse]);

  const handleLoadSample = useCallback(() => {
    onAssetsChange(SAMPLE_ASSETS);
    setErrors([]);
    setStatus(`Loaded ${SAMPLE_ASSETS.length} fictional demo assets.`);
  }, [onAssetsChange]);

  const handleClear = useCallback(() => {
    onAssetsChange([]);
    setErrors([]);
    setStatus("Cleared all assets.");
  }, [onAssetsChange]);

  const handleCopySample = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SAMPLE_ASSETS_CSV);
        setStatus("Sample CSV copied to clipboard.");
      } else {
        setPasteValue(SAMPLE_ASSETS_CSV);
        setStatus("Sample CSV placed in paste box (clipboard unavailable).");
      }
    } catch {
      setPasteValue(SAMPLE_ASSETS_CSV);
      setStatus("Sample CSV placed in paste box.");
    }
  }, []);

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
    setStatus("Sample CSV downloaded.");
  }, []);

  return (
    <section className="impact-upload">
      <header className="impact-upload-head">
        <span className="impact-eyebrow">Assets</span>
        <h2>Bring your own assets</h2>
        <p className="impact-upload-sub">
          {assetCount > 0
            ? `${assetCount} asset${assetCount === 1 ? "" : "s"} loaded locally.`
            : "No assets loaded yet. Add some to start scoring exposure."}
        </p>
      </header>

      <div className="impact-upload-actions">
        <button type="button" className="impact-btn impact-btn-primary" onClick={handleLoadSample}>
          Load sample assets
        </button>
        <label className="impact-btn impact-btn-secondary impact-file-label">
          Upload CSV
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFile}
            className="impact-file-input"
          />
        </label>
        <button type="button" className="impact-btn impact-btn-secondary" onClick={handleCopySample}>
          Copy sample CSV
        </button>
        <button type="button" className="impact-btn impact-btn-secondary" onClick={handleDownloadSample}>
          Download sample CSV
        </button>
        <button
          type="button"
          className="impact-btn impact-btn-ghost"
          onClick={handleClear}
          disabled={assetCount === 0}
        >
          Clear assets
        </button>
      </div>

      <details className="impact-upload-schema">
        <summary>Expected CSV format</summary>
        <pre>{`name,type,country,city,lat,lon,importance,owner,tags,notes
Haifa Supplier,supplier,Israel,Haifa,32.7940,34.9896,high,Demo Team,"electronics;shipping","Fictional demo supplier"`}</pre>
        <ul>
          <li>Required: name, country, lat, lon.</li>
          <li>type defaults to other; importance defaults to medium.</li>
          <li>tags can be comma- or semicolon-separated within quotes.</li>
        </ul>
      </details>

      <div className="impact-paste">
        <label className="impact-paste-label" htmlFor="impact-paste">
          Paste CSV
        </label>
        <textarea
          id="impact-paste"
          className="impact-paste-input"
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          placeholder="Paste rows in the same schema as the sample CSV…"
          rows={5}
          spellCheck={false}
        />
        <div className="impact-paste-actions">
          <button type="button" className="impact-btn impact-btn-secondary" onClick={handlePaste}>
            Parse pasted CSV
          </button>
          {pasteValue ? (
            <button
              type="button"
              className="impact-btn impact-btn-ghost"
              onClick={() => setPasteValue("")}
            >
              Clear paste box
            </button>
          ) : null}
        </div>
      </div>

      {status ? <p className="impact-upload-status">{status}</p> : null}
      {errors.length > 0 ? (
        <div className="impact-upload-errors">
          <strong>CSV warnings:</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={`${i}-${e}`}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="impact-privacy-note">
        Assets stay in your browser. Do not upload sensitive or confidential asset lists into this prototype.
      </p>
    </section>
  );
}
