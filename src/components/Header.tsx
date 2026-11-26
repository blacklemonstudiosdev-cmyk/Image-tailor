import React from 'react';

export function Header({
  onHome,
  actions,
  children,
}: {
  onHome?: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="hdr">
      <div
        className="hdr-brand"
        onClick={onHome}
        role={onHome ? 'button' : undefined}
        title="Image Tailor"
      >
        <h1 className="wordmark">Image Tailor</h1>
        <a
          className="attr"
          href="https://blacklemonstudios.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
        >
          A Product by BlackLemon Studios
        </a>
      </div>
      {children}
      <div className="hdr-actions">{actions}</div>
    </header>
  );
}
