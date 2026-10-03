import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const navItems = [
  { to: '/', label: '仪表盘', end: true },
  { to: '/domains', label: '域名列表' },
  { to: '/domains/import', label: '批量导入' },
  { to: '/notifications', label: '通知配置' },
  { to: '/history', label: '监测历史' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg text-blue-700">域名掉落监测器</span>
          <button
            onClick={onLogout}
            className="text-sm text-gray-600 hover:text-gray-900 border px-3 py-1 rounded hover:bg-gray-100"
          >
            退出登录
          </button>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        <nav className="w-44 shrink-0">
          <ul className="space-y-1">
            {navItems.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `block px-3 py-2 rounded text-sm font-medium ${
                      isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
