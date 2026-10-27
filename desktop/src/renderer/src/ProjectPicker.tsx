import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../shared/types';

/** Searchable dropdown of the user's assigned projects. */
export function ProjectPicker({
  projects,
  value,
  onChange,
  autoOpen = false,
}: {
  projects: Project[];
  value: string | null;
  onChange: (id: string) => void;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const selected = projects.find((p) => p.id === value);

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, query],
  );

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function pick(p: Project) {
    onChange(p.id);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-emerald-500"
        placeholder={selected ? selected.name : 'Search projects…'}
        value={open ? query : (selected?.name ?? '')}
        onFocus={() => setOpen(true)}
        autoFocus={autoOpen}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, filtered.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter' && filtered[active]) pick(filtered[active]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      <span className="pointer-events-none absolute top-2.5 right-3 text-slate-500">▾</span>
      {open && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching projects</li>}
          {filtered.map((p, i) => (
            <li
              key={p.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-slate-700' : ''} ${
                p.id === value ? 'text-emerald-400' : ''
              }`}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
