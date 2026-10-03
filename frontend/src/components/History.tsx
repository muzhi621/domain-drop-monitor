import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import type { EppStatus, StatusHistory } from '../api/client';

interface HistoryResponse {
  items: StatusHistory[];
  total: number;
}

const STATUS_LABELS: Record<EppStatus, string> = {
  ok: '正常',
  expired: '已过期',
  redemptionPeriod: '赎回期',
  pendingDelete: '删除期',
  available: '可注册',
  unknown: '未知',
};

function fmt(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const TRIGGER_LABELS: Record<string, string> = {
  import: '导入',
  check: '检测',
  'manual': '手动检测',
  'drop-notify': '掉落通知',
  'warn-notify': '预警通知',
};

export default function History() {
  const [items, setItems] = useState<StatusHistory[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const size = 50;

  const load = () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('size', String(size));
    if (domain) params.set('domain', domain);
    if (status) params.set('status', status);
    apiGet<HistoryResponse>(`/history?${params.toString()}`)
      .then((r) => {
        setItems(r.data?.items ?? []);
        setTotal(r.data?.total ?? 0);
        setError('');
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, domain, status]);

  const exportUrl = `/api/history?export=csv${domain ? `&domain=${encodeURIComponent(domain)}` : ''}${
    status ? `&status=${encodeURIComponent(status)}` : ''
  }`;

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">监测历史</h1>
        <a
          href={exportUrl}
          className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700"
        >
          导出 CSV
        </a>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded shadow-sm">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="域名筛选"
          className="border rounded px-2 py-1 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="">全部状态</option>
          {Object.keys(STATUS_LABELS).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s as EppStatus]}
            </option>
          ))}
        </select>
        <button onClick={() => setPage(1)} className="text-sm border px-3 py-1 rounded hover:bg-gray-100">
          查询
        </button>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">时间</th>
              <th className="px-3 py-2">域名</th>
              <th className="px-3 py-2">旧状态</th>
              <th className="px-3 py-2">新状态</th>
              <th className="px-3 py-2">触发动作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="px-3 py-2 text-gray-500">{fmt(h.changed_at)}</td>
                <td className="px-3 py-2 font-medium">{h.domain}</td>
                <td className="px-3 py-2">{h.old_status ? STATUS_LABELS[h.old_status] : '-'}</td>
                <td className="px-3 py-2">{STATUS_LABELS[h.new_status]}</td>
                <td className="px-3 py-2 text-gray-500">{TRIGGER_LABELS[h.trigger_action] ?? h.trigger_action}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  暂无记录
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>共 {total} 条</span>
        <div className="space-x-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="border px-3 py-1 rounded disabled:opacity-40"
          >
            上一页
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="border px-3 py-1 rounded disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
