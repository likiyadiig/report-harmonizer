import { Card } from "./ui";

// Only things the service does today.
const INCLUDED = [
  "Turn multi-author Word reports into one voice",
  "Every change returned as a Word tracked change",
  "Comments where an edit might change the meaning",
  "Cancel any time",
];

// The plan, shown the same way on /billing and the home page. Each page
// passes its own badge and buttons.
export function PlanCard({
  badge,
  children,
}: {
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-navy">Report Harmonizer</h2>
        {badge}
      </div>

      <p className="mt-2">
        <span className="text-3xl font-semibold tracking-tight text-navy">15 euros</span>{" "}
        <span className="text-muted">per month</span>
      </p>

      <ul className="mt-5 space-y-2">
        {INCLUDED.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-accent">
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {children}
    </Card>
  );
}
