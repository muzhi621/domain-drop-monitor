import { useState, type FormEvent } from 'react';
import { apiPost } from '../api/client';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const TEMPLATE = `domain,group,tags,note
example.com,抢注,#短字符,重点关注
test.io,观察,#品牌,
another.cn,抢注,,`;

export default function DomainImport() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onImport = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const r = await apiPost<ImportResult>('/domains/import', { text });
      setResult(r.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'domain_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">批量导入</h1>
        <button onClick={downloadTemplate} className="text-sm border px-3 py-1.5 rounded hover:bg-gray-100">
          下载模板
        </button>
      </div>

      <p className="text-sm text-gray-500">
        支持文本框或粘贴 CSV。每行格式：
        <code className="bg-gray-100 px-1 rounded">域名,分组,标签,备注</code>
        （逗号分隔，仅域名也可）。重复域名自动幂等忽略。
      </p>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <form onSubmit={onImport} className="bg-white p-4 rounded shadow space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={'example.com, 抢注, #短字符\nbest-name.io, 观察, #品牌'}
          className="w-full border rounded px-3 py-2 text-sm font-mono"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
        >
          {busy ? '导入中…' : '开始导入'}
        </button>
      </form>

      {result && (
        <div className="bg-white p-4 rounded shadow text-sm space-y-1">
          <div className="font-semibold">导入结果</div>
          <div>新增：{result.imported} 条</div>
          <div>跳过（已存在）：{result.skipped} 条</div>
          <div>失败：{result.errors.length} 条</div>
          {result.errors.length > 0 && (
            <ul className="list-disc pl-5 text-red-600">
              {result.errors.slice(0, 20).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
