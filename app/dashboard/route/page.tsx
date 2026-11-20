import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { geocodePostcodes } from "@/lib/geocode";
import { mapsLink, planDay, postcodeFor, ukDayRange } from "@/lib/routePlan";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";

export const metadata = { title: "My day" };

const todayUk = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

export default async function RoutePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const u = session.user as any;
  const sp = await searchParams;
  const day = ukDayRange(String(sp.date ?? "")) ? String(sp.date) : todayUk();
  const range = ukDayRange(day)!;
  const rows = u.companyId
    ? await prisma.inspection.findMany({
        where: { inspectorId: u.id, deletedAt: null, status: "draft", scheduledDate: { gte: range.start, lt: range.end }, property: { companyId: u.companyId, archivedAt: null } },
        select: { id: true, type: true, scheduledDate: true, property: { select: { id: true, address: true, city: true, postcode: true } } }, orderBy: { scheduledDate: "asc" }, take: 40,
      })
    : [];
  const pos = await geocodePostcodes(rows.map((r) => postcodeFor(r.property.postcode, r.property.address)));
  const plan = planDay(rows.map((r) => { const p = postcodeFor(r.property.postcode, r.property.address); const g = p ? pos.get(p) : undefined; return { id: r.id, address: r.property.address, postcode: r.property.postcode, at: r.scheduledDate, lat: g?.lat ?? null, lng: g?.lng ?? null }; }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const time = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }).format(d);
  const shift = (n: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
  return (
    <main className="max-w-2xl">
      <h1 className="font-display font-700 text-2xl text-ink">My day</h1>
      <div className="mt-2 flex items-center gap-3 text-sm">
        <Link href={`/dashboard/route?date=${shift(-1)}`} className="text-slate hover:text-ink">← Previous day</Link>
        <span className="font-medium text-ink" data-testid="route-day">{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
        <Link href={`/dashboard/route?date=${shift(1)}`} className="text-slate hover:text-ink">Next day →</Link>
      </div>
      <p className="text-sm text-slate mt-2">Your draft inspections for this day, in a sensible order. Visits with a set time keep it; the others are slotted in nearest first. Drive times are estimates from the distance between postcodes, not live traffic.</p>
      {plan.length === 0 ? <p className="mt-6 text-sm text-slate" data-testid="route-empty">You have no inspections scheduled for this day.</p> : (
        <ol className="mt-5 space-y-3">
          {plan.map((s, i) => { const r = byId.get(s.id)!; return (
            <li key={s.id} data-testid="route-stop">
              {s.driveMinutesFromPrevious !== null && <p className={`text-xs mb-1 ml-4 ${s.tight ? "text-red-600 font-medium" : "text-slate"}`}>About {s.driveMinutesFromPrevious} min drive ({s.km} km){s.tight ? " - tight: not enough time after the previous visit" : ""}</p>}
              <div className="bg-white border border-line rounded-xl p-4 flex items-start gap-3">
                <span className="w-7 h-7 rounded-full bg-signal text-white text-sm flex items-center justify-center shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{s.address}{s.postcode ? `, ${s.postcode}` : ""}</p>
                  <p className="text-xs text-slate">{inspectionTypeDisplayName(r.type)} · {s.timed && s.at ? time(s.at) : "no set time"}</p>
                  {s.lat === null && <p className="text-xs text-amber-700 mt-1" data-testid="route-no-postcode">No postcode found for this property, so no drive time. <Link href={`/dashboard/properties/${r.property.id}/edit`} className="underline">Add a postcode</Link></p>}
                  <div className="mt-2 flex gap-4 text-sm"><Link href={`/dashboard/inspections/${s.id}`} className="text-signal hover:underline">Open</Link><a href={mapsLink(s)} target="_blank" rel="noreferrer" className="text-signal hover:underline">Directions</a></div>
                </div>
              </div>
            </li>); })}
        </ol>
      )}
    </main>
  );
}
