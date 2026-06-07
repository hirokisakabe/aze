import { Children, createContext, isValidElement, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Components } from 'react-markdown';
import { assetIdFromMarkdownUrl } from './assets';

const InsidePreContext = createContext(false);

function Pre({ children }: { children?: ReactNode }) {
  return (
    <InsidePreContext.Provider value={true}>
      <pre className="md-pre">{children}</pre>
    </InsidePreContext.Provider>
  );
}

function Code({ children, className }: { children?: ReactNode; className?: string }) {
  const insidePre = useContext(InsidePreContext);
  if (insidePre) {
    return <code className={className}>{children}</code>;
  }
  return <code className="md-code">{children}</code>;
}

function Li({ children, className }: { children?: ReactNode; className?: string }) {
  if (className?.includes('task-list-item')) {
    const childArray = Children.toArray(children);
    const checkbox = childArray.find((child) => isValidElement(child) && child.type === 'input') as
      | ReactElement<{ checked?: boolean }>
      | undefined;
    const done = checkbox?.props?.checked ?? false;
    const textChildren = childArray.filter(
      (child) => !(isValidElement(child) && child.type === 'input')
    );
    return (
      <li className={`md-li md-task${done ? ' is-done' : ''}`}>
        <span className="md-check" aria-hidden="true">
          {done ? '✓' : ''}
        </span>
        <span className="md-task-text">{textChildren}</span>
      </li>
    );
  }
  return <li className="md-li">{children}</li>;
}

function isExternalUrl(href?: string) {
  if (!href) return false;
  if (href.startsWith('//')) return true;

  try {
    const url = new URL(href);
    return !['javascript:', 'vbscript:', 'data:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function transformMarkdownUrl(value: string) {
  if (assetIdFromMarkdownUrl(value)) return value;
  return defaultUrlTransform(value);
}

interface MarkdownPreviewProps {
  content: string;
  resolveAssetUrl?: (id: string) => string | undefined;
}

export function MarkdownPreview({ content, resolveAssetUrl }: MarkdownPreviewProps) {
  const components: Components = {
    h1: ({ children }) => <h1 className="md-h md-h1">{children}</h1>,
    h2: ({ children }) => <h2 className="md-h md-h2">{children}</h2>,
    h3: ({ children }) => <h3 className="md-h md-h3">{children}</h3>,
    h4: ({ children }) => <h4 className="md-h md-h4">{children}</h4>,
    p: ({ children }) => <p className="md-p">{children}</p>,
    ul: ({ children, className }) => (
      <ul className={`md-list${className?.includes('contains-task-list') ? ' md-tasklist' : ''}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => <ol className="md-list">{children}</ol>,
    li: Li,
    blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
    pre: Pre,
    code: Code,
    hr: () => <hr className="md-hr" />,
    a: ({ children, href }) => {
      const external = isExternalUrl(href);
      return (
        <a
          className="md-link"
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          onClick={external ? undefined : (e) => e.preventDefault()}
        >
          {children}
        </a>
      );
    },
    img: ({ alt, src, title }) => {
      const assetId = assetIdFromMarkdownUrl(src);
      const resolvedSrc = assetId ? resolveAssetUrl?.(assetId) : src;
      return (
        <img
          className="md-img"
          src={resolvedSrc}
          alt={alt ?? ''}
          title={title}
          loading="lazy"
          data-asset-id={assetId ?? undefined}
        />
      );
    },
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={components}
      urlTransform={transformMarkdownUrl}
    >
      {content}
    </ReactMarkdown>
  );
}
