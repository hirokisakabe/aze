import React, { createContext, useContext } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const InsidePreContext = createContext(false);

function Pre({ children }: { children?: React.ReactNode }) {
  return (
    <InsidePreContext.Provider value={true}>
      <pre className="md-pre">{children}</pre>
    </InsidePreContext.Provider>
  );
}

function Code({ children, className }: { children?: React.ReactNode; className?: string }) {
  const insidePre = useContext(InsidePreContext);
  if (insidePre) {
    return <code className={className}>{children}</code>;
  }
  return <code className="md-code">{children}</code>;
}

function Li({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (className?.includes('task-list-item')) {
    const childArray = React.Children.toArray(children);
    const checkbox = childArray.find(
      (child) => React.isValidElement(child) && child.type === 'input'
    ) as React.ReactElement<{ checked?: boolean }> | undefined;
    const done = checkbox?.props?.checked ?? false;
    const textChildren = childArray.filter(
      (child) => !(React.isValidElement(child) && child.type === 'input')
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
  a: ({ children, href }) => (
    <a className="md-link" href={href} onClick={(e: React.MouseEvent) => e.preventDefault()}>
      {children}
    </a>
  ),
};

export function MarkdownPreview({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
