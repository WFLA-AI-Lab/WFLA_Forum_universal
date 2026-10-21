import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(markdown: string): string {
  const unsafeHtml = marked.parse(markdown, { async: false });
  return DOMPurify.sanitize(unsafeHtml, {
    ALLOWED_TAGS: [
      'p','br','strong','em','b','i','code','pre','blockquote',
      'ul','ol','li','a','h1','h2','h3','h4','h5','h6','hr','span'
    ],
    ALLOWED_ATTR: ['href','title','class'],
    ALLOW_DATA_ATTR: false
  });
}
