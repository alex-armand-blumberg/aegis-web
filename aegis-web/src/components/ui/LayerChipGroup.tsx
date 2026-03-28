"use client";

export type LayerChipItem = {
  id: string;
  label: string;
  count: number;
  color: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  title?: string;
};

type LayerGroup = {
  label: string;
  layers: LayerChipItem[];
};

type LayerChipGroupProps = {
  groups: LayerGroup[];
  className?: string;
};

export function LayerChip({ item }: { item: LayerChipItem }) {
  return (
    <label
      className={`ui-layer-chip ${item.checked ? "ui-layer-chip-active" : ""}`}
      title={item.title}
    >
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => item.onChange(e.target.checked)}
      />
      <span className="ui-layer-dot" style={{ background: item.color }} />
      <span>{item.label}</span>
      <span className="ui-layer-count">{item.count}</span>
    </label>
  );
}

export function LayerChipGroup({ groups, className = "" }: LayerChipGroupProps) {
  return (
    <div className={`ui-layer-toolbar flex flex-col gap-3 ${className}`.trim()}>
      {groups.map((g) => (
        <div key={g.label}>
          <div className="ui-layer-group-label">{g.label}</div>
          <div className="flex flex-wrap gap-2">
            {g.layers.map((layer) => (
              <LayerChip key={layer.id} item={layer} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
