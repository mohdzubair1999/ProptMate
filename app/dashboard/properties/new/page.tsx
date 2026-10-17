import Link from "next/link";
import NewPropertyForm from "./new-property-form";

export default function NewPropertyPage() {
  return (
    <main className="max-w-lg">
      <Link href="/dashboard/properties" className="text-sm text-slate hover:text-ink">
        ← Back to properties
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Add property</h1>

      <NewPropertyForm />
    </main>
  );
}
