import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, formatDate } from './shared';

interface TargetThread { id: string; title: string; status: string; author_real_name: string; author_enrollment_year: string }
interface TargetPost { id: string; thread_id: string; thread_title: string; floor_number: number; status: string; content_markdown: string; author_real_name: string; author_enrollment_year: string }
interface TargetUser { id: string; username: string; real_name: string; enrollment_year: string; role: string; status: string }
interface ReportItem {
  id: string; target_type: 'thread' | 'post' | 'user'; target_id: string; reason: string; details: string;
  status: string; created_at: string; reporter_real_name: string; reporter_enrollment_year: string;
  target_thread: TargetThread | null; target_post: TargetPost | null; target_user: TargetUser | null;
}
type Notify = (tone: 'success' | 'error', message: string) => void;

export function ReportsPanel({ notify }: { notify: Notify }) {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [detail, setDetail] = useState<ReportItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  async function load() {
    try { setItems((await api.get<{ items: ReportItem[] }>('/reports?status=open')).items); }
    catch (error) { notify('error', error instanceof Error ? error.message : '无法加载举报'); }
  }
  async function open(id: string) {
    setDetail((await api.get<{ item: ReportItem }>(`/reports/${id}`)).item);
  }
  useEffect(() => { void load(); }, []);
  async function act(id: string, kind: 'resolve' | 'reject') {
    if (reason.trim().length < 2) { notify('error', '请先填写处理说明'); return; }
    setBusy(true);
    try {
      await api.post(`/reports/${id}/${kind}`, kind === 'resolve' ? { resolution: reason } : { reason });
      await load(); setDetail(null); setReason('');
      notify('success', kind === 'resolve' ? '举报已处理' : '举报已驳回');
    } catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); }
    finally { setBusy(false); }
  }
  const target = detail?.target_type === 'thread' ? detail.target_thread : detail?.target_type === 'post' ? detail.target_post : detail?.target_user;
  return (
    <>
      <section className="adm-card adm-reports-card">
        <header><div><small>MODERATION QUEUE</small><h3>举报与申诉</h3></div><span className="adm-permission-note">先查看完整上下文，再处理或驳回</span></header>
        <div className="adm-report-grid">
          {items.length === 0 ? <div className="adm-empty"><span>○</span><p>当前没有待处理举报</p></div> : items.map(report => (
            <article key={report.id} className={`adm-report ${report.status}`}>
              <header><Badge tone="orange">待处理</Badge><span>{formatDate(report.created_at)}</span></header>
              <h4>{report.reason}</h4>
              <p>{report.details || '举报人没有补充说明。'}</p>
              <dl><div><dt>对象</dt><dd>{report.target_type}</dd></div><div><dt>举报人</dt><dd>{report.reporter_real_name} · {report.reporter_enrollment_year} 届</dd></div></dl>
              <footer><button type="button" className="adm-primary" onClick={() => void open(report.id)}>查看上下文</button></footer>
            </article>
          ))}
        </div>
      </section>
      {detail && target && (
        <section className="adm-card">
          <header><div><small>REPORT CONTEXT</small><h3>举报上下文</h3></div><button type="button" onClick={() => setDetail(null)}>关闭</button></header>
          <div className="adm-context">
            <div><span>举报人</span><b>{detail.reporter_real_name} · {detail.reporter_enrollment_year} 届</b></div>
            <div><span>类型</span><b>{detail.target_type}</b></div>
            {'title' in target && <div className="adm-context-wide"><span>标题</span><b>{target.title}</b></div>}
            {'content_markdown' in target && <div className="adm-context-wide"><span>内容</span><p>{target.content_markdown}</p></div>}
            {'real_name' in target && <div><span>被举报人</span><b>{target.real_name} · {target.enrollment_year} 届 · {target.status}</b></div>}
            {'author_real_name' in target && <div><span>作者</span><b>{target.author_real_name} · {target.author_enrollment_year} 届</b></div>}
          </div>
          <textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder="处理说明 / 驳回原因（写入审计日志并通知举报人）" />
          <footer><button type="button" className="adm-primary" disabled={busy} onClick={() => void act(detail.id, 'resolve')}>标记处理</button><button type="button" className="adm-secondary" disabled={busy} onClick={() => void act(detail.id, 'reject')}>驳回</button></footer>
        </section>
      )}
    </>
  );
}
