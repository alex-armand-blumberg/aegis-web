"use client";

import { useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function ContactModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
    }
  }

  if (!isOpen) return null;

  return (
    <div className="contact-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
      <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="contact-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="contact-modal-title" className="contact-modal-title">Contact</h2>
        {status === "success" ? (
          <p className="contact-modal-success">Thanks! Your message has been sent.</p>
        ) : (
          <form onSubmit={handleSubmit} className="contact-form">
            <label>
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Message</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                required
              />
            </label>
            {status === "error" && (
              <p className="contact-form-error">Something went wrong. Please try again.</p>
            )}
            <div className="contact-form-actions">
              <button type="button" onClick={onClose} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={status === "sending"} className="btn-primary">
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
