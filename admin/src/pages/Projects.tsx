import { useEffect, useState } from 'react';
import { api, type UserRow } from '../api';

interface ProjectRow {
  id: string;
  name: string;
  active: boolean;
  userIds: string[];
}

export function Projects() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [employees, setEmployees] = useState<UserRow[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = () => api<ProjectRow[]>('GET', '/admin/projects').then(setProjects, (e) => setError(e.message));
  useEffect(() => {
    load();
    api<UserRow[]>('GET', '/admin/users').then((u) => setEmployees(u.filter((x) => x.role === 'EMPLOYEE')));
  }, []);

  async function act(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Projects & assignments</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) act(() => api('POST', '/admin/projects', { name })).then(() => setName(''));
        }}
      >
        <input
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="New project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="rounded-md bg-slate-900 px-4 text-sm font-medium text-white">Add</button>
      </form>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Active</th>
              {employees.map((u) => (
                <th key={u.id} className="px-4 py-3 text-center">
                  {u.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={p.id}>
                <td className={`px-4 py-3 font-medium ${p.active ? '' : 'text-slate-400 line-through'}`}>{p.name}</td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={(e) => act(() => api('PATCH', `/admin/projects/${p.id}`, { active: e.target.checked }))}
                  />
                </td>
                {employees.map((u) => {
                  const assigned = p.userIds.includes(u.id);
                  return (
                    <td key={u.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={assigned}
                        onChange={() =>
                          act(() =>
                            api('PUT', `/admin/projects/${p.id}/assignments`, {
                              userIds: assigned ? p.userIds.filter((id) => id !== u.id) : [...p.userIds, u.id],
                            }),
                          )
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
