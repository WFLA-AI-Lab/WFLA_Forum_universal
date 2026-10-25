import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ReportItem } from '../skins/contract';
import { Badge, formatDate } from './shared';

type Notify = (tone: 'success' | 'error', message: string) => void;

export function ReportsPanel({ notify }: { notify: Notify }) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [busy, setBusy] = useState(false);
  async function load() {
    try { setItems((await api.get<{ items: ReportItem[] }>('/reports')).items); }
    catch (error) { notify('error', error instanceof Error ? error.message : '无法加载举报'); }
  }
  useEffect(() => { void load(); }, []);
  async function handle(id: string, kind: 'resolve' | 'reject') {
    const text = window.prompt(kind === 'resolve' ? '处理说明' : '驳回原因');
    if (!text) return;
    setBusy(true);
    try {
      await api.post(`/reports/${id}/${kind}`, kind === 'resolve' ? { resolution: text } : { reason: text });
      await load();
      notify('success', kind === 'resolve' ? '举报已处理' : '举报已驳回');
    } catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  }
  return (
    <section className="adm-card adm-reports-card">
      <header><div><small>MODERATION QUEUE</small><h3>举报与申诉</h3></div><span className="adm-permission-note">优先处理公开队列中的紧急内容</span></header>
      <div className="adm-report-grid">
        {items.length === 0 ? <div className="adm-empty"><span>○</span><p>当前没有举报</p></div> : items.map(report => (
          <article key={report.id} className={`adm-report ${report.status}`}>
            <header><Badge tone={report.status === 'open' || report.status === 'in_review' ? 'orange' : report.status === 'resolved' ? 'green' : 'neutral'}>{report.status === 'open' ? '待处理' : report.status === 'in_review' ? '处理中' : report.status === 'resolved' ? '已处理' : '已驳回'}</Badge><span>{formatDate(report.created_at)}</span></header>
            <h4>{report.reason}</h4>
            <p>{report.details || '举报人没有补充说明。'}</p>
            <dl><div><dt>对象</dt><dd>{report.target_type} / {report.target_id.slice(0, 12)}</dd></div><div><dt>举报人</dt><dd>{report.reporter_username ?? report.reporter_id.slice(0, 10)}</dd></div></dl>
            {(report.status === 'open' || report.status === 'in_review') && <footer><button type="button" className="adm-primary" disabled={busy} onClick={() => void handle(report.id, 'resolve')}>标记处理</button><button type="button" className="adm-secondary" disabled={busy} onClick={() => void handle(report.id, 'reject')}>驳回</button></footer>}
          </article>
        ))}
      </div>
    </section>
  );
}

