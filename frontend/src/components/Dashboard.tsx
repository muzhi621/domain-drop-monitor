import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import type { EppStatus, StatusHistory } from '../api/client';

interface Stats {
  total: number;
  byStatus: Record<EppStatus, number>;
  recentDrops: StatusHistory[];
}

const STATUS_LABELS: Record<EppStatus, string> = {
  ok: '正常注册',
  expired: '已过期',
  redemptionPeriod: '赎回期',
  pendingDelete: '删除期',
  available: '可注册(掉落)',
  unknown: '检测失败',
};

const CARD_ORDER: EppStatus[] = ['available', 'pendingDelete', 'redemptionPeriod', 'expired', 'ok', 'unknown'];

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    apiGet<Stats>('/stats')
      .then((r) => setStats(r.data))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="text-red-600">加载失败：{error}</div>;
  if (!stats) return <div className="text-gray-500">加载中…</div>;

  const cards = [
    { label: '监控总数', value: stats.total, color: 'bg-blue-600' },
    ...CARD_ORDER.map((s) => ({
      label: STATUS_LABELS[s],
      value: stats.byStatus[s] ?? 0,
      color:
        s === 'available'
          ? 'bg-green-600'
          : s === 'pendingDelete'
            ? 'bg-red-600'
            : s === 'redemptionPeriod'
              ? 'bg-orange-500'
              : 'bg-gray-500',
    })),
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">仪表盘</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`${c.color} text-white rounded-lg p-4 shadow`}>
            <div className="text-sm opacity-90">{c.label}</div>
            <div className="text-3xl font-bold mt-1">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold mb-3">近期掉落（最近 20 条 available）</h2>
        {stats.recentDrops.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无掉落记录</p>
        ) : (
          <ul className="divide-y text-sm">
            {stats.recentDrops.map((h) => (
              <li key={h.id} className="py-2 flex justify-between">
                <span className="text-gray-700">{h.domain}</span>
                <span className="text-gray-400">
                  {h.old_status ?? '-'} → {h.new_status} · {fmtTime(h.changed_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
