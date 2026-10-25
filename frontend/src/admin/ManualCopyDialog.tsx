import { useEffect, useRef, useState } from 'react';
import { copyText } from './clipboard';

export function ManualCopyDialog({ text, label, onClose }: { text: string; label: string; onClose: () => void }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [retryResult, setRetryResult] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="adm-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="adm-sheet adm-copy-dialog" role="dialog" aria-modal="true" aria-labelledby="adm-copy-title">
        <header>
          <div><small>MANUAL COPY</small><h2 id="adm-copy-title">请手动复制{label}</h2><p>浏览器阻止了自动复制。内容已选中，可按 Ctrl+C（Mac：⌘C）复制。</p></div>
          <button type="button" aria-label="关闭" onClick={onClose}>×</button>
        </header>
        <textarea ref={input} className="adm-copy-value" rows={3} value={text} readOnly onFocus={event => event.currentTarget.select()} />
        {retryResult === 'failed' && <p className="adm-copy-hint" role="alert">仍无法自动复制，请使用上面的文本框手动复制。</p>}
        {retryResult === 'copied' && <p className="adm-copy-hint success" role="status">已复制。</p>}
        <footer>
          <button type="button" className="adm-secondary" onClick={onClose}>关闭</button>
          <button type="button" className="adm-primary" onClick={() => void copyText(text).then(result => setRetryResult(result === 'copied' ? 'copied' : 'failed'))}>再试一次</button>
        </footer>
      </section>
    </div>
  );
}
