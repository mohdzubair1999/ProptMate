"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { readUpload, safeFileName } from "@/lib/uploadGuard";
import { cleanPersonName } from "@/lib/inputLimits";

async function requireSelf() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user.id as string;
}

export async function updateOwnProfile(name: string, emailNotificationsEnabled: boolean) {
  const userId = await requireSelf();

  const trimmed = cleanPersonName(name);
  if (!trimmed) throw new Error("Name can't be empty");

  await prisma.user.update({
    where: { id: userId },
    data: { name: trimmed, emailNotificationsEnabled },
  });

  revalidatePath("/dashboard/profile");
}

export async function uploadOwnAvatar(formData: FormData) {
  const userId = await requireSelf();

  const file = formData.get("file") as File | null;
  // a picture, judged by what the file really is (not by what the browser says it is), no bigger than 8 MB
  const up = await readUpload(file, { allow: ["image"], maxBytes: 8 * 1024 * 1024 });
  if (!up.ok) throw new Error(up.error);

  const blob = await put(`avatars/${userId}-${Date.now()}-${safeFileName(file?.name, up.type.ext)}`, up.bytes, { access: "public", contentType: up.type.mime });

  await prisma.user.update({ where: { id: userId }, data: { image: blob.url } });

  revalidatePath("/dashboard/profile");
  return blob.url;
}
