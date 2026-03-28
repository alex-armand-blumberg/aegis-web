"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import ContactModal from "@/components/ContactModal";

type ContactModalContextValue = {
  openContact: () => void;
};

const ContactModalContext = createContext<ContactModalContextValue | null>(null);

export function ContactModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openContact = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ openContact }), [openContact]);

  return (
    <ContactModalContext.Provider value={value}>
      {children}
      <ContactModal isOpen={open} onClose={() => setOpen(false)} />
    </ContactModalContext.Provider>
  );
}

export function useContactModal(): ContactModalContextValue {
  const ctx = useContext(ContactModalContext);
  if (!ctx) {
    throw new Error("useContactModal must be used within ContactModalProvider");
  }
  return ctx;
}
