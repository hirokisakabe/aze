interface BreadcrumbProps {
  path: string;
}

export function Breadcrumb({ path }: BreadcrumbProps) {
  const parts = path.replace(/\.md$/, '').split('/');
  return (
    <div className="crumb">
      <span className="crumb-bracket">[</span>
      {parts.map((p, i) => (
        <span className="crumb-seg" key={i}>
          {i > 0 && <span className="crumb-sep">/</span>}
          <span className={i === parts.length - 1 ? 'crumb-leaf' : ''}>{p}</span>
        </span>
      ))}
      <span className="crumb-bracket">]</span>
    </div>
  );
}
