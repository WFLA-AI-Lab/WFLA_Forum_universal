/**
 * The small presentational primitives the Endfield skin is built from.
 *
 * They live beside the skin (not in the contract) because a different skin is
 * free to replace them entirely. They take plain props and hold no state.
 */
import type { ReactNode } from 'react';

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `ef-field ${className}` : 'ef-field'}>{children}</span>;
}

export function Pair({ en, zh }: { en: string; zh: string }) {
  return (
    <div className="ef-pair">
      <span className="ef-eyebrow slash">{en}</span>
      <span>{zh}</span>
    </div>
  );
}

export function Btn({ children, onClick, type = 'button', go = false, small = false, danger = false, disabled = false }: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit';
  go?: boolean; small?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const cls = ['ef-btn', go ? 'go' : '', small ? 'small' : '', danger ? 'danger' : ''].filter(Boolean).join(' ');
  return <button type={type} onClick={onClick} disabled={disabled} className={cls}><span>{children}</span></button>;
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function StateTag({ label, alert = false, draft = false }: { label: string; alert?: boolean; draft?: boolean }) {
  return <span className={`ef-state${alert ? ' is-alert' : ''}${draft ? ' is-draft' : ''}`}>{label}</span>;
}

export function Notice({ flag, children }: { flag: string; children: ReactNode }) {
  return <p className="ef-notice" data-flag={flag} children={children} />;
}

/** Bundle passed straight into the skin body, which destructures these names. */
export const EndfieldPrimitives = { Field, Pair, Btn, FormField, StateTag, Notice };