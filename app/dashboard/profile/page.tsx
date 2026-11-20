import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProfileForm from "./profile-form";
import ChangePasswordForm from "./change-password-form";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      role: true,
      emailNotificationsEnabled: true,
      company: { select: { name: true } },
    },
  });
  if (!user) redirect("/login");

  return (
    <main>
      <h1 className="font-display font-700 text-2xl text-ink">My profile</h1>
      <p className="text-sm text-slate mt-1">Your own name, photo, and preferences.</p>

      <div className="mt-8 space-y-6 max-w-lg">
        <ProfileForm
          initialName={user.name || ""}
          email={user.email}
          image={user.image}
          role={user.role}
          companyName={user.company?.name || null}
          initialEmailNotificationsEnabled={user.emailNotificationsEnabled}
        />
        <ChangePasswordForm />
      </div>
    </main>
  );
}
