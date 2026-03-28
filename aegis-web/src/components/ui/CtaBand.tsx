import type { ReactNode } from "react";

type CtaBandProps = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions: ReactNode;
  className?: string;
};

export function CtaBand({ eyebrow, title, description, actions, className = "" }: CtaBandProps) {
  return (
    <section className={`ui-cta-band ${className}`.trim()}>
      <p className="ui-cta-band-eyebrow">{eyebrow}</p>
      <h2 className="ui-cta-band-title">{title}</h2>
      {description ? <p className="ui-cta-band-desc">{description}</p> : null}
      <div className="ui-cta-band-actions">{actions}</div>
    </section>
  );
}
