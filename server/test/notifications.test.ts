import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import app, { initSocketServer } from '../src/index';
import prisma from '../src/lib/prisma';
import { TaskStatus, TaskPriority } from '@prisma/client';

const PORT = 4094;
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

async function runTests() {
  console.log('🚀 Starting Phase 7 In-App Notifications Test Suite...\n');

  // Start isolated HTTP + Socket.IO server on port 4094
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Phase 7 Test server running on port ${PORT}\n`);
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
  const createdNotificationIds: string[] = [];

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

    // Create a dedicated test project owned by PM1
    const testProject = await prisma.project.create({
      data: {
        name: 'Phase 7 Notification Project',
        clientId: existingClient.id,
        createdBy: pm1.user.id,
      },
    });
    createdProjectIds.push(testProject.id);

    console.log('--- 1. Notification Creation & Business Rules Tests ---');

    // Setup sockets for PM1 and Dev1 to verify real-time delivery
    const sPm1 = track(createSocket(pm1.token));
    const sDev1 = track(createSocket(dev1.token));
    const sDev2 = track(createSocket(dev2.token));

    await Promise.all([waitForConnect(sPm1), waitForConnect(sDev1), waitForConnect(sDev2)]);

    // Test 8: Assignment creates developer notification (when creating task assigned to dev1)
    const dev1NotifPromise = waitForEvent<any>(sDev1, 'notification:new');
    const dev1UnreadPromise = waitForEvent<any>(sDev1, 'notification:unreadCount');
    const dev2ShouldNotReceivePromise = waitForEvent<any>(sDev2, 'notification:new', 1000);

    const createTaskRes = await fetch(`${BASE_URL}/api/projects/${testProject.id}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({
        title: 'Notification Assignment Task',
        description: 'Testing assignment notification',
        assignedTo: dev1.user.id,
        priority: TaskPriority.HIGH,
      }),
    });
    const createTaskData = await toJson(createTaskRes);
    const createdTask = createTaskData.data?.task;
    if (createdTask) createdTaskIds.push(createdTask.id);

    const receivedDev1Notif = await dev1NotifPromise;
    const receivedDev1Unread = await dev1UnreadPromise;
    const receivedDev2Notif = await dev2ShouldNotReceivePromise;

    // Verify in database
    const dbAssignmentNotif = await prisma.notification.findFirst({
      where: {
        userId: dev1.user.id,
        relatedTaskId: createdTask?.id,
        type: 'TASK_ASSIGNED',
      },
    });
    if (dbAssignmentNotif) createdNotificationIds.push(dbAssignmentNotif.id);

    record(
      'Assignment creates developer notification',
      true,
      !!dbAssignmentNotif && dbAssignmentNotif.type === 'TASK_ASSIGNED',
      'TASK_ASSIGNED notification created in DB for dev1',
      `Type: ${dbAssignmentNotif?.type}, Message: ${dbAssignmentNotif?.message}`,
      !!dbAssignmentNotif
    );

    // Test 14: Notification is persisted in PostgreSQL
    record(
      'Notification is persisted in PostgreSQL',
      true,
      !!dbAssignmentNotif && typeof dbAssignmentNotif.id === 'string',
      'Record exists in PostgreSQL notifications table',
      `Notification ID: ${dbAssignmentNotif?.id}`,
      !!dbAssignmentNotif
    );

    // Test 15: Notification is emitted only to intended user socket room
    record(
      "Notification is emitted only to intended user's socket room (user:<userId>)",
      true,
      receivedDev1Notif !== null && receivedDev2Notif === null,
      'Dev1 received event, Dev2 did not receive event',
      `Dev1 received: ${receivedDev1Notif !== null}, Dev2 received: ${receivedDev2Notif !== null}`,
      receivedDev1Notif !== null && receivedDev2Notif === null
    );

    // Test 16: notification:new payload is safe
    const isPayloadSafe =
      receivedDev1Notif &&
      receivedDev1Notif.id &&
      receivedDev1Notif.type &&
      receivedDev1Notif.message &&
      receivedDev1Notif.passwordHash === undefined &&
      receivedDev1Notif.token === undefined;
    record(
      'notification:new payload is safe (no passwordHash or secrets)',
      true,
      isPayloadSafe,
      'Safe notification payload received',
      `Payload keys: ${Object.keys(receivedDev1Notif || {}).join(', ')}`,
      isPayloadSafe
    );

    // Test 17: unreadCount event is emitted after notification creation
    record(
      'notification:unreadCount event is emitted after notification creation',
      true,
      receivedDev1Unread !== null && typeof receivedDev1Unread.unreadCount === 'number',
      'unreadCount event received with numerical count',
      `Unread count: ${receivedDev1Unread?.unreadCount}`,
      receivedDev1Unread !== null && receivedDev1Unread.unreadCount > 0
    );

    // Test 9: Reassigning to a different developer creates the correct new notification
    const dev2NotifPromise = waitForEvent<any>(sDev2, 'notification:new');
    const patchReassignRes = await fetch(`${BASE_URL}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ assignedTo: dev2.user.id }),
    });
    const patchReassignData = await toJson(patchReassignRes);

    const receivedDev2ReassignNotif = await dev2NotifPromise;
    const dbDev2Notif = await prisma.notification.findFirst({
      where: {
        userId: dev2.user.id,
        relatedTaskId: createdTask.id,
        type: 'TASK_ASSIGNED',
      },
    });
    if (dbDev2Notif) createdNotificationIds.push(dbDev2Notif.id);

    record(
      'Reassigning to a different developer creates the correct new notification',
      true,
      !!dbDev2Notif && receivedDev2ReassignNotif !== null,
      'Notification created in DB and received via socket by Dev2',
      `Dev2 Notif ID: ${dbDev2Notif?.id}, Socket received: ${receivedDev2ReassignNotif !== null}`,
      !!dbDev2Notif && receivedDev2ReassignNotif !== null
    );

    // Test 10: Updating unrelated task fields does not create assignment notification
    const dev2UnrelatedNotifPromise = waitForEvent<any>(sDev2, 'notification:new', 1000);
    await fetch(`${BASE_URL}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ priority: TaskPriority.CRITICAL, description: 'Updated description' }),
    });
    const receivedDev2Unrelated = await dev2UnrelatedNotifPromise;
    record(
      'Updating unrelated task fields does not create assignment notification',
      null,
      receivedDev2Unrelated,
      'No notification emitted for unrelated field update',
      `Event received: ${receivedDev2Unrelated !== null}`,
      receivedDev2Unrelated === null
    );

    // Test 11: Changing status to IN_REVIEW creates PM notification
    const pm1InReviewNotifPromise = waitForEvent<any>(sPm1, 'notification:new');
    const patchInReviewRes = await fetch(`${BASE_URL}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2.token}`,
      },
      body: JSON.stringify({ status: TaskStatus.IN_REVIEW }),
    });
    const patchInReviewData = await toJson(patchInReviewRes);

    const receivedPm1Notif = await pm1InReviewNotifPromise;
    const dbInReviewNotif = await prisma.notification.findFirst({
      where: {
        userId: pm1.user.id,
        relatedTaskId: createdTask.id,
        type: 'TASK_IN_REVIEW',
      },
    });
    if (dbInReviewNotif) createdNotificationIds.push(dbInReviewNotif.id);

    record(
      'Changing status to IN_REVIEW creates PM notification',
      true,
      !!dbInReviewNotif && receivedPm1Notif !== null,
      'TASK_IN_REVIEW notification created in DB and delivered via socket to PM1',
      `PM1 Notif ID: ${dbInReviewNotif?.id}, Type: ${dbInReviewNotif?.type}`,
      !!dbInReviewNotif && receivedPm1Notif !== null
    );

    // Test 12: Updating an already-IN_REVIEW task does not duplicate notification
    const pm1DuplicateNotifPromise = waitForEvent<any>(sPm1, 'notification:new', 1000);
    await fetch(`${BASE_URL}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pm1.token}`,
      },
      body: JSON.stringify({ title: 'New title while already IN_REVIEW' }),
    });
    const receivedDuplicateNotif = await pm1DuplicateNotifPromise;
    record(
      'Updating an already-IN_REVIEW task does not duplicate notification',
      null,
      receivedDuplicateNotif,
      'No duplicate notification emitted',
      `Received duplicate: ${receivedDuplicateNotif !== null}`,
      receivedDuplicateNotif === null
    );

    // Test 13: Status changes to other statuses do not create IN_REVIEW notification
    const pm1DoneNotifPromise = waitForEvent<any>(sPm1, 'notification:new', 1000);
    await fetch(`${BASE_URL}/api/tasks/${createdTask.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${dev2.token}`,
      },
      body: JSON.stringify({ status: TaskStatus.DONE }),
    });
    const receivedDoneNotif = await pm1DoneNotifPromise;
    record(
      'Status changes to other statuses (e.g. DONE) do not create IN_REVIEW notification',
      null,
      receivedDoneNotif,
      'No notification emitted for DONE transition',
      `Received: ${receivedDoneNotif !== null}`,
      receivedDoneNotif === null
    );

    console.log('\n--- 2. REST API & Authorization / IDOR Tests ---');

    // Test 1: Authenticated user can list own notifications
    const listDev1Res = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const listDev1Data = await toJson(listDev1Res);
    const dev1Notifs = listDev1Data.data?.notifications;
    record(
      'Authenticated user can list own notifications',
      200,
      listDev1Res.status,
      'status: 200 with notification array',
      `Count: ${dev1Notifs?.length}, Total: ${listDev1Data.data?.totalCount}`,
      listDev1Res.status === 200 && Array.isArray(dev1Notifs)
    );

    // Test 2: User cannot list another user's notifications
    const dev1OwnsAllReturned = dev1Notifs?.every((n: any) => n.userId === dev1.user.id);
    record(
      "User cannot list another user's notifications (strict user boundary)",
      true,
      dev1OwnsAllReturned,
      'All returned notifications have userId === dev1.user.id',
      `All owned by dev1: ${dev1OwnsAllReturned}`,
      dev1OwnsAllReturned === true
    );

    // Test 3: Unread count is scoped to authenticated user
    const unreadDev1Res = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const unreadDev1Data = await toJson(unreadDev1Res);
    const dbExpectedDev1Unread = await prisma.notification.count({
      where: { userId: dev1.user.id, isRead: false },
    });
    record(
      'Unread count is scoped strictly to authenticated user',
      dbExpectedDev1Unread,
      unreadDev1Data.data?.unreadCount,
      'Matches PostgreSQL unread count for dev1',
      `Actual: ${unreadDev1Data.data?.unreadCount}, Expected: ${dbExpectedDev1Unread}`,
      unreadDev1Data.data?.unreadCount === dbExpectedDev1Unread
    );

    // Test 4: User can mark own notification as read
    const targetDev1NotifId = dev1Notifs[0]?.id;
    const markReadPromise = waitForEvent<any>(sDev1, 'notification:unreadCount');
    const markReadRes = await fetch(`${BASE_URL}/api/notifications/${targetDev1NotifId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const markReadData = await toJson(markReadRes);
    const unreadAfterMark = await markReadPromise;

    record(
      'User can mark own notification as read',
      true,
      markReadData.data?.notification?.isRead,
      'isRead: true returned and updated in PostgreSQL',
      `isRead: ${markReadData.data?.notification?.isRead}`,
      markReadData.data?.notification?.isRead === true
    );

    // Test 18: unreadCount decreases correctly after marking read
    record(
      'unreadCount decreases correctly after marking individual notification as read',
      true,
      unreadAfterMark !== null && unreadAfterMark.unreadCount === dbExpectedDev1Unread - 1,
      'unreadCount decremented by 1 in real-time Socket event',
      `Previous: ${dbExpectedDev1Unread}, New unreadCount: ${unreadAfterMark?.unreadCount}`,
      unreadAfterMark !== null && unreadAfterMark.unreadCount === dbExpectedDev1Unread - 1
    );

    // Test 5 [CRITICAL IDOR]: User cannot mark another user's notification as read
    const dev2TryMarkDev1Res = await fetch(`${BASE_URL}/api/notifications/${targetDev1NotifId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dev2.token}` },
    });
    record(
      "[CRITICAL IDOR] User cannot mark another user's notification as read (403 Forbidden)",
      403,
      dev2TryMarkDev1Res.status,
      'status: 403 Forbidden',
      `Actual status: ${dev2TryMarkDev1Res.status}`,
      dev2TryMarkDev1Res.status === 403
    );

    // Test 6: Marking already-read notification is safe/idempotent
    const repeatMarkReadRes = await fetch(`${BASE_URL}/api/notifications/${targetDev1NotifId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const repeatMarkReadData = await toJson(repeatMarkReadRes);
    record(
      'Marking already-read notification is safe/idempotent',
      200,
      repeatMarkReadRes.status,
      'status: 200 with isRead: true',
      `Status: ${repeatMarkReadRes.status}, isRead: ${repeatMarkReadData.data?.notification?.isRead}`,
      repeatMarkReadRes.status === 200 && repeatMarkReadData.data?.notification?.isRead === true
    );

    // Test 7 & 19: Mark-all affects only authenticated user's notifications and unreadCount becomes zero
    // First, create 2 more unread notifications for Dev1
    const extraNotif1 = await prisma.notification.create({
      data: {
        userId: dev1.user.id,
        type: 'TASK_ASSIGNED',
        message: 'Extra test notification 1',
        isRead: false,
      },
    });
    const extraNotif2 = await prisma.notification.create({
      data: {
        userId: dev1.user.id,
        type: 'TASK_ASSIGNED',
        message: 'Extra test notification 2',
        isRead: false,
      },
    });
    createdNotificationIds.push(extraNotif1.id, extraNotif2.id);

    // Also ensure Dev2 has an unread notification
    const dev2InitialUnread = await prisma.notification.count({
      where: { userId: dev2.user.id, isRead: false },
    });

    const readAllPromise = waitForEvent<any>(sDev1, 'notification:unreadCount');
    const markAllRes = await fetch(`${BASE_URL}/api/notifications/read-all`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const markAllData = await toJson(markAllRes);
    const unreadAfterReadAll = await readAllPromise;

    const dev2UnreadAfterDev1ReadAll = await prisma.notification.count({
      where: { userId: dev2.user.id, isRead: false },
    });

    record(
      "Mark-all affects only authenticated user's notifications (does not clear other users' unread)",
      true,
      dev2UnreadAfterDev1ReadAll === dev2InitialUnread,
      "Dev2 unread count remains unchanged after Dev1 marks all as read",
      `Dev2 count before: ${dev2InitialUnread}, after: ${dev2UnreadAfterDev1ReadAll}`,
      dev2UnreadAfterDev1ReadAll === dev2InitialUnread
    );

    // Test 19: unreadCount becomes zero after mark-all
    record(
      'unreadCount becomes zero after mark-all',
      0,
      unreadAfterReadAll?.unreadCount,
      'unreadCount === 0 in real-time Socket.IO event',
      `Socket unreadCount: ${unreadAfterReadAll?.unreadCount}`,
      unreadAfterReadAll?.unreadCount === 0
    );

    // Test 20: No polling/SSE implementation exists (pure Socket.IO architecture)
    const sseRes = await fetch(`${BASE_URL}/api/notifications/stream`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    record(
      'No polling or SSE implementation exists (pure Socket.IO realtime delivery)',
      404,
      sseRes.status,
      'SSE endpoint /api/notifications/stream returns 404 Not Found',
      `Actual status: ${sseRes.status}`,
      sseRes.status === 404
    );

    // Clean up created database records
    await prisma.notification.deleteMany({
      where: { id: { in: createdNotificationIds } },
    }).catch(() => {});

    await prisma.task.deleteMany({
      where: { id: { in: createdTaskIds } },
    }).catch(() => {});

    await prisma.project.deleteMany({
      where: { id: { in: createdProjectIds } },
    }).catch(() => {});

    // ── SUMMARY & REPORT ──
    console.log('\n==================================================');
    console.log('         PHASE 7 TEST RESULTS SUMMARY             ');
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
      console.log(`🎉 ALL ${results.length} PHASE 7 IN-APP NOTIFICATIONS TESTS PASSED PERFECTLY!\n`);
    } else {
      console.error('⚠️ SOME PHASE 7 TESTS FAILED. INVESTIGATION REQUIRED.\n');
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
  console.error('Fatal test error in Phase 7:', err);
  process.exit(1);
});
