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

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
};

const initialSession = readJson(SESSION_KEY, null);
const initialCache = initialSession ? readJson(RECORD_CACHE_KEY, null) : null;
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
  const [view, setView] = useState(initialSession ? 'dashboard' : 'login');
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [records, setRecords] = useState(initialCache?.items || []);
  const [pagination, setPagination] = useState(initialCache?.pagination || emptyPagination);
  const [recordsLoading, setRecordsLoading] = useState(Boolean(initialSession && !initialCache));
  const [recordsError, setRecordsError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [editingActivity, setEditingActivity] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);
  const notificationTimer = useRef(null);
  const lastFilters = useRef({ page: 1 });

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
      localStorage.removeItem(RECORD_CACHE_KEY);
    });
    return () => {
      setAuthFailureHandler(null);
      window.clearTimeout(notificationTimer.current);
    };
  }, []);

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
        localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
        setCatalog(catalogResponse.data);
        setRecords(history.items || []);
        setPagination(history.pagination || emptyPagination);
        setRecordsError('');
        localStorage.setItem(RECORD_CACHE_KEY, JSON.stringify({ items: history.items || [], pagination: history.pagination || emptyPagination }));
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

  const login = async ({ email, password }) => {
    setLoginLoading(true);
    setLoginError('');
    try {
      const response = await api.post('/auth/login', { email, password });
      const nextSession = response.data;
      setApiToken(nextSession.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setRecordsLoading(true);
      setView('dashboard');
    } catch (error) {
      setLoginError(getErrorMessage(error, 'Unable to sign in. Check that the server is running.'));
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = () => {
    setApiToken(null);
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(RECORD_CACHE_KEY);
    setSession(null);
    setView('login');
    setRecords([]);
    setPagination(emptyPagination);
    setRecordsError('');
    setEditingActivity(null);
    setLoginError('');
  };

  const navigate = (nextView) => {
    setEditingActivity(null);
    setView(nextView);
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
      localStorage.setItem(RECORD_CACHE_KEY, JSON.stringify({ items: response.data.items || [], pagination: response.data.pagination || emptyPagination }));
    } catch (error) {
      setRecordsError(getErrorMessage(error, 'Unable to load activity records.'));
    } finally {
      setRecordsLoading(false);
    }
  };

  const editRecord = async (record) => {
    try {
      const response = await api.get(`/activity/${record.act_id}`);
      setEditingActivity(response.data.activity);
      setView('submit');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      setView('records');
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

  if (!session?.user || view === 'login') {
    return <Login onLogin={login} loading={loginLoading} error={loginError} />;
  }

  const user = session.user;

  return (
    <div id="app">
      <Header activeNav={view} navigate={navigate} logout={logout} user={user} />
      <Breadcrumb current={viewLabels[view]} navigate={navigate} />
      <main className="app-main" id="main-content">
        {view === 'dashboard' && <Dashboard user={user} records={records} total={pagination.total} loading={recordsLoading} error={recordsError} navigate={navigate} reload={() => loadRecords({ page: 1 })} />}
        {view === 'submit' && <SubmitActivity key={editingActivity?.act_id || 'new-activity'} user={user} catalog={catalog} initialActivity={editingActivity} onSubmit={saveActivity} onCancel={() => navigate(editingActivity ? 'records' : 'dashboard')} submitting={submitting} />}
        {view === 'records' && <Records user={user} records={records} loading={recordsLoading} error={recordsError} pagination={pagination} catalog={catalog} onReload={loadRecords} onEdit={editRecord} onDelete={deleteRecord} onReview={reviewRecord} navigate={navigate} />}
        {view === 'reports' && <Reports user={user} catalog={catalog} records={records} total={pagination.total} onDownload={downloadReport} />}
        {view === 'profile' && <Profile user={user} onChangePassword={changePassword} onSignOut={logout} />}
      </main>
      <footer className="app-footer"><span>© 2026 Walchand College of Engineering, Sangli</span><span>WCE Prof-Insights · Faculty Activity & Evidence Portal</span></footer>
      <Notification notification={notification} onClose={() => setNotification(null)} />
    </div>
  );
};

export default App;
