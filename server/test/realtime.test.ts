import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app, { initSocketServer } from '../src/index';
import prisma from '../src/lib/prisma';
import { presenceManager } from '../src/realtime/presence';

const PORT = 4097;
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

// Socket test helper utilities
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

const waitForConnectError = (socket: ClientSocketType, timeoutMs = 2500): Promise<string> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMEOUT'), timeoutMs);
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      resolve(err.message);
    });
  });
};

const waitForEvent = <T>(socket: ClientSocketType, event: string, timeoutMs = 2500): Promise<T | null> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

async function runTests() {
  console.log('🚀 Starting Phase 4 Real-Time Socket.IO Test Suite...\n');

  // Start isolated HTTP + Socket.IO server on port 4097
  const server = http.createServer(app);
  const io = initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Phase 4 Test server running on port ${PORT}\n`);
      resolve();
    });
  });

  const socketsToCleanup: ClientSocketType[] = [];
  const track = (s: ClientSocketType): ClientSocketType => {
    socketsToCleanup.push(s);
    return s;
  };

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
      return { token: data.data?.accessToken as string, user: data.data?.user };
    };

    const admin = await login('admin@velozity.com');
    const pm1 = await login('pm1@velozity.com');
    const pm2 = await login('pm2@velozity.com');
    const dev1 = await login('dev1@velozity.com');
    const dev2 = await login('dev2@velozity.com');

    // Fetch projects from database
    const pm1Project = await prisma.project.findFirstOrThrow({
      where: { createdBy: pm1.user.id },
    });
    const pm2Project = await prisma.project.findFirstOrThrow({
      where: { createdBy: pm2.user.id },
    });

    // ── 1. SOCKET AUTHENTICATION TESTS ──
    console.log('--- 1. Socket Authentication Tests ---');

    // Test 1: Authenticated user can establish socket connection
    const s1 = track(createSocket(admin.token));
    const s1Connected = await waitForConnect(s1);
    record(
      'Authenticated user can establish socket connection',
      true,
      s1Connected,
      'Socket connected successfully',
      `Connected: ${s1Connected}`,
      s1Connected
    );

    // Test 2: Invalid JWT is rejected
    const sBad = track(createSocket('invalid.jwt.token.string'));
    const sBadError = await waitForConnectError(sBad);
    const sBadFailed = !sBad.connected && sBadError.includes('Authentication error');
    record(
      'Invalid/expired JWT is rejected',
      true,
      sBadFailed,
      'Connection rejected with Authentication error',
      `Error: ${sBadError}`,
      sBadFailed
    );

    // ── 2. ROOM AUTHORIZATION TESTS ──
    console.log('\n--- 2. Room Authorization Tests ---');

    // Test 3: Admin can join an authorized project room
    const sAdmin = track(createSocket(admin.token));
    await waitForConnect(sAdmin);
    const adminJoinRes = await new Promise<any>((resolve) => {
      sAdmin.emit('project:join', { projectId: pm1Project.id }, resolve);
    });
    record(
      'Admin can join an authorized project room',
      true,
      adminJoinRes?.success,
      'success: true',
      `Result: ${JSON.stringify(adminJoinRes)}`,
      adminJoinRes?.success === true
    );

    // Test 4: PM can join their own project room
    const sPm1 = track(createSocket(pm1.token));
    await waitForConnect(sPm1);
    const pm1JoinOwnRes = await new Promise<any>((resolve) => {
      sPm1.emit('project:join', { projectId: pm1Project.id }, resolve);
    });
    record(
      'PM can join their own project room',
      true,
      pm1JoinOwnRes?.success,
      'success: true',
      `Result: ${JSON.stringify(pm1JoinOwnRes)}`,
      pm1JoinOwnRes?.success === true
    );

    // Test 5 (CRITICAL IDOR): PM cannot join another PM's project room
    const pm1JoinPm2Res = await new Promise<any>((resolve) => {
      sPm1.emit('project:join', { projectId: pm2Project.id }, resolve);
    });
    record(
      "[CRITICAL IDOR] PM cannot join another PM's project room",
      false,
      pm1JoinPm2Res?.success,
      'success: false with Forbidden message',
      `Result: ${JSON.stringify(pm1JoinPm2Res)}`,
      pm1JoinPm2Res?.success === false && pm1JoinPm2Res?.error?.includes('Forbidden')
    );

    // Test 6: Developer can join a project where they have an assigned task
    // Dev1 has tasks in pm1Project
    const sDev1 = track(createSocket(dev1.token));
    await waitForConnect(sDev1);
    const dev1JoinAssignedRes = await new Promise<any>((resolve) => {
      sDev1.emit('project:join', { projectId: pm1Project.id }, resolve);
    });
    record(
      'Developer can join a project where they have an assigned task',
      true,
      dev1JoinAssignedRes?.success,
      'success: true',
      `Result: ${JSON.stringify(dev1JoinAssignedRes)}`,
      dev1JoinAssignedRes?.success === true
    );

    // Create an isolated project with no tasks for dev1 to test room authorization IDOR
    const existingClient = await prisma.client.findFirstOrThrow();
    const unassignedProject = await prisma.project.create({
      data: {
        name: 'Isolated Project Without Dev1',
        clientId: existingClient.id,
        createdBy: pm2.user.id,
      },
    });

    // Test 7 (CRITICAL IDOR): Developer cannot join an unrelated project
    const dev1JoinUnassignedRes = await new Promise<any>((resolve) => {
      sDev1.emit('project:join', { projectId: unassignedProject.id }, resolve);
    });
    record(
      '[CRITICAL IDOR] Developer cannot join an unrelated project',
      false,
      dev1JoinUnassignedRes?.success,
      'success: false with Forbidden message',
      `Result: ${JSON.stringify(dev1JoinUnassignedRes)}`,
      dev1JoinUnassignedRes?.success === false && dev1JoinUnassignedRes?.error?.includes('Forbidden')
    );

    // Clean up unassigned project
    await prisma.project.delete({ where: { id: unassignedProject.id } }).catch(() => {});

    // ── 3. TASK STATUS CHANGE & REAL-TIME BROADCAST TESTS ──
    console.log('\n--- 3. Task Status Change & Real-Time Broadcast Tests ---');

    // Create a new task in pm1Project assigned to dev1
    const tCreateRes = await fetch(`${BASE_URL}/api/projects/${pm1Project.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Real-Time Verification Task',
        assignedTo: dev1.user.id,
        status: 'TODO',
        priority: 'HIGH',
      }),
    });
    const tCreateData = await toJson(tCreateRes);
    const testTaskId = tCreateData.data?.task?.id;

    // Set up listeners on sPm1 and sDev1 (both joined to project:pm1Project.id)
    const devStatusPromise = waitForEvent<any>(sDev1, 'task:statusChanged');
    const devActivityPromise = waitForEvent<any>(sDev1, 'activity:new');
    const pmStatusPromise = waitForEvent<any>(sPm1, 'task:statusChanged');

    // Dev1 changes status from TODO to IN_PROGRESS via REST
    const patchRes = await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev1.token}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    const patchData = await toJson(patchRes);
    const devReceivedStatus = await devStatusPromise;
    const pmReceivedStatus = await pmStatusPromise;
    const devReceivedActivity = await devActivityPromise;

    // Test 8: Status change creates PostgreSQL ActivityLog
    const dbLog = await prisma.activityLog.findFirst({
      where: { taskId: testTaskId, fromStatus: 'TODO', toStatus: 'IN_PROGRESS' },
    });
    record(
      'Status change through REST creates the Phase 3 ActivityLog in PostgreSQL',
      true,
      !!dbLog,
      'ActivityLog record exists in PostgreSQL',
      `DB Log ID: ${dbLog?.id}`,
      !!dbLog && dbLog.userId === dev1.user.id
    );

    // Test 9: Successful status change emits task:statusChanged
    record(
      'Successful status change emits task:statusChanged to project room',
      true,
      !!devReceivedStatus && !!pmReceivedStatus,
      'Both Dev1 and PM1 received task:statusChanged',
      `Dev: ${!!devReceivedStatus}, PM: ${!!pmReceivedStatus}`,
      !!devReceivedStatus && !!pmReceivedStatus
    );

    // Test 10: The emitted event contains all required fields safely
    const hasRequiredFields =
      devReceivedStatus?.taskId === testTaskId &&
      devReceivedStatus?.projectId === pm1Project.id &&
      devReceivedStatus?.fromStatus === 'TODO' &&
      devReceivedStatus?.toStatus === 'IN_PROGRESS' &&
      devReceivedStatus?.changedBy?.id === dev1.user.id &&
      devReceivedStatus?.changedBy?.role === 'DEVELOPER' &&
      typeof devReceivedStatus?.changedAt === 'string' &&
      devReceivedStatus?.changedBy?.passwordHash === undefined;

    record(
      'The emitted event contains taskId, projectId, fromStatus, toStatus, changedBy, changedAt safely',
      true,
      hasRequiredFields,
      'All required fields present and passwordHash omitted',
      `Payload: ${JSON.stringify(devReceivedStatus)}`,
      hasRequiredFields
    );

    // Test 11: Failed/unauthorized status change does NOT emit a status event
    const unauthorizedStatusPromise = waitForEvent<any>(sDev1, 'task:statusChanged', 600);
    const unauthPatch = await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2.token}`,
      },
      body: JSON.stringify({ status: 'DONE' }),
    });
    const unauthReceived = await unauthorizedStatusPromise;
    record(
      'Failed/unauthorized status change does NOT emit a status event',
      true,
      unauthPatch.status === 403 && unauthReceived === null,
      'HTTP 403 and zero socket events emitted',
      `HTTP: ${unauthPatch.status}, Socket Event: ${JSON.stringify(unauthReceived)}`,
      unauthPatch.status === 403 && unauthReceived === null
    );

    // Test 12: Non-status task updates do NOT emit task:statusChanged
    const nonStatusPromise = waitForEvent<any>(sDev1, 'task:statusChanged', 600);
    const metaPatch = await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ title: 'Updated Title Only', priority: 'CRITICAL' }),
    });
    const nonStatusReceived = await nonStatusPromise;
    record(
      'Non-status task updates do NOT emit task:statusChanged',
      true,
      metaPatch.status === 200 && nonStatusReceived === null,
      'HTTP 200 and zero statusChanged events emitted',
      `HTTP: ${metaPatch.status}, Socket Event: ${JSON.stringify(nonStatusReceived)}`,
      metaPatch.status === 200 && nonStatusReceived === null
    );

    // Test 13: ActivityLog creation results in activity:new
    record(
      'ActivityLog creation results in activity:new event',
      true,
      !!devReceivedActivity,
      'activity:new received by project member',
      `Activity ID: ${devReceivedActivity?.id}, Desc: ${devReceivedActivity?.description}`,
      !!devReceivedActivity && devReceivedActivity.fromStatus === 'TODO' && devReceivedActivity.toStatus === 'IN_PROGRESS'
    );

    // ── 4. ACTIVITY FEED SCOPING TESTS ──
    console.log('\n--- 4. Activity Feed Scoping Tests ---');

    // Setup PM2 socket joined to pm2Project
    const sPm2 = track(createSocket(pm2.token));
    await waitForConnect(sPm2);
    await new Promise<any>((resolve) => {
      sPm2.emit('project:join', { projectId: pm2Project.id }, resolve);
    });

    // Test 14: PM receives activity only for their own projects
    // Trigger status change on pm1Project
    const pm1ActPromise = waitForEvent<any>(sPm1, 'activity:new');
    const pm2ActPromise = waitForEvent<any>(sPm2, 'activity:new', 600);

    await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ status: 'IN_REVIEW' }),
    });

    const pm1GotAct = await pm1ActPromise;
    const pm2GotAct = await pm2ActPromise;

    record(
      'PM receives activity only for their own projects',
      true,
      !!pm1GotAct && pm2GotAct === null,
      'PM1 received activity; PM2 did NOT receive activity',
      `PM1: ${!!pm1GotAct}, PM2: ${!!pm2GotAct}`,
      !!pm1GotAct && pm2GotAct === null
    );

    // Test 15: Developer receives activity only for legitimately assigned project scope
    const sDev2 = track(createSocket(dev2.token));
    await waitForConnect(sDev2);
    // Dev2 is not joined to pm1Project
    const dev1ScopePromise = waitForEvent<any>(sDev1, 'activity:new');
    const dev2ScopePromise = waitForEvent<any>(sDev2, 'activity:new', 600);

    await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ status: 'DONE' }),
    });

    const dev1GotAct = await dev1ScopePromise;
    const dev2GotAct = await dev2ScopePromise;

    record(
      'Developer receives activity only for legitimately assigned project/task scope',
      true,
      !!dev1GotAct && dev2GotAct === null,
      'Dev1 received activity; Dev2 did NOT receive activity',
      `Dev1: ${!!dev1GotAct}, Dev2: ${!!dev2GotAct}`,
      !!dev1GotAct && dev2GotAct === null
    );

    // Test 16: Admin can receive global activity
    // sAdmin is automatically joined to global:activity on connection
    const adminGlobalPromise = waitForEvent<any>(sAdmin, 'activity:new');

    await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });

    const adminGotGlobal = await adminGlobalPromise;
    record(
      'Admin can receive global activity',
      true,
      !!adminGotGlobal,
      'Admin received activity:new via global:activity',
      `Global Activity ID: ${adminGotGlobal?.id}`,
      !!adminGotGlobal && adminGotGlobal.taskId === testTaskId
    );

    // Test 17: PM/Developer do not receive Admin global activity
    const pmGlobalJoinRes = await new Promise<any>((resolve) => {
      sPm1.emit('global:join', resolve);
    });
    const devGlobalJoinRes = await new Promise<any>((resolve) => {
      sDev1.emit('global:join', resolve);
    });

    const forbiddenGlobal =
      pmGlobalJoinRes?.success === false &&
      pmGlobalJoinRes?.error?.includes('Forbidden') &&
      devGlobalJoinRes?.success === false &&
      devGlobalJoinRes?.error?.includes('Forbidden');

    record(
      'PM/Developer do not receive Admin global activity (forbidden from global:activity room)',
      true,
      forbiddenGlobal,
      'Both PM and Developer rejected from global:activity',
      `PM err: ${pmGlobalJoinRes?.error}, Dev err: ${devGlobalJoinRes?.error}`,
      forbiddenGlobal
    );

    // Clean up test task safely
    await fetch(`${BASE_URL}/api/tasks/${testTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin.token}` },
    });

    // ── 5. ONLINE PRESENCE TESTS ──
    console.log('\n--- 5. Online Presence Tests ---');

    // Close all current sockets to test presence tracking in isolation
    for (const s of socketsToCleanup) {
      s.disconnect();
    }
    socketsToCleanup.length = 0;
    presenceManager.clear();

    await new Promise((r) => setTimeout(r, 200));

    // Test 18: Multiple connections for one user count as ONE online user
    const dev1Tab1 = track(createSocket(dev1.token));
    await waitForConnect(dev1Tab1);
    const countAfterTab1 = presenceManager.getOnlineCount();

    const dev1Tab2 = track(createSocket(dev1.token));
    await waitForConnect(dev1Tab2);
    const countAfterTab2 = presenceManager.getOnlineCount();

    const dev1Tab3 = track(createSocket(dev1.token));
    await waitForConnect(dev1Tab3);
    const countAfterTab3 = presenceManager.getOnlineCount();

    const dev2Tab1 = track(createSocket(dev2.token));
    await waitForConnect(dev2Tab1);
    const countAfterDev2 = presenceManager.getOnlineCount();

    const multiConnectionCorrect =
      countAfterTab1 === 1 && countAfterTab2 === 1 && countAfterTab3 === 1 && countAfterDev2 === 2;

    record(
      'Multiple connections for one user count as one online user',
      true,
      multiConnectionCorrect,
      '3 tabs of Dev1 = 1 online; Adding Dev2 = 2 online',
      `Tab1: ${countAfterTab1}, Tab2: ${countAfterTab2}, Tab3: ${countAfterTab3}, Dev2: ${countAfterDev2}`,
      multiConnectionCorrect
    );

    // Test 19: Disconnecting one of multiple tabs does not incorrectly mark the user offline
    dev1Tab1.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    const countAfterTab1Close = presenceManager.getOnlineCount();

    dev1Tab2.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    const countAfterTab2Close = presenceManager.getOnlineCount();

    const disconnectOneTabCorrect =
      countAfterTab1Close === 2 && countAfterTab2Close === 2 && presenceManager.isUserOnline(dev1.user.id);

    record(
      'Disconnecting one of multiple tabs does not incorrectly mark the user offline',
      true,
      disconnectOneTabCorrect,
      'Online count remains 2 while Dev1 has Tab 3 open',
      `After Tab1 close: ${countAfterTab1Close}, After Tab2 close: ${countAfterTab2Close}`,
      disconnectOneTabCorrect
    );

    // Test 20: User becomes offline only after their final active socket connection disconnects
    dev1Tab3.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    const countAfterTab3Close = presenceManager.getOnlineCount();
    const dev1IsOffline = !presenceManager.isUserOnline(dev1.user.id);

    dev2Tab1.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    const countAfterAllClose = presenceManager.getOnlineCount();

    const finalDisconnectCorrect =
      countAfterTab3Close === 1 && dev1IsOffline && countAfterAllClose === 0;

    record(
      'User becomes offline only after their final active socket connection disconnects',
      true,
      finalDisconnectCorrect,
      'Dev1 offline after Tab3 close (count: 1); Count: 0 after all close',
      `After Dev1 Tab3: ${countAfterTab3Close}, Dev1 offline: ${dev1IsOffline}, Final count: ${countAfterAllClose}`,
      finalDisconnectCorrect
    );

    // ── SUMMARY & REPORT ──
    console.log('\n==================================================');
    console.log('         PHASE 4 TEST RESULTS SUMMARY             ');
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
      console.log(`🎉 ALL ${results.length} PHASE 4 REAL-TIME SOCKET.IO TESTS PASSED PERFECTLY!\n`);
    } else {
      console.error('⚠️ SOME PHASE 4 TESTS FAILED. INVESTIGATION REQUIRED.\n');
    }
  } finally {
    for (const s of socketsToCleanup) {
      if (s.connected) s.disconnect();
    }
    server.close(() => {
      process.exit(allPassed ? 0 : 1);
    });
  }
}

runTests().catch((err) => {
  console.error('Fatal test error in Phase 4:', err);
  process.exit(1);
});
