/**
 * Subscription (web sign-in) AI providers.
 *
 * Claude Pro/Max/Team and ChatGPT Plus/Pro/Team plans don't come with API keys. They are used through
 * the vendors' official CLIs (Claude Code and Codex), which sign in through the browser and keep their
 * own tokens. The Electron main process runs those CLIs (see electron/aiCli.ts); this module is the
 * renderer-side wrapper.
 */

export type SubscriptionCliTool = 'claude' | 'codex';

export interface SubscriptionStatus {
  installed: boolean;
  signedIn: boolean;
  binaryPath?: string;
  version?: string;
  account?: string;
  plan?: string;
  detail: string;
}

interface AiCliBridge {
  status: (tool: string, customPath?: string) => Promise<SubscriptionStatus>;
  login: (tool: string, customPath?: string) => Promise<{ success: boolean; detail: string }>;
  sendLoginInput: (tool: string, text: string) => Promise<boolean>;
  cancelLogin: (tool: string) => Promise<void>;
  logout: (tool: string, customPath?: string) => Promise<{ success: boolean; detail?: string }>;
  complete: (tool: string, opts: { systemPrompt: string; prompt: string; model?: string; customPath?: string; timeoutMs?: number }) => Promise<{ success: boolean; text?: string; tokensUsed?: number; error?: string }>;
  onLoginOutput: (func: (payload: { tool: string; text: string; urls: string[] }) => void) => () => void;
}

/** Provider id → CLI that backs it */
export const SUBSCRIPTION_PROVIDERS: Record<string, { tool: SubscriptionCliTool; planLabel: string; cliName: string; installUrl: string }> = {
  'claude-subscription': {
    tool: 'claude',
    planLabel: 'Claude Pro / Max / Team / Enterprise',
    cliName: 'Claude Code',
    installUrl: 'https://docs.claude.com/en/docs/claude-code/setup'
  },
  'chatgpt-subscription': {
    tool: 'codex',
    planLabel: 'ChatGPT Plus / Pro / Team / Enterprise',
    cliName: 'Codex CLI',
    installUrl: 'https://github.com/openai/codex'
  }
};

export const isSubscriptionProvider = (providerId?: string): boolean =>
  Boolean(providerId && SUBSCRIPTION_PROVIDERS[providerId]);

/** Model ids are namespaced ("claude-sub:sonnet") so they stay unique across providers; the CLI takes the bare name */
export const toCliModel = (modelId?: string): string | undefined => {
  if (!modelId) return undefined;
  const bare = modelId.includes(':') ? modelId.split(':').slice(1).join(':') : modelId;
  return bare === 'default' ? undefined : bare;
};

const getBridge = (): AiCliBridge | null => {
  if (typeof window === 'undefined') return null;
  return ((window as any).electronAPI?.aiCli as AiCliBridge) || null;
};

const DESKTOP_ONLY = 'Subscription sign-in needs the Bubble Studio desktop app (it is not available in the browser preview).';

export class SubscriptionAuth {
  public static isAvailable(): boolean {
    return getBridge() !== null;
  }

  public static async getStatus(providerId: string, customPath?: string): Promise<SubscriptionStatus> {
    const meta = SUBSCRIPTION_PROVIDERS[providerId];
    const bridge = getBridge();
    if (!meta) return { installed: false, signedIn: false, detail: `Unknown subscription provider '${providerId}'` };
    if (!bridge) return { installed: false, signedIn: false, detail: DESKTOP_ONLY };
    return bridge.status(meta.tool, customPath);
  }

  public static async signIn(providerId: string, customPath?: string): Promise<{ success: boolean; detail: string }> {
    const meta = SUBSCRIPTION_PROVIDERS[providerId];
    const bridge = getBridge();
    if (!meta || !bridge) return { success: false, detail: DESKTOP_ONLY };
    return bridge.login(meta.tool, customPath);
  }

  public static async sendSignInCode(providerId: string, code: string): Promise<boolean> {
    const meta = SUBSCRIPTION_PROVIDERS[providerId];
    const bridge = getBridge();
    if (!meta || !bridge) return false;
    return bridge.sendLoginInput(meta.tool, code);
  }

  public static async cancelSignIn(providerId: string): Promise<void> {
    const meta = SUBSCRIPTION_PROVIDERS[providerId];
    await getBridge()?.cancelLogin(meta?.tool || '');
  }

  public static async signOut(providerId: string, customPath?: string): Promise<{ success: boolean; detail?: string }> {
    const meta = SUBSCRIPTION_PROVIDERS[providerId];
    const bridge = getBridge();
    if (!meta || !bridge) return { success: false, detail: DESKTOP_ONLY };
    return bridge.logout(meta.tool, customPath);
  }

  public static onSignInOutput(func: (payload: { tool: string; text: string; urls: string[] }) => void): () => void {
    const bridge = getBridge();
    return bridge ? bridge.onLoginOutput(func) : () => {};
  }

  public static async complete(
    providerId: string,
    systemPrompt: string,
    prompt: string,
    modelId?: string,
    customPath?: string
  ): Promise<{ text: string; tokensUsed: number }> {
    const meta = SUBSCRIPTION_PROVIDERS[providerId];
    const bridge = getBridge();
    if (!meta) throw new Error(`Unknown subscription provider '${providerId}'`);
    if (!bridge) throw new Error(DESKTOP_ONLY);
    const res = await bridge.complete(meta.tool, { systemPrompt, prompt, model: toCliModel(modelId), customPath });
    if (!res.success) throw new Error(res.error || `${meta.cliName} request failed`);
    return { text: res.text || '', tokensUsed: res.tokensUsed || 0 };
  }
}
