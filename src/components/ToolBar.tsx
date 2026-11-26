import React from 'react';
import { EditorApi, Tool } from './editorApi';

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'move', label: 'Move', key: 'V' },
  { id: 'marquee', label: 'Rectangle select', key: 'M' },
  { id: 'ellipse', label: 'Ellipse select', key: '' },
  { id: 'lasso', label: 'Lasso', key: 'L' },
  { id: 'wand', label: 'Magic wand', key: 'W' },
  { id: 'crop', label: 'Crop', key: 'C' },
  { id: 'brush', label: 'Brush', key: 'B' },
  { id: 'erase', label: 'Eraser', key: 'E' },
  { id: 'clone', label: 'Retouch', key: 'S' },
  { id: 'gradient', label: 'Gradient', key: 'G' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'shape', label: 'Shape', key: '' },
  { id: 'eyedrop', label: 'Eyedropper', key: 'I' },
  { id: 'hand', label: 'Hand', key: 'H' },
  { id: 'zoom', label: 'Zoom', key: 'Z' },
];

function ToolIcon({ name }: { name: Tool }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'move':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v18M3 12h18" {...common} />
          <path d="m12 3 2.4 3M12 3 9.6 6M12 21l2.4-3M12 21l-2.4-3M3 12l3-2.4M3 12l3 2.4M21 12l-3-2.4M21 12l-3 2.4" {...common} />
        </svg>
      );
    case 'marquee':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" strokeDasharray="4 3" {...common} />
        </svg>
      );
    case 'ellipse':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <ellipse cx="12" cy="12" rx="8.5" ry="8.5" strokeDasharray="4 3" {...common} />
        </svg>
      );
    case 'lasso':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4c4.4 0 8 2.4 8 5.4S16.4 15 12 15 4 12.4 4 9.4 7.6 4 12 4Z" {...common} />
          <path d="M8.4 14.6c-.2 1.8.8 2.6.8 3.8a1.4 1.4 0 0 0 2.8 0" {...common} />
        </svg>
      );
    case 'wand':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 20 11-11" {...common} />
          <path d="m14.5 4 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9L14.5 4Z" {...common} />
          <path d="M19.5 13.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" {...common} />
        </svg>
      );
    case 'crop':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 2.5v15h15" {...common} />
          <path d="M2.5 6.5h15v15" {...common} />
        </svg>
      );
    case 'brush':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 3.5 12 11.5l-1.5-1.5L18.5 2 20 3.5Z" {...common} />
          <path d="M10.5 10c-2 0-3.5 1.4-3.5 3.2 0 1.6-1 2.6-2.5 3.1 1.2 1.4 2.8 2.2 4.4 2.2 2.4 0 4.1-1.8 4.1-4.2 0-1.6-.9-2.8-2.5-4.3Z" {...common} />
        </svg>
      );
    case 'erase':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 15.5 11 9l5.5 5.5-3.5 3.5H8l-3.5-2.5Z" {...common} />
          <path d="M11 9l4.5-4.5a1.4 1.4 0 0 1 2 0l3.5 3.5a1.4 1.4 0 0 1 0 2L16.5 14.5" {...common} />
          <path d="M3 20.5h18" {...common} />
        </svg>
      );
    case 'clone':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 15.5h7l-1-4.5h-5l-1 4.5Z" {...common} />
          <path d="M11.5 11V6.5a2 2 0 1 0-2.5-2" {...common} />
          <path d="M6 19.5h12" {...common} />
          <path d="M9.5 19.5v1.5h5v-1.5" {...common} />
        </svg>
      );
    case 'gradient':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" {...common} />
          <path d="M20.5 10.5H8v10" strokeOpacity="0.55" {...common} />
          <path d="M20.5 15.5H13v5" strokeOpacity="0.85" {...common} />
        </svg>
      );
    case 'text':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 6V4.5h15V6" {...common} />
          <path d="M12 4.5v15" {...common} />
          <path d="M8.5 19.5h7" {...common} />
        </svg>
      );
    case 'shape':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" {...common} />
        </svg>
      );
    case 'eyedrop':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 3.5 20.5 9.5 11 19l-5 1 1-5 7.5-7.5Z" {...common} />
          <path d="m13 5 6 6" {...common} />
        </svg>
      );
    case 'hand':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 12V6.2a1.6 1.6 0 0 1 3.2 0V12" {...common} />
          <path d="M11.2 11.5V4.8a1.6 1.6 0 0 1 3.2 0v6.7" {...common} />
          <path d="M14.4 11.8V6.6a1.6 1.6 0 0 1 3.2 0V15c0 3.4-2.4 6-5.8 6S6 18.4 6 15v-2.2a1.6 1.6 0 0 1 3.2 0" {...common} />
        </svg>
      );
    case 'zoom':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" {...common} />
          <path d="m15.5 15.5 4.5 4.5" {...common} />
          <path d="M7.5 10.5h6M10.5 7.5v6" {...common} />
        </svg>
      );
    default:
      return null;
  }
}

export function ToolBar({
  api,
  onImportImage,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
}: {
  api: EditorApi;
  onImportImage: () => void;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={'tool-btn' + (api.tool === t.id ? ' active' : '')}
            data-name={t.key ? `${t.label}  ${t.key}` : t.label}
            aria-label={t.label}
            onClick={() => api.setTool(t.id)}
          >
            <ToolIcon name={t.id} />
          </button>
        ))}
      </div>

      <div className="toolbar-sep" />

      <button type="button" className="btn solid toolbar-import" onClick={onImportImage}>
        + Image
      </button>

      <span className="spacer" />

      <button
        type="button"
        className={'tool-btn' + (leftOpen ? ' active' : '')}
        data-name={leftOpen ? 'Hide panels' : 'Show panels'}
        aria-label="Toggle left panel"
        onClick={onToggleLeft}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9 4.5v15" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      <button
        type="button"
        className={'tool-btn' + (rightOpen ? ' active' : '')}
        data-name={rightOpen ? 'Hide properties' : 'Show properties'}
        aria-label="Toggle right panel"
        onClick={onToggleRight}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15 4.5v15" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}
