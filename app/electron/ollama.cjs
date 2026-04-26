// ── AREA 4: Ollama Prompt Construction ────────────────────────────────────
// Ollama runs locally at port 11434. All inference stays on-device — no data
// leaves the machine. MODEL is the local llama3.2 checkpoint.
const fs = require('fs');
const path = require('path');

const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_TAGS_URL = 'http://127.0.0.1:11434/api/tags';

async function getAvailableModel() {
  try {
    const response = await fetch(OLLAMA_TAGS_URL);
    if (response.ok) {
      const data = await response.json();
      if (data.models && data.models.length > 0) {
        const llama = data.models.find(m => m.name.includes('llama'));
        return llama ? llama.name : data.models[0].name;
      }
    }
  } catch (e) {
    // ollama not running or reachable
  }
  return 'llama3.2'; // default fallback
}

// Assembles the full prompt string that gets sent to Ollama.
// This is where the structured context object from Area 1 is injected into
// natural language — the implementation of structured prompting from the literature review.
// Two variants: auto-explain (no userQuery) and @-prefix Q&A (with userQuery).
function buildPrompt(context, userQuery = null) {
  // Flatten the history array into newline-separated text for the prompt
  const history = context.history.length > 0
    ? context.history.join('\n')
    : 'No previous commands';

  // Variant A — @-prefix Q&A: user asked a specific question
  // The context object fields are injected directly as labelled sections
  if (userQuery) {
    return `You are an expert cybersecurity terminal assistant. Answer the following question accurately using the terminal session context provided. Do not guess or hallucinate — if you don't know, say so.

Question: ${userQuery}

Current session context:
Command just run: ${context.currentCommand}
Working directory: ${context.cwd}
Recent history: ${history}
Last terminal output:
${context.currentOutput.slice(0, 1000)}

Respond in JSON:
{"explanation": "direct answer to the question", "security_implications": "relevant security context", "next_steps": "recommended actions"}
Only return JSON. No markdown, no extra text.`;
// ↑ Constrained JSON-only output format prevents free-text drift and makes
//   the response trivially parseable — parseability was a key design requirement.
  }

  // Variant B — auto-explain: triggered automatically after every command
  // Same context fields, different task framing (analysis vs Q&A)
  return `You are an expert cybersecurity terminal assistant analysing Linux command output.

Command: ${context.currentCommand}
Working directory: ${context.cwd}
Recent history:
${history}

Terminal output:
${context.currentOutput || '(no output — command may have failed or produced nothing)'}

Provide a concise technical analysis. Respond in JSON:
{"explanation": "what the command did and what the output means", "security_implications": "specific security risks or observations, or 'No significant security implications' if none", "next_steps": "specific actionable next steps for a cybersecurity workflow"}
Only return JSON. No markdown, no extra text.`;
}

function buildScriptPrompt(request, context) {
  return `You are an expert cybersecurity and Linux systems engineer. Generate a correct, working bash script for the following request.

Request: ${request}
Working directory: ${context.cwd}

Rules:
- Write a complete, functional bash script
- Use best practices and correct syntax
- Include comments explaining each step
- Do NOT suggest running the script automatically
- If the request involves network scanning, use nmap
- If the request involves process inspection, use ps, top, or lsof

Respond in JSON with this exact structure:
{"script": "#!/bin/bash\\n# script here", "description": "one sentence description", "warning": "any safety warning or empty string"}
Only return JSON. No markdown, no extra text.`;
}

async function queryOllama(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000); // 3 minutes timeout for slower hardware

  try {
    const targetModel = await getAvailableModel();
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel, prompt, stream: false }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    const text = data.response.trim();
    try {
      return { success: true, data: JSON.parse(text) };
    } catch {
      return { success: true, data: { explanation: text, security_implications: '', next_steps: '' } };
    }
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: err.message };
  }
}

async function explainOutput(context) {
  const truncatedContext = {
    ...context,
    currentOutput: context.currentOutput.slice(0, 1000)
  }
  const prompt = buildPrompt(truncatedContext);
  return queryOllama(prompt);
}

async function answerQuery(userQuery, context) {
  const prompt = buildPrompt(context, userQuery);
  return queryOllama(prompt);
}

async function generateScript(request, context) {
  const prompt = buildScriptPrompt(request, context);
  return queryOllama(prompt);
}

async function nextReconStep(context, project) {
  try {
    const reconDir = path.join(context.cwd, 'recon');
    let reconData = '';
    if (fs.existsSync(reconDir)) {
      const files = fs.readdirSync(reconDir);
      for (const file of files) {
        if (fs.statSync(path.join(reconDir, file)).isFile()) {
          const content = fs.readFileSync(path.join(reconDir, file), 'utf8');
          reconData += `\n--- ${file} ---\n${content.slice(-2000)}\n`; // last 2k chars to save context window
        }
      }
    }

    const scopeStr = project.scope.domains.join(', ');

    const prompt = `You are an automated AI Bug Bounty Recon agent. Your task is to propose the SINGLE next best bash command to run for enumeration and vulnerability discovery.
You must strictly stay within the allowed scope: ${scopeStr}

Current Working Directory: ${context.cwd}
Recent History:
${context.history.join('\n')}

Previously gathered recon data:
${reconData.slice(-4000)}

Rules:
1. Output MUST be redirected or appended to a file in the "recon/" or "findings/" directory. Example: "nmap -sV target.com > recon/nmap.txt" or "curl -s target.com | tee -a recon/curl.txt".
2. The command MUST be a valid Linux bash command (e.g. curl, nmap, subfinder, python).
3. Do NOT run interactive commands that require prompt answers.
4. Keep the command non-destructive.
5. If you found a vulnerability, output a command that writes a markdown draft to "findings/vuln_01.md".

Respond strictly in JSON with this exact structure:
{"command": "the bash command to run", "rationale": "one sentence explaining why"}
Only return JSON. No markdown, no extra text.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const targetModel = await getAvailableModel();
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: targetModel, prompt, stream: false, format: 'json' }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    
    const data = await response.json();
    const text = data.response.trim();
    const parsed = JSON.parse(text);

    return { 
      success: true, 
      command: parsed.command, 
      rationale: parsed.rationale 
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { explainOutput, answerQuery, generateScript, nextReconStep };