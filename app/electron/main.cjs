const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const pty = require("node-pty");
const ollama = require('./ollama.cjs');
const safeguard = require('./safeguard.cjs');
const bbStore = require('./store.cjs');

let mainWindow;
let shellPty;

// --- Session Context State ---
let sessionContext = {
  currentCommand: '',
  lastCommand: '',
  currentOutput: '',
  cwd: process.env.HOME || '/',
  history: []
};

let isCapturingOutput = false;
let awaitingPassword = false;
let skipOnePrompt = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    icon: path.join(__dirname, "../public/bug.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.openDevTools({ mode: "detach" });
}

app.whenReady().then(createWindow);

ipcMain.on("pty:start", (_event, { cols, rows, cwd } = {}) => {
  if (shellPty) return;

  const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
  const startCwd = cwd || (process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME);
  
  sessionContext.cwd = startCwd;

  shellPty = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: cols || 120,
    rows: rows || 30,
    cwd: startCwd,
    env: process.env,
  });

  shellPty.onData((data) => {
    mainWindow.webContents.send("pty:data", data);

    const clean = data
      .replace(/\x1B\[[0-9;]*[mGKHFJl]/g, '')
      .replace(/\x1B\[\?[0-9;]*[hl]/g, '')
      .replace(/\r/g, '');

    // Detect password prompts
    if (/\[sudo\] password/i.test(clean) || /password for/i.test(clean)) {
      awaitingPassword = true;
      isCapturingOutput = false;
      sessionContext.currentOutput = '';
      sessionContext.lastCommand = '';
      return;
    }

    const promptPattern = /\$\s*$|#\s*$|>\s*$/m;
    if (promptPattern.test(clean)) {
      // Extract CWD from prompt e.g. "user@host:~/Documents$" or PowerShell "PS C:\>"
      const cwdMatch = clean.match(/:([~\/][^\$#]*)\s*[\$#]/);
      const psMatch = clean.match(/PS\s+([A-Za-z]:\\[^>]*?)>/);
      if (cwdMatch) {
        let cwd = cwdMatch[1].trim();
        if (cwd.startsWith('~')) {
          cwd = cwd.replace('~', process.env.HOME || '/home/' + process.env.USER);
        }
        sessionContext.cwd = cwd;
      } else if (psMatch) {
        sessionContext.cwd = psMatch[1].trim();
      }

      if (skipOnePrompt) {
        skipOnePrompt = false;
        // fall through — sudo output is already in currentOutput, analyse normally
      }

      if (isCapturingOutput && sessionContext.lastCommand) {
        // Capture all values NOW before they get reset
        const capturedOutput = sessionContext.currentOutput.trim();
        const capturedCommand = sessionContext.lastCommand;
        const capturedCwd = sessionContext.cwd;

        const skipFromHistory = ['cd', 'clear', 'exit', 'history'];
        const baseCmd = capturedCommand.split(' ')[0];
        if (
          !skipFromHistory.includes(baseCmd) &&
          sessionContext.history[sessionContext.history.length - 1] !== capturedCommand
        ) {
          if (sessionContext.history.length >= 10) sessionContext.history.shift();
          sessionContext.history.push(capturedCommand);
        }
        const capturedHistory = [...sessionContext.history];

        // ── AREA 1: Structured Session Context Object ──────────────────────────
        // This is the single structured object passed to the AI on every request.
        // It answers RQ2: "how does the system maintain terminal awareness?"
        // Each field is captured from live shell state — nothing is fabricated.
        clearTimeout(sessionContext._debounce);
        sessionContext._debounce = setTimeout(() => {
          mainWindow.webContents.send('context:ready', {
            currentCommand: capturedCommand, // the exact command the user just ran
            currentOutput: capturedOutput,   // raw terminal output that followed the command
            cwd: capturedCwd,               // working directory at the moment of execution
            history: capturedHistory        // rolling window of the last 10 shell commands — enables cross-command reasoning (e.g. ps aux referencing a prior nmap scan)
          });
        }, 150);
      }
      isCapturingOutput = false;
      sessionContext.currentOutput = '';
    } else {
      if (isCapturingOutput) {
        sessionContext.currentOutput += clean;
      }
    }
  });
});

ipcMain.on('pty:write', (_event, data) => {
  // Detect Enter key = command submission
  if (data === '\r') {
    const cmd = sessionContext.currentCommand.trim();

    if (awaitingPassword) {
      awaitingPassword = false;
      skipOnePrompt = true;
      shellPty.write(data);
      return;
    }

    // ── AREA 3: Prefix Router ──────────────────────────────────────────────
    // Intercepts @ (question) and # (script) prefixes before node-pty sees them.
    // This is the exact line that means @ queries NEVER touch the shell —
    // they are caught here in the Electron main process before node-pty sees them.
    if (cmd.startsWith('@') || cmd.startsWith('#')) {
      // Cancel the command in the shell so it doesn't execute the AI query natively
      shellPty.write('\x03'); 

      // Route the input to the renderer's AI handler, NOT to the PTY
      mainWindow.webContents.send('ai:query', {
        type: cmd.startsWith('@') ? 'query' : 'script', // @ → freeform Q&A, # → bash script generation
        input: cmd.slice(1).trim(),                      // strip the prefix character before sending to AI
        context: {
          currentCommand: sessionContext.currentCommand, // what the user had typed
          currentOutput: sessionContext.currentOutput,   // any output already on screen
          cwd: sessionContext.cwd,                       // working directory for grounding the response
          history: [...sessionContext.history]           // prior commands for multi-turn reasoning
        }
      });
      sessionContext.currentCommand = '';
      return; // ← hard stop: the PTY never sees this input
    }

    // Intercept clear/cls to bypass Windows conpty visual bugs
    if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
      mainWindow.webContents.send('pty:data', '\x1b[2K\r'); // clear current line
      mainWindow.webContents.send('pty:data', '\x1b[2J\x1b[3J\x1b[H'); // full screen clear + scrollback wipe
      shellPty.write('\x03'); // send CTRL+C to shell to spawn a fresh prompt at the top
      sessionContext.currentCommand = '';
      return;
    }

    // Store command for context BEFORE clearing
    sessionContext.lastCommand = cmd;
    isCapturingOutput = true;
    sessionContext.currentOutput = '';
    sessionContext.currentCommand = '';
  } else if (data === '\x7f') {
    // Backspace
    sessionContext.currentCommand = sessionContext.currentCommand.slice(0, -1);
  } else {
    sessionContext.currentCommand += data;
  }

  if (!shellPty) return;
  shellPty.write(data);
});

ipcMain.handle('context:get', () => ({ ...sessionContext }));

ipcMain.on('pty:resize', (_event, { cols, rows }) => {
  if (shellPty) shellPty.resize(cols, rows)
});

ipcMain.handle('ai:explain', async (_event, context) => {
  const result = await ollama.explainOutput(context);
  if (result.success) {
    result.risk = safeguard.assessRisk(context.currentCommand, result.data);
  }
  return result;
});

ipcMain.handle('ai:query', async (_event, { input, context }) => {
  const result = await ollama.answerQuery(input, context);
  if (result.success) {
    result.risk = safeguard.assessRisk(input, result.data);
  }
  return result;
});

ipcMain.handle('ai:script', async (_event, { input, context }) => {
  const result = await ollama.generateScript(input, context);
  if (result.success) {
    result.risk = safeguard.assessRisk(input, result.data);
  }
  return result;
});

ipcMain.handle('ai:nextReconStep', async (_event, { context, project }) => {
  const result = await ollama.nextReconStep(context, project);
  if (result.success) {
    result.risk = safeguard.assessRisk(result.command, result.command);
  }
  return result;
});

ipcMain.handle('script:save', async (_event, { script, filename, cwd }) => {
  try {
    const resolvedCwd = cwd.startsWith('~')
      ? cwd.replace('~', require('os').homedir())
      : cwd
    const safeName = filename
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60)
    const fullName = safeName.endsWith('.sh') ? safeName : safeName + '.sh'
    const filePath = path.join(resolvedCwd, fullName)
    fs.writeFileSync(filePath, script, { mode: 0o755 })
    return { success: true, path: filePath, filename: fullName }
  } catch (err) {
    return { success: false, error: err.message }
  }
});

// BugBounty Store
ipcMain.handle('bb:getProjects', () => bbStore.getProjects());
ipcMain.handle('bb:createProject', (_event, { name, scopeStr }) => bbStore.createProject(name, scopeStr));
ipcMain.handle('bb:updateProjectStatus', (_event, { id, status }) => bbStore.updateProjectStatus(id, status));
ipcMain.handle('bb:getProjectDir', (_event, { name }) => bbStore.getProjectDir(name));
ipcMain.handle('bb:generateReport', (_event, { name }) => bbStore.generateReport(name));
ipcMain.handle('bb:getProjectDetails', (_event, { name }) => bbStore.getProjectDetails(name));
ipcMain.handle('bb:saveProjectDetails', (_event, { name, details }) => bbStore.saveProjectDetails(name, details));
