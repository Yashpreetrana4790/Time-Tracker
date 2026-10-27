import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

// Idempotent: safe to run on every `pnpm dev`.
async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  const empHash = await bcrypt.hash('emp123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: { name: 'Demo Admin', email: 'admin@demo.com', passwordHash: adminHash, role: 'ADMIN' },
  });
  const emp1 = await prisma.user.upsert({
    where: { email: 'emp1@demo.com' },
    update: {},
    create: { name: 'Alex Employee', email: 'emp1@demo.com', passwordHash: empHash, role: 'EMPLOYEE' },
  });
  const emp2 = await prisma.user.upsert({
    where: { email: 'emp2@demo.com' },
    update: {},
    create: { name: 'Sam Employee', email: 'emp2@demo.com', passwordHash: empHash, role: 'EMPLOYEE' },
  });

  if ((await prisma.project.count()) === 0) {
    const names = ['Website Redesign', 'Mobile App', 'Internal Tools'];
    const projects = await Promise.all(names.map((name) => prisma.project.create({ data: { name } })));
    const assignments = [
      [emp1, projects[0]],
      [emp1, projects[1]],
      [emp1, projects[2]],
      [emp2, projects[0]],
      [emp2, projects[2]],
    ] as const;
    for (const [user, project] of assignments) {
      await prisma.projectAssignment.create({ data: { userId: user.id, projectId: project.id } });
    }
    console.log('Seeded users and projects');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
