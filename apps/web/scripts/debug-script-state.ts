// Debug helper: report on the most recently-touched project + its
// scripts + recent script_gen ApiCall rows, so we can see whether
// scripts are persisting or the action is failing silently.

import dotenv from 'dotenv';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { prisma } from '../lib/db';

async function main() {
  // Find the user with creditsBalance=36 — that's the user in the
  // screenshot complaining about scripts not generating.
  console.log('ALL users in DB:');
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      creditsBalance: true,
      role: true,
      banned: true,
      _count: { select: { projects: true } },
    },
    orderBy: { creditsBalance: 'asc' },
  });
  for (const u of users) {
    console.log(
      `  ${u.id} | ${u.email} | credits=${u.creditsBalance} | role=${u.role} | banned=${u.banned} | projects=${u._count.projects}`,
    );
  }

  // Pull the user with credits=36 specifically + their most-recent projects.
  const targetUser = users.find((u) => u.creditsBalance === 36);
  if (!targetUser) {
    console.log('\nNo user with creditsBalance=36 found.');
    process.exit(0);
  }
  console.log(`\nDigging into user: ${targetUser.email} (${targetUser.id})`);
  const projects = await prisma.project.findMany({
    where: { userId: targetUser.id },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: {
      scripts: {
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { scenes: true } } },
      },
    },
  });
  if (projects.length === 0) {
    console.log('No projects found for dor77777@gmail.com.');
    process.exit(0);
  }
  for (const project of projects) {
    console.log(`\nProject: ${project.id}`);
    console.log(`  name: ${project.productName}`);
    console.log(`  createdAt: ${project.createdAt.toISOString()}`);
    console.log(`  updatedAt: ${project.updatedAt.toISOString()}`);
    console.log(`  scripts: ${project.scripts.length}`);
    for (const s of project.scripts.slice(0, 3)) {
      console.log(
        `    [${s.createdAt.toISOString()}] framework=${s.framework} scenes=${s._count.scenes}`,
      );
    }
  }
  // The rest of the debug script operates on the most-recent.
  const project = projects[0]!;
  console.log(`Project: ${project.id} (${project.productName})`);
  console.log(`  userId: ${project.userId}`);
  console.log(`  updatedAt: ${project.updatedAt.toISOString()}`);
  console.log(`  scripts: ${project.scripts.length}`);
  for (const s of project.scripts) {
    console.log(
      `    [${s.createdAt.toISOString()}] framework=${s.framework} angle=${s.angle} scenes=${s._count.scenes} qualityOverall=${s.qualityScoreOverall}`,
    );
  }

  // Owner of the project
  const owner = await prisma.user.findUnique({
    where: { id: project.userId },
    select: { email: true, role: true, creditsBalance: true },
  });
  console.log(`  owner: ${owner?.email} role=${owner?.role} credits=${owner?.creditsBalance}`);

  console.log('\nALL ApiCalls in last 30m:');
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const calls = await prisma.apiCall.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  for (const c of calls) {
    console.log(
      `  [${c.createdAt.toISOString()}] op=${c.operation} provider=${c.provider} status=${c.status} userId=${c.userId} err=${c.errorMessage?.slice(0, 80) ?? '—'}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
