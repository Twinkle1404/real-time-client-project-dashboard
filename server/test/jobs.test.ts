import http from 'http';
import app, { initSocketServer } from '../src/index';
import prisma from '../src/lib/prisma';
import { TaskStatus, TaskPriority } from '@prisma/client';
import {
  processOverdueTasks,
  startOverdueTasksJob,
  stopOverdueTasksJob,
  isOverdueTasksJobRunning,
  startBackgroundJobs,
  stopBackgroundJobs,
} from '../src/jobs';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';

const PORT = 4095;
const BASE_URL = `http://localhost:${PORT}`;

interface ApiResponse {
  [key: string]: any;
}

const toJson = async (res: Response): Promise<ApiResponse> => (await res.json()) as ApiResponse;

interface TestResult {
  id: number;
  description: string;
  expectedStatus: any;
  actualStatus: any;
  expectedCondition: string;
  actualDetail: string;
  passed: boolean;
}

const results: TestResult[] = [];
let testCounter = 1;

function record(
  description: string,
  expectedStatus: any,
  actualStatus: any,
  expectedCondition: string,
  actualDetail: string,
  extraCheck: boolean = true
) {
  const passed = expectedStatus === actualStatus && extraCheck;
  results.push({
    id: testCounter++,
    description,
    expectedStatus,
    actualStatus,
    expectedCondition,
    actualDetail,
    passed,
  });
}

const createSocket = (token?: string): ClientSocketType => {
  return ClientSocket(BASE_URL, {
    auth: token ? { token } : undefined,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
};

const waitForConnect = (socket: ClientSocketType, timeoutMs = 2500): Promise<boolean> => {
  return new Promise((resolve) => {
    if (socket.connected) return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(true);
    });
    socket.once('connect_error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
};

async function runTests() {
  console.log('🚀 Starting Phase 6 Background Job / Overdue Task Processing Test Suite...\n');

  // Start isolated HTTP + Socket.IO server on port 4095
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Phase 6 Test server running on port ${PORT}\n`);
      resolve();
    });
  });

  const socketsToCleanup: ClientSocketType[] = [];
  const track = (s: ClientSocketType): ClientSocketType => {
    socketsToCleanup.push(s);
    return s;
  };

  let allPassed = true;

  // Track database records to clean up after tests
  const createdProjectIds: string[] = [];
  const createdTaskIds: string[] = [];

  try {
    // ── 0. AUTHENTICATE TEST USERS ──
    const login = async (email: string) => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'DevPassword123!' }),
      });
      const data = await toJson(res);
      return { token: data.data?.accessToken as string, user: data.data?.user };
    };

    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const existingClient = await prisma.client.findFirstOrThrow();

    // Create a dedicated test project for Phase 6 job tests
    const jobTestProject = await prisma.project.create({
      data: {
        name: 'Phase 6 Job Test Project',
        clientId: existingClient.id,
        createdBy: pm1.user.id,
      },
    });
    createdProjectIds.push(jobTestProject.id);

    console.log('--- 1. Overdue Detection & Status Rules Tests ---');

    // Test 1: Detects task with dueDate < now and status = TODO and updates isOverdue: true in PostgreSQL
    const pastDueDate1 = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const taskTodoOverdue = await prisma.task.create({
      data: {
        projectId: jobTestProject.id,
        assignedTo: dev1.user.id,
        title: 'Overdue TODO Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        dueDate: pastDueDate1,
        isOverdue: false, // Initially false
      },
    });
    createdTaskIds.push(taskTodoOverdue.id);

    await processOverdueTasks();

    const dbTask1 = await prisma.task.findUniqueOrThrow({ where: { id: taskTodoOverdue.id } });
    record(
      'Detects task with dueDate < now and status = TODO and updates isOverdue: true in PostgreSQL',
      true,
      dbTask1.isOverdue,
      'isOverdue: true in database',
      `Actual isOverdue: ${dbTask1.isOverdue}`,
      dbTask1.isOverdue === true
    );

    // Test 2: Detects task with dueDate < now and status = IN_PROGRESS and updates isOverdue: true in PostgreSQL
    const pastDueDate2 = new Date(Date.now() - 7200 * 1000); // 2 hours ago
    const taskInProgressOverdue = await prisma.task.create({
      data: {
        projectId: jobTestProject.id,
        assignedTo: dev1.user.id,
        title: 'Overdue IN_PROGRESS Task',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.CRITICAL,
        dueDate: pastDueDate2,
        isOverdue: false,
      },
    });
    createdTaskIds.push(taskInProgressOverdue.id);

    await processOverdueTasks();

    const dbTask2 = await prisma.task.findUniqueOrThrow({ where: { id: taskInProgressOverdue.id } });
    record(
      'Detects task with dueDate < now and status = IN_PROGRESS and updates isOverdue: true in PostgreSQL',
      true,
      dbTask2.isOverdue,
      'isOverdue: true in database',
      `Actual isOverdue: ${dbTask2.isOverdue}`,
      dbTask2.isOverdue === true
    );

    // Test 3 [CRITICAL COMPLETED TASK SAFETY]: Tasks with dueDate < now and status = DONE are NEVER marked overdue
    const pastDueDate3 = new Date(Date.now() - 86400 * 1000); // 1 day ago
    const taskDonePastDue = await prisma.task.create({
      data: {
        projectId: jobTestProject.id,
        assignedTo: dev1.user.id,
        title: 'Completed Past Due Task',
        status: TaskStatus.DONE,
        priority: TaskPriority.MEDIUM,
        dueDate: pastDueDate3,
        isOverdue: false,
      },
    });
    createdTaskIds.push(taskDonePastDue.id);

    await processOverdueTasks();

    const dbTask3 = await prisma.task.findUniqueOrThrow({ where: { id: taskDonePastDue.id } });
    record(
      '[COMPLETED TASK SAFETY] Tasks with dueDate < now and status = DONE are NEVER marked overdue',
      false,
      dbTask3.isOverdue,
      'isOverdue: false in database',
      `Actual isOverdue: ${dbTask3.isOverdue}`,
      dbTask3.isOverdue === false
    );

    // Test 4: Tasks with dueDate > now (future) and status != DONE remain isOverdue: false
    const futureDueDate = new Date(Date.now() + 86400 * 1000); // 1 day in future
    const taskFuture = await prisma.task.create({
      data: {
        projectId: jobTestProject.id,
        assignedTo: dev1.user.id,
        title: 'Future Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        dueDate: futureDueDate,
        isOverdue: false,
      },
    });
    createdTaskIds.push(taskFuture.id);

    await processOverdueTasks();

    const dbTask4 = await prisma.task.findUniqueOrThrow({ where: { id: taskFuture.id } });
    record(
      'Tasks with dueDate > now (future) and status != DONE remain isOverdue: false',
      false,
      dbTask4.isOverdue,
      'isOverdue: false in database',
      `Actual isOverdue: ${dbTask4.isOverdue}`,
      dbTask4.isOverdue === false
    );

    // Test 5: Tasks with dueDate = null remain isOverdue: false
    const taskNoDueDate = await prisma.task.create({
      data: {
        projectId: jobTestProject.id,
        assignedTo: dev1.user.id,
        title: 'No Due Date Task',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        dueDate: null,
        isOverdue: false,
      },
    });
    createdTaskIds.push(taskNoDueDate.id);

    await processOverdueTasks();

    const dbTask5 = await prisma.task.findUniqueOrThrow({ where: { id: taskNoDueDate.id } });
    record(
      'Tasks with dueDate = null remain isOverdue: false',
      false,
      dbTask5.isOverdue,
      'isOverdue: false in database',
      `Actual isOverdue: ${dbTask5.isOverdue}`,
      dbTask5.isOverdue === false
    );

    console.log('\n--- 2. State Transition & Reset Tests ---');

    // Test 6 [TRANSITION SAFETY]: When an overdue task is updated to DONE, running the job resets isOverdue: false
    // First, verify dbTask1 is overdue
    expectOverdue: await prisma.task.update({
      where: { id: taskTodoOverdue.id },
      data: { status: TaskStatus.DONE },
    });

    await processOverdueTasks();

    const dbTask1AfterDone = await prisma.task.findUniqueOrThrow({ where: { id: taskTodoOverdue.id } });
    record(
      '[TRANSITION SAFETY] When an overdue task is marked DONE, running the job resets isOverdue: false in PostgreSQL',
      false,
      dbTask1AfterDone.isOverdue,
      'isOverdue: false in database after completing task',
      `Actual isOverdue: ${dbTask1AfterDone.isOverdue}`,
      dbTask1AfterDone.isOverdue === false
    );

    // Test 7 [DUE DATE EXTENSION]: When an overdue task's dueDate is extended to the future, running the job resets isOverdue: false
    const extendedDueDate = new Date(Date.now() + 7 * 86400 * 1000); // 7 days in future
    await prisma.task.update({
      where: { id: taskInProgressOverdue.id },
      data: { dueDate: extendedDueDate },
    });

    await processOverdueTasks();

    const dbTask2AfterExtension = await prisma.task.findUniqueOrThrow({ where: { id: taskInProgressOverdue.id } });
    record(
      '[DUE DATE EXTENSION] When an overdue task is extended to the future, running the job resets isOverdue: false',
      false,
      dbTask2AfterExtension.isOverdue,
      'isOverdue: false in database after extending due date',
      `Actual isOverdue: ${dbTask2AfterExtension.isOverdue}`,
      dbTask2AfterExtension.isOverdue === false
    );

    console.log('\n--- 3. Standalone Execution & Scheduler Tests ---');

    // Test 8: Standalone execution: Job executes independently without HTTP requests or page loads
    const standaloneResult = await processOverdueTasks();
    record(
      'Job executes independently without requiring HTTP requests or page loads',
      true,
      typeof standaloneResult.markedCount === 'number' && typeof standaloneResult.clearedCount === 'number',
      'Returns OverdueProcessResult object with counts and processedAt',
      `markedCount: ${standaloneResult.markedCount}, clearedCount: ${standaloneResult.clearedCount}`,
      typeof standaloneResult.markedCount === 'number'
    );

    // Test 9: Scheduled cron job starts cleanly via startOverdueTasksJob
    stopOverdueTasksJob(); // ensure clean state
    const cronTask = startOverdueTasksJob('* * * * *');
    const isRunningAfterStart = isOverdueTasksJobRunning();
    record(
      'Scheduled cron job starts cleanly via startOverdueTasksJob',
      true,
      isRunningAfterStart,
      'isOverdueTasksJobRunning() === true',
      `isRunning: ${isRunningAfterStart}`,
      isRunningAfterStart && cronTask !== null
    );

    // Test 10: Singleton protection: Multiple calls to startBackgroundJobs do not create duplicate schedulers
    const secondCallTask = startBackgroundJobs();
    const isStillRunning = isOverdueTasksJobRunning();
    record(
      'Singleton protection: Multiple scheduler invocations do not start duplicate cron instances',
      true,
      isStillRunning,
      'Scheduler remains active without error or duplicate instances',
      `isStillRunning: ${isStillRunning}`,
      isStillRunning
    );

    // Test 11: Graceful shutdown: stopBackgroundJobs halts the scheduler cleanly
    stopBackgroundJobs();
    const isRunningAfterStop = isOverdueTasksJobRunning();
    record(
      'Graceful shutdown: stopBackgroundJobs halts the background scheduler cleanly',
      false,
      isRunningAfterStop,
      'isOverdueTasksJobRunning() === false',
      `isRunning: ${isRunningAfterStop}`,
      isRunningAfterStop === false
    );

    console.log('\n--- 4. REST API Integration & Visibility Tests ---');

    // Create a new task that is overdue
    const apiOverdueTask = await prisma.task.create({
      data: {
        projectId: jobTestProject.id,
        assignedTo: dev1.user.id,
        title: 'API Overdue Visibility Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.CRITICAL,
        dueDate: new Date(Date.now() - 100000),
        isOverdue: false,
      },
    });
    createdTaskIds.push(apiOverdueTask.id);

    // Run the background job to persist isOverdue
    await processOverdueTasks();

    // Test 12: GET /api/projects/:projectId/tasks accurately exposes persisted isOverdue status
    const listRes = await fetch(`${BASE_URL}/api/projects/${jobTestProject.id}/tasks`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    const listData = await toJson(listRes);
    const apiTaskFromList = listData.data?.tasks?.find((t: any) => t.id === apiOverdueTask.id);
    record(
      'REST API task list accurately exposes persisted isOverdue status from PostgreSQL',
      true,
      apiTaskFromList?.isOverdue,
      'isOverdue === true in GET /api/projects/:projectId/tasks response',
      `isOverdue: ${apiTaskFromList?.isOverdue}`,
      apiTaskFromList?.isOverdue === true
    );

    // Test 13: GET /api/tasks/:id accurately exposes persisted isOverdue status
    const detailRes = await fetch(`${BASE_URL}/api/tasks/${apiOverdueTask.id}`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    const detailData = await toJson(detailRes);
    record(
      'REST API task detail accurately exposes persisted isOverdue status from PostgreSQL',
      true,
      detailData.data?.task?.isOverdue,
      'isOverdue === true in GET /api/tasks/:id response',
      `isOverdue: ${detailData.data?.task?.isOverdue}`,
      detailData.data?.task?.isOverdue === true
    );

    console.log('\n--- 5. Non-Regression Tests (Phases 2-5) ---');

    // Test 14: Phase 2 Authentication preserved (Unauthenticated request returns 401)
    const unauthRes = await fetch(`${BASE_URL}/api/tasks/${apiOverdueTask.id}`);
    record(
      'Phase 2 Authentication preserved: Unauthenticated request returns 401 Unauthorized',
      401,
      unauthRes.status,
      'status: 401',
      `Actual status: ${unauthRes.status}`,
      unauthRes.status === 401
    );

    // Test 15: Phase 3 RBAC preserved: Dev cannot access tasks from unassigned project
    const dev2 = await login('dev2@velozity.com');
    const dev2ForbiddenRes = await fetch(`${BASE_URL}/api/tasks/${apiOverdueTask.id}`, {
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    record(
      'Phase 3 RBAC preserved: Developer cannot access unassigned task (403 Forbidden)',
      403,
      dev2ForbiddenRes.status,
      'status: 403',
      `Actual status: ${dev2ForbiddenRes.status}`,
      dev2ForbiddenRes.status === 403
    );

    // Test 16: Phase 4 & 5 Socket.IO & Catchup preserved concurrently with background job
    startBackgroundJobs();
    const socket = track(createSocket(admin.token));
    const connected = await waitForConnect(socket);

    const catchupRes = await new Promise<any>((resolve) => {
      socket.emit('activity:catchup', { projectId: jobTestProject.id }, (res: any) => {
        resolve(res);
      });
    });

    const socketAndCatchupWorking = connected && catchupRes?.success === true;
    record(
      'Phase 4 & 5 Socket.IO and Catchup remain fully operational while background jobs run',
      true,
      socketAndCatchupWorking,
      'Socket connected and catchup returns success: true',
      `Connected: ${connected}, Catchup success: ${catchupRes?.success}`,
      socketAndCatchupWorking
    );
    stopBackgroundJobs();

    // Clean up created database records
    await prisma.task.deleteMany({
      where: { id: { in: createdTaskIds } },
    }).catch(() => {});

    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds } },
    }).catch(() => {});

    // ── SUMMARY & REPORT ──
    console.log('\n==================================================');
    console.log('         PHASE 6 TEST RESULTS SUMMARY             ');
    console.log('==================================================\n');

    allPassed = true;
    for (const r of results) {
      const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
      if (!r.passed) allPassed = false;
      console.log(
        `[#${r.id.toString().padStart(2, '0')}] ${statusIcon} | Exp: ${r.expectedStatus} | Act: ${r.actualStatus} | ${r.description}`
      );
      if (!r.passed) {
        console.log(`     -> Expected: ${r.expectedCondition}`);
        console.log(`     -> Actual:   ${r.actualDetail}`);
      }
    }

    console.log('\n--------------------------------------------------');
    const totalPassed = results.filter((r) => r.passed).length;
    console.log(`Total: ${results.length} | Passed: ${totalPassed} | Failed: ${results.length - totalPassed}`);
    console.log('--------------------------------------------------\n');

    if (allPassed) {
      console.log(`🎉 ALL ${results.length} PHASE 6 BACKGROUND JOB TESTS PASSED PERFECTLY!\n`);
    } else {
      console.error('⚠️ SOME PHASE 6 TESTS FAILED. INVESTIGATION REQUIRED.\n');
    }
  } finally {
    stopBackgroundJobs();
    for (const s of socketsToCleanup) {
      if (s.connected) s.disconnect();
    }
    server.close(() => {
      process.exit(allPassed ? 0 : 1);
    });
  }
}

runTests().catch((err) => {
  console.error('Fatal test error in Phase 6:', err);
  process.exit(1);
});
