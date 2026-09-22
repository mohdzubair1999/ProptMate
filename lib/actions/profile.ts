"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";

async function requireSelf() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user.id as string;
}

export async function updateOwnProfile(name: string, emailNotificationsEnabled: boolean) {
  const userId = await requireSelf();

  const trimmed = name.trim();
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
  if (!file || file.size === 0) throw new Error("No file was provided");
  if (!file.type.startsWith("image/")) throw new Error("Please upload an image file");
  // A generous but real ceiling - a profile photo has no business being tens of megabytes,
  // and this catches an accidental wrong-file selection before it reaches Blob storage at all.
  if (file.size > 8 * 1024 * 1024) throw new Error("Image is too large - please use one under 8MB");

  const blob = await put(`avatars/${userId}-${Date.now()}-${file.name}`, file, { access: "public" });

  await prisma.user.update({ where: { id: userId }, data: { image: blob.url } });

  revalidatePath("/dashboard/profile");
  return blob.url;
}
