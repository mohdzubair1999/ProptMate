import { getSession } from "@/lib/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addSection, addRegulationBlock, unhideSection } from "@/lib/actions/templates";
import TemplateSectionsEditor from "./sections-editor";

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canManage = role === "ADMIN" || role === "MANAGER";

  const template = await prisma.template.findUnique({
    where: { id: id },
    include: { sections: { orderBy: { order: "asc" }, include: { fields: { orderBy: { order: "asc" } } } } },
  });

  if (!template) notFound();

  const hiddenSections = template.sections.filter((s) => s.hidden);

  return (
    <main className="max-w-3xl">
      <Link href="/dashboard/settings/templates" className="text-sm text-slate hover:text-ink">
        ← Back to templates
      </Link>

      <div className="mt-4">
        <h1 className="font-display font-700 text-2xl text-ink">{template.name}</h1>
        <p className="text-sm text-slate mt-1 capitalize">
          {template.inspectionType} · {template.propertyType || "Any property type"}
        </p>
      </div>

      <p className="text-xs text-slate mt-8 mb-2">Drag ⠿ to reorder sections and fields.</p>
      <TemplateSectionsEditor templateId={template.id} initialSections={template.sections} />

      {hiddenSections.length > 0 && (
        <section className="mt-6 bg-paper border border-line border-dashed rounded-xl p-6">
          <h2 className="font-display font-600 text-ink mb-1">Hidden sections</h2>
          <p className="text-sm text-slate mb-4">Not shown in the editor or in new inspections. Unhide to bring one back.</p>
          <div className="flex flex-wrap gap-2">
            {hiddenSections.map((section) => (
              <form key={section.id} action={unhideSection}>
                <input type="hidden" name="sectionId" value={section.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                  👁 Unhide "{section.title}"
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      {canManage && (
        <section className="mt-6 bg-white border border-line rounded-xl p-6">
          <h2 className="font-display font-600 text-ink mb-1">Quick-add a regulation block</h2>
          <p className="text-sm text-slate mb-4">
            Insert our pre-built compliance sections in one click — same fields we use across our own templates, ready to
            adapt for your own.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={addRegulationBlock}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="blockKey" value="front-cover" />
              <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                + Front cover photo
              </button>
            </form>
            <form action={addRegulationBlock}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="blockKey" value="awaabs-law" />
              <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                + Awaab's Law hazard review
              </button>
            </form>
            <form action={addRegulationBlock}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="blockKey" value="licence-compliance" />
              <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                + Licence &amp; compliance
              </button>
            </form>
            <form action={addRegulationBlock}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="blockKey" value="property-licence" />
              <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                + Property licence details
              </button>
            </form>
            <form action={addRegulationBlock}>
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="blockKey" value="deposit-protection" />
              <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                + Deposit protection
              </button>
            </form>
          </div>
        </section>
      )}

      {canManage && (
        <form action={addSection} className="mt-6 bg-white border border-line rounded-xl p-6 flex gap-3">
          <input type="hidden" name="templateId" value={template.id} />
          <input name="title" required placeholder="New section title, e.g. Communal Kitchen" className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          <button type="submit" className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity shrink-0">
            Add section
          </button>
        </form>
      )}
    </main>
  );
}
