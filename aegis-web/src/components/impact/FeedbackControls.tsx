"use client";

import { useCallback, useState } from "react";
import { addFeedback } from "@/lib/impact/storage";
import type { AlertFeedback, AlertFeedbackValue, ExposureAlert } from "@/lib/impact/types";

type Props = {
  alert: ExposureAlert;
  existingFeedback: AlertFeedback[];
  onFeedback: (feedback: AlertFeedback[]) => void;
};

const OPTIONS: Array<{ value: AlertFeedbackValue; label: string }> = [
  { value: "useful", label: "Useful" },
  { value: "not_useful", label: "Not useful" },
  { value: "false_positive", label: "False positive" },
  { value: "needs_better_sources", label: "Needs better sources" },
];

export function FeedbackControls({ alert, existingFeedback, onFeedback }: Props) {
  const [note, setNote] = useState("");
  const [pendingValue, setPendingValue] = useState<AlertFeedbackValue | null>(null);

  const submit = useCallback(
    (value: AlertFeedbackValue) => {
      const entry: AlertFeedback = {
        alertId: alert.id,
        assetId: alert.asset.id,
        value,
        note: note.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      const next = addFeedback(entry);
      onFeedback(next);
      setPendingValue(value);
      setNote("");
      setTimeout(() => setPendingValue(null), 1500);
    },
    [alert, note, onFeedback]
  );

  const recent = existingFeedback
    .filter((f) => f.alertId === alert.id)
    .slice(0, 3);

  return (
    <div className="impact-feedback">
      <span className="impact-eyebrow">Feedback</span>
      <div className="impact-feedback-buttons">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`impact-btn impact-btn-secondary${pendingValue === opt.value ? " is-active" : ""}`}
            onClick={() => submit(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <label className="impact-feedback-note">
        <span>Optional note</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add context (saved locally only)"
          maxLength={240}
        />
      </label>
      {recent.length > 0 ? (
        <ul className="impact-feedback-log">
          {recent.map((f) => (
            <li key={`${f.alertId}-${f.value}-${f.createdAt}`}>
              <span className="impact-feedback-log-value">{f.value.replace(/_/g, " ")}</span>
              <span className="impact-feedback-log-time">
                {new Date(f.createdAt).toLocaleString()}
              </span>
              {f.note ? <em className="impact-feedback-log-note">“{f.note}”</em> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
