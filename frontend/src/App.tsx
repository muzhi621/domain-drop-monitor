import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import DomainList from './components/DomainList';
import DomainImport from './components/DomainImport';
import NotificationConfig from './components/NotificationConfig';
import History from './components/History';

export default function App() {
  const { authed, loading } = useAuth();

  if (loading) {
    return <div className="p-10 text-center text-gray-500">加载中…</div>;
  }

  if (!authed) {
    return <Login />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/domains" element={<DomainList />} />
        <Route path="/domains/import" element={<DomainImport />} />
        <Route path="/notifications" element={<NotificationConfig />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
