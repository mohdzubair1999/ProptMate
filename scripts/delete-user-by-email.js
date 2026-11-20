// One-off cleanup — deletes a user by email, and their company too if they're the only
// member of it (safe for a test account created by mistake via normal signup).
// Run with: node --env-file=.env scripts/delete-user-by-email.js the-email@example.com

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: node --env-file=.env scripts/delete-user-by-email.js the-email@example.com");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
  if (!user) {
    console.log("No user found with that email — nothing to do.");
    return;
  }

  console.log(`Found: ${user.email} (role: ${user.role}, company: ${user.company?.name || "none"})`);

  // Delete their sessions/accounts first (foreign key dependencies)
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`✓ Deleted user ${email}`);

  if (user.companyId) {
    const remainingMembers = await prisma.user.count({ where: { companyId: user.companyId } });
    if (remainingMembers === 0) {
      await prisma.company.delete({ where: { id: user.companyId } });
      console.log(`✓ Also deleted their now-empty company (${user.company?.name})`);
    } else {
      console.log(`Company "${user.company?.name}" still has ${remainingMembers} other member(s) — left it alone.`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
