import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { createBillingPortalSession } from "@/lib/actions/billing";

export default async function SubscriptionEndedPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const isAdmin = (session.user as any).role === "ADMIN";

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display font-700 text-2xl text-ink">Your subscription has ended</h1>
        <p className="text-sm text-slate mt-3">
          {isAdmin
            ? "Reactivate your plan to get back into your account."
            : "Ask your company's Admin to reactivate your plan to get back into your account."}
        </p>
        {isAdmin && (
          <form action={createBillingPortalSession} className="mt-6">
            <button type="submit" className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
              Reactivate billing
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
