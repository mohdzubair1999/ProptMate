import { prisma } from "@/lib/prisma";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";
import { formatDate } from "@/lib/formatDate";
import ConfirmForm from "./confirm-form";

export default async function ConfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const ack = await prisma.reportAcknowledgement.findUnique({
    where: { token },
    include: { inspection: { include: { property: true } } },
  });

  const isValid = ack && !ack.inspection.deletedAt;

  return (
    <main className="min-h-screen bg-paper flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {!isValid ? (
          <div className="bg-white border border-line rounded-xl p-6 text-center">
            <p className="text-ink font-medium">This confirmation link isn't valid.</p>
            <p className="text-sm text-slate mt-1">If you think this is a mistake, please contact whoever sent it to you.</p>
          </div>
        ) : (
          <>
            <h1 className="font-display font-700 text-xl text-ink mb-1">{inspectionTypeDisplayName(ack.inspection.type)}</h1>
            <p className="text-sm text-slate mb-4">{ack.inspection.property.address}</p>

            <a
              href={ack.pdfUrlSnapshot}
              target="_blank"
              rel="noreferrer"
              className="inline-block mb-4 text-sm text-signal underline"
            >
              📄 View the report
            </a>

            {ack.confirmedAt ? (
              <div className="bg-verified/10 border border-verified/30 rounded-xl p-6 text-center">
                <p className="text-verified font-medium">✓ You already confirmed receipt of this report on {formatDate(ack.confirmedAt)}.</p>
              </div>
            ) : (
              <ConfirmForm token={token} defaultName={ack.recipientName} />
            )}
          </>
        )}
      </div>
    </main>
  );
}
