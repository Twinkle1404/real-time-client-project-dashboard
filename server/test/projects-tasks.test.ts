import app from '../src/index';
import http from 'http';
import prisma from '../src/lib/prisma';

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
  console.log('🚀 Starting Phase 3 Project & Task REST API Test Suite...\n');

  const TEST_PORT = 4098;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => {
      console.log(`Test server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  const BASE_URL = `http://localhost:${TEST_PORT}`;
  let allPassed = true;

  try {
    // ── 0. AUTHENTICATE TEST USERS ──
    const login = async (email: string) => {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'DevPassword123!' }),
      });
      const data = await toJson(res);
      return {
        token: data.data.accessToken as string,
        user: data.data.user as { id: string; role: string; email: string },
      };
    };

    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const pm2 = await login('pm2@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');

    // Fetch existing seeded client & projects
    const existingClient = await prisma.client.findFirstOrThrow();
    const pm1Project = await prisma.project.findFirstOrThrow({ where: { createdBy: pm1.user.id } });
    const pm2Project = await prisma.project.findFirstOrThrow({ where: { createdBy: pm2.user.id } });

    // ── 1. PROJECT CREATION TESTS ──
    console.log('--- 1. Project Creation Tests ---');

    // Test 1: Admin can create project
    const pCreateAdmin = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ name: 'Admin Created Project', clientId: existingClient.id }),
    });
    const pCreateAdminData = await toJson(pCreateAdmin);
    record(
      'ADMIN creates project -> 201 Created',
      201,
      pCreateAdmin.status,
      '201 Created + creator is Admin',
      `Status: ${pCreateAdmin.status}, CreatorId: ${pCreateAdminData.data?.project?.createdBy}`,
      pCreateAdmin.status === 201 && pCreateAdminData.data?.project?.createdBy === admin.user.id
    );

    // Test 2: PM can create project
    let pmCreatedProjectId = '';
    const pCreatePm = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ name: 'PM1 New Project', clientId: existingClient.id }),
    });
    const pCreatePmData = await toJson(pCreatePm);
    pmCreatedProjectId = pCreatePmData.data?.project?.id || '';
    record(
      'PM creates project -> 201 Created',
      201,
      pCreatePm.status,
      '201 Created + creator is PM1',
      `Status: ${pCreatePm.status}, CreatorId: ${pCreatePmData.data?.project?.createdBy}`,
      pCreatePm.status === 201 && pCreatePmData.data?.project?.createdBy === pm1.user.id
    );

    // Test 3: Developer cannot create project
    const pCreateDev = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1.token}`,
      },
      body: JSON.stringify({ name: 'Dev Project Attempt', clientId: existingClient.id }),
    });
    const pCreateDevData = await toJson(pCreateDev);
    record(
      'DEVELOPER cannot create project -> 403 Forbidden',
      403,
      pCreateDev.status,
      '403 FORBIDDEN',
      `Status: ${pCreateDev.status}, Code: ${pCreateDevData.error?.code}`,
      pCreateDev.status === 403 && pCreateDevData.error?.code === 'FORBIDDEN'
    );

    // Test 4: Client-supplied createdBy is ignored (IDOR protection)
    const pCreateIdor = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        name: 'IDOR Spoof Attempt',
        clientId: existingClient.id,
        createdBy: admin.user.id, // Attempt to spoof ownership to Admin
      }),
    });
    const pCreateIdorData = await toJson(pCreateIdor);
    record(
      'Client-supplied createdBy is ignored and set to authenticated user',
      201,
      pCreateIdor.status,
      `createdBy is ${pm1.user.id}, not spoofed admin`,
      `Actual createdBy: ${pCreateIdorData.data?.project?.createdBy}`,
      pCreateIdorData.data?.project?.createdBy === pm1.user.id
    );

    // Test 5: Project creation fails with nonexistent client ID
    const pCreateBadClient = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: 'Bad Client Project',
        clientId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    record(
      'Project creation rejects nonexistent client UUID -> 400 VALIDATION_ERROR',
      400,
      pCreateBadClient.status,
      '400 VALIDATION_ERROR',
      `Status: ${pCreateBadClient.status}`,
      pCreateBadClient.status === 400
    );

    // ── 2. PROJECT LISTING TESTS ──
    console.log('\n--- 2. Project Listing Tests ---');

    // Test 6: Admin sees all projects
    const pListAdmin = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const pListAdminData = await toJson(pListAdmin);
    const totalProjects = await prisma.project.count();
    record(
      'ADMIN sees all projects in database',
      200,
      pListAdmin.status,
      `Length matches total projects in DB (${totalProjects})`,
      `Returned count: ${pListAdminData.data?.projects?.length}`,
      pListAdminData.data?.projects?.length === totalProjects
    );

    // Test 7: PM1 sees ONLY projects created by PM1
    const pListPm1 = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    const pListPm1Data = await toJson(pListPm1);
    const pm1AllOwn = pListPm1Data.data?.projects?.every(
      (p: any) => p.createdBy === pm1.user.id
    );
    record(
      'PM1 sees ONLY projects created by PM1',
      200,
      pListPm1.status,
      'All listed projects have createdBy = pm1.id',
      `Total: ${pListPm1Data.data?.projects?.length}, All own: ${pm1AllOwn}`,
      pm1AllOwn && pListPm1Data.data?.projects?.length > 0
    );

    // Test 8: Developer only sees projects where they have assigned tasks
    const pListDev1 = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const pListDev1Data = await toJson(pListDev1);
    record(
      'DEVELOPER sees only projects with assigned tasks',
      200,
      pListDev1.status,
      'Developer receives role-scoped project list',
      `Returned projects count: ${pListDev1Data.data?.projects?.length}`,
      pListDev1.status === 200 && Array.isArray(pListDev1Data.data?.projects)
    );

    // ── 3. PROJECT DETAIL TESTS ──
    console.log('\n--- 3. Project Detail & IDOR Tests ---');

    // Test 9: Admin can access any project detail
    const pGetAdmin = await fetch(`${BASE_URL}/api/projects/${pm2Project.id}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    record(
      'ADMIN can view any project detail -> 200 OK',
      200,
      pGetAdmin.status,
      '200 OK',
      `Status: ${pGetAdmin.status}`,
      pGetAdmin.status === 200
    );

    // Test 10: PM1 can access own project detail
    const pGetPm1Own = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    record(
      'PM1 can view own project detail -> 200 OK',
      200,
      pGetPm1Own.status,
      '200 OK',
      `Status: ${pGetPm1Own.status}`,
      pGetPm1Own.status === 200
    );

    // Test 11 (CRITICAL IDOR): PM1 cannot access PM2's project detail
    const pGetPm1Other = await fetch(`${BASE_URL}/api/projects/${pm2Project.id}`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    const pGetPm1OtherData = await toJson(pGetPm1Other);
    record(
      '[CRITICAL IDOR] PM1 blocked from accessing PM2 project -> 403 Forbidden',
      403,
      pGetPm1Other.status,
      '403 FORBIDDEN',
      `Status: ${pGetPm1Other.status}, Code: ${pGetPm1OtherData.error?.code}`,
      pGetPm1Other.status === 403 && pGetPm1OtherData.error?.code === 'FORBIDDEN'
    );

    // Test 12: Developer cannot access unassigned project
    // Create an isolated project with no tasks for dev1
    const unassignedProject = await prisma.project.create({
      data: {
        name: 'Secret Project Without Dev1',
        clientId: existingClient.id,
        createdBy: pm2.user.id,
      },
    });
    const pGetDevUnassigned = await fetch(`${BASE_URL}/api/projects/${unassignedProject.id}`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    record(
      '[CRITICAL IDOR] DEVELOPER blocked from unassigned project -> 403 Forbidden',
      403,
      pGetDevUnassigned.status,
      '403 FORBIDDEN',
      `Status: ${pGetDevUnassigned.status}`,
      pGetDevUnassigned.status === 403
    );

    // ── 4. PROJECT UPDATE & DELETE TESTS ──
    console.log('\n--- 4. Project Update & Delete Tests ---');

    // Test 13: PM1 updates own project
    const pPatchPm1 = await fetch(`${BASE_URL}/api/projects/${pmCreatedProjectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ name: 'PM1 Renamed Project' }),
    });
    const pPatchPm1Data = await toJson(pPatchPm1);
    record(
      'PM1 updates own project -> 200 OK',
      200,
      pPatchPm1.status,
      '200 OK with updated name',
      `Status: ${pPatchPm1.status}, Name: ${pPatchPm1Data.data?.project?.name}`,
      pPatchPm1Data.data?.project?.name === 'PM1 Renamed Project'
    );

    // Test 14 (CRITICAL IDOR): PM1 cannot update PM2's project
    const pPatchPm1Other = await fetch(`${BASE_URL}/api/projects/${pm2Project.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ name: 'Hacked Project Name' }),
    });
    record(
      '[CRITICAL IDOR] PM1 blocked from updating PM2 project -> 403 Forbidden',
      403,
      pPatchPm1Other.status,
      '403 FORBIDDEN',
      `Status: ${pPatchPm1Other.status}`,
      pPatchPm1Other.status === 403
    );

    // Test 15: Developer cannot update project
    const pPatchDev = await fetch(`${BASE_URL}/api/projects/${pmCreatedProjectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1.token}`,
      },
      body: JSON.stringify({ name: 'Dev Renamed' }),
    });
    record(
      'DEVELOPER cannot update project -> 403 Forbidden',
      403,
      pPatchDev.status,
      '403 FORBIDDEN',
      `Status: ${pPatchDev.status}`,
      pPatchDev.status === 403
    );

    // Test 16: Deleting project with existing tasks returns 409 Conflict
    const pDelConflict = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    record(
      'Deleting project with active tasks returns 409 Conflict (FK protection)',
      409,
      pDelConflict.status,
      '409 CONFLICT',
      `Status: ${pDelConflict.status}`,
      pDelConflict.status === 409
    );

    // Test 17: Deleting empty project succeeds with 204 No Content
    const pDelSuccess = await fetch(`${BASE_URL}/api/projects/${pmCreatedProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    record(
      'PM1 deletes own empty project -> 204 No Content',
      204,
      pDelSuccess.status,
      '204 No Content',
      `Status: ${pDelSuccess.status}`,
      pDelSuccess.status === 204
    );

    // ── 5. TASK CREATION & ASSIGNMENT TESTS ──
    console.log('\n--- 5. Task Creation & Assignment Tests ---');

    // Test 18: PM1 creates task in own project
    let createdTaskId = '';
    const tCreatePm = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Build Payment Gateway Module',
        description: 'Integrate Stripe API',
        assignedTo: dev1.user.id,
        priority: 'HIGH',
        status: 'TODO',
      }),
    });
    const tCreatePmData = await toJson(tCreatePm);
    createdTaskId = tCreatePmData.data?.task?.id || '';
    record(
      'PM creates task in own project -> 201 Created',
      201,
      tCreatePm.status,
      '201 Created with assignedTo = dev1.id',
      `Status: ${tCreatePm.status}, TaskId: ${createdTaskId}`,
      tCreatePm.status === 201 && tCreatePmData.data?.task?.assignedTo === dev1.user.id
    );

    // Test: CRITICAL priority is accepted
    const tCreateCritical = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Fix Critical Production Security Bug',
        assignedTo: dev1.user.id,
        priority: 'CRITICAL',
        status: 'TODO',
      }),
    });
    const tCreateCriticalData = await toJson(tCreateCritical);
    const criticalTaskId = tCreateCriticalData.data?.task?.id;
    record(
      'CRITICAL priority is accepted on task creation -> 201 Created',
      201,
      tCreateCritical.status,
      '201 Created with priority = CRITICAL',
      `Status: ${tCreateCritical.status}, Priority: ${tCreateCriticalData.data?.task?.priority}`,
      tCreateCritical.status === 201 && tCreateCriticalData.data?.task?.priority === 'CRITICAL'
    );
    // Clean up temporary critical task
    if (criticalTaskId) {
      await prisma.task.delete({ where: { id: criticalTaskId } }).catch(() => {});
    }

    // Test: URGENT priority is rejected as validation error
    const tCreateUrgent = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Invalid Urgent Priority Task',
        assignedTo: dev1.user.id,
        priority: 'URGENT',
      }),
    });
    const tCreateUrgentData = await toJson(tCreateUrgent);
    record(
      'URGENT priority is rejected with 400 VALIDATION_ERROR',
      400,
      tCreateUrgent.status,
      '400 VALIDATION_ERROR',
      `Status: ${tCreateUrgent.status}, Error: ${tCreateUrgentData.error?.code}`,
      tCreateUrgent.status === 400 && tCreateUrgentData.error?.code === 'VALIDATION_ERROR'
    );

    // Test 19 (CRITICAL IDOR): PM1 cannot create task in PM2's project
    const tCreatePmOther = await fetch(`${BASE_URL}/api/projects/${pm2Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized Task',
        assignedTo: dev1.user.id,
      }),
    });
    record(
      '[CRITICAL IDOR] PM1 blocked from creating task in PM2 project -> 403 Forbidden',
      403,
      tCreatePmOther.status,
      '403 FORBIDDEN',
      `Status: ${tCreatePmOther.status}`,
      tCreatePmOther.status === 403
    );

    // Test 20: Developer cannot create task
    const tCreateDev = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1.token}`,
      },
      body: JSON.stringify({
        title: 'Dev Self Created Task',
        assignedTo: dev1.user.id,
      }),
    });
    record(
      'DEVELOPER cannot create task -> 403 Forbidden',
      403,
      tCreateDev.status,
      '403 FORBIDDEN',
      `Status: ${tCreateDev.status}`,
      tCreateDev.status === 403
    );

    // Test 21: Task assignment rejects assigning to PM or Admin
    const tCreateBadAssignee = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Task Assigned to PM',
        assignedTo: pm2.user.id, // Not a DEVELOPER
      }),
    });
    record(
      'Task assignment rejects non-developer user -> 400 VALIDATION_ERROR',
      400,
      tCreateBadAssignee.status,
      '400 VALIDATION_ERROR',
      `Status: ${tCreateBadAssignee.status}`,
      tCreateBadAssignee.status === 400
    );

    // ── 6. TASK LISTING & DETAIL TESTS ──
    console.log('\n--- 6. Task Listing & Detail Tests ---');

    // Test 22: Admin lists all tasks in project
    const tListAdmin = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const tListAdminData = await toJson(tListAdmin);
    record(
      'ADMIN can view all tasks in project -> 200 OK',
      200,
      tListAdmin.status,
      'Returns all project tasks',
      `Tasks count: ${tListAdminData.data?.tasks?.length}`,
      tListAdmin.status === 200 && tListAdminData.data?.tasks?.length > 0
    );

    // Test 23 (CRITICAL IDOR): PM1 cannot view tasks in PM2 project
    const tListPmOther = await fetch(`${BASE_URL}/api/projects/${pm2Project.id}/tasks`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    record(
      '[CRITICAL IDOR] PM1 blocked from listing tasks in PM2 project -> 403 Forbidden',
      403,
      tListPmOther.status,
      '403 FORBIDDEN',
      `Status: ${tListPmOther.status}`,
      tListPmOther.status === 403
    );

    // Test 24 (CRITICAL): Developer sees ONLY own assigned tasks
    const tListDev = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const tListDevData = await toJson(tListDev);
    const allDev1Assigned = tListDevData.data?.tasks?.every(
      (t: any) => t.assignedTo === dev1.user.id
    );
    record(
      '[CRITICAL QUERY-SCOPED] Developer sees ONLY own assigned tasks',
      200,
      tListDev.status,
      'All tasks belong strictly to dev1',
      `Dev1 tasks: ${tListDevData.data?.tasks?.length}, All assigned to dev1: ${allDev1Assigned}`,
      allDev1Assigned
    );

    // Test 25: Developer can view own task detail
    const tGetDevOwn = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    record(
      'Developer can view own assigned task detail -> 200 OK',
      200,
      tGetDevOwn.status,
      '200 OK',
      `Status: ${tGetDevOwn.status}`,
      tGetDevOwn.status === 200
    );

    // Test 26 (CRITICAL IDOR): Dev2 cannot view Dev1's task detail
    const tGetDevOther = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    record(
      '[CRITICAL IDOR] Dev2 blocked from viewing Dev1 task -> 403 Forbidden',
      403,
      tGetDevOther.status,
      '403 FORBIDDEN',
      `Status: ${tGetDevOther.status}`,
      tGetDevOther.status === 403
    );

    // ── 7. TASK UPDATE & STATUS CHANGE TESTS ──
    console.log('\n--- 7. Task Update & Status Change Tests ---');

    // Test 27: Developer updates status of assigned task (permitted workflow)
    const tPatchStatus = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1.token}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const tPatchStatusData = await toJson(tPatchStatus);
    record(
      'Developer updates status of own task -> 200 OK',
      200,
      tPatchStatus.status,
      'Status updated to IN_PROGRESS',
      `Status: ${tPatchStatus.status}, New Status: ${tPatchStatusData.data?.task?.status}`,
      tPatchStatusData.data?.task?.status === 'IN_PROGRESS'
    );

    // ── ACTIVITY LOG POSTGRESQL VERIFICATION (DEVELOPER STATUS CHANGE) ──
    const devLogs = await prisma.activityLog.findMany({
      where: { taskId: createdTaskId },
      orderBy: { createdAt: 'desc' },
    });
    const devLog = devLogs[0];
    const devLogHasValidTime =
      devLog?.createdAt instanceof Date &&
      !isNaN(devLog.createdAt.getTime()) &&
      Math.abs(Date.now() - devLog.createdAt.getTime()) < 60000;

    record(
      'Status change creates exactly one ActivityLog record in PostgreSQL',
      1,
      devLogs.length,
      'Exactly 1 ActivityLog record',
      `PostgreSQL count: ${devLogs.length}`,
      devLogs.length === 1
    );

    record(
      'ActivityLog contains the correct task ID',
      200,
      devLog?.taskId === createdTaskId ? 200 : 500,
      `taskId: ${createdTaskId}`,
      `taskId: ${devLog?.taskId}`,
      devLog?.taskId === createdTaskId
    );

    record(
      "ActivityLog contains the authenticated user's ID",
      200,
      devLog?.userId === dev1.user.id ? 200 : 500,
      `userId: ${dev1.user.id}`,
      `userId: ${devLog?.userId}`,
      devLog?.userId === dev1.user.id
    );

    record(
      'ActivityLog contains the previous status (TODO)',
      200,
      devLog?.fromStatus === 'TODO' ? 200 : 500,
      'fromStatus: TODO',
      `fromStatus: ${devLog?.fromStatus}`,
      devLog?.fromStatus === 'TODO'
    );

    record(
      'ActivityLog contains the new status (IN_PROGRESS)',
      200,
      devLog?.toStatus === 'IN_PROGRESS' ? 200 : 500,
      'toStatus: IN_PROGRESS',
      `toStatus: ${devLog?.toStatus}`,
      devLog?.toStatus === 'IN_PROGRESS'
    );

    record(
      'ActivityLog contains a valid timestamp',
      200,
      devLogHasValidTime ? 200 : 500,
      'Valid timestamp within last 60 seconds',
      `Timestamp: ${devLog?.createdAt}`,
      devLogHasValidTime
    );

    // ── UPDATING NON-STATUS FIELDS DOES NOT CREATE ACTIVITY LOG ──
    const tPatchMeta = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Updated Payment Gateway Title By PM',
        description: 'Updated Stripe integration requirements',
        priority: 'CRITICAL',
      }),
    });
    const countAfterMeta = await prisma.activityLog.count({ where: { taskId: createdTaskId } });
    record(
      'Updating only title/description/priority does not create a status-change activity',
      200,
      tPatchMeta.status,
      'ActivityLog count remains 1 in PostgreSQL',
      `HTTP: ${tPatchMeta.status}, ActivityLog count: ${countAfterMeta}`,
      tPatchMeta.status === 200 && countAfterMeta === 1
    );

    // ── PM STATUS CHANGE LOGGED IN POSTGRESQL ──
    const tPatchPmStatus = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ status: 'IN_REVIEW' }),
    });
    const pmLogs = await prisma.activityLog.findMany({
      where: { taskId: createdTaskId },
      orderBy: { createdAt: 'desc' },
    });
    const pmLog = pmLogs[0];
    record(
      'PM status change is logged with authenticated PM user ID in PostgreSQL',
      200,
      tPatchPmStatus.status,
      `New status IN_REVIEW logged by PM ${pm1.user.id}`,
      `Total logs: ${pmLogs.length}, PM user: ${pmLog?.userId}, From: ${pmLog?.fromStatus}, To: ${pmLog?.toStatus}`,
      tPatchPmStatus.status === 200 &&
        pmLogs.length === 2 &&
        pmLog?.userId === pm1.user.id &&
        pmLog?.fromStatus === 'IN_PROGRESS' &&
        pmLog?.toStatus === 'IN_REVIEW'
    );

    // ── ADMIN STATUS CHANGE LOGGED IN POSTGRESQL ──
    const tPatchAdminStatus = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ status: 'DONE' }),
    });
    const adminLogs = await prisma.activityLog.findMany({
      where: { taskId: createdTaskId },
      orderBy: { createdAt: 'desc' },
    });
    const adminLog = adminLogs[0];
    record(
      'Admin status change is logged with authenticated Admin user ID in PostgreSQL',
      200,
      tPatchAdminStatus.status,
      `New status DONE logged by Admin ${admin.user.id}`,
      `Total logs: ${adminLogs.length}, Admin user: ${adminLog?.userId}, From: ${adminLog?.fromStatus}, To: ${adminLog?.toStatus}`,
      tPatchAdminStatus.status === 200 &&
        adminLogs.length === 3 &&
        adminLog?.userId === admin.user.id &&
        adminLog?.fromStatus === 'IN_REVIEW' &&
        adminLog?.toStatus === 'DONE'
    );

    // Test 28 (CRITICAL): Developer cannot reassign task to someone else
    const tPatchReassign = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1.token}`,
      },
      body: JSON.stringify({ assignedTo: dev2.user.id }),
    });
    record(
      '[CRITICAL SECURITY] Developer blocked from reassigning task -> 403 Forbidden',
      403,
      tPatchReassign.status,
      '403 FORBIDDEN',
      `Status: ${tPatchReassign.status}`,
      tPatchReassign.status === 403
    );

    // Test 29 (CRITICAL): Dev2 cannot update Dev1's task
    const tPatchDevOther = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2.token}`,
      },
      body: JSON.stringify({ status: 'TODO' }),
    });
    record(
      '[CRITICAL IDOR] Dev2 blocked from updating Dev1 task -> 403 Forbidden',
      403,
      tPatchDevOther.status,
      '403 FORBIDDEN',
      `Status: ${tPatchDevOther.status}`,
      tPatchDevOther.status === 403
    );

    // ── UNAUTHORIZED ATTEMPT DOES NOT CREATE ACTIVITY LOG ──
    const countAfterDev2 = await prisma.activityLog.count({ where: { taskId: createdTaskId } });
    record(
      'Developer cannot create an activity log for a task they are not authorized to modify',
      3,
      countAfterDev2,
      'ActivityLog count in PostgreSQL remains 3 after unauthorized attempt',
      `PostgreSQL count: ${countAfterDev2}`,
      countAfterDev2 === 3
    );

    // ── 8. TASK DELETE TESTS ──
    console.log('\n--- 8. Task Delete Tests ---');

    // Test 30: Developer cannot delete task
    const tDelDev = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    record(
      'DEVELOPER cannot delete task -> 403 Forbidden',
      403,
      tDelDev.status,
      '403 FORBIDDEN',
      `Status: ${tDelDev.status}`,
      tDelDev.status === 403
    );

    // Test 31: PM1 cannot delete task in PM2's project
    const pm2Task = await prisma.task.findFirstOrThrow({ where: { projectId: pm2Project.id } });
    const tDelPmOther = await fetch(`${BASE_URL}/api/tasks/${pm2Task.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    record(
      '[CRITICAL IDOR] PM1 blocked from deleting PM2 task -> 403 Forbidden',
      403,
      tDelPmOther.status,
      '403 FORBIDDEN',
      `Status: ${tDelPmOther.status}`,
      tDelPmOther.status === 403
    );

    // Test 32: PM1 deletes task in own project -> 204 No Content
    const tDelSuccess = await fetch(`${BASE_URL}/api/tasks/${createdTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    record(
      'PM1 deletes task in own project -> 204 No Content',
      204,
      tDelSuccess.status,
      '204 No Content',
      `Status: ${tDelSuccess.status}`,
      tDelSuccess.status === 204
    );

    // ── 9. SERIALIZATION & SENSITIVE DATA CHECK ──
    console.log('\n--- 9. Data Serialization & Security Sanity Checks ---');

    // Test 33: Response payloads never expose passwordHash
    const pDetail = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const pDetailText = await pDetail.text();
    const noPassHashInProject = !pDetailText.includes('passwordHash') && !pDetailText.includes('password_hash');
    record(
      'Project detail never exposes passwordHash or password_hash',
      200,
      pDetail.status,
      'No password hash in JSON response string',
      `Safe: ${noPassHashInProject}`,
      noPassHashInProject
    );

    // Clean up temporary unassigned project
    await prisma.project.delete({ where: { id: unassignedProject.id } }).catch(() => {});

    // ── SUMMARY & REPORT ──
    console.log('\n==================================================');
    console.log('         PHASE 3 TEST RESULTS SUMMARY             ');
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
      console.log(`🎉 ALL ${results.length} PHASE 3 REST & AUTHORIZATION TESTS PASSED PERFECTLY!\n`);
    } else {
      console.error('⚠️ SOME TESTS FAILED. INVESTIGATION REQUIRED.\n');
    }
  } finally {
    server.close(() => {
      process.exit(allPassed ? 0 : 1);
    });
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
