import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BASE_DIR = path.join(os.homedir(), 'Desktop', 'BugBountyAI');

/**
 * Gathers all markdown findings for a project and compiles them into a single report.md
 */
export function generateReport(projectName: string): string {
  const projectDir = path.join(BASE_DIR, projectName);
  const findingsDir = path.join(projectDir, 'findings');
  const reportPath = path.join(projectDir, 'report.md');

  if (!fs.existsSync(findingsDir)) {
    throw new Error(`Findings directory does not exist for project: ${projectName}`);
  }

  const files = fs.readdirSync(findingsDir).filter(f => f.endsWith('.md'));
  
  let reportContent = `# Security Assessment Report: ${projectName}\n\n`;
  reportContent += `*Generated on: ${new Date().toLocaleDateString()}*\n\n`;
  reportContent += `## Executive Summary\nThis report contains the automated and triaged findings gathered during the reconnaissance phase.\n\n`;
  reportContent += `---\n\n`;

  if (files.length === 0) {
    reportContent += `*No vulnerabilities or findings recorded yet.*\n`;
  } else {
    files.forEach(file => {
      const content = fs.readFileSync(path.join(findingsDir, file), 'utf-8');
      reportContent += `## Finding: ${file.replace('.md', '')}\n\n`;
      reportContent += `${content}\n\n`;
      reportContent += `---\n\n`;
    });
  }

  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  return reportPath;
}