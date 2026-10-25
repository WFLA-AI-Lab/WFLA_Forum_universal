export type CopyResult = 'copied' | 'manual';

/**
 * Copy text without assuming a secure browser context.
 *
 * navigator.clipboard is unavailable on plain-HTTP origins. The legacy
 * textarea fallback still works there and is also useful in older embedded
 * WebViews. Callers must provide a manual-copy surface when this returns
 * "manual" (for example because the browser blocks execCommand too).
 */
export async function copyText(text: string): Promise<CopyResult> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      // Permission or focus errors: keep trying the local fallback.
    }
  }

  if (typeof document === 'undefined') return 'manual';
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  document.body.appendChild(area);

  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy') ? 'copied' : 'manual';
  } catch {
    return 'manual';
  } finally {
    area.remove();
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}
