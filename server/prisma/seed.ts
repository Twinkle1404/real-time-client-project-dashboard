import { PrismaClient, Role, TaskStatus, TaskPriority } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── Constants ───

const SALT_ROUNDS = 10;
const DEV_PASSWORD = 'DevPassword123!';

// ─── Helpers ───

/** Returns a date N days from now (negative = past). */
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// ─── Seed Data Definitions ───

const users = [
  { email: 'admin@velozity.com', name: 'Alice Admin', role: Role.ADMIN },
  { email: 'pm1@velozity.com', name: 'Paul Manager', role: Role.PM },
  { email: 'pm2@velozity.com', name: 'Priya Manager', role: Role.PM },
  { email: 'dev1@velozity.com', name: 'Dan Developer', role: Role.DEVELOPER },
  { email: 'dev2@velozity.com', name: 'Diana Developer', role: Role.DEVELOPER },
  { email: 'dev3@velozity.com', name: 'Derek Developer', role: Role.DEVELOPER },
  { email: 'dev4@velozity.com', name: 'Deepa Developer', role: Role.DEVELOPER },
] as const;

const clients = [
  { name: 'Acme Corporation' },
  { name: 'Globex Industries' },
  { name: 'Stark Enterprises' },
] as const;

// ─── Main seed function ───

async function main() {
  console.log('🌱 Seeding database...\n');

  // 1. Hash password once and reuse
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  // 2. Upsert users
  const seededUsers: Record<string, string> = {};
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, passwordHash },
    });
    seededUsers[u.email] = user.id;
    console.log(`  ✔ User: ${u.name} (${u.role})`);
  }

  // 3. Upsert clients (use name as dedup key via findFirst + upsert pattern)
  const seededClients: Record<string, string> = {};
  for (const c of clients) {
    let client = await prisma.client.findFirst({ where: { name: c.name } });
    if (!client) {
      client = await prisma.client.create({ data: { name: c.name } });
    }
    seededClients[c.name] = client.id;
    console.log(`  ✔ Client: ${c.name}`);
  }

  // 4. Create projects (one per client)
  const projectDefs = [
    { name: 'E-Commerce Platform Redesign', clientName: 'Acme Corporation', creatorEmail: 'pm1@velozity.com' },
    { name: 'Internal CRM System', clientName: 'Globex Industries', creatorEmail: 'pm1@velozity.com' },
    { name: 'Mobile Banking App', clientName: 'Stark Enterprises', creatorEmail: 'pm2@velozity.com' },
  ];

  const seededProjects: Record<string, string> = {};
  for (const p of projectDefs) {
    let project = await prisma.project.findFirst({ where: { name: p.name } });
    if (!project) {
      project = await prisma.project.create({
        data: {
          name: p.name,
          clientId: seededClients[p.clientName],
          createdBy: seededUsers[p.creatorEmail],
        },
      });
    }
    seededProjects[p.name] = project.id;
    console.log(`  ✔ Project: ${p.name}`);
  }

  // 5. Create tasks (≥5 per project, mixed status/priority, ≥2 overdue)
  const taskDefs = [
    // ── E-Commerce Platform Redesign (5 tasks) ──
    {
      projectName: 'E-Commerce Platform Redesign',
      title: 'Design new product listing page',
      description: 'Create wireframes and mockups for the new product listing UI',
      assigneeEmail: 'dev1@velozity.com',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      dueDate: daysFromNow(-10),
      isOverdue: false,
    },
    {
      projectName: 'E-Commerce Platform Redesign',
      title: 'Implement shopping cart API',
      description: 'Build REST endpoints for cart operations',
      assigneeEmail: 'dev2@velozity.com',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.CRITICAL,
      dueDate: daysFromNow(-3),
      isOverdue: true, // overdue
    },
    {
      projectName: 'E-Commerce Platform Redesign',
      title: 'Payment gateway integration',
      description: 'Integrate Stripe payment processing',
      assigneeEmail: 'dev1@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      dueDate: daysFromNow(14),
      isOverdue: false,
    },
    {
      projectName: 'E-Commerce Platform Redesign',
      title: 'Implement order confirmation emails',
      description: 'Set up transactional email templates and sending logic',
      assigneeEmail: 'dev3@velozity.com',
      status: TaskStatus.IN_REVIEW,
      priority: TaskPriority.MEDIUM,
      dueDate: daysFromNow(7),
      isOverdue: false,
    },
    {
      projectName: 'E-Commerce Platform Redesign',
      title: 'Write unit tests for checkout flow',
      description: 'Cover edge cases in the checkout pipeline',
      assigneeEmail: 'dev4@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      dueDate: daysFromNow(21),
      isOverdue: false,
    },

    // ── Internal CRM System (5 tasks) ──
    {
      projectName: 'Internal CRM System',
      title: 'Set up database schema for contacts',
      description: 'Design and implement the contacts data model',
      assigneeEmail: 'dev3@velozity.com',
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
      dueDate: daysFromNow(-15),
      isOverdue: false,
    },
    {
      projectName: 'Internal CRM System',
      title: 'Build contact search functionality',
      description: 'Full-text search across contact fields',
      assigneeEmail: 'dev2@velozity.com',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      dueDate: daysFromNow(5),
      isOverdue: false,
    },
    {
      projectName: 'Internal CRM System',
      title: 'Implement deal pipeline view',
      description: 'Kanban board for deal tracking',
      assigneeEmail: 'dev4@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      dueDate: daysFromNow(-2),
      isOverdue: true, // overdue
    },
    {
      projectName: 'Internal CRM System',
      title: 'Create reporting dashboard',
      description: 'Sales metrics and charts for management',
      assigneeEmail: 'dev1@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDate: daysFromNow(30),
      isOverdue: false,
    },
    {
      projectName: 'Internal CRM System',
      title: 'Email integration module',
      description: 'Sync emails with contact records',
      assigneeEmail: 'dev3@velozity.com',
      status: TaskStatus.IN_REVIEW,
      priority: TaskPriority.CRITICAL,
      dueDate: daysFromNow(3),
      isOverdue: false,
    },

    // ── Mobile Banking App (6 tasks) ──
    {
      projectName: 'Mobile Banking App',
      title: 'Design login and authentication screens',
      description: 'UI/UX for biometric and PIN-based login',
      assigneeEmail: 'dev2@velozity.com',
      status: TaskStatus.DONE,
      priority: TaskPriority.CRITICAL,
      dueDate: daysFromNow(-20),
      isOverdue: false,
    },
    {
      projectName: 'Mobile Banking App',
      title: 'Implement account balance API',
      description: 'Real-time balance retrieval from core banking',
      assigneeEmail: 'dev4@velozity.com',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: daysFromNow(10),
      isOverdue: false,
    },
    {
      projectName: 'Mobile Banking App',
      title: 'Build fund transfer flow',
      description: 'P2P and inter-bank transfer with confirmation',
      assigneeEmail: 'dev1@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
      dueDate: daysFromNow(-5),
      isOverdue: true, // overdue
    },
    {
      projectName: 'Mobile Banking App',
      title: 'Transaction history screen',
      description: 'Paginated list with filters and search',
      assigneeEmail: 'dev3@velozity.com',
      status: TaskStatus.IN_REVIEW,
      priority: TaskPriority.MEDIUM,
      dueDate: daysFromNow(7),
      isOverdue: false,
    },
    {
      projectName: 'Mobile Banking App',
      title: 'Push notification service',
      description: 'Firebase Cloud Messaging integration',
      assigneeEmail: 'dev2@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
      dueDate: daysFromNow(25),
      isOverdue: false,
    },
    {
      projectName: 'Mobile Banking App',
      title: 'Security audit and penetration testing',
      description: 'Third-party security review of all endpoints',
      assigneeEmail: 'dev4@velozity.com',
      status: TaskStatus.TODO,
      priority: TaskPriority.CRITICAL,
      dueDate: daysFromNow(45),
      isOverdue: false,
    },
  ];

  const seededTasks: Array<{ id: string; projectName: string; title: string; status: TaskStatus }> = [];
  for (const t of taskDefs) {
    let task = await prisma.task.findFirst({
      where: { title: t.title, projectId: seededProjects[t.projectName] },
    });
    if (!task) {
      task = await prisma.task.create({
        data: {
          projectId: seededProjects[t.projectName],
          assignedTo: seededUsers[t.assigneeEmail],
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          isOverdue: t.isOverdue,
        },
      });
    }
    seededTasks.push({ id: task.id, projectName: t.projectName, title: t.title, status: t.status });
    console.log(`  ✔ Task: ${t.title} [${t.status}/${t.priority}]${t.isOverdue ? ' ⚠ OVERDUE' : ''}`);
  }

  // 6. Create activity logs (status transitions for completed/in-progress tasks)
  const activityDefs = [
    // E-Commerce: "Design new product listing page" went TODO → IN_PROGRESS → DONE
    { taskTitle: 'Design new product listing page', projectName: 'E-Commerce Platform Redesign', userEmail: 'dev1@velozity.com', changes: [
      { desc: 'Started working on product listing design', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
      { desc: 'Completed product listing design – approved by PM', from: TaskStatus.IN_PROGRESS, to: TaskStatus.DONE },
    ]},
    // E-Commerce: "Implement shopping cart API" went TODO → IN_PROGRESS
    { taskTitle: 'Implement shopping cart API', projectName: 'E-Commerce Platform Redesign', userEmail: 'dev2@velozity.com', changes: [
      { desc: 'Started implementing cart API endpoints', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
    ]},
    // E-Commerce: "Implement order confirmation emails" went TODO → IN_PROGRESS → IN_REVIEW
    { taskTitle: 'Implement order confirmation emails', projectName: 'E-Commerce Platform Redesign', userEmail: 'dev3@velozity.com', changes: [
      { desc: 'Started email template development', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
      { desc: 'Submitted email templates for review', from: TaskStatus.IN_PROGRESS, to: TaskStatus.IN_REVIEW },
    ]},
    // CRM: "Set up database schema for contacts" went TODO → IN_PROGRESS → DONE
    { taskTitle: 'Set up database schema for contacts', projectName: 'Internal CRM System', userEmail: 'dev3@velozity.com', changes: [
      { desc: 'Began designing contacts schema', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
      { desc: 'Contacts schema finalized and migrated', from: TaskStatus.IN_PROGRESS, to: TaskStatus.DONE },
    ]},
    // CRM: "Build contact search functionality" went TODO → IN_PROGRESS
    { taskTitle: 'Build contact search functionality', projectName: 'Internal CRM System', userEmail: 'dev2@velozity.com', changes: [
      { desc: 'Started implementing full-text search', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
    ]},
    // CRM: "Email integration module" went TODO → IN_PROGRESS → IN_REVIEW
    { taskTitle: 'Email integration module', projectName: 'Internal CRM System', userEmail: 'dev3@velozity.com', changes: [
      { desc: 'Began email sync implementation', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
      { desc: 'Email integration submitted for code review', from: TaskStatus.IN_PROGRESS, to: TaskStatus.IN_REVIEW },
    ]},
    // Banking: "Design login and authentication screens" went TODO → IN_PROGRESS → DONE
    { taskTitle: 'Design login and authentication screens', projectName: 'Mobile Banking App', userEmail: 'dev2@velozity.com', changes: [
      { desc: 'Started authentication screen designs', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
      { desc: 'Auth screens approved and merged', from: TaskStatus.IN_PROGRESS, to: TaskStatus.DONE },
    ]},
    // Banking: "Implement account balance API" went TODO → IN_PROGRESS
    { taskTitle: 'Implement account balance API', projectName: 'Mobile Banking App', userEmail: 'dev4@velozity.com', changes: [
      { desc: 'Started balance API development', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
    ]},
    // Banking: "Transaction history screen" went TODO → IN_PROGRESS → IN_REVIEW
    { taskTitle: 'Transaction history screen', projectName: 'Mobile Banking App', userEmail: 'dev3@velozity.com', changes: [
      { desc: 'Started transaction history UI', from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS },
      { desc: 'Transaction history submitted for review', from: TaskStatus.IN_PROGRESS, to: TaskStatus.IN_REVIEW },
    ]},
  ];

  let activityCount = 0;
  // Check if we already have activity logs (idempotency)
  const existingLogCount = await prisma.activityLog.count();
  if (existingLogCount === 0) {
    for (const a of activityDefs) {
      const task = seededTasks.find(t => t.title === a.taskTitle && t.projectName === a.projectName);
      if (!task) continue;

      for (const change of a.changes) {
        await prisma.activityLog.create({
          data: {
            taskId: task.id,
            projectId: seededProjects[a.projectName],
            userId: seededUsers[a.userEmail],
            changeDescription: change.desc,
            fromStatus: change.from,
            toStatus: change.to,
          },
        });
        activityCount++;
      }
    }
    console.log(`  ✔ Activity logs: ${activityCount} entries created`);
  } else {
    console.log(`  ⏭ Activity logs: ${existingLogCount} already exist, skipping`);
  }

  // 7. Create notifications
  const notificationDefs = [
    { userEmail: 'dev1@velozity.com', type: 'TASK_ASSIGNED', message: 'You have been assigned "Payment gateway integration"', taskTitle: 'Payment gateway integration', projectName: 'E-Commerce Platform Redesign' },
    { userEmail: 'dev2@velozity.com', type: 'TASK_OVERDUE', message: 'Task "Implement shopping cart API" is overdue', taskTitle: 'Implement shopping cart API', projectName: 'E-Commerce Platform Redesign' },
    { userEmail: 'dev4@velozity.com', type: 'TASK_OVERDUE', message: 'Task "Implement deal pipeline view" is overdue', taskTitle: 'Implement deal pipeline view', projectName: 'Internal CRM System' },
    { userEmail: 'pm1@velozity.com', type: 'TASK_STATUS_CHANGED', message: 'Task "Design new product listing page" has been completed', taskTitle: 'Design new product listing page', projectName: 'E-Commerce Platform Redesign' },
    { userEmail: 'dev3@velozity.com', type: 'TASK_ASSIGNED', message: 'You have been assigned "Transaction history screen"', taskTitle: 'Transaction history screen', projectName: 'Mobile Banking App' },
    { userEmail: 'pm2@velozity.com', type: 'TASK_STATUS_CHANGED', message: 'Task "Auth screens" moved to DONE', taskTitle: 'Design login and authentication screens', projectName: 'Mobile Banking App' },
    { userEmail: 'dev1@velozity.com', type: 'TASK_OVERDUE', message: 'Task "Build fund transfer flow" is overdue', taskTitle: 'Build fund transfer flow', projectName: 'Mobile Banking App' },
  ];

  const existingNotifCount = await prisma.notification.count();
  if (existingNotifCount === 0) {
    for (const n of notificationDefs) {
      const task = seededTasks.find(t => t.title === n.taskTitle && t.projectName === n.projectName);
      await prisma.notification.create({
        data: {
          userId: seededUsers[n.userEmail],
          type: n.type,
          message: n.message,
          relatedTaskId: task?.id ?? null,
          isRead: false,
        },
      });
    }
    console.log(`  ✔ Notifications: ${notificationDefs.length} entries created`);
  } else {
    console.log(`  ⏭ Notifications: ${existingNotifCount} already exist, skipping`);
  }

  // ─── Summary ───
  const userCount = await prisma.user.count();
  const clientCount = await prisma.client.count();
  const projectCount = await prisma.project.count();
  const taskCount = await prisma.task.count();
  const overdueCount = await prisma.task.count({ where: { isOverdue: true } });
  const logCount = await prisma.activityLog.count();
  const notifCount = await prisma.notification.count();

  console.log('\n📊 Seed Summary:');
  console.log(`   Users:          ${userCount}`);
  console.log(`   Clients:        ${clientCount}`);
  console.log(`   Projects:       ${projectCount}`);
  console.log(`   Tasks:          ${taskCount}`);
  console.log(`   Overdue tasks:  ${overdueCount}`);
  console.log(`   Activity logs:  ${logCount}`);
  console.log(`   Notifications:  ${notifCount}`);
  console.log('\n✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
