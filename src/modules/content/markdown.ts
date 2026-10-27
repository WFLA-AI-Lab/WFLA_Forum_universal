import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

export function renderMarkdown(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false, gfm: true, breaks: true });
  return sanitizeHtml(rendered, {
    allowedTags: [
      'p','br','strong','em','b','i','del','code','pre','blockquote',
      'ul','ol','li','a','h1','h2','h3','h4','h5','h6','hr','span'
    ],
    allowedAttributes: {
      a: ['href','title','class'],
      span: ['class']
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow' })
    }
  });
}
