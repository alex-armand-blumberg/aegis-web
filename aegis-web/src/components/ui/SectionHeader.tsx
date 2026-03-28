import type { ReactNode } from "react";

type SectionHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  showDivider?: boolean;
  className?: string;
  align?: "left" | "center";
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  showDivider = false,
  className = "",
  align = "left",
}: SectionHeaderProps) {
  return (
    <header
      className={`ui-section-header ${className}`}
      style={align === "center" ? { textAlign: "center" } : undefined}
    >
      <div className="ui-section-header-row" style={align === "center" ? { justifyContent: "center" } : undefined}>
        <div style={align === "center" ? { maxWidth: "42rem", margin: "0 auto" } : undefined}>
          <p className="ui-section-eyebrow">{eyebrow}</p>
          <h2 className="ui-section-title">{title}</h2>
          {description ? <div className="ui-section-desc">{description}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {showDivider ? <div className="ui-section-divider" /> : null}
    </header>
  );
}
