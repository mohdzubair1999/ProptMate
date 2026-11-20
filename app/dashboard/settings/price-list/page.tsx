import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPounds } from "@/lib/depositEstimate";
import { addExamplePrices, deletePriceItem } from "@/lib/actions/priceList";
import PriceForm from "./price-form";

export default async function PriceListPage() {
  const session = await getSession();
  const user = session?.user as any;
  const companyId = user?.companyId as string | null | undefined;
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const items = companyId ? await prisma.priceListItem.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 200 }) : [];
  return (
    <main className="max-w-3xl">
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">← Back to settings</Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Price list</h1>
      <p className="text-sm text-slate mt-1">What a typical fix costs. On a check-out, ProptMate suggests a cost for each defect from this list and reduces it for fair wear and tear when you enter the item&apos;s age. These are suggestions for an agent to review, never final charges.</p>
      <p className="text-sm text-slate mt-2">Keywords are the words that make a line a good match, for example <em>wall, paint, scuff</em>. Lifespan (years) is how long the item is expected to last: leave it empty for things like cleaning that do not wear out.</p>

      {items.length === 0 && canEdit && (
        <form action={addExamplePrices} className="mt-4"><button className="text-sm bg-signal text-white px-4 py-2 rounded-full" data-testid="add-example-prices">Start with some example prices</button><p className="text-xs text-slate mt-1">They are examples, not market rates. Edit them to your own.</p></form>
      )}
      <ul className="mt-5 space-y-2" data-testid="price-list">
        {items.map((i) => (
          <li key={i.id} className="bg-white border border-line rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">{i.name} <span className="text-slate font-normal">- {formatPounds(i.pricePence)}</span></p>
              <p className="text-xs text-slate">Matches: {i.keywords || "nothing yet (you can still pick it by hand)"}{i.lifespanYears ? ` · lasts about ${i.lifespanYears} years` : ""}</p>
            </div>
            {canEdit && <form action={deletePriceItem}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-red-600 hover:underline">Remove</button></form>}
          </li>
        ))}
      </ul>
      {canEdit ? <PriceForm /> : <p className="text-sm text-slate mt-4">Only an Admin or Manager can change the price list.</p>}
    </main>
  );
}
