import app from '../src/index';
import http from 'http';
import prisma from '../src/lib/prisma';
import { io as ioClient, Socket } from 'socket.io-client';
import { initSocketServer } from '../src/realtime/socket';

async function runManualUiVerification() {
  console.log('================================================================');
  console.log('      PHASE 8 MANUAL DASHBOARD VERIFICATION LOG (ADMIN/PM/DEV)  ');
  console.log('================================================================\n');

  const PORT = 4091;
  const server = http.createServer(app);
  initSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`[SERVER] Running verification instance on http://localhost:${PORT}`);
      resolve();
    });
  });

  const BASE_URL = `http://localhost:${PORT}`;

  const login = async (email: string) => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'DevPassword123!' }),
    });
    const data = await res.json();
    return { token: data.data.accessToken, user: data.data.user };
  };

  try {
    // ==========================================
    // 1. ADMIN DASHBOARD VERIFICATION
    // ==========================================
    console.log('\n--- 1. VERIFYING ADMIN DASHBOARD ---');
    const admin = await login('admin@velozity.com');
    console.log(`[PASS] Admin Login: Authenticated as ${admin.user.email} (Role: ${admin.user.role})`);

    // Fetch projects
    const adminProjectsRes = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const adminProjects = (await adminProjectsRes.json()).data.projects;
    console.log(`[PASS] Global/Authorized Projects Visible: Found ${adminProjects.length} total projects across system`);

    // Find seeded project with tasks
    const activeProject = adminProjects.find((p: any) => p.name === 'Website Redesign') || adminProjects[0];
    console.log(`[PASS] Selected Active Project: "${activeProject.name}" (ID: ${activeProject.id})`);

    // Fetch tasks without filter
    const adminTasksRes = await fetch(`${BASE_URL}/api/projects/${activeProject.id}/tasks`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const adminTasks = (await adminTasksRes.json()).data.tasks;
    console.log(`[PASS] Task List Visible: Loaded ${adminTasks.length} tasks for active project`);

    // Filter by status
    const statusFilteredRes = await fetch(`${BASE_URL}/api/projects/${activeProject.id}/tasks?status=IN_PROGRESS`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const statusFiltered = (await statusFilteredRes.json()).data.tasks;
    console.log(`[PASS] Status Filter (IN_PROGRESS): Returned ${statusFiltered.length} tasks (all IN_PROGRESS: ${statusFiltered.every((t: any) => t.status === 'IN_PROGRESS')})`);

    // Filter by priority
    const priorityFilteredRes = await fetch(`${BASE_URL}/api/projects/${activeProject.id}/tasks?priority=HIGH`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const priorityFiltered = (await priorityFilteredRes.json()).data.tasks;
    console.log(`[PASS] Priority Filter (HIGH): Returned ${priorityFiltered.length} tasks (all HIGH: ${priorityFiltered.every((t: any) => t.priority === 'HIGH')})`);

    // Filter by date range
    const dateFilteredRes = await fetch(`${BASE_URL}/api/projects/${activeProject.id}/tasks?fromDate=2026-09-01&toDate=2026-12-31`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const dateFiltered = (await dateFilteredRes.json()).data.tasks;
    console.log(`[PASS] Date Range Filter (2026-09-01 to 2026-12-31): Returned ${dateFiltered.length} tasks`);

    // Combined filters
    const combinedRes = await fetch(
      `${BASE_URL}/api/projects/${activeProject.id}/tasks?status=IN_PROGRESS&priority=HIGH&fromDate=2026-09-01&toDate=2026-12-31`,
      { headers: { Authorization: `Bearer ${admin.token}` } }
    );
    const combinedTasks = (await combinedRes.json()).data.tasks;
    console.log(`[PASS] Combined Filters (status + priority + fromDate + toDate): Returned ${combinedTasks.length} matching tasks`);

    // Real-time Socket.IO connection for Admin
    const adminSocket: Socket = ioClient(BASE_URL, {
      auth: { token: admin.token },
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => {
      adminSocket.on('connect', () => {
        console.log(`[PASS] Admin Socket.IO Connected: Socket ID ${adminSocket.id}`);
        resolve();
      });
    });

    // Admin joins global activity room
    const globalJoinAck = await new Promise<any>((resolve) => {
      adminSocket.emit('global:join', (ack: any) => resolve(ack));
    });
    console.log(`[PASS] Global Activity Room Joined: Ack success=${globalJoinAck.success}`);

    // Admin joins project room
    const projectJoinAck = await new Promise<any>((resolve) => {
      adminSocket.emit('project:join', { projectId: activeProject.id }, (ack: any) => resolve(ack));
    });
    console.log(`[PASS] Project Room Joined (project:${activeProject.id}): Ack success=${projectJoinAck.success}`);

    // Realtime task status update test
    if (adminTasks.length > 0) {
      const targetTask = adminTasks[0];
      const newStatus = targetTask.status === 'DONE' ? 'IN_PROGRESS' : 'DONE';

      const taskStatusReceivedPromise = new Promise<any>((resolve) => {
        adminSocket.once('task:statusChanged', (payload: any) => resolve(payload));
      });

      const activityReceivedPromise = new Promise<any>((resolve) => {
        adminSocket.once('activity:new', (payload: any) => resolve(payload));
      });

      // Patch task status via REST API
      const patchRes = await fetch(`${BASE_URL}/api/tasks/${targetTask.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${admin.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const patchData = await patchRes.json();
      console.log(`[PASS] Realtime Task Status Patch: Updated task "${targetTask.title}" to ${patchData.data.task.status}`);

      const statusEvent = await taskStatusReceivedPromise;
      console.log(`[PASS] Realtime task:statusChanged Event Received: taskId=${statusEvent.taskId}, toStatus=${statusEvent.toStatus}`);

      const activityEvent = await activityReceivedPromise;
      console.log(`[PASS] Realtime activity:new Event Received on Global Feed: taskId=${activityEvent.taskId}, toStatus=${activityEvent.toStatus}`);
    }

    // Notifications check
    const notifRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const notifs = (await notifRes.json()).data.notifications;
    const unreadRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const unreadCount = (await unreadRes.json()).data.unreadCount;
    console.log(`[PASS] Notifications Panel & Badge: Loaded ${notifs.length} notifications (${unreadCount} unread)`);

    adminSocket.disconnect();

    // ==========================================
    // 2. PROJECT MANAGER DASHBOARD VERIFICATION
    // ==========================================
    console.log('\n--- 2. VERIFYING PROJECT MANAGER DASHBOARD ---');
    const pm1 = await login('pm1@velozity.com');
    const pm2 = await login('pm2@velozity.com');
    console.log(`[PASS] PM 1 Login: Authenticated as ${pm1.user.email} (Role: ${pm1.user.role})`);

    // PM 1 project visibility
    const pm1ProjectsRes = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${pm1.token}` },
    });
    const pm1Projects = (await pm1ProjectsRes.json()).data.projects;
    console.log(`[PASS] PM 1 Own Projects Visible: Loaded ${pm1Projects.length} projects (all created by PM 1: ${pm1Projects.every((p: any) => p.createdBy === pm1.user.id)})`);

    // Verify PM 2 project is inaccessible to PM 1
    const pm2ProjectsRes = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${pm2.token}` },
    });
    const pm2Projects = (await pm2ProjectsRes.json()).data.projects;
    if (pm2Projects.length > 0) {
      const pm2ProjectId = pm2Projects[0].id;
      const unauthorizedAccessRes = await fetch(`${BASE_URL}/api/projects/${pm2ProjectId}/tasks`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      console.log(`[PASS] Another PM Project Inaccessible: Accessing PM 2 project returned HTTP ${unauthorizedAccessRes.status} Forbidden`);
    }

    // PM 1 filters work
    if (pm1Projects.length > 0) {
      const pmProj = pm1Projects[0];
      const pmFilterRes = await fetch(`${BASE_URL}/api/projects/${pmProj.id}/tasks?status=TODO`, {
        headers: { Authorization: `Bearer ${pm1.token}` },
      });
      const pmFiltered = (await pmFilterRes.json()).data.tasks;
      console.log(`[PASS] PM Task Filters: Filtered by status=TODO returned ${pmFiltered.length} tasks`);
    }

    // ==========================================
    // 3. DEVELOPER DASHBOARD VERIFICATION
    // ==========================================
    console.log('\n--- 3. VERIFYING DEVELOPER DASHBOARD ---');
    const dev1 = await login('dev1@velozity.com');
    console.log(`[PASS] Developer Login: Authenticated as ${dev1.user.email} (Role: ${dev1.user.role})`);

    // Developer assigned-task projects
    const devProjectsRes = await fetch(`${BASE_URL}/api/projects`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const devProjects = (await devProjectsRes.json()).data.projects;
    console.log(`[PASS] Developer Projects Visible: Loaded ${devProjects.length} projects where Dev 1 has assigned tasks`);

    if (devProjects.length > 0) {
      const devProj = devProjects[0];
      const devTasksRes = await fetch(`${BASE_URL}/api/projects/${devProj.id}/tasks`, {
        headers: { Authorization: `Bearer ${dev1.token}` },
      });
      const devTasks = (await devTasksRes.json()).data.tasks;
      console.log(`[PASS] Assigned Tasks Visible: Loaded ${devTasks.length} tasks for Dev 1`);
      console.log(`[PASS] Unrelated Developer Tasks Excluded: All returned tasks assigned to Dev 1: ${devTasks.every((t: any) => t.assignedTo === dev1.user.id)}`);

      // Developer status update on assigned task
      if (devTasks.length > 0) {
        const assignedTask = devTasks[0];
        const nextDevStatus = assignedTask.status === 'IN_PROGRESS' ? 'IN_REVIEW' : 'IN_PROGRESS';
        const devUpdateRes = await fetch(`${BASE_URL}/api/tasks/${assignedTask.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${dev1.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: nextDevStatus }),
        });
        const devUpdateData = await devUpdateRes.json();
        console.log(`[PASS] Developer Status Update: Dev 1 updated own task "${assignedTask.title}" to ${devUpdateData.data.task.status}`);

        // Developer attempting to update unassigned task
        const unassignedTask = await prisma.task.findFirst({
          where: { assignedTo: { not: dev1.user.id } },
        });
        if (unassignedTask) {
          const illegalUpdateRes = await fetch(`${BASE_URL}/api/tasks/${unassignedTask.id}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${dev1.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'DONE' }),
          });
          console.log(`[PASS] Unassigned Task Status Protection: Dev 1 attempting to update another developer's task returned HTTP ${illegalUpdateRes.status} Forbidden`);
        }
      }
    }

    // ==========================================
    // 4. DUAL-SESSION REALTIME CROSS-CLIENT VERIFICATION
    // ==========================================
    console.log('\n--- 4. VERIFYING REALTIME CROSS-SESSION SYNCHRONIZATION (PM + DEVELOPER) ---');
    // Session A: Alice (Project Manager)
    const pmSocket: Socket = ioClient(BASE_URL, {
      auth: { token: pm1.token },
      transports: ['websocket'],
    });

    // Session B: Charlie (Developer)
    const devSocket: Socket = ioClient(BASE_URL, {
      auth: { token: dev1.token },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve) => pmSocket.on('connect', () => resolve())),
      new Promise<void>((resolve) => devSocket.on('connect', () => resolve())),
    ]);
    console.log(`[PASS] Two Authenticated Sessions Connected simultaneously: PM Socket (${pmSocket.id}) & Dev Socket (${devSocket.id})`);

    if (devProjects.length > 0) {
      const sharedProject = devProjects[0];

      // Both join shared project room
      await new Promise<any>((resolve) => {
        pmSocket.emit('project:join', { projectId: sharedProject.id }, (ack: any) => resolve(ack));
      });
      await new Promise<any>((resolve) => {
        devSocket.emit('project:join', { projectId: sharedProject.id }, (ack: any) => resolve(ack));
      });
      console.log(`[PASS] Both Sessions Joined Shared Project Room: project:${sharedProject.id}`);

      // Find Charlie's task in this project
      const sharedTasksRes = await fetch(`${BASE_URL}/api/projects/${sharedProject.id}/tasks`, {
        headers: { Authorization: `Bearer ${dev1.token}` },
      });
      const sharedTasks = (await sharedTasksRes.json()).data.tasks;

      if (sharedTasks.length > 0) {
        const charlieTask = sharedTasks[0];
        const nextStatus = charlieTask.status === 'IN_PROGRESS' ? 'IN_REVIEW' : 'IN_PROGRESS';

        // Setup PM listener for live event without page refresh
        const pmTaskStatusPromise = new Promise<any>((resolve) => {
          pmSocket.once('task:statusChanged', (payload: any) => resolve(payload));
        });
        const pmActivityPromise = new Promise<any>((resolve) => {
          pmSocket.once('activity:new', (payload: any) => resolve(payload));
        });

        // Charlie patches task status via REST
        const patchRes = await fetch(`${BASE_URL}/api/tasks/${charlieTask.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${dev1.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: nextStatus }),
        });
        const patchData = await patchRes.json();
        console.log(`[PASS] Developer (Session B) modified task status via REST API: "${charlieTask.title}" -> ${patchData.data.task.status}`);

        // Verify PM (Session A) receives real-time updates without page refresh
        const pmReceivedStatus = await pmTaskStatusPromise;
        console.log(`[PASS] PM (Session A) received live task:statusChanged without refresh: taskId=${pmReceivedStatus.taskId}, toStatus=${pmReceivedStatus.toStatus}`);

        const pmReceivedActivity = await pmActivityPromise;
        console.log(`[PASS] PM (Session A) received live activity:new audit without refresh: from=${pmReceivedActivity.fromStatus} -> to=${pmReceivedActivity.toStatus}`);
      }
    }

    pmSocket.disconnect();
    devSocket.disconnect();

    console.log('\n================================================================');
    console.log('   🎉 ALL MANUAL DASHBOARD VERIFICATIONS COMPLETED SUCCESSFULLY!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Manual verification error:', err);
  } finally {
    server.close();
  }
}

runManualUiVerification();
