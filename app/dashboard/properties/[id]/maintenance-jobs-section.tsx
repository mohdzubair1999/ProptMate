import { loadPropertyJobs } from "@/lib/maintenanceJobs";
import { countOpen } from "@/lib/maintenanceTracking";
import MaintenanceJobList from "@/components/MaintenanceJobList";
import DownloadButton from "@/components/DownloadButton";

// "Maintenance jobs" on a property's page: the jobs found at inspections and tracked until they are dealt with.
export default async function MaintenanceJobsSection({ propertyId, companyId, role }: { propertyId: string; companyId: string | null | undefined; role: string | undefined }) {
  const jobs = await loadPropertyJobs(propertyId, companyId);
  const open = countOpen(jobs);
  return (
    <section className="mt-10" data-testid="maintenance-jobs-section">
      <h2 className="font-display font-600 text-lg text-ink">
        Maintenance jobs{open > 0 ? <span className="ml-2 text-xs font-medium text-amber-800" data-testid="jobs-open-count">{open} open</span> : null}
      </h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-slate mt-3" data-testid="jobs-empty">
          Nothing is being tracked. When a mid-term inspection has a draft maintenance list, click Track these jobs to follow them up here and at the next visit.
        </p>
      ) : (
        <div className="mt-3">
          <MaintenanceJobList jobs={jobs} mode="property" canRemove={role === "ADMIN" || role === "MANAGER"} />
          <div className="mt-3">
            <DownloadButton url={`/api/export/maintenance?propertyId=${encodeURIComponent(propertyId)}`} label="Download jobs (CSV)" fallbackName="maintenance-jobs.csv" />
          </div>
        </div>
      )}
    </section>
  );
}
