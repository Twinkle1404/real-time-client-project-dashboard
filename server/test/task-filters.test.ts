import app from '../src/index';
import http from 'http';
import prisma from '../src/lib/prisma';
import { Role, TaskStatus, TaskPriority } from '@prisma/client';

interface ApiResponse {
  [key: string]: any;
}

const toJson = async (res: Response): Promise<ApiResponse> => (await res.json()) as ApiResponse;

interface TestResult {
  id: number;
  description: string;
  expectedStatus: number;
  actualStatus: number;
  expectedCondition: string;
  actualDetail: string;
  passed: boolean;
}

const results: TestResult[] = [];
let testCounter = 1;

function record(
  description: string,
  expectedStatus: number,
  actualStatus: number,
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

async function runTests() {
  console.log('🚀 Starting Phase 8 Task Query-Parameter Filters Test Suite...\n');

  const TEST_PORT = 4093;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`Phase 8 Test server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  const BASE_URL = `http://localhost:${TEST_PORT}`;
  let allPassed = true;
  let project1: any = null;

  try {
    // 1. Fetch seed users & tokens
    const login = async (email: string, password: string) => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await toJson(res);
      return { token: data.data?.accessToken, user: data.data?.user };
    };

    const admin = await login('admin@velozity.com', 'DevPassword123!');
    const pm1 = await login('pm1@velozity.com', 'DevPassword123!');
    const pm2 = await login('pm2@velozity.com', 'DevPassword123!');
    const dev1 = await login('dev1@velozity.com', 'DevPassword123!');
    const dev2 = await login('dev2@velozity.com', 'DevPassword123!');

    // Create a dedicated project for filter testing created by PM 1
    const existingClient = await prisma.client.findFirstOrThrow();
    project1 = await prisma.project.create({
      data: {
        name: 'Phase 8 Filter Test Project',
        clientId: existingClient.id,
        createdBy: pm1.user.id,
      },
    });

    const taskA = await prisma.task.create({
      data: {
        projectId: project1.id,
        assignedTo: dev1.user.id,
        title: 'Filter Test Task A',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        dueDate: new Date('2026-10-01T10:00:00Z'),
      },
    });

    const taskB = await prisma.task.create({
      data: {
        projectId: project1.id,
        assignedTo: dev1.user.id,
        title: 'Filter Test Task B',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2026-10-15T10:00:00Z'),
      },
    });

    const taskC = await prisma.task.create({
      data: {
        projectId: project1.id,
        assignedTo: dev2.user.id,
        title: 'Filter Test Task C',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.CRITICAL,
        dueDate: new Date('2026-10-20T10:00:00Z'),
      },
    });

    const taskD = await prisma.task.create({
      data: {
        projectId: project1.id,
        assignedTo: dev2.user.id,
        title: 'Filter Test Task D',
        status: TaskStatus.DONE,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date('2026-09-01T10:00:00Z'),
      },
    });

    // --- 1. Basic Listing without query params ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      record(
        'GET /api/projects/:id/tasks without filters returns all project tasks for PM',
        200,
        res.status,
        '4 tasks',
        `${data.data?.tasks?.length} tasks`,
        data.data?.tasks?.length === 4
      );
    }

    // --- 2. Filter by status: IN_PROGRESS ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?status=IN_PROGRESS`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      const allInProgress = tasks.length === 2 && tasks.every((t: any) => t.status === 'IN_PROGRESS');
      record(
        'Filter by status=IN_PROGRESS returns only in-progress tasks',
        200,
        res.status,
        '2 IN_PROGRESS tasks',
        `${tasks.length} tasks (all IN_PROGRESS: ${allInProgress})`,
        allInProgress
      );
    }

    // --- 3. Filter by status: DONE ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?status=DONE`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      const allDone = tasks.length === 1 && tasks[0].id === taskD.id;
      record(
        'Filter by status=DONE returns only done tasks',
        200,
        res.status,
        '1 DONE task (taskD)',
        `${tasks.length} tasks`,
        allDone
      );
    }

    // --- 4. Filter by priority: CRITICAL ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?priority=CRITICAL`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      const allCritical = tasks.length === 1 && tasks[0].id === taskC.id;
      record(
        'Filter by priority=CRITICAL returns only critical tasks',
        200,
        res.status,
        '1 CRITICAL task (taskC)',
        `${tasks.length} tasks`,
        allCritical
      );
    }

    // --- 5. Filter by priority: LOW ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?priority=LOW`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      const allLow = tasks.length === 1 && tasks[0].id === taskA.id;
      record(
        'Filter by priority=LOW returns only low priority tasks',
        200,
        res.status,
        '1 LOW task (taskA)',
        `${tasks.length} tasks`,
        allLow
      );
    }

    // --- 6. Reject invalid priority: URGENT ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?priority=URGENT`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      record(
        '[CRITICAL SPEC] Query filter with priority=URGENT is strictly rejected with 400 VALIDATION_ERROR',
        400,
        res.status,
        'VALIDATION_ERROR',
        data.error?.code || 'NO_ERROR',
        data.error?.code === 'VALIDATION_ERROR'
      );
    }

    // --- 7. Reject invalid status: PENDING ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?status=PENDING`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      record(
        'Query filter with invalid status returns 400 VALIDATION_ERROR',
        400,
        res.status,
        'VALIDATION_ERROR',
        data.error?.code || 'NO_ERROR',
        data.error?.code === 'VALIDATION_ERROR'
      );
    }

    // --- 8. Date range filter: fromDate & toDate ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?fromDate=2026-10-10&toDate=2026-10-25`,
        {
          headers: { Authorization: `Bearer ${pm1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      // Expected: Task B (2026-10-15) and Task C (2026-10-20)
      const correctDateRange =
        tasks.length === 2 &&
        tasks.some((t: any) => t.id === taskB.id) &&
        tasks.some((t: any) => t.id === taskC.id);
      record(
        'Filter by date range fromDate & toDate returns matching tasks',
        200,
        res.status,
        '2 tasks (Task B & Task C)',
        `${tasks.length} tasks`,
        correctDateRange
      );
    }

    // --- 9. Reject malformed fromDate ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?fromDate=not-a-valid-date`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      record(
        'Query filter with malformed fromDate returns 400 VALIDATION_ERROR',
        400,
        res.status,
        'VALIDATION_ERROR',
        data.error?.code || 'NO_ERROR',
        data.error?.code === 'VALIDATION_ERROR'
      );
    }

    // --- 10. Reject malformed toDate ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?toDate=invalid-date`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const data = await toJson(res);
      record(
        'Query filter with malformed toDate returns 400 VALIDATION_ERROR',
        400,
        res.status,
        'VALIDATION_ERROR',
        data.error?.code || 'NO_ERROR',
        data.error?.code === 'VALIDATION_ERROR'
      );
    }

    // --- 11. Reject fromDate > toDate ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?fromDate=2026-11-01&toDate=2026-10-01`,
        {
          headers: { Authorization: `Bearer ${pm1.token}` },
        }
      );
      const data = await toJson(res);
      record(
        'Query filter where fromDate > toDate returns 400 VALIDATION_ERROR',
        400,
        res.status,
        'VALIDATION_ERROR',
        data.error?.code || 'NO_ERROR',
        data.error?.code === 'VALIDATION_ERROR'
      );
    }

    // --- 12. Combined filters: status=IN_PROGRESS & priority=HIGH ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?status=IN_PROGRESS&priority=HIGH`,
        {
          headers: { Authorization: `Bearer ${pm1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      const correctCombined = tasks.length === 1 && tasks[0].id === taskB.id;
      record(
        'Combined status and priority filter returns exact intersection',
        200,
        res.status,
        '1 task (Task B)',
        `${tasks.length} tasks`,
        correctCombined
      );
    }

    // --- 13. Security / RBAC: Developer scope invariant with filters ---
    {
      // Dev 1 has Task A and Task B assigned; Task C is assigned to Dev 2
      // If Dev 1 requests status=IN_PROGRESS without filter, should only see Task B (NOT Task C)
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?status=IN_PROGRESS`,
        {
          headers: { Authorization: `Bearer ${dev1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      const devScopeHonored =
        tasks.length === 1 && tasks[0].id === taskB.id && !tasks.some((t: any) => t.id === taskC.id);
      record(
        '[SECURITY RBAC] Developer filtering by status=IN_PROGRESS cannot see other developer tasks',
        200,
        res.status,
        'Only own assigned task (Task B)',
        `${tasks.length} tasks returned`,
        devScopeHonored
      );
    }

    // --- 14. Security / RBAC: Developer filtering for unassigned task priority returns empty ---
    {
      // Dev 1 has no CRITICAL tasks (Task C is CRITICAL and assigned to Dev 2)
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?priority=CRITICAL`,
        {
          headers: { Authorization: `Bearer ${dev1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      record(
        '[SECURITY RBAC] Developer filtering for priority not assigned to them returns empty array (not forbidden or other user task)',
        200,
        res.status,
        '0 tasks',
        `${tasks.length} tasks returned`,
        tasks.length === 0
      );
    }

    // --- 15. Security / RBAC: Non-owning PM cannot view or filter another PM project ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?status=TODO`,
        {
          headers: { Authorization: `Bearer ${pm2.token}` },
        }
      );
      record(
        '[SECURITY RBAC] Non-owning PM cannot filter tasks in another PM project (403 Forbidden)',
        403,
        res.status,
        '403 Forbidden',
        `Status ${res.status}`,
        res.status === 403
      );
    }

    // --- 16. Security: Unauthenticated request with filters returns 401 ---
    {
      const res = await fetch(`${BASE_URL}/api/projects/${project1.id}/tasks?status=TODO`);
      record(
        '[SECURITY] Unauthenticated request with filters returns 401 Unauthorized',
        401,
        res.status,
        '401 Unauthorized',
        `Status ${res.status}`,
        res.status === 401
      );
    }

    // --- 17. Empty results when filter matches no tasks ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?fromDate=2030-01-01&toDate=2030-01-02`,
        {
          headers: { Authorization: `Bearer ${pm1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];
      record(
        'Empty filter result returns 200 OK with empty array (no error)',
        200,
        res.status,
        '0 tasks',
        `${tasks.length} tasks`,
        Array.isArray(tasks) && tasks.length === 0
      );
    }

    // --- Create additional tasks for all-filters testing ---
    // taskE: IN_PROGRESS, HIGH, dueDate 2026-11-05 (outside date range), assigned to dev1
    // taskF: IN_PROGRESS, HIGH, dueDate 2026-10-18 (inside date range), assigned to dev2
    const taskE = await prisma.task.create({
      data: {
        projectId: project1.id,
        assignedTo: dev1.user.id,
        title: 'Filter Test Task E (Future High)',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2026-11-05T10:00:00Z'),
      },
    });

    const taskF = await prisma.task.create({
      data: {
        projectId: project1.id,
        assignedTo: dev2.user.id,
        title: 'Filter Test Task F (Dev2 All-Match)',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2026-10-18T10:00:00Z'),
      },
    });

    // --- 18. [MANDATORY ALL-FILTERS] Query with ALL four filters simultaneously ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?status=IN_PROGRESS&priority=HIGH&fromDate=2026-10-10&toDate=2026-10-25`,
        {
          headers: { Authorization: `Bearer ${pm1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];

      const fromTimestamp = new Date('2026-10-10T00:00:00.000Z').getTime();
      const toTimestamp = new Date('2026-10-25T23:59:59.999Z').getTime();

      // 1. Verify every returned task satisfies ALL 4 conditions simultaneously
      const allSatisfyAllFour =
        tasks.length === 2 &&
        tasks.every((t: any) => {
          const due = new Date(t.dueDate).getTime();
          return (
            t.status === 'IN_PROGRESS' &&
            t.priority === 'HIGH' &&
            due >= fromTimestamp &&
            due <= toTimestamp
          );
        });

      // 2. Exactly taskB and taskF returned
      const returnedExpectedTasks =
        tasks.some((t: any) => t.id === taskB.id) &&
        tasks.some((t: any) => t.id === taskF.id);

      // 3. Tasks failing any single condition are excluded:
      //    - taskA fails status (TODO)
      //    - taskC fails priority (CRITICAL)
      //    - taskD fails status, priority, date
      //    - taskE fails date range (2026-11-05 > 2026-10-25)
      const excludedNonMatching =
        !tasks.some((t: any) => t.id === taskA.id) &&
        !tasks.some((t: any) => t.id === taskC.id) &&
        !tasks.some((t: any) => t.id === taskD.id) &&
        !tasks.some((t: any) => t.id === taskE.id);

      const passCondition = allSatisfyAllFour && returnedExpectedTasks && excludedNonMatching;

      record(
        '[MANDATORY ALL-FILTERS] Query with ALL 4 filters simultaneously (status, priority, fromDate, toDate) verifies all 4 criteria and excludes non-matching tasks',
        200,
        res.status,
        '2 tasks satisfying all 4 conditions (taskB, taskF); non-matching excluded',
        `${tasks.length} tasks returned (all 4 conditions satisfied: ${allSatisfyAllFour}, non-matching excluded: ${excludedNonMatching})`,
        passCondition
      );
    }

    // --- 19. [SECURITY RBAC ALL-FILTERS] Developer using all 4 filters cannot bypass assigned-task boundary ---
    {
      // Both taskB and taskF match all 4 filters.
      // But taskB is assigned to dev1 and taskF is assigned to dev2.
      // Developer 1 MUST receive ONLY taskB; taskF is strictly excluded by database role scoping.
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?status=IN_PROGRESS&priority=HIGH&fromDate=2026-10-10&toDate=2026-10-25`,
        {
          headers: { Authorization: `Bearer ${dev1.token}` },
        }
      );
      const data = await toJson(res);
      const tasks = data.data?.tasks || [];

      const devScopePreserved =
        tasks.length === 1 &&
        tasks[0].id === taskB.id &&
        !tasks.some((t: any) => t.id === taskF.id);

      record(
        '[SECURITY RBAC ALL-FILTERS] Developer using all 4 filters simultaneously cannot see other developer tasks matching same filters',
        200,
        res.status,
        'Only own assigned task (taskB), taskF strictly excluded',
        `${tasks.length} tasks returned (only own task: ${devScopePreserved})`,
        devScopePreserved
      );
    }

    // --- 20. [SECURITY RBAC ALL-FILTERS] Non-owning PM using all 4 filters is rejected with 403 Forbidden ---
    {
      const res = await fetch(
        `${BASE_URL}/api/projects/${project1.id}/tasks?status=IN_PROGRESS&priority=HIGH&fromDate=2026-10-10&toDate=2026-10-25`,
        {
          headers: { Authorization: `Bearer ${pm2.token}` },
        }
      );
      record(
        '[SECURITY RBAC ALL-FILTERS] Non-owning PM using all 4 filters against another PM project is rejected with 403 Forbidden',
        403,
        res.status,
        '403 Forbidden',
        `Status ${res.status}`,
        res.status === 403
      );
    }
  } catch (err: any) {
    console.error('Test execution error:', err);
    allPassed = false;
  } finally {
    try {
      if (project1?.id) {
        await prisma.task.deleteMany({ where: { projectId: project1.id } });
        await prisma.project.delete({ where: { id: project1.id } });
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
    server.close();
  }

  console.log('\n==================================================');
  console.log('         PHASE 8 TEST RESULTS SUMMARY             ');
  console.log('==================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  for (const r of results) {
    const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(
      `[#${String(r.id).padStart(2, '0')}] ${statusIcon} | Exp: ${r.expectedStatus} | Act: ${r.actualStatus} | ${r.description}`
    );
    if (!r.passed) {
      console.log(`     Condition Expected: ${r.expectedCondition}`);
      console.log(`     Actual Detail:      ${r.actualDetail}`);
      failedCount++;
      allPassed = false;
    } else {
      passedCount++;
    }
  }

  console.log('\n--------------------------------------------------');
  console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log('--------------------------------------------------\n');

  if (allPassed && failedCount === 0) {
    console.log(`🎉 ALL ${results.length} PHASE 8 TASK QUERY-PARAMETER FILTER TESTS PASSED PERFECTLY!\n`);
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED IN PHASE 8!');
    process.exit(1);
  }
}

runTests();
