import { useQuery } from "@tanstack/react-query";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { useWorkspace, missingIdentity, overdue } from "../data/workspace";
import { readStay } from "../data/repository";
import { boardBeds, staySummary } from "../domain/stay";
import { Metric, WorkspaceState } from "../components/workspace";
export function DashboardReadiness() {
  const { event } = useEvent();
  const { t } = useI18n();
  const root = `/e/${event.id}`;
  const q = useWorkspace(["person", "task", "apartment_issue"]);
  const stay = useQuery({
    queryKey: ["event", event.id, "stay"],
    queryFn: () => readStay(event.id),
  });
  const beds = stay.data ? staySummary(boardBeds(stay.data)) : null;
  return (
    <section>
      <h2>{t("readiness")}</h2>
      <WorkspaceState
        pending={q.pending || stay.isPending}
        error={q.error || stay.error}
        retry={() => {
          q.retry();
          void stay.refetch();
        }}
      >
        <div className="workspace-metrics readiness-metrics">
          <Metric
            label="identityToComplete"
            value={(q.rows.person ?? []).filter(missingIdentity).length}
            to={`${root}/people?filter=incomplete`}
          />
          <Metric
            label="overdue"
            value={(q.rows.task ?? []).filter((a) => overdue(a)).length}
            to={`${root}/tasks?filter=overdue`}
          />
          <Metric
            label="urgentIssues"
            value={
              (q.rows.apartment_issue ?? []).filter(
                (a) =>
                  ["HIGH", "CRITICAL"].includes(String(a.priority)) &&
                  !["RESOLVED", "CLOSED"].includes(String(a.status)),
              ).length
            }
            to={`${root}/issues?filter=open&priority=urgent`}
          />
          <Metric
            label="bedsReady"
            value={`${beds?.available ?? "—"} / ${beds?.total ?? "—"}`}
            to={`${root}/availability`}
          />
        </div>
      </WorkspaceState>
    </section>
  );
}
