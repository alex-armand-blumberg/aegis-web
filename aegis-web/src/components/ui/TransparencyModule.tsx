import type { ReactNode } from "react";

type TransparencyModuleProps = {
  title?: string;
  items: ReactNode[];
  className?: string;
};

export function TransparencyModule({
  title = "Transparency",
  items,
  className = "",
}: TransparencyModuleProps) {
  if (items.length === 0) return null;
  return (
    <aside className={`ui-transparency-module ${className}`.trim()}>
      <div className="ui-transparency-module-title">{title}</div>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
