/**
 * Temporary backend acceptance page for the v0.9 chat API.
 * The production UI will be implemented by Zx_; do not polish this page.
 * Route: /#/chat-test
 */
import { useEffect, useState } from 'react';
import { api } from './api';

interface User {
  id: string;
  username: string;
  real_name: string;
  enrollment_year: string;
  role: string;
  status: string;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  unread_count: number;
  counterpart?: User | null;
  owner?: User | null;
  last_message?: Message | null;
  last_message_at?: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content_markdown: string;
  content_html: string;
  status: string;
  created_at: string;
  deleted_at?: string | null;
  sender?: User | null;
}

interface SearchResults { users: User[] }

const style: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  padding: 24,
  display: 'grid',
  gap: 12
};

const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

export default function ChatTestPage() {
  const [me, setMe] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [content, setContent] = useState('');
  const [groupId, setGroupId] = useState('');
  const [message, setMessage] = useState('');

  const loadConversations = async () => {
    const data = await api.get<{ items: Conversation[] }>('/conversations?limit=50');
    setConversations(data.items);
  };

  const loadMessages = async (conversation: Conversation) => {
    setSelected(conversation);
    const data = await api.get<{ items: Message[] }>(`/conversations/${conversation.id}/messages?limit=100`);
    setMessages(data.items);
  };

  useEffect(() => {
    void (async () => {
      try {
        const meData = await api.get<{ user: User }>('/me');
        setMe(meData.user);
        await loadConversations();
      } catch (error) {
        setMessage((error as Error).message);
      }
    })();
  }, []);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const data = await api.get<SearchResults>(`/search?q=${encodeURIComponent(query)}`);
      setUsers(data.users.filter(user => user.id !== me?.id));
    } catch (error) { setMessage((error as Error).message); }
  };

  const startDirect = async (userId: string) => {
    try {
      const data = await api.post<{ item: Conversation }>('/conversations/direct', { user_id: userId });
      await loadConversations();
      await loadMessages(data.item);
    } catch (error) { setMessage((error as Error).message); }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !content.trim()) return;
    try {
      const data = await api.post<{ item: Message }>(`/conversations/${selected.id}/messages`, {
        client_id: crypto.randomUUID(),
        content
      });
      setMessages(current => [data.item, ...current]);
      setContent('');
      await loadConversations();
    } catch (error) { setMessage((error as Error).message); }
  };

  const remove = async (id: string) => {
    try {
      const data = await api.del<{ item: Partial<Message> }>(`/messages/${id}`);
      setMessages(current => current.map(item => item.id === id ? { ...item, ...data.item } : item));
    } catch (error) { setMessage((error as Error).message); }
  };

  const read = async () => {
    if (!selected || !messages[0]) return;
    try {
      await api.post(`/conversations/${selected.id}/read`, { message_id: messages[0].id });
      await loadConversations();
    } catch (error) { setMessage((error as Error).message); }
  };

  const block = async (userId: string) => {
    try { await api.post(`/users/${userId}/block`, {}); setMessage('已屏蔽'); }
    catch (error) { setMessage((error as Error).message); }
  };

  const unblock = async (userId: string) => {
    try { await api.del(`/users/${userId}/block`); setMessage('已取消屏蔽'); }
    catch (error) { setMessage((error as Error).message); }
  };

  const report = async (id: string) => {
    try { await api.post('/reports', { target_type: 'message', target_id: id, reason: '临时验收举报', details: '' }); setMessage('已举报'); }
    catch (error) { setMessage((error as Error).message); }
  };

  const createGroup = async () => {
    try {
      const data = await api.post<{ item: { id: string } }>('/admin/chat/groups', { name: `临时测试群-${Date.now()}` });
      setGroupId(data.item.id);
      setMessage(`群已创建：${data.item.id}`);
      await loadConversations();
    } catch (error) { setMessage((error as Error).message); }
  };

  const addMeToGroup = async () => {
    if (!groupId || !me) return;
    try {
      await api.post(`/admin/chat/groups/${groupId}/members`, { user_id: me.id });
      await loadConversations();
      setMessage('已加入群');
    } catch (error) { setMessage((error as Error).message); }
  };

  return (
    <main style={style}>
      <h1>聊天 API 临时验收页</h1>
      <p>这是后端验收用页面；正式 UI 由 Zx_实现。</p>
      <div>{message}</div>
      <form style={rowStyle} onSubmit={search}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名/用户名" />
        <button type="submit">搜索用户</button>
        <button type="button" onClick={createGroup}>管理员：创建测试群</button>
        <button type="button" onClick={addMeToGroup}>管理员：把我加入群</button>
      </form>
      <div style={rowStyle}>
        {users.map(user => (
          <span key={user.id}>
            <b>{user.real_name}</b> @{user.username}
            <button type="button" onClick={() => void startDirect(user.id)}>私聊</button>
            <button type="button" onClick={() => void block(user.id)}>屏蔽</button>
            <button type="button" onClick={() => void unblock(user.id)}>取消屏蔽</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
        <section>
          <h2>会话</h2>
          {conversations.map(conversation => (
            <button key={conversation.id} type="button" onClick={() => void loadMessages(conversation)}>
              <b>{conversation.title || conversation.id}</b> 未读 {conversation.unread_count}
            </button>
          ))}
        </section>
        <section>
          <h2>消息（服务端 DESC）</h2>
          {messages.map(item => (
            <article key={item.id}>
              <b>{item.sender?.real_name ?? item.sender_id}</b>
              <div>{item.status === 'deleted' ? '（已删除）' : item.content_markdown}</div>
              <button type="button" onClick={() => void report(item.id)}>举报</button>
              {item.sender_id === me?.id && item.status === 'published' && <button type="button" onClick={() => void remove(item.id)}>删除</button>}
            </article>
          ))}
          {selected && <button type="button" onClick={() => void read()}>全部标记已读</button>}
          <form style={rowStyle} onSubmit={send}>
            <input value={content} onChange={event => setContent(event.target.value)} placeholder="消息内容" />
            <button type="submit">发送</button>
          </form>
        </section>
      </div>
    </main>
  );
}
