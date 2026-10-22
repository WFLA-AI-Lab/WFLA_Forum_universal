import sanitizeHtml from 'sanitize-html';

export function renderMarkdown(markdown: string): string {
  return sanitizeHtml(markdown, {
    allowedTags: [
      'p','br','strong','em','b','i','code','pre','blockquote',
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
