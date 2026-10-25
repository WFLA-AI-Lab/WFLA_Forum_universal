import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { Badge, formatDate } from './shared';

interface ContentItem {
  id: string; title?: string; thread_title?: string; content_markdown?: string; status: string;
  created_at: string; author_username: string; author_real_name: string; author_enrollment_year?: string;
  board_name?: string; floor_number?: number; view_count?: number; reply_count?: number; report_count?: number;
}
type Notify = (tone: 'success' | 'error', message: string) => void;

export function ContentPanel({ notify }: { notify: Notify }) {
  const [type, setType] = useState<'threads' | 'posts'>('threads');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [reason, setReason] = useState('');
  const params = useMemo(() => {
    const value = new URLSearchParams({ type, limit: '150' });
    if (status) value.set('status', status);
    if (query.trim()) value.set('query', query.trim());
    return value.toString();
  }, [type, status, query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.get<{ items: ContentItem[] }>(`/admin/content?${params}`).then(data => setItems(data.items)).catch(error => notify('error', error instanceof Error ? error.message : '无法加载内容'));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [params]);
  async function update(item: ContentItem, next: string) {
    if (!reason.trim()) { notify('error', '请先填写操作原因'); return; }
    try {
      await api.patch(type === 'threads' ? `/threads/${item.id}/status` : `/posts/${item.id}/status`, { status: next, reason });
      const data = await api.get<{ items: ContentItem[] }>(`/admin/content?${params}`);
      setItems(data.items); setReason(''); notify('success', '内容状态已更新');
    } catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); }
  }
  return (
    <>
      <section className="adm-toolbar">
        <div className="adm-segment"><button type="button" className={type === 'threads' ? 'active' : ''} onClick={() => { setType('threads'); setStatus(''); }}>话题</button><button type="button" className={type === 'posts' ? 'active' : ''} onClick={() => { setType('posts'); setStatus(''); }}>回复</button></div>
        <div className="adm-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索内容" /></div>
        <select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="published">正常</option><option value="hidden">已隐藏</option>{type === 'threads' && <option value="locked">已锁定</option>}</select>
      </section>
      <section className="adm-card adm-feed-admin">
        <header><div><small>CONTENT MODERATION</small><h3>{type === 'threads' ? '话题审核' : '回复审核'}</h3></div><span className="adm-permission-note">隐藏操作必须填写原因并写入审计日志</span></header>
        {items.length === 0 ? <div className="adm-empty"><span>○</span><p>没有符合条件的内容</p></div> : items.map(item => (
          <article key={item.id} className="adm-content-row">
            <div className="adm-content-main">
              <div className="adm-content-meta"><Badge tone={item.status === 'published' ? 'green' : item.status === 'hidden' ? 'orange' : 'neutral'}>{item.status === 'published' ? '正常' : item.status === 'hidden' ? '已隐藏' : '已锁定'}</Badge><span>{item.board_name ?? item.thread_title}</span><span>#{item.floor_number ?? '主贴'}</span>{!!item.report_count && <Badge tone="red">{item.report_count} 条举报</Badge>}</div>
              <h4>{item.title ?? item.content_markdown?.slice(0, 120)}</h4>
              <p>{item.content_markdown?.slice(0, 220) ?? `${item.author_real_name} 发布的话题`}</p>
              <footer><span>{item.author_real_name} · {item.author_enrollment_year ?? '—'} 届 · {formatDate(item.created_at)}</span><span>{item.reply_count ?? 0} 回复 · {item.view_count ?? 0} 浏览</span></footer>
            </div>
            <div className="adm-content-actions"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="操作原因" />{item.status !== 'published' && <button type="button" className="adm-secondary" onClick={() => void update(item, 'published')}>恢复</button>}{item.status === 'published' && <button type="button" className="adm-danger-ghost" onClick={() => void update(item, 'hidden')}>隐藏</button>}{type === 'threads' && item.status !== 'locked' && <button type="button" className="adm-secondary" onClick={() => void update(item, 'locked')}>锁定</button>}</div>
          </article>
        ))}
      </section>
    </>
  );
}
