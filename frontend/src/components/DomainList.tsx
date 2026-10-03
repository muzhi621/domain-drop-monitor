import { useEffect, useState, type FormEvent } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../api/client';
import type { Domain, EppStatus, Priority } from '../api/client';

interface ListResponse {
  items: Domain[];
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

const STATUS_BADGE: Record<EppStatus, string> = {
  ok: 'bg-gray-100 text-gray-700',
  expired: 'bg-yellow-100 text-yellow-700',
  redemptionPeriod: 'bg-orange-100 text-orange-700',
  pendingDelete: 'bg-red-100 text-red-700',
  available: 'bg-green-100 text-green-700',
  unknown: 'bg-gray-100 text-gray-500',
};

function fmt(ts: number | null): string {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function DomainList() {
  const [items, setItems] = useState<Domain[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Add-domain form
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({ domain: '', group: '', tags: '', note: '', priority: 'normal' as Priority });

  // Inline editing
  const [editing, setEditing] = useState<Domain | null>(null);

  const size = 20;

  const load = () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('size', String(size));
    if (q) params.set('q', q);
    if (group) params.set('group', group);
    if (status) params.set('status', status);
    apiGet<ListResponse>(`/domains?${params.toString()}`)
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
  }, [page, q, group, status]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiPost<Domain>('/domains', add);
      setAdd({ domain: '', group: '', tags: '', note: '', priority: 'normal' });
      setShowAdd(false);
      setPage(1);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm('确认删除该域名？')) return;
    try {
      await apiDelete(`/domains/${id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onCheck = async (id: number) => {
    try {
      await apiPost(`/domains/${id}/check`, {});
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiPut<Domain>(`/domains/${editing.id}`, {
        group: editing.group_name,
        tags: editing.tags,
        note: editing.note,
        priority: editing.priority,
      });
      setEditing(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">域名列表</h1>
        <div className="space-x-2">
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            + 新增域名
          </button>
          <a
            href="/domains/import"
            className="bg-gray-600 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-700"
          >
            批量导入
          </a>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white p-3 rounded shadow-sm">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索域名"
          className="border rounded px-2 py-1 text-sm"
        />
        <input
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="分组"
          className="border rounded px-2 py-1 text-sm w-28"
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

      {/* Add form */}
      {showAdd && (
        <form onSubmit={onAdd} className="bg-white p-4 rounded shadow space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
            <input
              required
              value={add.domain}
              onChange={(e) => setAdd({ ...add, domain: e.target.value })}
              placeholder="域名 example.com"
              className="border rounded px-2 py-1 text-sm"
            />
            <input
              value={add.group}
              onChange={(e) => setAdd({ ...add, group: e.target.value })}
              placeholder="分组"
              className="border rounded px-2 py-1 text-sm"
            />
            <input
              value={add.tags}
              onChange={(e) => setAdd({ ...add, tags: e.target.value })}
              placeholder="标签"
              className="border rounded px-2 py-1 text-sm"
            />
            <input
              value={add.note}
              onChange={(e) => setAdd({ ...add, note: e.target.value })}
              placeholder="备注"
              className="border rounded px-2 py-1 text-sm"
            />
            <select
              value={add.priority}
              onChange={(e) => setAdd({ ...add, priority: e.target.value as Priority })}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="high">高频(5分)</option>
              <option value="normal">常规(1时)</option>
              <option value="low">低频(6时)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm disabled:opacity-50">
              保存
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="border px-4 py-1.5 rounded text-sm">
              取消
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">域名</th>
              <th className="px-3 py-2">状态</th>
              <th className="px-3 py-2">分组</th>
              <th className="px-3 py-2">标签</th>
              <th className="px-3 py-2">优先级</th>
              <th className="px-3 py-2">下次检测</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-t">
                {editing && editing.id === d.id ? (
                  <td colSpan={7} className="px-3 py-2">
                    <form onSubmit={saveEdit} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                      <span className="py-1 font-medium">{d.domain}</span>
                      <input
                        value={editing.group_name}
                        onChange={(e) => setEditing({ ...editing, group_name: e.target.value })}
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="分组"
                      />
                      <input
                        value={editing.tags}
                        onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="标签"
                      />
                      <input
                        value={editing.note}
                        onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                        className="border rounded px-2 py-1 text-sm"
                        placeholder="备注"
                      />
                      <select
                        value={editing.priority}
                        onChange={(e) => setEditing({ ...editing, priority: e.target.value as Priority })}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="high">高频</option>
                        <option value="normal">常规</option>
                        <option value="low">低频</option>
                      </select>
                      <div className="col-span-1 md:col-span-5 flex gap-2">
                        <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">保存</button>
                        <button type="button" onClick={() => setEditing(null)} className="border px-3 py-1 rounded text-sm">
                          取消
                        </button>
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 font-medium">{d.domain}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_BADGE[d.status]}`}>
                        {STATUS_LABELS[d.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{d.group_name}</td>
                    <td className="px-3 py-2">{d.tags}</td>
                    <td className="px-3 py-2">{d.priority}</td>
                    <td className="px-3 py-2 text-gray-500">{fmt(d.next_check_at)}</td>
                    <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                      <button onClick={() => setEditing(d)} className="text-blue-600 hover:underline text-xs">
                        编辑
                      </button>
                      <button onClick={() => onCheck(d.id)} className="text-green-600 hover:underline text-xs">
                        检测
                      </button>
                      <button onClick={() => onDelete(d.id)} className="text-red-600 hover:underline text-xs">
                        删除
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  暂无域名
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
