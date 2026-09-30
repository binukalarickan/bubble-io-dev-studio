import { ipcMain, BrowserWindow } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Subscription (web sign-in) AI providers.
 *
 * Instead of API keys, these providers run the vendor's official CLI, which the user signs in
 * to with their Claude Pro/Max/Team or ChatGPT Plus/Pro/Team account through the browser.
 * The CLI owns the OAuth flow and stores the tokens itself; Bubble Studio never sees them.
 */

export type AiCliTool = 'claude' | 'codex';

interface CliRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: string;
}

const isWin = process.platform === 'win32';

// Apps launched from Finder / Start Menu don't inherit the login shell PATH, so add the usual install locations
function buildEnv(tool: AiCliTool): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extra = isWin
    ? [
        path.join(home, '.local', 'bin'),
        path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm'),
        path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Programs', 'claude')
      ]
    : [
        path.join(home, '.local', 'bin'),
        path.join(home, '.claude', 'local'),
        path.join(home, '.npm-global', 'bin'),
        path.join(home, '.bun', 'bin'),
        path.join(home, '.volta', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin'
      ];
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.PATH = [...(env.PATH || '').split(path.delimiter), ...extra].filter(Boolean).join(path.delimiter);
  // An API key in the environment would take precedence over the subscription login
  if (tool === 'claude') delete env.ANTHROPIC_API_KEY;
  if (tool === 'codex') delete env.OPENAI_API_KEY;
  env.NO_COLOR = '1';
  return env;
}

function resolveBinary(tool: AiCliTool, customPath?: string): string | null {
  if (customPath && customPath.trim()) {
    return fs.existsSync(customPath.trim()) ? customPath.trim() : null;
  }
  const env = buildEnv(tool);
  const exts = isWin ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, tool + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

function spawnCli(bin: string, args: string[], tool: AiCliTool): ChildProcess {
  const cwd = path.join(os.tmpdir(), 'bubble-studio-ai');
  fs.mkdirSync(cwd, { recursive: true });
  // .cmd/.bat shims (npm installs on Windows) can only be launched through the shell
  const needsShell = isWin && /\.(cmd|bat)$/i.test(bin);
  const quote = (a: string) => `"${a.replace(/"/g, '\\"')}"`;
  return needsShell
    ? spawn(quote(bin), args.map(quote), { cwd, env: buildEnv(tool), shell: true, windowsHide: true })
    : spawn(bin, args, { cwd, env: buildEnv(tool), windowsHide: true });
}

function runCli(bin: string, args: string[], tool: AiCliTool, input?: string, timeoutMs = 15000): Promise<CliRunResult> {
  return new Promise(resolve => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child: ChildProcess;
    try {
      child = spawnCli(bin, args, tool);
    } catch (err: any) {
      resolve({ code: null, stdout, stderr, timedOut, spawnError: err.message });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout?.on('data', d => { stdout += d.toString(); });
    child.stderr?.on('data', d => { stderr += d.toString(); });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, timedOut, spawnError: err.message });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    if (input !== undefined) child.stdin?.end(input);
    else child.stdin?.end();
  });
}

const INSTALL_HINT: Record<AiCliTool, string> = {
  claude: 'Claude Code CLI not found. Install it (https://docs.claude.com/en/docs/claude-code/setup) or set its path.',
  codex: 'Codex CLI not found. Install it with "npm install -g @openai/codex" or set its path.'
};

async function getStatus(tool: AiCliTool, customPath?: string) {
  const bin = resolveBinary(tool, customPath);
  if (!bin) {
    return { installed: false, signedIn: false, detail: INSTALL_HINT[tool] };
  }
  const ver = await runCli(bin, ['--version'], tool);
  if (ver.spawnError || ver.code !== 0) {
    return { installed: false, signedIn: false, binaryPath: bin, detail: `Found ${bin} but it failed to run (${(ver.spawnError || ver.stderr || ver.stdout).trim().split('\n')[0].slice(0, 200)}). Try reinstalling it.` };
  }
  const version = ver.stdout.trim().split('\n')[0];

  if (tool === 'claude') {
    const res = await runCli(bin, ['auth', 'status', '--json'], tool);
    let info: any = null;
    try { info = JSON.parse(res.stdout); } catch { /* older CLI without JSON status */ }
    const signedIn = Boolean(info?.loggedIn);
    const isSubscription = info?.authMethod === 'claude.ai';
    return {
      installed: true,
      signedIn: signedIn && isSubscription,
      binaryPath: bin,
      version,
      account: info?.email,
      plan: info?.subscriptionType,
      detail: !signedIn
        ? 'Not signed in. Click "Sign in with browser" to connect your Claude account.'
        : !isSubscription
          ? `Claude Code is signed in with ${info?.authMethod || 'a non-subscription method'}, not a Claude subscription. Sign in again to switch.`
          : `Signed in as ${info?.email || 'Claude user'}${info?.subscriptionType ? ` (${info.subscriptionType} plan)` : ''}.`
    };
  }

  const res = await runCli(bin, ['login', 'status'], tool);
  const out = `${res.stdout}\n${res.stderr}`.trim();
  const signedIn = res.code === 0 && /logged in/i.test(out);
  const usesChatGpt = /chatgpt/i.test(out);
  return {
    installed: true,
    signedIn: signedIn && usesChatGpt,
    binaryPath: bin,
    version,
    detail: !signedIn
      ? 'Not signed in. Click "Sign in with browser" to connect your ChatGPT account.'
      : !usesChatGpt
        ? 'Codex is signed in with an API key, not a ChatGPT plan. Sign in again to switch.'
        : out.split('\n')[0]
  };
}

const activeLogins = new Map<AiCliTool, ChildProcess>();

function startLogin(win: BrowserWindow | null, tool: AiCliTool, customPath?: string): Promise<{ success: boolean; detail: string }> {
  const bin = resolveBinary(tool, customPath);
  if (!bin) return Promise.resolve({ success: false, detail: INSTALL_HINT[tool] });

  activeLogins.get(tool)?.kill();
  const args = tool === 'claude' ? ['auth', 'login', '--claudeai'] : ['login'];

  return new Promise(resolve => {
    let child: ChildProcess;
    try {
      child = spawnCli(bin, args, tool);
    } catch (err: any) {
      resolve({ success: false, detail: err.message });
      return;
    }
    activeLogins.set(tool, child);
    let transcript = '';
    const emit = (chunk: string) => {
      transcript += chunk;
      // The CLI opens the browser itself; the URL is forwarded so the UI can offer it if that didn't happen
      const urls = chunk.match(/https:\/\/[^\s"'<>]+/g) || [];
      win?.webContents.send('ai-cli:login-output', { tool, text: chunk, urls });
    };
    const timer = setTimeout(() => child.kill(), 5 * 60 * 1000);
    child.stdout?.on('data', d => emit(d.toString()));
    child.stderr?.on('data', d => emit(d.toString()));
    child.on('error', err => {
      clearTimeout(timer);
      activeLogins.delete(tool);
      resolve({ success: false, detail: err.message });
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (activeLogins.get(tool) === child) activeLogins.delete(tool);
      const tail = transcript.trim().split('\n').slice(-3).join(' ').slice(0, 400);
      resolve(code === 0
        ? { success: true, detail: 'Sign-in completed.' }
        : { success: false, detail: tail || `Sign-in exited with code ${code}.` });
    });
  });
}

async function complete(
  tool: AiCliTool,
  opts: { systemPrompt: string; prompt: string; model?: string; customPath?: string; timeoutMs?: number }
): Promise<{ success: boolean; text?: string; tokensUsed?: number; error?: string }> {
  const bin = resolveBinary(tool, opts.customPath);
  if (!bin) return { success: false, error: INSTALL_HINT[tool] };
  const timeoutMs = opts.timeoutMs || 120000;
  // Instructions travel over stdin rather than argv to avoid shell quoting and length limits
  const input = `${opts.systemPrompt}\n\n---\n\n${opts.prompt}`;

  if (tool === 'claude') {
    const args = [
      '-p',
      '--output-format', 'json',
      '--tools', '',
      '--no-session-persistence',
      '--system-prompt', 'Follow the instructions in the user message exactly and reply with only the requested output.'
    ];
    if (opts.model) args.push('--model', opts.model);
    const res = await runCli(bin, args, tool, input, timeoutMs);
    if (res.spawnError) return { success: false, error: res.spawnError };
    if (res.timedOut) return { success: false, error: `Claude CLI timed out after ${timeoutMs}ms` };
    let data: any = null;
    try { data = JSON.parse(res.stdout); } catch { /* fall through */ }
    if (!data || data.is_error || res.code !== 0) {
      return { success: false, error: (data?.result || res.stderr || res.stdout || `Claude CLI exited with code ${res.code}`).toString().trim().slice(0, 500) };
    }
    const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    return { success: true, text: String(data.result || '').trim(), tokensUsed };
  }

  const outFile = path.join(os.tmpdir(), `bubble-studio-codex-${process.pid}-${Date.now()}.txt`);
  const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--output-last-message', outFile];
  if (opts.model) args.push('--model', opts.model);
  args.push('-');
  const res = await runCli(bin, args, tool, input, timeoutMs);
  try {
    if (res.spawnError) return { success: false, error: res.spawnError };
    if (res.timedOut) return { success: false, error: `Codex CLI timed out after ${timeoutMs}ms` };
    const text = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim() : '';
    if (res.code !== 0 || !text) {
      return { success: false, error: (res.stderr || res.stdout || `Codex CLI exited with code ${res.code}`).trim().slice(-500) };
    }
    return { success: true, text, tokensUsed: Math.round(input.length / 4 + text.length / 4) };
  } finally {
    fs.rmSync(outFile, { force: true });
  }
}

const isTool = (t: unknown): t is AiCliTool => t === 'claude' || t === 'codex';

export function registerAiCliHandlers(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('ai-cli:status', async (_e, tool: unknown, customPath?: string) => {
    if (!isTool(tool)) return { installed: false, signedIn: false, detail: 'Unknown tool' };
    return getStatus(tool, customPath);
  });

  ipcMain.handle('ai-cli:login', async (_e, tool: unknown, customPath?: string) => {
    if (!isTool(tool)) return { success: false, detail: 'Unknown tool' };
    return startLogin(getWindow(), tool, customPath);
  });

  // Some sign-in flows ask the user to paste an authorization code back into the CLI
  ipcMain.handle('ai-cli:login-input', async (_e, tool: unknown, text: string) => {
    if (!isTool(tool)) return false;
    const child = activeLogins.get(tool);
    if (!child?.stdin || typeof text !== 'string') return false;
    child.stdin.write(text.trim() + '\n');
    return true;
  });

  ipcMain.handle('ai-cli:login-cancel', async (_e, tool: unknown) => {
    if (!isTool(tool)) return;
    activeLogins.get(tool)?.kill();
    activeLogins.delete(tool);
  });

  ipcMain.handle('ai-cli:logout', async (_e, tool: unknown, customPath?: string) => {
    if (!isTool(tool)) return { success: false };
    const bin = resolveBinary(tool, customPath);
    if (!bin) return { success: false, detail: INSTALL_HINT[tool] };
    const res = await runCli(bin, tool === 'claude' ? ['auth', 'logout'] : ['logout'], tool);
    return { success: res.code === 0, detail: (res.stdout || res.stderr).trim() };
  });

  ipcMain.handle('ai-cli:complete', async (_e, tool: unknown, opts: any) => {
    if (!isTool(tool)) return { success: false, error: 'Unknown tool' };
    if (!opts || typeof opts.prompt !== 'string') return { success: false, error: 'Missing prompt' };
    return complete(tool, opts);
  });
}
