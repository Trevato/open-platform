type Status =
  | "pending"
  | "provisioning"
  | "ready"
  | "failed"
  | "unhealthy"
  | "terminating"
  | "terminated";

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  provisioning: "Provisioning",
  ready: "Ready",
  failed: "Failed",
  unhealthy: "Unhealthy",
  terminating: "Terminating",
  terminated: "Terminated",
};

export function StatusBadge({ status }: { status: string }) {
  const known = status in STATUS_LABELS;
  const s: Status = known ? (status as Status) : "pending";
  const label = known ? STATUS_LABELS[s] : status || "Pending";

  return (
    <span className={`badge badge-${s}`}>
      {s !== "terminated" && (
        <span className={`status-dot status-dot-${s}`} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
