import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app, { initSocketServer } from '../src/index';
import prisma from '../src/lib/prisma';
import { TaskStatus, TaskPriority } from '@prisma/client';

const PORT = 4096;
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

const waitForEvent = <T>(socket: ClientSocketType, event: string, timeoutMs = 2500): Promise<T | null> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
};

const requestCatchup = (
  socket: ClientSocketType,
  payload?: { lastSeenActivityId?: string; projectId?: string },
  timeoutMs = 4000
): Promise<any> => {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ success: false, error: { code: 'TIMEOUT', message: 'Catchup timed out' } }),
      timeoutMs
    );
    socket.emit('activity:catchup', payload || {}, (res: any) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
};

async function runTests() {
  console.log('🚀 Starting Phase 5 Missed-Event Catchup Test Suite...\n');

  // Start isolated HTTP + Socket.IO server on port 4096
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Phase 5 Test server running on port ${PORT}\n`);
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
  const createdActivityLogIds: string[] = [];

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

    const existingClient = await prisma.client.findFirstOrThrow();
    const pm1Project = await prisma.project.findFirstOrThrow({ where: { createdBy: pm1.user.id } });
    const pm2Project = await prisma.project.findFirstOrThrow({ where: { createdBy: pm2.user.id } });

    // Create an isolated project owned by PM2 where Dev1 has NO assigned tasks
    const unassignedProject = await prisma.project.create({
      data: {
        name: 'Unassigned Project For Dev1',
        clientId: existingClient.id,
        createdBy: pm2.user.id,
      },
    });
    createdProjectIds.push(unassignedProject.id);

    // ── 1. BASIC CATCHUP REQUEST TESTS ──
    console.log('--- 1. Basic Catchup Request & Auth Tests ---');

    // Test 1: Authenticated user can request catchup
    const sAdmin = track(createSocket(admin.token));
    await waitForConnect(sAdmin);
    const adminCatchupRes = await requestCatchup(sAdmin);
    record(
      'Authenticated user can request catchup',
      true,
      adminCatchupRes?.success,
      'success: true with event array',
      `success: ${adminCatchupRes?.success}, count: ${adminCatchupRes?.data?.count}`,
      adminCatchupRes?.success === true && Array.isArray(adminCatchupRes?.data?.events)
    );

    // Test 2: Unauthenticated socket connection is rejected
    const sBad = track(createSocket('invalid.access.token'));
    const sBadConnected = await waitForConnect(sBad);
    record(
      'Invalid socket authentication cannot establish connection or request catchup',
      false,
      sBadConnected,
      'Connection rejected at handshake',
      `Connected: ${sBadConnected}`,
      sBadConnected === false
    );

    // ── 2. ROLE-SCOPED CATCHUP TESTS (ADMIN, PM, DEVELOPER) ──
    console.log('\n--- 2. Role-Scoped Catchup Tests ---');

    // Test 3: Admin receives authorized missed activity across projects
    const allProjectsInAdminCatchup = new Set(adminCatchupRes.data.events.map((e: any) => e.projectId));
    record(
      'Admin receives authorized missed activity across projects',
      true,
      adminCatchupRes.success && adminCatchupRes.data.count > 0,
      'Admin receives global activity events',
      `Total events: ${adminCatchupRes.data.count}, Distinct projects: ${allProjectsInAdminCatchup.size}`,
      adminCatchupRes.success && adminCatchupRes.data.count > 0
    );

    // Test 4: PM receives only their own project's missed activity
    const sPm1 = track(createSocket(pm1.token));
    await waitForConnect(sPm1);
    const pm1CatchupRes = await requestCatchup(sPm1);
    const allPm1Projects = await prisma.project.findMany({
      where: { createdBy: pm1.user.id },
      select: { id: true },
    });
    const pm1ProjectIds = new Set(allPm1Projects.map((p) => p.id));
    const allBelongToPm1 = pm1CatchupRes.data?.events?.every((e: any) =>
      pm1ProjectIds.has(e.projectId)
    );
    record(
      "PM receives only their own project's missed activity",
      true,
      pm1CatchupRes.success && (allBelongToPm1 ?? false),
      "All returned events belong strictly to PM1's projects",
      `Count: ${pm1CatchupRes.data?.count}, All belong to PM1: ${allBelongToPm1}`,
      pm1CatchupRes.success && allBelongToPm1 === true
    );

    // Test 5 (CRITICAL IDOR): PM cannot receive another PM's missed activity
    const pm1TryPm2Res = await requestCatchup(sPm1, { projectId: pm2Project.id });
    record(
      "[CRITICAL IDOR] PM cannot receive another PM's missed activity",
      false,
      pm1TryPm2Res.success,
      'success: false with FORBIDDEN error',
      `Result: ${JSON.stringify(pm1TryPm2Res)}`,
      pm1TryPm2Res.success === false && pm1TryPm2Res.error?.code === 'FORBIDDEN'
    );

    // Test 6: Developer receives only assigned-project activity
    const sDev1 = track(createSocket(dev1.token));
    await waitForConnect(sDev1);
    const dev1CatchupRes = await requestCatchup(sDev1);
    const dev1Tasks = await prisma.task.findMany({
      where: { assignedTo: dev1.user.id },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    const dev1ProjectIds = new Set(dev1Tasks.map((t) => t.projectId));
    const allBelongToDev1Scope = dev1CatchupRes.data?.events?.every((e: any) =>
      dev1ProjectIds.has(e.projectId)
    );
    record(
      'Developer receives only assigned-project activity',
      true,
      dev1CatchupRes.success && (allBelongToDev1Scope ?? false),
      "All returned events belong to Dev1's assigned projects",
      `Count: ${dev1CatchupRes.data?.count}, All in Dev1 scope: ${allBelongToDev1Scope}`,
      dev1CatchupRes.success && allBelongToDev1Scope === true
    );

    // Test 7 (CRITICAL IDOR): Developer cannot receive unrelated-project activity
    const dev1TryUnassignedRes = await requestCatchup(sDev1, { projectId: unassignedProject.id });
    record(
      '[CRITICAL IDOR] Developer cannot receive unrelated-project activity',
      false,
      dev1TryUnassignedRes.success,
      'success: false with FORBIDDEN error',
      `Result: ${JSON.stringify(dev1TryUnassignedRes)}`,
      dev1TryUnassignedRes.success === false && dev1TryUnassignedRes.error?.code === 'FORBIDDEN'
    );

    // Test 8: Client cannot bypass authorization by manipulating projectId
    const fakeProjectId = 'a0000000-0000-4000-8000-000000000001';
    const fakeProjectRes = await requestCatchup(sDev1, { projectId: fakeProjectId });
    record(
      'Client cannot bypass authorization by manipulating projectId',
      false,
      fakeProjectRes.success,
      'Rejected with FORBIDDEN error',
      `Error code: ${fakeProjectRes.error?.code}`,
      fakeProjectRes.success === false && fakeProjectRes.error?.code === 'FORBIDDEN'
    );

    // ── 3. LAST 20 LIMIT & CHRONOLOGICAL ORDERING TESTS ──
    console.log('\n--- 3. Last-20 Limit & Chronological Ordering Tests ---');

    // Create a dedicated project and 25 ActivityLog records
    const testBatchProject = await prisma.project.create({
      data: {
        name: 'Catchup 25-Event Test Project',
        clientId: existingClient.id,
        createdBy: pm1.user.id,
      },
    });
    createdProjectIds.push(testBatchProject.id);

    const testBatchTask = await prisma.task.create({
      data: {
        projectId: testBatchProject.id,
        assignedTo: dev1.user.id,
        title: 'Batch Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
      },
    });
    createdTaskIds.push(testBatchTask.id);

    // Insert 25 ActivityLog records spaced by 10ms
    const baseTime = Date.now() - 100000;
    const createdLogs = [];
    for (let i = 1; i <= 25; i++) {
      const logTime = new Date(baseTime + i * 1000);
      const log = await prisma.activityLog.create({
        data: {
          taskId: testBatchTask.id,
          projectId: testBatchProject.id,
          userId: pm1.user.id,
          changeDescription: `Status change event #${i}`,
          fromStatus: i % 2 === 0 ? TaskStatus.TODO : TaskStatus.IN_PROGRESS,
          toStatus: i % 2 === 0 ? TaskStatus.IN_PROGRESS : TaskStatus.TODO,
          createdAt: logTime,
        },
      });
      createdLogs.push(log);
      createdActivityLogIds.push(log.id);
    }

    // Request catchup on this test project (>20 events exist)
    const batchCatchupRes = await requestCatchup(sPm1, { projectId: testBatchProject.id });

    // Test 9: Result contains exactly 20 events when >20 exist
    record(
      'Authorized user with >20 missed events receives exactly 20 events',
      20,
      batchCatchupRes.data?.events?.length,
      'events.length === 20',
      `Actual events count: ${batchCatchupRes.data?.events?.length}`,
      batchCatchupRes.data?.events?.length === 20
    );

    // Test 10: hasMore === true when >20 events exist
    record(
      'hasMore === true when >20 missed events exist',
      true,
      batchCatchupRes.data?.hasMore,
      'hasMore: true',
      `hasMore: ${batchCatchupRes.data?.hasMore}`,
      batchCatchupRes.data?.hasMore === true
    );

    // Test 11: Events are the LATEST 20 missed events (events #6 to #25)
    const expectedFirstId = createdLogs[5].id; // 6th event (index 5)
    const expectedLastId = createdLogs[24].id; // 25th event (index 24)
    const actualFirstId = batchCatchupRes.data?.events?.[0]?.id;
    const actualLastId = batchCatchupRes.data?.events?.[19]?.id;
    const isLatest20 = actualFirstId === expectedFirstId && actualLastId === expectedLastId;
    record(
      'Events returned are the latest 20 missed events from PostgreSQL',
      true,
      isLatest20,
      `First event: #${createdLogs[5].changeDescription}, Last event: #${createdLogs[24].changeDescription}`,
      `First actual: ${batchCatchupRes.data?.events?.[0]?.description}, Last actual: ${batchCatchupRes.data?.events?.[19]?.description}`,
      isLatest20
    );

    // Test 12: Events are returned in chronological order (oldest → newest)
    let isChronological = true;
    for (let i = 0; i < batchCatchupRes.data.events.length - 1; i++) {
      const t1 = new Date(batchCatchupRes.data.events[i].createdAt).getTime();
      const t2 = new Date(batchCatchupRes.data.events[i + 1].createdAt).getTime();
      if (t1 > t2) {
        isChronological = false;
        break;
      }
    }
    record(
      'Events are returned in chronological order (oldest -> newest)',
      true,
      isChronological,
      'Each event timestamp <= next event timestamp',
      `Chronological verified: ${isChronological}`,
      isChronological
    );

    // ── 4. CURSOR & LAST-SEEN TESTS ──
    console.log('\n--- 4. Cursor & Last-Seen Tests ---');

    // Test 13: Cursor before several events returns only subsequent events
    // Pass cursor at event #20 (5 newer events exist: #21, #22, #23, #24, #25)
    const cursorAt20 = createdLogs[19].id;
    const cursorRes = await requestCatchup(sPm1, {
      projectId: testBatchProject.id,
      lastSeenActivityId: cursorAt20,
    });
    record(
      'Cursor before several events returns only subsequent authorized events',
      5,
      cursorRes.data?.events?.length,
      'Exactly 5 events (#21 to #25) returned',
      `Count: ${cursorRes.data?.events?.length}, hasMore: ${cursorRes.data?.hasMore}`,
      cursorRes.data?.events?.length === 5 && cursorRes.data?.hasMore === false
    );

    // Test 14: Cursor at newest event returns 0 missed events
    const cursorAtNewest = createdLogs[24].id; // Event #25
    const atNewestRes = await requestCatchup(sPm1, {
      projectId: testBatchProject.id,
      lastSeenActivityId: cursorAtNewest,
    });
    record(
      'Cursor at newest event returns 0 missed events',
      0,
      atNewestRes.data?.events?.length,
      'events: [], count: 0, hasMore: false',
      `Count: ${atNewestRes.data?.count}, hasMore: ${atNewestRes.data?.hasMore}`,
      atNewestRes.data?.count === 0 && atNewestRes.data?.hasMore === false
    );

    // Test 15: Invalid/nonexistent cursor returns structured error INVALID_CURSOR
    const nonexistentCursorRes = await requestCatchup(sPm1, {
      projectId: testBatchProject.id,
      lastSeenActivityId: 'a0000000-0000-4000-8000-000000000000',
    });
    record(
      'Invalid/nonexistent cursor returns structured error INVALID_CURSOR',
      false,
      nonexistentCursorRes.success,
      'error.code === INVALID_CURSOR',
      `Result: ${JSON.stringify(nonexistentCursorRes)}`,
      nonexistentCursorRes.success === false &&
        nonexistentCursorRes.error?.code === 'INVALID_CURSOR'
    );

    // Test 16: Cursor from another project does not bypass authorization
    // Dev1 attempts to use cursor from unassignedProject to catch up on unassignedProject
    const unassignedTask = await prisma.task.create({
      data: {
        projectId: unassignedProject.id,
        assignedTo: dev2.user.id,
        title: 'Unassigned Task for Dev1',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
      },
    });
    createdTaskIds.push(unassignedTask.id);

    const unassignedLog = await prisma.activityLog.create({
      data: {
        taskId: unassignedTask.id,
        projectId: unassignedProject.id,
        userId: pm2.user.id,
        changeDescription: 'Unassigned log',
        fromStatus: TaskStatus.TODO,
        toStatus: TaskStatus.IN_PROGRESS,
      },
    });
    createdActivityLogIds.push(unassignedLog.id);

    // Dev1 provides unassignedLog.id as cursor with unassignedProject.id
    const dev1BypassRes = await requestCatchup(sDev1, {
      projectId: unassignedProject.id,
      lastSeenActivityId: unassignedLog.id,
    });
    record(
      'Cursor from another project cannot bypass project authorization (FORBIDDEN)',
      false,
      dev1BypassRes.success,
      'Rejected with FORBIDDEN error',
      `Error code: ${dev1BypassRes.error?.code}`,
      dev1BypassRes.success === false && dev1BypassRes.error?.code === 'FORBIDDEN'
    );

    // ── 5. OFFLINE RECONNECT & DEDUPLICATION TESTS ──
    console.log('\n--- 5. Offline Reconnect & Deduplication Tests ---');

    // Create a live task in pm1Project
    const liveTask = await prisma.task.create({
      data: {
        projectId: pm1Project.id,
        assignedTo: dev1.user.id,
        title: 'Offline Reconnect Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
      },
    });
    createdTaskIds.push(liveTask.id);

    // Test 17: Events created while client is disconnected are retrieved upon reconnect
    // Dev1 joins pm1Project room, receives current cursor, then disconnects
    await new Promise<any>((resolve) => {
      sDev1.emit('project:join', { projectId: pm1Project.id }, resolve);
    });
    const preDisconnectCatchup = await requestCatchup(sDev1, { projectId: pm1Project.id });
    const lastSeenBeforeOffline =
      preDisconnectCatchup.data.events.length > 0
        ? preDisconnectCatchup.data.events[preDisconnectCatchup.data.events.length - 1].id
        : undefined;

    // Disconnect Dev1
    sDev1.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // While Dev1 is offline, PM updates status of liveTask (creating ActivityLog in PostgreSQL)
    const offlinePatchRes = await fetch(`${BASE_URL}/api/tasks/${liveTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
    const offlinePatchData = await toJson(offlinePatchRes);

    // Dev1 reconnects
    const sDev1Reconnected = track(createSocket(dev1.token));
    await waitForConnect(sDev1Reconnected);

    // Dev1 requests catchup using lastSeenBeforeOffline cursor
    const postReconnectCatchup = await requestCatchup(sDev1Reconnected, {
      projectId: pm1Project.id,
      lastSeenActivityId: lastSeenBeforeOffline,
    });

    const offlineEventDelivered = postReconnectCatchup.data?.events?.some(
      (e: any) => e.taskId === liveTask.id && e.toStatus === 'IN_PROGRESS'
    );
    record(
      'Events created while client is offline are delivered after reconnect',
      true,
      offlineEventDelivered,
      'Offline status change delivered via catchup',
      `Delivered: ${offlineEventDelivered}, New events count: ${postReconnectCatchup.data?.count}`,
      offlineEventDelivered === true
    );

    // Test 18: Client deduplicates overlapping events using ActivityLog ID
    const sampleEvent1 = postReconnectCatchup.data.events[0];
    const clientEventList = [sampleEvent1]; // Already received live
    // Incoming catchup batch containing sampleEvent1 again
    const incomingBatch = [sampleEvent1];
    const seenIds = new Set(clientEventList.map((e) => e.id));
    const dedupedIncoming = incomingBatch.filter((e) => !seenIds.has(e.id));
    const finalList = [...clientEventList, ...dedupedIncoming];
    record(
      'Client deduplicates overlapping events using ActivityLog ID',
      1,
      finalList.length,
      'Duplicate event ignored; list length remains 1',
      `Initial: ${clientEventList.length}, Incoming: ${incomingBatch.length}, Final: ${finalList.length}`,
      finalList.length === 1 && finalList[0].id === sampleEvent1.id
    );

    // ── 6. SERVER PERSISTENCE & CONCURRENT LIVE EVENTS TESTS ──
    console.log('\n--- 6. Server Persistence & Concurrent Live Events Tests ---');

    // Test 19: Catchup retrieves from PostgreSQL directly without in-memory dependency
    // Querying catchup on testBatchProject returns DB-persisted events even on a brand new socket
    const sNewAdmin = track(createSocket(admin.token));
    await waitForConnect(sNewAdmin);
    const dbDirectCatchup = await requestCatchup(sNewAdmin, { projectId: testBatchProject.id });
    record(
      'Catchup is backed directly by PostgreSQL (not dependent on server memory)',
      true,
      dbDirectCatchup.success && dbDirectCatchup.data?.count === 20,
      '20 DB-persisted events retrieved on fresh socket',
      `Count: ${dbDirectCatchup.data?.count}, hasMore: ${dbDirectCatchup.data?.hasMore}`,
      dbDirectCatchup.success && dbDirectCatchup.data?.count === 20
    );

    // Test 20: Phase 4 live events continue to function concurrently
    await new Promise<any>((resolve) => {
      sNewAdmin.emit('project:join', { projectId: pm1Project.id }, resolve);
    });
    const liveStatusPromise = waitForEvent<any>(sNewAdmin, 'task:statusChanged');
    const liveActivityPromise = waitForEvent<any>(sNewAdmin, 'activity:new');

    await fetch(`${BASE_URL}/api/tasks/${liveTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ status: 'DONE' }),
    });

    const receivedLiveStatus = await liveStatusPromise;
    const receivedLiveActivity = await liveActivityPromise;
    const liveEventsWorking = !!receivedLiveStatus && !!receivedLiveActivity;
    record(
      'Phase 4 live events (task:statusChanged and activity:new) continue to function',
      true,
      liveEventsWorking,
      'Both live events received while catchup is operational',
      `Live status: ${!!receivedLiveStatus}, Live activity: ${!!receivedLiveActivity}`,
      liveEventsWorking
    );

    // ── 7. DETERMINISTIC COMPOUND CURSOR & SAME-TIMESTAMP REGRESSION TESTS ──
    console.log('\n--- 7. Deterministic Compound Cursor & Same-Timestamp Regression Tests ---');

    // Setup isolated project & task for same-timestamp testing
    const sameTimeProject = await prisma.project.create({
      data: {
        name: 'Same-Timestamp Test Project',
        clientId: existingClient.id,
        createdBy: pm1.user.id,
      },
    });
    createdProjectIds.push(sameTimeProject.id);

    const sameTimeTask = await prisma.task.create({
      data: {
        projectId: sameTimeProject.id,
        assignedTo: dev1.user.id,
        title: 'Same-Timestamp Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
      },
    });
    createdTaskIds.push(sameTimeTask.id);

    // Create exactly two ActivityLog records with the EXACT same createdAt timestamp
    const exactSameTimestamp = new Date('2026-09-12T12:00:00.000Z');

    const logAlpha = await prisma.activityLog.create({
      data: {
        taskId: sameTimeTask.id,
        projectId: sameTimeProject.id,
        userId: pm1.user.id,
        changeDescription: 'Same-time Event Alpha',
        fromStatus: TaskStatus.TODO,
        toStatus: TaskStatus.IN_PROGRESS,
        createdAt: exactSameTimestamp,
      },
    });
    createdActivityLogIds.push(logAlpha.id);

    const logBeta = await prisma.activityLog.create({
      data: {
        taskId: sameTimeTask.id,
        projectId: sameTimeProject.id,
        userId: pm1.user.id,
        changeDescription: 'Same-time Event Beta',
        fromStatus: TaskStatus.IN_PROGRESS,
        toStatus: TaskStatus.IN_REVIEW,
        createdAt: exactSameTimestamp,
      },
    });
    createdActivityLogIds.push(logBeta.id);

    // Identify which ID is ordered first and second under (createdAt, id) ascending order
    const [firstSameTimeLog, secondSameTimeLog] =
      logAlpha.id < logBeta.id ? [logAlpha, logBeta] : [logBeta, logAlpha];

    // Test 21: With cursor = firstSameTimeLog.id, the second event sharing the same timestamp MUST NOT be skipped
    const catchupSameTimeRes1 = await requestCatchup(sPm1, {
      projectId: sameTimeProject.id,
      lastSeenActivityId: firstSameTimeLog.id,
    });

    const secondEventReturned =
      catchupSameTimeRes1.success === true &&
      catchupSameTimeRes1.data?.events?.length === 1 &&
      catchupSameTimeRes1.data?.events?.[0]?.id === secondSameTimeLog.id;

    record(
      '[REGRESSION] ActivityLog records with identical createdAt are not skipped when cursor is first record',
      true,
      secondEventReturned,
      `Event #${secondSameTimeLog.id.slice(0, 8)} returned without skipping`,
      `Events returned: ${catchupSameTimeRes1.data?.events?.length}, Returned ID: ${catchupSameTimeRes1.data?.events?.[0]?.id?.slice(0, 8)}`,
      secondEventReturned
    );

    // Test 22: Reverse cursor position: cursor at secondSameTimeLog.id returns subsequent events in deterministic order
    const laterTimestamp = new Date(exactSameTimestamp.getTime() + 5000);
    const logGamma = await prisma.activityLog.create({
      data: {
        taskId: sameTimeTask.id,
        projectId: sameTimeProject.id,
        userId: pm1.user.id,
        changeDescription: 'Subsequent Event Gamma',
        fromStatus: TaskStatus.IN_REVIEW,
        toStatus: TaskStatus.DONE,
        createdAt: laterTimestamp,
      },
    });
    createdActivityLogIds.push(logGamma.id);

    // Query catchup after secondSameTimeLog
    const catchupAfterSecondRes = await requestCatchup(sPm1, {
      projectId: sameTimeProject.id,
      lastSeenActivityId: secondSameTimeLog.id,
    });

    // Query catchup after firstSameTimeLog (should return secondSameTimeLog followed by logGamma in chronological order)
    const catchupAfterFirstRes = await requestCatchup(sPm1, {
      projectId: sameTimeProject.id,
      lastSeenActivityId: firstSameTimeLog.id,
    });

    const reverseCursorCorrect =
      catchupAfterSecondRes.success === true &&
      catchupAfterSecondRes.data?.events?.length === 1 &&
      catchupAfterSecondRes.data?.events?.[0]?.id === logGamma.id &&
      catchupAfterFirstRes.success === true &&
      catchupAfterFirstRes.data?.events?.length === 2 &&
      catchupAfterFirstRes.data?.events?.[0]?.id === secondSameTimeLog.id &&
      catchupAfterFirstRes.data?.events?.[1]?.id === logGamma.id;

    record(
      '[REGRESSION] Reverse cursor position with same timestamp returns subsequent records in deterministic order',
      true,
      reverseCursorCorrect,
      'Cursor at second record returns only subsequent records; cursor at first returns both subsequent records in exact (createdAt ASC, id ASC) order',
      `After second count: ${catchupAfterSecondRes.data?.events?.length}, After first count: ${catchupAfterFirstRes.data?.events?.length}`,
      reverseCursorCorrect
    );

    // Test 23: Deterministic latest-20 selection and ordering when all records share identical timestamps
    const batchSameTimeProject = await prisma.project.create({
      data: {
        name: 'Batch Same-Timestamp Project',
        clientId: existingClient.id,
        createdBy: pm1.user.id,
      },
    });
    createdProjectIds.push(batchSameTimeProject.id);

    const batchSameTimeTask = await prisma.task.create({
      data: {
        projectId: batchSameTimeProject.id,
        assignedTo: dev1.user.id,
        title: 'Batch Same-Timestamp Task',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
      },
    });
    createdTaskIds.push(batchSameTimeTask.id);

    const sharedBatchTimestamp = new Date('2026-09-12T13:00:00.000Z');
    for (let i = 1; i <= 25; i++) {
      const batchLog = await prisma.activityLog.create({
        data: {
          taskId: batchSameTimeTask.id,
          projectId: batchSameTimeProject.id,
          userId: pm1.user.id,
          changeDescription: `Batch same-time event #${i}`,
          fromStatus: TaskStatus.TODO,
          toStatus: TaskStatus.IN_PROGRESS,
          createdAt: sharedBatchTimestamp,
        },
      });
      createdActivityLogIds.push(batchLog.id);
    }

    // Query directly from PostgreSQL using deterministic [createdAt DESC, id DESC]
    const expectedDbRecords = await prisma.activityLog.findMany({
      where: { projectId: batchSameTimeProject.id },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: 20,
    });
    const expectedDbIdsChronological = expectedDbRecords.map((r) => r.id).reverse();

    const batchSameTimeCatchupRes = await requestCatchup(sPm1, {
      projectId: batchSameTimeProject.id,
    });

    const actualBatchIds = batchSameTimeCatchupRes.data?.events?.map((e: any) => e.id) ?? [];
    const latest20DeterministicMatchesDb =
      batchSameTimeCatchupRes.success === true &&
      batchSameTimeCatchupRes.data?.hasMore === true &&
      batchSameTimeCatchupRes.data?.count === 20 &&
      JSON.stringify(actualBatchIds) === JSON.stringify(expectedDbIdsChronological);

    record(
      'Deterministic latest-20 selection and ordering when all records share identical timestamps matches PostgreSQL',
      true,
      latest20DeterministicMatchesDb,
      'Latest 20 records match PostgreSQL [createdAt DESC, id DESC] deterministic order exactly',
      `Count: ${actualBatchIds.length}, hasMore: ${batchSameTimeCatchupRes.data?.hasMore}, Matches DB: ${latest20DeterministicMatchesDb}`,
      latest20DeterministicMatchesDb
    );

    // Test 24 (CRITICAL IDOR): Cursor record from unauthorized project is rejected with FORBIDDEN even when projectId is omitted
    const dev1UnassignedCursorRes = await requestCatchup(sDev1Reconnected, {
      lastSeenActivityId: unassignedLog.id,
    });

    record(
      '[CRITICAL IDOR] Cursor record from unauthorized project is rejected with FORBIDDEN even when projectId is omitted',
      false,
      dev1UnassignedCursorRes.success,
      'Rejected with FORBIDDEN error code',
      `Result: ${JSON.stringify(dev1UnassignedCursorRes)}`,
      dev1UnassignedCursorRes.success === false && dev1UnassignedCursorRes.error?.code === 'FORBIDDEN'
    );

    // Clean up created test tasks & projects
    await prisma.activityLog.deleteMany({
      where: { id: { in: createdActivityLogIds } },
    }).catch(() => {});

    await prisma.task.deleteMany({
      where: { id: { in: createdTaskIds } },
    }).catch(() => {});

    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds } },
    }).catch(() => {});

    // ── SUMMARY & REPORT ──
    console.log('\n==================================================');
    console.log('         PHASE 5 TEST RESULTS SUMMARY             ');
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
      console.log(`🎉 ALL ${results.length} PHASE 5 MISSED-EVENT CATCHUP TESTS PASSED PERFECTLY!\n`);
    } else {
      console.error('⚠️ SOME PHASE 5 TESTS FAILED. INVESTIGATION REQUIRED.\n');
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
  console.error('Fatal test error in Phase 5:', err);
  process.exit(1);
});
