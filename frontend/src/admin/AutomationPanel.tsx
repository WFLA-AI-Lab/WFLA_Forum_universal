import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, formatDate } from './shared';

interface AutomationRuleItem {
  id: string; kind: string; name: string; description: string; enabled: boolean; threshold: number; updated_at: string;
}
interface RiskItem {
  id: string; target_type: string; target_id: string; reason: string; score: number; status: string; created_at: string;
  rule_name?: string | null; actor_real_name?: string | null;
}
type Notify = (tone: 'success' | 'error', message: string) => void;

export function AutomationPanel({ notify, canEdit }: { notify: Notify; canEdit: boolean }) {
  const [rules, setRules] = useState<AutomationRuleItem[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  async function load() {
    const [ruleData, riskData] = await Promise.all([
      api.get<{ items: AutomationRuleItem[] }>('/moderation/rules'),
      api.get<{ items: RiskItem[] }>('/moderation/risks')
    ]);
    setRules(ruleData.items); setRisks(riskData.items);
  }
  async function updateRule(item: AutomationRuleItem, patch: { enabled?: boolean; threshold?: number }) {
    try {
      await api.patch(`/moderation/rules/${item.id}`, patch);
      await load(); notify('success', '自动监管规则已更新');
    } catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); }
  }
  async function dismiss(id: string) {
    const reason = window.prompt('忽略该风险事件的原因');
    if (!reason) return;
    try { await api.post(`/moderation/risks/${id}/dismiss`, { reason }); await load(); notify('success', '风险事件已忽略'); }
    catch (error) { notify('error', error instanceof Error ? error.message : '操作失败'); }
  }
  useEffect(() => { void load(); }, []);
  return (
    <div className="adm-automation">
      <section className="adm-card">
        <header><div><small>AUTOMATION RULES</small><h3>自动监管规则</h3></div><span className="adm-permission-note">自动隐藏必须留审计记录；管理员可随时调整</span></header>
        <div className="adm-rule-list">{rules.map(rule => (
          <article key={rule.id}>
            <div><b>{rule.name}</b><p>{rule.description}</p></div>
            <div className="adm-rule-actions">
              <label>阈值<input type="number" min={1} max={100} defaultValue={rule.threshold} disabled={!canEdit} onBlur={event => { const value = Number(event.target.value); if (value !== rule.threshold && value >= 1) void updateRule(rule, { threshold: value }); }} /></label>
              <button type="button" className={rule.enabled ? 'adm-primary' : 'adm-secondary'} disabled={!canEdit} onClick={() => void updateRule(rule, { enabled: !rule.enabled })}>{rule.enabled ? '已启用' : '已停用'}</button>
            </div>
          </article>
        ))}</div>
      </section>
      <section className="adm-card">
        <header><div><small>RISK EVENTS</small><h3>风险事件</h3></div><span>{risks.filter(item => item.status === 'open').length} 个待复核</span></header>
        <div className="adm-risk-list">{risks.length === 0 ? <div className="adm-empty"><span>○</span><p>暂无风险事件</p></div> : risks.map(item => (
          <article key={item.id}>
            <div><Badge tone={item.status === 'open' ? 'red' : 'green'}>{item.status}</Badge><span>{item.rule_name ?? '自动规则'}</span></div>
            <p>{item.reason}</p><small>{item.target_type} / {item.target_id} · {formatDate(item.created_at)}</small>
            {item.status === 'open' && <button type="button" className="adm-secondary" onClick={() => void dismiss(item.id)}>人工复核并忽略</button>}
          </article>
        ))}</div>
      </section>
    </div>
  );
}
