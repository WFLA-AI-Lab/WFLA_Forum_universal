import { useEffect, useState } from 'react';
import { api } from '../api';
import type { SiteConfig, User } from '../skins/contract';

type Notify = (tone: 'success' | 'error', message: string) => void;
type Mode = 'appearance' | 'settings' | 'system';
interface Skin { id: string; name: string; description: string; status: string }
interface SiteConfigAdmin { tagline: string; default_skin: string; skins: Skin[]; all_skins: Skin[]; guest_read_enabled: boolean; registration_enabled: boolean }
interface RuntimeSettings { forum_name: string; public_origin: string; session_ttl_seconds: number; cookie_secure: boolean; cookie_samesite: 'Lax' | 'Strict'; trust_proxy_headers: boolean; github_client_id: string; github_client_secret_configured: boolean; github_redirect_uri: string; microsoft_client_id: string; microsoft_client_secret_configured: boolean; microsoft_redirect_uri: string; updated_at: string | null }
interface SettingsForm { forum_name: string; public_origin: string; session_ttl_seconds: number; cookie_secure: boolean; cookie_samesite: 'Lax' | 'Strict'; trust_proxy_headers: boolean; github_client_id: string; github_client_secret: string; github_redirect_uri: string; clear_github_client_secret: boolean; microsoft_client_id: string; microsoft_client_secret: string; microsoft_redirect_uri: string; clear_microsoft_client_secret: boolean; confirm_password: string }
interface Diagnostics { results: Record<string, { label: string; ok: boolean; status: number; latency_ms: number; error: string | null }>; hint: string | null }

export function SystemPanel({ mode, me, site, notify, onSettingsChanged }: { mode: Mode; me: User; site: SiteConfig; notify: Notify; onSettingsChanged: () => Promise<void> }) {
  const [config, setConfig] = useState<SiteConfigAdmin | null>(null);
  const [runtime, setRuntime] = useState<RuntimeSettings | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [form, setForm] = useState<SettingsForm>({
    forum_name: '', public_origin: '', session_ttl_seconds: 604800, cookie_secure: false,
    cookie_samesite: 'Lax', trust_proxy_headers: false, github_client_id: '', github_client_secret: '',
    github_redirect_uri: '', clear_github_client_secret: false, microsoft_client_id: '',
    microsoft_client_secret: '', microsoft_redirect_uri: '', clear_microsoft_client_secret: false, confirm_password: ''
  });

  useEffect(() => {
    if (mode === 'appearance') {
      api.get<{ config: SiteConfigAdmin }>('/admin/site-config')
        .then(data => setConfig(data.config))
        .catch(error => notify('error', error instanceof Error ? error.message : '无法加载外观配置'));
    }
    if (mode === 'settings') {
      api.get<{ settings: RuntimeSettings }>('/admin/settings').then(data => {
        setRuntime(data.settings);
        setForm({
          forum_name: data.settings.forum_name, public_origin: data.settings.public_origin,
          session_ttl_seconds: data.settings.session_ttl_seconds, cookie_secure: data.settings.cookie_secure,
          cookie_samesite: data.settings.cookie_samesite, trust_proxy_headers: data.settings.trust_proxy_headers,
          github_client_id: data.settings.github_client_id, github_client_secret: '',
          github_redirect_uri: data.settings.github_redirect_uri, clear_github_client_secret: false,
          microsoft_client_id: data.settings.microsoft_client_id, microsoft_client_secret: '',
          microsoft_redirect_uri: data.settings.microsoft_redirect_uri,
          clear_microsoft_client_secret: false, confirm_password: ''
        });
      }).catch(error => notify('error', error instanceof Error ? error.message : '无法加载高级设置'));
    }
  }, [mode]);

  async function run<T>(task: () => Promise<T>, message: string): Promise<T | null> {
    try { const result = await task(); notify('success', message); return result; }
    catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); return null; }
  }
  if (mode === 'appearance') {
    if (!config) return <div className="adm-skeleton"><span /><span /><span /></div>;
    return (
      <section className="adm-two-column appearance">
        <article className="adm-card">
          <header><div><small>DISCOVERY</small><h3>皮肤与默认布局</h3></div></header>
          <div className="adm-skin-grid">{config.all_skins.map(skin => {
            const enabled = config.skins.some(item => item.id === skin.id);
            return <button type="button" key={skin.id} className={`${enabled ? 'enabled' : ''} ${config.default_skin === skin.id ? 'default' : ''}`} onClick={() => setConfig(current => {
              if (!current) return current;
              const nextSkins = enabled ? current.skins.filter(item => item.id !== skin.id) : [...current.skins, skin];
              if (nextSkins.length === 0) return current;
              return { ...current, skins: nextSkins, default_skin: enabled && current.default_skin === skin.id ? nextSkins[0]!.id : current.default_skin };
            })}><span><i>{skin.id === 'x' ? 'X' : 'EF'}</i><b>{skin.name}</b><small>{skin.status === 'stable' ? '稳定版' : '预览版'}</small></span><em>{enabled ? '已启用' : '已关闭'}</em></button>;
          })}</div>
          <label className="adm-field"><span>访客默认皮肤</span><select value={config.default_skin} onChange={e => setConfig({ ...config, default_skin: e.target.value })}>{config.skins.map(skin => <option key={skin.id} value={skin.id}>{skin.name}</option>)}</select></label>
        </article>
        <article className="adm-card">
          <header><div><small>PUBLIC POLICY</small><h3>可见性与注册</h3></div></header>
          <div className="adm-setting-list">
            <Toggle title="允许游客浏览" detail="关闭后所有页面都要求登录。" checked={config.guest_read_enabled} onChange={value => setConfig({ ...config, guest_read_enabled: value })} />
            <Toggle title="开放邀请注册" detail="关闭后注册页面立即停止接受申请。" checked={config.registration_enabled} onChange={value => setConfig({ ...config, registration_enabled: value })} />
            <label className="adm-field"><span>站点副标题</span><input value={config.tagline} onChange={e => setConfig({ ...config, tagline: e.target.value })} /></label>
          </div>
          <button type="button" className="adm-primary wide" onClick={() => void run(() => api.patch('/admin/site-config', { default_skin: config.default_skin, allowed_skins: config.skins.map(skin => skin.id), guest_read_enabled: config.guest_read_enabled, registration_enabled: config.registration_enabled, site_tagline: config.tagline }), '外观与访问策略已保存').then(async ok => { if (ok) await onSettingsChanged(); })}>保存并立即应用</button>
        </article>
      </section>
    );
  }
  if (mode === 'system') {
    return (
      <section className="adm-settings">
        <article className="adm-card">
          <header><div><small>NETWORK DIAGNOSTICS</small><h3>第三方服务连通性</h3></div><button type="button" className="adm-secondary" onClick={() => void run(() => api.get<Diagnostics>('/admin/diagnostics'), '网络诊断完成').then(data => { if (data) setDiag(data); })}>开始检测</button></header>
          {!diag ? <div className="adm-empty"><span>○</span><p>点击「开始检测」检查 GitHub 与 Microsoft 连通性</p></div> : <div className="adm-probe-grid">{Object.entries(diag.results).map(([key, probe]) => <div key={key} className={probe.ok ? 'ok' : 'fail'}><span>{probe.ok ? '✓' : '!'}</span><div><b>{probe.label}</b><small>HTTP {probe.status} · {probe.latency_ms} ms</small>{probe.error && <p>{probe.error}</p>}</div></div>)}</div>}
          {diag?.hint && <div className="adm-diagnostic-hint">{diag.hint}</div>}
        </article>
        <article className="adm-card system-info"><header><div><small>BUILD</small><h3>运行信息</h3></div></header><dl><div><dt>应用版本</dt><dd>{site.version}</dd></div><div><dt>API 版本</dt><dd>v1</dd></div><div><dt>皮肤契约</dt><dd>v{site.skin_contract_version}</dd></div><div><dt>管理员</dt><dd>{me.real_name} / {me.role}</dd></div></dl></article>
      </section>
    );
  }
  if (!runtime) return <div className="adm-skeleton"><span /><span /><span /></div>;
  return (
    <section className="adm-settings">
      <article className="adm-card">
        <header><div><small>RUNTIME</small><h3>站点与会话</h3></div><span>修改后立即生效</span></header>
        <div className="adm-form-grid">
          <label className="adm-field"><span>论坛名称</span><input value={form.forum_name} onChange={e => setForm({ ...form, forum_name: e.target.value })} /></label>
          <label className="adm-field"><span>公开地址</span><input value={form.public_origin} onChange={e => setForm({ ...form, public_origin: e.target.value })} /></label>
          <label className="adm-field"><span>会话有效期（秒）</span><input type="number" min={300} value={form.session_ttl_seconds} onChange={e => setForm({ ...form, session_ttl_seconds: Number(e.target.value) })} /></label>
          <label className="adm-field"><span>Cookie SameSite</span><select value={form.cookie_samesite} onChange={e => setForm({ ...form, cookie_samesite: e.target.value as 'Lax' | 'Strict' })}><option value="Lax">Lax</option><option value="Strict">Strict</option></select></label>
          <Toggle title="Secure Cookie" detail="HTTPS 部署必须开启。" checked={form.cookie_secure} onChange={value => setForm({ ...form, cookie_secure: value })} />
          <Toggle title="信任代理头" detail="仅在使用可信反向代理时开启。" checked={form.trust_proxy_headers} onChange={value => setForm({ ...form, trust_proxy_headers: value })} />
        </div>
      </article>
      <article className="adm-card">
        <header><div><small>OAUTH</small><h3>第三方登录</h3></div><span>敏感值已加密存储，不会回显</span></header>
        <div className="adm-provider-grid">
          <ProviderForm kind="github" label="GitHub" clientId={form.github_client_id} secret={form.github_client_secret} redirect={form.github_redirect_uri} configured={runtime.github_client_secret_configured} clear={form.clear_github_client_secret} onClientId={value => setForm({ ...form, github_client_id: value })} onSecret={value => setForm({ ...form, github_client_secret: value, clear_github_client_secret: false })} onRedirect={value => setForm({ ...form, github_redirect_uri: value })} onClear={() => setForm({ ...form, github_client_secret: '', clear_github_client_secret: !form.clear_github_client_secret })} />
          <ProviderForm kind="microsoft" label="Microsoft" clientId={form.microsoft_client_id} secret={form.microsoft_client_secret} redirect={form.microsoft_redirect_uri} configured={runtime.microsoft_client_secret_configured} clear={form.clear_microsoft_client_secret} onClientId={value => setForm({ ...form, microsoft_client_id: value })} onSecret={value => setForm({ ...form, microsoft_client_secret: value, clear_microsoft_client_secret: false })} onRedirect={value => setForm({ ...form, microsoft_redirect_uri: value })} onClear={() => setForm({ ...form, microsoft_client_secret: '', clear_microsoft_client_secret: !form.clear_microsoft_client_secret })} />
        </div>
      </article>
      <article className="adm-card confirm-card">
        <div><small>OWNER CONFIRMATION</small><h3>确认修改</h3><p>高级设置会影响全站登录与安全策略，保存前需要验证当前 owner 密码。</p></div>
        <input type="password" autoComplete="current-password" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })} placeholder="当前 owner 密码" />
        <button type="button" className="adm-primary" disabled={!form.confirm_password} onClick={() => void run(() => api.patch<{ settings: RuntimeSettings }>('/admin/settings', { ...form, github_client_secret: form.github_client_secret || undefined, microsoft_client_secret: form.microsoft_client_secret || undefined }), '高级设置已保存并立即生效').then(data => { if (data) { setRuntime(data.settings); setForm(current => ({ ...current, github_client_secret: '', microsoft_client_secret: '', confirm_password: '' })); } })}>验证并保存</button>
      </article>
    </section>
  );
}

function Toggle({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="adm-toggle"><div><b>{title}</b><small>{detail}</small></div><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><i /></label>;
}
function ProviderForm({ kind, label, clientId, secret, redirect, configured, clear, onClientId, onSecret, onRedirect, onClear }: { kind: string; label: string; clientId: string; secret: string; redirect: string; configured: boolean; clear: boolean; onClientId: (value: string) => void; onSecret: (value: string) => void; onRedirect: (value: string) => void; onClear: () => void }) {
  return <div className="adm-provider"><header><i className={kind}>{kind === 'github' ? 'GH' : 'MS'}</i><div><b>{label} OAuth</b><small>{configured ? '已配置密钥' : '尚未配置密钥'}</small></div><span className={`adm-badge ${configured && clientId ? 'green' : 'neutral'}`}>{configured && clientId ? '可用' : '未完成'}</span></header><label className="adm-field"><span>Client ID</span><input value={clientId} onChange={e => onClientId(e.target.value)} /></label><label className="adm-field"><span>Client Secret</span><input type="password" value={secret} onChange={e => onSecret(e.target.value)} placeholder={configured ? '留空表示保持不变' : '输入新的密钥'} /></label><label className="adm-field"><span>回调地址</span><input value={redirect} onChange={e => onRedirect(e.target.value)} /></label>{configured && <button type="button" className="adm-danger-ghost" onClick={onClear}>{clear ? '已标记清除（点击撤销）' : `清除 ${label} 密钥`}</button>}</div>;
}
