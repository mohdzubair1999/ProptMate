import { loadOpenJobsForVisit } from "@/lib/maintenanceJobs";
import MaintenanceJobList from "@/components/MaintenanceJobList";

// On a draft mid-term inspection: the property's maintenance jobs that are still open from earlier visits, as a checklist. Shows nothing
// when there are none.
export default async function OpenJobsChecklist({ propertyId, companyId, inspectionId }: { propertyId: string; companyId: string | null | undefined; inspectionId: string }) {
  const jobs = await loadOpenJobsForVisit(propertyId, companyId, inspectionId);
  if (jobs.length === 0) return null;
  return (
    <section className="mb-4 rounded-xl border border-line bg-white p-4" data-testid="open-jobs-checklist">
      <p className="font-semibold text-ink text-sm">Open jobs from earlier visits ({jobs.length})</p>
      <p className="text-xs text-slate mt-0.5 mb-3">Check each one as you go round. Fixed closes it. Still there is saved with today&apos;s date, so the next visit can see when it was last confirmed; mention it in this inspection&apos;s notes too.</p>
      <MaintenanceJobList jobs={jobs} mode="checklist" inspectionId={inspectionId} />
    </section>
  );
}
