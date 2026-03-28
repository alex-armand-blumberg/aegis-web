import type { ReactNode } from "react";
import { StatusChip, type StatusChipVariant } from "./StatusChip";

export type TimelineItem = {
  id: string;
  time: string;
  summary: ReactNode;
  source?: string;
  severity?: StatusChipVariant;
  onClick?: () => void;
};

type TimelineGroup = {
  label: string;
  items: TimelineItem[];
};

type EventTimelineProps = {
  groups: TimelineGroup[];
  className?: string;
};

export function EventTimeline({ groups, className = "" }: EventTimelineProps) {
  return (
    <div className={`ui-timeline ${className}`.trim()}>
      {groups.map((g) => (
        <div key={g.label} className="ui-timeline-group">
          <div className="ui-timeline-group-label">{g.label}</div>
          {g.items.map((item) =>
            item.onClick ? (
              <button
                key={item.id}
                type="button"
                className="ui-timeline-item w-full text-left"
                onClick={item.onClick}
              >
                <div className="ui-timeline-time">{item.time}</div>
                <div className="ui-timeline-summary">{item.summary}</div>
                {item.source ? <div className="ui-timeline-source">{item.source}</div> : null}
                {item.severity ? (
                  <div className="mt-1">
                    <StatusChip variant={item.severity}>{item.severity}</StatusChip>
                  </div>
                ) : null}
              </button>
            ) : (
              <div key={item.id} className="ui-timeline-item">
                <div className="ui-timeline-time">{item.time}</div>
                <div className="ui-timeline-summary">{item.summary}</div>
                {item.source ? <div className="ui-timeline-source">{item.source}</div> : null}
                {item.severity ? (
                  <div className="mt-1">
                    <StatusChip variant={item.severity}>{item.severity}</StatusChip>
                  </div>
                ) : null}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
