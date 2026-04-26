import { useEffect, useState, type FormEvent } from 'react';
import './dashboard.css';

export interface Project {
  id: string;
  name: string;
  scope: { domains: string[] };
  status: string;
  createdAt: number;
}

interface DashboardProps {
  onSelectProject: (project: Project, path: string) => void;
}

export default function Dashboard({ onSelectProject }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const list = await (window as any).bugbounty.getProjects();
    setProjects(list);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await (window as any).bugbounty.createProject(newName, newScope);
    setNewName('');
    setNewScope('');
    setIsCreating(false);
    loadProjects();
  };

  const handleOpen = async (p: Project) => {
    const dir = await (window as any).bugbounty.getProjectDir(p.name);
    onSelectProject(p, dir);
  };

  const handleGenerateReport = async (p: Project) => {
    const res = await (window as any).bugbounty.generateReport(p.name);
    if (res.success) {
      alert(`Report generated at:\n${res.reportPath}`);
    } else {
      alert('Failed to generate report: ' + res.error);
    }
  };

  const totalAssets = projects.reduce((sum, project) => sum + project.scope.domains.length, 0);
  const activeProjects = projects.filter((project) => project.status.toLowerCase().includes('active')).length;

  const getStatusTone = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized.includes('active')) return 'active';
    if (normalized.includes('paused')) return 'paused';
    if (normalized.includes('complete')) return 'complete';
    return 'queued';
  };

  return (
    <main className="bb-dashboard">
      <div className="bb-dashboard__backdrop" aria-hidden="true" />

      <header className="bb-header">
        <div className="bb-brand">
          <div className="bb-brand__chip">
            <img src="/bug.png" alt="BugBountyAI logo" className="bb-brand__logo" />
          </div>
          <div>
            <p className="bb-brand__kicker">Security Operations Workspace</p>
            <h1 className="bb-brand__title">Bug Bounty Command Center</h1>
            <p className="bb-brand__subtitle">Create scoped targets, run recon loops, and generate evidence-backed reports.</p>
          </div>
        </div>

        {(projects.length > 0 || isCreating) && (
          <button
            type="button"
            className={`bb-button bb-button--create ${isCreating ? 'bb-button--danger' : ''}`}
            onClick={() => setIsCreating(!isCreating)}
          >
            {isCreating ? 'Cancel New Target' : 'Create New Target'}
          </button>
        )}
      </header>

      <section className="bb-metrics" aria-label="Dashboard metrics">
        <article className="bb-metric-card">
          <span className="bb-metric-card__label">Bug Bounties</span>
          <strong className="bb-metric-card__value">{projects.length}</strong>
        </article>
        <article className="bb-metric-card">
          <span className="bb-metric-card__label">Submitted Bug Bounties</span>
          <strong className="bb-metric-card__value">0</strong>
        </article>
        <article className="bb-metric-card">
          <span className="bb-metric-card__label">Accepted Bug Bounties</span>
          <strong className="bb-metric-card__value">0</strong>
        </article>
        <article className="bb-metric-card">
          <span className="bb-metric-card__label">Writeups</span>
          <strong className="bb-metric-card__value">0</strong>
        </article>
      </section>

      {isCreating && (
        <section className="bb-create-panel" aria-label="Create new target">
          <div className="bb-create-panel__header">
            <h2>Define Target Scope</h2>
            <p>Keep entries newline-separated for domains, hosts, and CIDR ranges.</p>
          </div>

          <form onSubmit={handleCreate} className="bb-create-form">
            <label className="bb-field">
              <span>Project Name</span>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Example: HackerOne Main Program"
                autoFocus
                required
              />
            </label>

            <label className="bb-field">
              <span>In-Scope Assets</span>
              <textarea
                value={newScope}
                onChange={(e) => setNewScope(e.target.value)}
                rows={7}
                placeholder="api.example.com&#10;*.example.com&#10;198.51.100.0/24"
              />
            </label>

            <div className="bb-create-form__actions">
              <button type="submit" className="bb-button bb-button--primary">Initialize Recon Workspace</button>
            </div>
          </form>
        </section>
      )}

      <section className="bb-target-section">
        <div className="bb-target-section__header">
          <h2>Monitored Targets</h2>
          <p>Each workspace stays isolated with dedicated recon and findings directories.</p>
        </div>

      <div className="bb-target-grid">
        {projects.map(p => (
          <article key={p.id} className="bb-target-card">
            <div className="bb-target-card__header">
              <h3>{p.name}</h3>
              <span className={`bb-status bb-status--${getStatusTone(p.status)}`}>
                {p.status}
              </span>
            </div>

            <div className="bb-target-card__meta">
              <div>
                <span>Assets</span>
                <strong>{p.scope.domains.length}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{new Date(p.createdAt).toLocaleDateString()}</strong>
              </div>
            </div>

            <div className="bb-scope-box" aria-label={`Scope for ${p.name}`}>
              <p className="bb-scope-box__title">In-Scope Domains / IPs</p>
              <div className="bb-scope-box__list">
                {p.scope.domains.slice(0, 3).map((d, i) => <div key={i}>{d}</div>)}
                {p.scope.domains.length > 3 && <div className="bb-scope-box__overflow">+ {p.scope.domains.length - 3} more</div>}
              </div>
            </div>

            <div className="bb-target-card__actions">
              <button
                onClick={() => handleOpen(p)}
                className="bb-button bb-button--primary"
              >
                Open Workspace
              </button>

              <button
                onClick={() => handleGenerateReport(p)}
                className="bb-button bb-button--secondary"
              >
                Generate Report
              </button>
            </div>
          </article>
        ))}

        {projects.length === 0 && !isCreating && (
          <article className="bb-empty-state">
            <h3>No targets initialized</h3>
            <p>Create your first scoped program to start autonomous reconnaissance and reporting.</p>
            <button type="button" className="bb-button bb-button--primary" onClick={() => setIsCreating(true)}>
              Create First Target
            </button>
          </article>
        )}
      </div>
      </section>
    </main>
  );
}
