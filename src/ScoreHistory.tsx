import { Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function ScoreHistory({
  serviceName,
  currentScore,
}: {
  serviceName: string;
  currentScore: number;
}) {
  const [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/services/${encodeURIComponent(serviceName)}/score-history`)
      .then((response) => (response.ok ? response.json() : { history: [] }))
      .then((data) => setHistory(data.history || []))
      .catch(() => setHistory([]));
  }, [serviceName]);
  const points = useMemo(
    () =>
      [...history]
        .reverse()
        .concat(
          history.length
            ? []
            : [{ score: currentScore }],
        ),
    [history, currentScore],
  );
  const polyline = points
    .map(
      (point, index) =>
        `${points.length === 1 ? 50 : (index / (points.length - 1)) * 100},${100 - Number(point.score)}`,
    )
    .join(" ");
  const delta =
    points.length > 1
      ? Number(points.at(-1)?.score) - Number(points[0]?.score)
      : 0;
  return (
    <section className="record-section score-history">
      <div className="record-section-head">
        <div>
          <p className="eyebrow">TREND</p>
          <h2>Scorecard history</h2>
          <p>
            {points.length > 1
              ? `${points.length} recorded changes`
              : "History starts when a score changes."}
          </p>
        </div>
        <span
          className={`history-delta ${delta < 0 ? "down" : delta > 0 ? "up" : ""}`}
        >
          {delta > 0 ? "+" : ""}
          {delta} points
        </span>
      </div>
      <div className="history-chart">
        <div className="history-axis">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Score history ending at ${currentScore}`}
        >
          <line x1="0" y1="0" x2="100" y2="0" />
          <line x1="0" y1="50" x2="100" y2="50" />
          <line x1="0" y1="100" x2="100" y2="100" />
          <polyline points={polyline} />
          {points.map((point, index) => (
            <circle
              key={`${point.score}-${index}`}
              cx={
                points.length === 1 ? 50 : (index / (points.length - 1)) * 100
              }
              cy={100 - Number(point.score)}
              r="2"
            />
          ))}
        </svg>
        <div className="history-current">
          <Activity size={15} />
          <strong>{currentScore}</strong>
          <span>Current score</span>
        </div>
      </div>
    </section>
  );
}
