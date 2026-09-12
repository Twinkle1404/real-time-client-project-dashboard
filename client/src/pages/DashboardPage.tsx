import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserSummary, Project, Task, TaskFilters, TaskStatus, NotificationItem, ActivityItem } from '../types/dashboard.types';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { ProjectList } from '../components/dashboard/ProjectList';
import { TaskList } from '../components/dashboard/TaskList';
import { ActivityFeed } from '../components/dashboard/ActivityFeed';
import { NotificationPanel } from '../components/dashboard/NotificationPanel';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { projectsService } from '../services/projects.service';
import { tasksService } from '../services/tasks.service';
import { notificationsService } from '../services/notifications.service';
import { socketService } from '../services/socket.service';

interface DashboardPageProps {
  user: UserSummary;
  accessToken: string;
  onLogout: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  accessToken,
  onLogout,
}) => {
  // --- URL Search Params Initialization ---
  const getInitialFiltersFromUrl = (): TaskFilters => {
    const params = new URLSearchParams(window.location.search);
    return {
      status: (params.get('status') as TaskStatus) || '',
      priority: (params.get('priority') as any) || '',
      fromDate: params.get('fromDate') || '',
      toDate: params.get('toDate') || '',
    };
  };

  const getInitialProjectIdFromUrl = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get('projectId');
  };

  // --- State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(getInitialProjectIdFromUrl());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filters, setFilters] = useState<TaskFilters>(getInitialFiltersFromUrl());
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  // Loading & Error States
  const [isProjectsLoading, setIsProjectsLoading] = useState<boolean>(true);
  const [isTasksLoading, setIsTasksLoading] = useState<boolean>(false);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState<boolean>(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track currently joined project room for clean transitions
  const activeRoomProjectId = useRef<string | null>(null);

  // --- URL State Synchronization ---
  const syncFiltersToUrl = useCallback(
    (newFilters: TaskFilters, projId: string | null) => {
      const params = new URLSearchParams();
      if (projId) params.set('projectId', projId);
      if (newFilters.status) params.set('status', newFilters.status);
      if (newFilters.priority) params.set('priority', newFilters.priority);
      if (newFilters.fromDate) params.set('fromDate', newFilters.fromDate);
      if (newFilters.toDate) params.set('toDate', newFilters.toDate);

      const queryString = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState(null, '', queryString);
    },
    []
  );

  // --- Fetch Tasks ---
  const fetchTasks = useCallback(
    async (projectId: string, appliedFilters: TaskFilters) => {
      setIsTasksLoading(true);
      setError(null);
      try {
        const fetchedTasks = await tasksService.listTasks(accessToken, projectId, appliedFilters);
        setTasks(fetchedTasks);
      } catch (err: any) {
        setError(err.message || 'Failed to fetch tasks');
        setTasks([]);
      } finally {
        setIsTasksLoading(false);
      }
    },
    [accessToken]
  );

  // --- Fetch Projects ---
  useEffect(() => {
    let isMounted = true;
    const loadProjects = async () => {
      setIsProjectsLoading(true);
      setError(null);
      try {
        const list = await projectsService.listProjects(accessToken);
        if (!isMounted) return;
        setProjects(list);

        // If URL has projectId, verify it exists; otherwise pick the first available project
        if (list.length > 0) {
          const initialId = getInitialProjectIdFromUrl();
          const targetProject = list.find((p) => p.id === initialId) || list[0];
          setSelectedProjectId(targetProject.id);
          syncFiltersToUrl(filters, targetProject.id);
        } else {
          setSelectedProjectId(null);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load projects');
      } finally {
        if (isMounted) setIsProjectsLoading(false);
      }
    };

    loadProjects();
    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  // --- Fetch Notifications ---
  useEffect(() => {
    let isMounted = true;
    const loadNotifications = async () => {
      setIsNotificationsLoading(true);
      try {
        const [notifData, count] = await Promise.all([
          notificationsService.listNotifications(accessToken),
          notificationsService.getUnreadCount(accessToken),
        ]);
        if (!isMounted) return;
        setNotifications(notifData.notifications);
        setUnreadCount(count);
      } catch (err) {
        // Silently ignore notification error to not block main dashboard
      } finally {
        if (isMounted) setIsNotificationsLoading(false);
      }
    };

    loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [accessToken]);

  // --- Load Tasks when selected Project or Filters change ---
  useEffect(() => {
    if (selectedProjectId) {
      fetchTasks(selectedProjectId, filters);
    } else {
      setTasks([]);
    }
  }, [selectedProjectId, filters, fetchTasks]);

  // --- Realtime Socket.IO Integration ---
  useEffect(() => {
    // 1. Connect socket with short-lived access JWT
    socketService.connect(accessToken);

    // 2. If ADMIN, join global activity room
    if (user.role === 'ADMIN') {
      socketService.joinGlobalActivity();
    }

    // 3. Listen for online presence updates
    const unbindPresence = socketService.onPresenceUpdate((payload) => {
      setOnlineCount(payload.onlineCount);
    });

    // 4. Listen for live task status changes
    const unbindTaskStatus = socketService.onTaskStatusChanged((payload) => {
      // Update task in local state if it belongs to the current project
      setTasks((prev) =>
        prev.map((t) => (t.id === payload.taskId ? { ...t, status: payload.toStatus } : t))
      );
    });

    // 5. Listen for live activity events
    const unbindActivity = socketService.onActivityNew((payload) => {
      setActivities((prev) => {
        // Avoid duplicate events
        if (prev.some((a) => a.id === payload.id)) return prev;
        return [
          {
            id: payload.id,
            taskId: payload.taskId,
            projectId: payload.projectId,
            userId: payload.userId,
            user: payload.user,
            fromStatus: payload.fromStatus,
            toStatus: payload.toStatus,
            description: payload.description,
            createdAt: payload.createdAt,
          },
          ...prev.slice(0, 29), // keep latest 30
        ];
      });
    });

    // 6. Listen for live notification arrivals
    const unbindNotifNew = socketService.onNotificationNew((payload) => {
      setNotifications((prev) => [payload, ...prev]);
    });

    // 7. Listen for authoritative unread count updates
    const unbindNotifCount = socketService.onNotificationUnreadCount((payload) => {
      setUnreadCount(payload.unreadCount);
    });

    return () => {
      unbindPresence();
      unbindTaskStatus();
      unbindActivity();
      unbindNotifNew();
      unbindNotifCount();
    };
  }, [accessToken, user.role]);

  // --- Room Management on Project Selection ---
  useEffect(() => {
    if (selectedProjectId) {
      // Leave previous project room if different
      if (activeRoomProjectId.current && activeRoomProjectId.current !== selectedProjectId) {
        socketService.leaveProject(activeRoomProjectId.current);
      }
      // Join new project room
      socketService.joinProject(selectedProjectId);
      activeRoomProjectId.current = selectedProjectId;

      // Missed-event catchup from PostgreSQL for this project
      socketService.catchup({ projectId: selectedProjectId }).then((res) => {
        if (res.success && res.data.events.length > 0) {
          setActivities((prev) => {
            const incoming: ActivityItem[] = res.data.events.map((e) => ({
              id: e.id,
              taskId: e.taskId,
              projectId: e.projectId,
              userId: e.userId,
              user: e.user,
              fromStatus: e.fromStatus,
              toStatus: e.toStatus,
              description: e.description,
              createdAt: e.createdAt,
            }));
            const seenIds = new Set(prev.map((a) => a.id));
            const unique = incoming.filter((a) => !seenIds.has(a.id));
            return [...unique, ...prev];
          });
        }
      });
    }

    return () => {
      if (activeRoomProjectId.current) {
        socketService.leaveProject(activeRoomProjectId.current);
        activeRoomProjectId.current = null;
      }
    };
  }, [selectedProjectId]);

  // --- Handler: Select Project ---
  const handleSelectProject = (project: Project) => {
    setSelectedProjectId(project.id);
    syncFiltersToUrl(filters, project.id);
  };

  // --- Handler: Change Filter ---
  const handleFilterChange = (newFilters: TaskFilters) => {
    setFilters(newFilters);
    syncFiltersToUrl(newFilters, selectedProjectId);
  };

  // --- Handler: Reset Filters ---
  const handleFilterReset = () => {
    const emptyFilters: TaskFilters = {
      status: '',
      priority: '',
      fromDate: '',
      toDate: '',
    };
    setFilters(emptyFilters);
    syncFiltersToUrl(emptyFilters, selectedProjectId);
  };

  // --- Handler: Update Task Status ---
  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setUpdatingTaskId(taskId);
    setError(null);
    try {
      const updatedTask = await tasksService.updateTaskStatus(accessToken, taskId, newStatus);
      // Immediately reflect local change
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updatedTask : t)));
    } catch (err: any) {
      setError(err.message || 'Failed to update task status');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  // --- Handler: Mark Notification As Read ---
  const handleMarkNotifAsRead = async (id: string) => {
    try {
      const updated = await notificationsService.markAsRead(accessToken, id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
    } catch (err: any) {
      setError(err.message || 'Failed to mark notification as read');
    }
  };

  // --- Handler: Mark All Notifications As Read ---
  const handleMarkAllNotifsAsRead = async () => {
    try {
      await notificationsService.markAllAsRead(accessToken);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err: any) {
      setError(err.message || 'Failed to mark all notifications as read');
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        position: 'relative',
      }}
    >
      {/* Top Navigation Header */}
      <DashboardHeader
        user={user}
        onlineCount={onlineCount}
        unreadCount={unreadCount}
        showNotifications={showNotifications}
        onToggleNotifications={() => setShowNotifications((prev) => !prev)}
        onLogout={onLogout}
      />

      {/* Real-time Notification Dropdown */}
      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          isLoading={isNotificationsLoading}
          onMarkAsRead={handleMarkNotifAsRead}
          onMarkAllAsRead={handleMarkAllNotifsAsRead}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {/* Main Body */}
      <main
        style={{
          flex: 1,
          padding: '24px 28px',
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Error notification banner */}
        <ErrorBanner error={error} onDismiss={() => setError(null)} />

        {/* Responsive 3-Column Layout: Left (Projects), Center (Tasks & Filters), Right (Activity Feed) */}
        <div className="dashboard-grid">
          {/* Column 1: Projects List */}
          <div className="dashboard-col-sticky">
            <ProjectList
              projects={projects}
              selectedProjectId={selectedProjectId}
              isLoading={isProjectsLoading}
              onSelectProject={handleSelectProject}
            />
          </div>

          {/* Column 2: Tasks List with Query-Parameter Filters */}
          <div className="dashboard-col-main">
            <TaskList
              project={selectedProject}
              tasks={tasks}
              currentUser={user}
              filters={filters}
              onFilterChange={handleFilterChange}
              onFilterReset={handleFilterReset}
              onStatusChange={handleStatusChange}
              isLoading={isTasksLoading}
              updatingTaskId={updatingTaskId}
            />
          </div>

          {/* Column 3: Real-Time Activity Feed */}
          <div className="dashboard-col-sticky">
            <ActivityFeed activities={activities} />
          </div>
        </div>

        <style>{`
          .dashboard-grid {
            display: grid;
            grid-template-columns: 320px 1fr 340px;
            gap: 24px;
            align-items: start;
          }
          .dashboard-col-sticky {
            position: sticky;
            top: 24px;
          }
          .dashboard-col-main {
            min-width: 0;
          }
          @media (max-width: 1200px) {
            .dashboard-grid {
              grid-template-columns: 280px 1fr;
            }
            .dashboard-grid > :nth-child(3) {
              grid-column: span 2;
              position: static;
            }
          }
          @media (max-width: 840px) {
            .dashboard-grid {
              grid-template-columns: 1fr;
            }
            .dashboard-grid > :nth-child(1),
            .dashboard-grid > :nth-child(3) {
              grid-column: span 1;
              position: static;
            }
          }
        `}</style>
      </main>
    </div>
  );
};
