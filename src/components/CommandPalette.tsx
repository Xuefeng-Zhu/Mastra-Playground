/**
 * CommandPalette — Cmd+K fuzzy-search overlay for quick example switching.
 *
 * Opens via Cmd/Ctrl+K or clicking the search bar in the Topbar.
 * Filters examples by name, number, or primitive tags. Arrow keys +
 * Enter to navigate and select; Escape to close.
 */

import { useEffect, useRef, useState } from 'react';
import { EXAMPLES, EXAMPLE_IDS, type PlaygroundExample } from '../registry/examples';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  activeId: string;
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  // Simple subsequence match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function getFilteredExamples(query: string): { id: string; example: PlaygroundExample }[] {
  if (!query.trim()) {
    return EXAMPLE_IDS.map((id) => ({ id, example: EXAMPLES[id] }));
  }
  return EXAMPLE_IDS.filter((id) => {
    const ex = EXAMPLES[id];
    const searchable = `${ex.num} ${ex.name} ${id} ${ex.primTags.join(' ')}`;
    return fuzzyMatch(query, searchable);
  }).map((id) => ({ id, example: EXAMPLES[id] }));
}

export function CommandPalette({ open, onClose, onSelect, activeId }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = getFilteredExamples(query);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay to let the DOM render before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('.cp-item-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          onSelect(results[selectedIndex].id);
          onClose();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!open) return null;

  return (
    <div
      className="cp-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="cp-container" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="cp-input-row">
          <span className="cp-search-icon">⌕</span>
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            placeholder="Search examples…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-label="Search examples"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="cp-esc">esc</kbd>
        </div>
        <div className="cp-list" ref={listRef} role="listbox">
          {results.length === 0 && <div className="cp-empty">No matching examples</div>}
          {results.map(({ id, example }, i) => (
            <button
              key={id}
              className={`cp-item${i === selectedIndex ? ' cp-item-active' : ''}${id === activeId ? ' cp-item-current' : ''}`}
              role="option"
              aria-selected={i === selectedIndex}
              onClick={() => {
                onSelect(id);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="cp-item-num">{String(example.num).padStart(2, '0')}</span>
              <span className="cp-item-name">{example.name}</span>
              <span className="cp-item-tags">
                {example.primTags.map((tag) => (
                  <span key={tag} className="cp-tag">
                    {tag}
                  </span>
                ))}
              </span>
              {id === activeId && <span className="cp-item-current-badge">active</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
