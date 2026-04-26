const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const DESKTOP_DIR = path.join(os.homedir(), 'Desktop');
const APP_DIR = path.join(DESKTOP_DIR, 'BugBountyAI');
const PROJECTS_FILE = path.join(APP_DIR, 'projects.json');

// Ensure the BugBountyAI directory exists
if (!fs.existsSync(APP_DIR)) {
  fs.mkdirSync(APP_DIR, { recursive: true });
}

// Ensure projects.json exists
if (!fs.existsSync(PROJECTS_FILE)) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ projects: [] }, null, 2), 'utf-8');
}

function getProjects() {
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data).projects || [];
  } catch (err) {
    return [];
  }
}

function saveProjects(projects) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify({ projects }, null, 2), 'utf-8');
}

function createProject(name, scopeStr) {
  const id = crypto.randomUUID();
  const domains = scopeStr.split('\n').map(s => s.trim()).filter(Boolean);
  const newProject = {
    id,
    name,
    scope: { domains },
    status: 'Recon',
    createdAt: Date.now()
  };

  const projects = getProjects();
  projects.push(newProject);
  saveProjects(projects);

  const projectDir = path.join(APP_DIR, safeName(name));
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'recon'));
    fs.mkdirSync(path.join(projectDir, 'findings'));
    fs.writeFileSync(path.join(projectDir, 'report.md'), `# Target: ${name}\n\n## Scope\n${domains.join('\\n')}\n\n## Summary\n`, 'utf-8');
  }

  return newProject;
}

function updateProjectStatus(id, newStatus) {
  const projects = getProjects();
  const idx = projects.findIndex(p => p.id === id);
  if (idx !== -1) {
    projects[idx].status = newStatus;
    saveProjects(projects);
    return projects[idx];
  }
  return null;
}

function safeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function getProjectDir(name) {
  return path.join(APP_DIR, safeName(name));
}

function generateReport(name) {
  try {
    const projectDir = getProjectDir(name);
    const findingsDir = path.join(projectDir, 'findings');
    const reportPath = path.join(projectDir, 'report.md');
    
    let content = `# Targeted Security Assessment: ${name}\n\n`;
    content += `*Generated on ${new Date().toISOString()}*\n\n`;
    content += `## Methodology\nAutomated AI-Augmented Recon Loop executing constrained enumeration against predefined domains.\n\n`;
    
    content += `## Findings & Drafts\n\n`;
    
    if (fs.existsSync(findingsDir)) {
      const files = fs.readdirSync(findingsDir).filter(f => f.endsWith('.md'));
      if (files.length === 0) {
        content += `*No vulnerabilities flagged yet.*\n`;
      }
      for (const file of files) {
        const data = fs.readFileSync(path.join(findingsDir, file), 'utf-8');
        content += `### ${file}\n\n${data}\n\n---\n\n`;
      }
    }

    fs.writeFileSync(reportPath, content, 'utf-8');
    return { success: true, reportPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  APP_DIR,
  getProjects,
  saveProjects,
  createProject,
  updateProjectStatus,
  getProjectDir,
  generateReport
};
