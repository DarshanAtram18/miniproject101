import React, { useEffect, useRef, useState } from 'react';
import fallbackCatalog from '../../shared/activity-catalog.json';
import api, {
  SESSION_KEY,
  downloadResponse,
  getErrorMessage,
  getBlobErrorMessage,
  setApiToken,
  setAuthFailureHandler
} from './api';
import Header from './components/Header';
import Breadcrumb from './components/Breadcrumb';
import Notification from './components/Notification';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Records from './components/Records';
import Reports from './components/Reports';
import SubmitActivity from './components/SubmitActivity';
import Profile from './components/Profile';

const RECORD_CACHE_KEY = 'wce_prof_insights_record_cache_v2';
const ACTIVE_VIEW_KEY = 'wce_prof_insights_active_view';
const EDITING_ACTIVITY_KEY = 'wce_editing_activity';
const DRAFT_KEY = 'wce_activity_draft_v1';
const VALID_VIEWS = ['dashboard', 'submit', 'records', 'reports', 'profile'];

// Clear legacy localStorage sessions so previous shared credentials don't leak into new tabs
try {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(RECORD_CACHE_KEY);
} catch {}

const readSessionJson = (key, fallback) => {
  try {
    return JSON.parse(sessionStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const getViewFromHash = () => {
  if (typeof window === 'undefined') return null;
  const hash = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0].trim().toLowerCase();
  return VALID_VIEWS.includes(hash) ? hash : null;
};

const getInitialView = (hasSession) => {
  if (!hasSession) return 'login';
  const hashView = getViewFromHash();
  if (hashView) return hashView;
  try {
    const saved = sessionStorage.getItem(ACTIVE_VIEW_KEY);
    if (saved && VALID_VIEWS.includes(saved)) return saved;
  } catch {}
  return 'dashboard';
};

const initialSession = readSessionJson(SESSION_KEY, null);
const initialCache = initialSession ? readSessionJson(RECORD_CACHE_KEY, null) : null;
const initialEditingActivity = initialSession ? readSessionJson(EDITING_ACTIVITY_KEY, null) : null;
setApiToken(initialSession?.token);

const emptyPagination = { page: 1, pageSize: 25, total: 0, totalPages: 1 };

const viewLabels = {
  dashboard: 'Dashboard',
  submit: 'Add Faculty Activity',
  records: 'Activity Records',
  reports: 'Reports',
  profile: 'My Profile'
};

const App = () => {
  const [session, setSession] = useState(initialSession);
  const [view, setView] = useState(() => getInitialView(Boolean(initialSession)));
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [records, setRecords] = useState(initialCache?.items || []);
  const [pagination, setPagination] = useState(initialCache?.pagination || emptyPagination);
  const [recordsLoading, setRecordsLoading] = useState(Boolean(initialSession && !initialCache));
  const [recordsError, setRecordsError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [editingActivity, setEditingActivity] = useState(initialEditingActivity);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationTimer = useRef(null);
  const notifPollTimer = useRef(null);
  const lastFilters = useRef({ page: 1 });

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // Ignore - notifications are non-critical
    }
  };

  const showNotification = (message, kind = 'success') => {
    window.clearTimeout(notificationTimer.current);
    setNotification({ message, kind });
    notificationTimer.current = window.setTimeout(() => setNotification(null), 4500);
  };

  useEffect(() => {
    setAuthFailureHandler((message) => {
      setSession(null);
      setView('login');
      setLoginError(message);
      setRecords([]);
      setPagination(emptyPagination);
      setRecordsError('');
      sessionStorage.removeItem(RECORD_CACHE_KEY);
      sessionStorage.removeItem(ACTIVE_VIEW_KEY);
      sessionStorage.removeItem(EDITING_ACTIVITY_KEY);
    });
    return () => {
      setAuthFailureHandler(null);
      window.clearTimeout(notificationTimer.current);
    };
  }, []);

  // Listen for browser Back/Forward navigation or manual hash changes
  useEffect(() => {
    const onHashChange = () => {
      const hashView = getViewFromHash();
      if (hashView && session?.token) {
        setView(hashView);
        sessionStorage.setItem(ACTIVE_VIEW_KEY, hashView);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [session?.token]);

  // Sync hash with current active view on mount and navigation
  useEffect(() => {
    if (session?.user && view && view !== 'login') {
      if (window.location.hash !== `#${view}`) {
        window.location.hash = `#${view}`;
      }
      sessionStorage.setItem(ACTIVE_VIEW_KEY, view);
    }
  }, [session?.user, view]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let cancelled = false;

    const hydrate = async () => {
      try {
        const [profileResponse, catalogResponse, historyResponse] = await Promise.all([
          api.get('/auth/me'),
          api.get('/activity/catalog'),
          api.get('/activity/history', { params: { page: 1, pageSize: 25 } })
        ]);
        if (cancelled) return;
        const nextSession = { token: session.token, user: profileResponse.data.user };
        const history = historyResponse.data;
        setSession(nextSession);
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        setCatalog(catalogResponse.data);
        setRecords(history.items || []);
        setPagination(history.pagination || emptyPagination);
        setRecordsError('');
        sessionStorage.setItem(RECORD_CACHE_KEY, JSON.stringify({ items: history.items || [], pagination: history.pagination || emptyPagination }));
      } catch (error) {
        if (!cancelled && error.response?.status !== 401) {
          setRecordsError(getErrorMessage(error, 'The faculty activity service could not be reached.'));
        }
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    };

    hydrate();
    return () => { cancelled = true; };
  }, [session?.token]);

  // Fetch notifications on login and poll every 30 seconds for real-time updates
  useEffect(() => {
    if (!session?.token) { setNotifications([]); setUnreadCount(0); return; }
    fetchNotifications();
    notifPollTimer.current = window.setInterval(fetchNotifications, 30_000);
    return () => window.clearInterval(notifPollTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const markNotificationRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const login = async ({ email, password }) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const response = await api.post('/auth/login', { email, password });
      const nextSession = response.data;
      setApiToken(nextSession.token);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setRecordsLoading(true);
      const targetView = getInitialView(true);
      setView(targetView);
      sessionStorage.setItem(ACTIVE_VIEW_KEY, targetView);
      window.location.hash = `#${targetView}`;
    } catch (error) {
      setLoginError(getErrorMessage(error, 'Unable to sign in. Check that the server is running.'));
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    setApiToken(null);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(RECORD_CACHE_KEY);
    sessionStorage.removeItem(ACTIVE_VIEW_KEY);
    sessionStorage.removeItem(EDITING_ACTIVITY_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(RECORD_CACHE_KEY);
    setSession(null);
    setView('login');
    window.location.hash = '';
    setRecords([]);
    setPagination(emptyPagination);
    setRecordsError('');
    setEditingActivity(null);
    setLoginError('');
  };

  const navigate = (nextView) => {
    if (nextView !== 'submit') {
      setEditingActivity(null);
      sessionStorage.removeItem(EDITING_ACTIVITY_KEY);
    }
    setView(nextView);
    sessionStorage.setItem(ACTIVE_VIEW_KEY, nextView);
    if (window.location.hash !== `#${nextView}`) {
      window.location.hash = `#${nextView}`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadRecords = async (filters = lastFilters.current) => {
    lastFilters.current = filters;
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const response = await api.get('/activity/history', { params: { ...filters, pageSize: 25 } });
      setRecords(response.data.items || []);
      setPagination(response.data.pagination || emptyPagination);
      sessionStorage.setItem(RECORD_CACHE_KEY, JSON.stringify({ items: response.data.items || [], pagination: response.data.pagination || emptyPagination }));
    } catch (error) {
      setRecordsError(getErrorMessage(error, 'Unable to load activity records.'));
    } finally {
      setRecordsLoading(false);
    }
  };

  const editRecord = async (record) => {
    try {
      const response = await api.get(`/activity/${record.act_id}`);
      const act = response.data.activity;
      setEditingActivity(act);
      sessionStorage.setItem(EDITING_ACTIVITY_KEY, JSON.stringify(act));
      navigate('submit');
    } catch (error) {
      showNotification(getErrorMessage(error, 'Unable to open the activity for editing.'), 'error');
    }
  };

  const saveActivity = async (payload, activityId) => {
    setSubmitting(true);
    try {
      const request = (body) => activityId
        ? api.put(`/activity/${activityId}`, body)
        : api.post('/activity', body);
      try {
        await request(payload);
      } catch (error) {
        if (error.response?.data?.code !== 'POSSIBLE_DUPLICATE') throw error;
        const submitAnyway = window.confirm(`${error.response.data.error}\n\nSubmit it anyway?`);
        if (!submitAnyway) return;
        await request({ ...payload, confirmDuplicate: true });
      }
      showNotification(payload.saveAsDraft ? 'Draft saved successfully.' : activityId ? 'Activity resubmitted successfully.' : 'Activity submitted successfully.');
      setEditingActivity(null);
      sessionStorage.removeItem(EDITING_ACTIVITY_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
      navigate('records');
      await loadRecords({ page: 1 });
    } catch (error) {
      showNotification(getErrorMessage(error, 'Unable to save the activity.'), 'error');
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  const deleteRecord = async (record) => {
    try {
      await api.delete(`/activity/${record.act_id}`, { data: { note: 'Removed by submitting faculty after identifying a mistake.' } });
      showNotification('Activity removed from active records. Audit history was retained.');
      await loadRecords(lastFilters.current);
    } catch (error) {
      showNotification(getErrorMessage(error, 'Unable to remove the activity.'), 'error');
    }
  };

  const reviewRecord = async (record, decision, comment) => {
    try {
      await api.patch(`/admin/activities/${record.act_id}/review`, { decision, comment });
      showNotification(decision === 'Approved' ? 'Activity approved.' : 'Activity returned with requested changes.');
      await loadRecords(lastFilters.current);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to save the review decision.');
      showNotification(message, 'error');
      throw new Error(message);
    }
  };

  const downloadReport = async (format, filters) => {
    try {
      const response = await api.get('/reports/activity-register', {
        params: { ...filters, format },
        responseType: 'blob'
      });
      downloadResponse(response, `faculty-activity-report.${format}`);
      showNotification(`${format.toUpperCase()} report downloaded successfully.`);
    } catch (error) {
      const message = await getBlobErrorMessage(error, 'Unable to generate the report.');
      showNotification(message, 'error');
      throw error;
    }
  };

  const changePassword = async (passwords) => {
    try {
      await api.patch('/auth/change-password', passwords);
      showNotification('Password updated successfully.');
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to update the password.');
      throw new Error(message);
    }
  };

  const updateUser = (updatedUser) => {
    setSession((prev) => {
      if (!prev) return prev;
      const nextSession = { ...prev, user: { ...prev.user, ...updatedUser } };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      return nextSession;
    });
  };

  if (!session?.user || view === 'login') {
    return <Login onLogin={login} loading={loginLoading} error={loginError} />;
  }

  const user = session.user;

  return (
    <div id="app">
      <Header activeNav={view} navigate={navigate} logout={logout} user={user} notifications={notifications} unreadCount={unreadCount} onMarkRead={markNotificationRead} onMarkAllRead={markAllNotificationsRead} />
      <Breadcrumb current={viewLabels[view]} navigate={navigate} />
      <main className="app-main" id="main-content">
        {view === 'dashboard' && <Dashboard user={user} records={records} total={pagination.total} loading={recordsLoading} error={recordsError} navigate={navigate} reload={() => loadRecords({ page: 1 })} />}
        {view === 'submit' && (
          <SubmitActivity
            key={editingActivity?.act_id || 'new-activity'}
            user={user}
            catalog={catalog}
            initialActivity={editingActivity}
            onSubmit={saveActivity}
            onCancel={() => {
              sessionStorage.removeItem(EDITING_ACTIVITY_KEY);
              sessionStorage.removeItem(DRAFT_KEY);
              navigate(editingActivity ? 'records' : 'dashboard');
            }}
            submitting={submitting}
          />
        )}
        {view === 'records' && <Records user={user} records={records} loading={recordsLoading} error={recordsError} pagination={pagination} catalog={catalog} onReload={loadRecords} onEdit={editRecord} onDelete={deleteRecord} onReview={reviewRecord} navigate={navigate} showNotification={showNotification} />}
        {view === 'reports' && <Reports user={user} catalog={catalog} records={records} total={pagination.total} onDownload={downloadReport} showNotification={showNotification} />}
        {view === 'profile' && <Profile user={user} onUpdateUser={updateUser} onChangePassword={changePassword} onSignOut={logout} />}
      </main>
      <footer className="app-footer"><span>© 2026 Walchand College of Engineering, Sangli</span><span>WCE Prof-Insights · Faculty Activity & Evidence Portal</span></footer>
      <Notification notification={notification} onClose={() => setNotification(null)} />
    </div>
  );
};

export default App;
