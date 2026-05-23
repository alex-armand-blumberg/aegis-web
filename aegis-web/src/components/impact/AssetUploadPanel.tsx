"use client";

import { useCallback, useRef, useState } from "react";
import { parseAssetsCsv } from "@/lib/impact/csv";
import { SAMPLE_ASSETS, SAMPLE_ASSETS_CSV } from "@/lib/impact/sampleAssets";
import type { UserAsset } from "@/lib/impact/types";

type Props = {
  assetCount: number;
  onAssetsChange: (assets: UserAsset[]) => void;
};

function usePortfolioActions(onAssetsChange: (assets: UserAsset[]) => void) {
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

  return {
    pasteValue,
    setPasteValue,
    errors,
    status,
    fileRef,
    handleFile,
    handlePaste,
    handleLoadSample,
    handleClear,
    handleCopySample,
    handleDownloadSample,
  };
}

function PortfolioExtras({
  pasteValue,
  setPasteValue,
  errors,
  status,
  onPaste,
}: {
  pasteValue: string;
  setPasteValue: (value: string) => void;
  errors: string[];
  status: string | null;
  onPaste: () => void;
}) {
  return (
    <>
      <details className="impact-disclosure impact-disclosure-sample">
        <summary>Expected CSV format</summary>
        <div className="impact-csv-sample-box">
          <pre className="impact-csv-sample-pre">{`name,type,country,city,lat,lon,importance,owner,tags,notes
Haifa Supplier,supplier,Israel,Haifa,32.7940,34.9896,high,Demo Team,"electronics;shipping","Fictional demo supplier"`}</pre>
        </div>
        <ul>
          <li>Required: name, country, lat, lon.</li>
          <li>type defaults to other; importance defaults to medium.</li>
          <li>tags can be comma- or semicolon-separated within quotes.</li>
        </ul>
      </details>

      <details className="impact-disclosure">
        <summary>Paste CSV manually</summary>
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
          <button type="button" className="impact-btn impact-btn-secondary" onClick={onPaste}>
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
      </details>

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
    </>
  );
}

export function AssetUploadPanel({ assetCount, onAssetsChange }: Props) {
  const actions = usePortfolioActions(onAssetsChange);

  if (assetCount === 0) {
    return (
      <section className="impact-portfolio-empty">
        <span className="impact-eyebrow">Asset Portfolio</span>
        <h2 className="impact-empty-title">Start with a demo portfolio</h2>
        <p className="impact-empty-body">
          Load fictional sample assets to see how AEGIS ranks exposure against live public-source
          signals, or upload your own CSV.
        </p>
        <div className="impact-empty-actions">
          <button
            type="button"
            className="impact-btn impact-btn-primary impact-btn-lg"
            onClick={actions.handleLoadSample}
          >
            Load sample assets
          </button>
          <label className="impact-btn impact-btn-secondary impact-btn-lg impact-file-label">
            Upload CSV
            <input
              ref={actions.fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={actions.handleFile}
              className="impact-file-input"
            />
          </label>
        </div>
        <div className="impact-empty-utils">
          <button
            type="button"
            className="impact-btn impact-btn-ghost impact-btn-sm"
            onClick={actions.handleCopySample}
          >
            Copy sample CSV
          </button>
          <button
            type="button"
            className="impact-btn impact-btn-ghost impact-btn-sm"
            onClick={actions.handleDownloadSample}
          >
            Download sample CSV
          </button>
        </div>
        <PortfolioExtras
          pasteValue={actions.pasteValue}
          setPasteValue={actions.setPasteValue}
          errors={actions.errors}
          status={actions.status}
          onPaste={actions.handlePaste}
        />
        <p className="impact-privacy-note">
          Assets stay in your browser. Do not upload sensitive or confidential asset lists into
          this prototype.
        </p>
      </section>
    );
  }

  return (
    <header className="impact-portfolio-head">
      <span className="impact-eyebrow">Asset Portfolio</span>
      <span className="impact-portfolio-count">
        {assetCount} asset{assetCount === 1 ? "" : "s"}
      </span>
    </header>
  );
}

export function PortfolioManagePanel({
  onAssetsChange,
}: {
  onAssetsChange: (assets: UserAsset[]) => void;
}) {
  const actions = usePortfolioActions(onAssetsChange);

  return (
    <details className="impact-portfolio-manage-panel">
      <summary className="impact-portfolio-manage-btn">Manage portfolio</summary>
      <div className="impact-portfolio-manage-body">
        <div className="impact-portfolio-toolbar">
          <button
            type="button"
            className="impact-btn impact-btn-secondary impact-btn-sm"
            onClick={actions.handleLoadSample}
            title="Replace with the fictional demo portfolio"
          >
            Load sample assets
          </button>
          <label
            className="impact-btn impact-btn-secondary impact-btn-sm impact-file-label"
            title="Upload a CSV"
          >
            Upload CSV
            <input
              ref={actions.fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={actions.handleFile}
              className="impact-file-input"
            />
          </label>
          <button
            type="button"
            className="impact-btn impact-btn-secondary impact-btn-sm"
            onClick={actions.handleCopySample}
          >
            Copy sample CSV
          </button>
          <button
            type="button"
            className="impact-btn impact-btn-secondary impact-btn-sm"
            onClick={actions.handleDownloadSample}
          >
            Download sample CSV
          </button>
          <button
            type="button"
            className="impact-btn impact-btn-ghost impact-btn-sm"
            onClick={actions.handleClear}
          >
            Clear assets
          </button>
        </div>
        <PortfolioExtras
          pasteValue={actions.pasteValue}
          setPasteValue={actions.setPasteValue}
          errors={actions.errors}
          status={actions.status}
          onPaste={actions.handlePaste}
        />
      </div>
    </details>
  );
}
