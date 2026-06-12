/**
 * The Bliss terminal's command interpreter — a deliberately sandboxed,
 * renderer-side command table instead of a real PTY. A real shell would hand
 * arbitrary exec to the renderer and nullify the whitelisted-IPC posture, so
 * commands are implemented in TypeScript: in-OS commands drive the window/
 * workspace/theme stores, and filesystem commands reuse the SAME read-only
 * sandboxed fs:* channels the File Explorer uses (the terminal adds zero
 * main-process surface of its own). Pure logic + injected context = testable.
 */

export interface TerminalContext {
  /** App registry: [id, title] pairs for `open`/`help`. */
  apps: () => Array<{ id: string; title: string }>;
  openApp: (id: string) => boolean;
  killApp: (id: string) => boolean;
  switchWorkspace: (n: number) => void;
  setTheme: (name: string) => boolean;
  themeNames: () => string[];
  versions: () => { electron: string; chrome: string; node: string } | null;
  stats: () => Promise<{ cpu: number; ramUsed: number; ramTotal: number } | null>;
  fsList: (rel: string) => Promise<{ entries: Array<{ name: string; kind: string; size: number }>; truncated: boolean } | null>;
  fsRead: (rel: string) => Promise<{ content: string } | { error: string }>;
  /** Wired to Bliss AI when configured; null = not available. */
  aiAsk: ((prompt: string) => Promise<string>) | null;
}

export interface TermResult {
  lines: string[];
  clear?: boolean;
}

const HELP = [
  'Bliss OS terminal — built-in commands:',
  '  help                 this list',
  '  clear                clear the screen',
  '  echo <text>          print text',
  '  date                 current date/time',
  '  whoami               current user',
  '  neofetch             system summary',
  '  ls [dir]   cd <dir>  browse the (read-only) home sandbox',
  '  pwd        cat <f>   working dir / print a text file',
  '  open <app>           launch an app (try: open calculator)',
  '  kill <app>           close all windows of an app',
  '  workspace <1-4>      spin the cube to a workspace',
  '  theme <name>         switch theme (bliss|cyber|synthwave|hologram|matrix)',
  '  ai <prompt>          ask Bliss AI',
];

/** Normalize a posix-ish path against the current working dir (sandbox-rooted). */
function resolvePath(cwd: string, input: string): string {
  const raw = input.startsWith('/') ? input : cwd + '/' + input;
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export class TerminalInterpreter {
  /** Sandbox-relative working directory ('' = sandbox root, i.e. ~). */
  private cwd = '';

  constructor(private ctx: TerminalContext) {}

  prompt(): string {
    return `crystalfox@bliss:~${this.cwd ? '/' + this.cwd : ''}$`;
  }

  async run(input: string): Promise<TermResult> {
    const trimmed = input.trim();
    if (!trimmed) return { lines: [] };
    const [cmd, ...args] = trimmed.split(/\s+/);
    const rest = trimmed.slice(cmd.length).trim();
    switch (cmd) {
      case 'help':
        return { lines: HELP };
      case 'clear':
        return { lines: [], clear: true };
      case 'echo':
        return { lines: [rest] };
      case 'date':
        return { lines: [new Date().toString()] };
      case 'whoami':
        return { lines: ['crystalfox'] };
      case 'neofetch':
        return { lines: await this.neofetch() };
      case 'pwd':
        return { lines: ['~' + (this.cwd ? '/' + this.cwd : '')] };
      case 'ls':
        return this.ls(args[0] ?? '');
      case 'cd':
        return this.cd(args[0] ?? '');
      case 'cat':
      case 'stat':
        return this.cat(cmd, args[0]);
      case 'open':
        return this.open(args[0]);
      case 'kill':
        return args[0] && this.ctx.killApp(args[0])
          ? { lines: [`terminated: ${args[0]}`] }
          : { lines: [`kill: no windows for '${args[0] ?? ''}'`] };
      case 'workspace': {
        const n = Number(args[0]);
        if (!Number.isInteger(n) || n < 1 || n > 4) return { lines: ['workspace: expected 1-4'] };
        this.ctx.switchWorkspace(n - 1);
        return { lines: [`spinning to workspace ${n}…`] };
      }
      case 'theme':
        if (args[0] && this.ctx.setTheme(args[0])) return { lines: [`theme → ${args[0]}`] };
        return { lines: [`theme: expected one of ${this.ctx.themeNames().join('|')}`] };
      case 'ai': {
        if (!rest) return { lines: ['ai: usage: ai <prompt>'] };
        if (!this.ctx.aiAsk) return { lines: ['ai: Bliss AI is not configured (set an API key in Control Center)'] };
        try {
          const answer = await this.ctx.aiAsk(rest);
          return { lines: answer.split('\n') };
        } catch (e) {
          return { lines: [`ai: ${e instanceof Error ? e.message : 'request failed'}`] };
        }
      }
      default:
        return { lines: [`${cmd}: command not found (try 'help')`] };
    }
  }

  private async neofetch(): Promise<string[]> {
    const v = this.ctx.versions();
    const s = await this.ctx.stats().catch(() => null);
    const gb = (b: number) => (b / 1e9).toFixed(1);
    return [
      '   ___ ',
      '  /( )\\    crystalfox @ BlissCube',
      '  \\_^_/    -------------------',
      `   /_\\     OS: Bliss OS 2026 x86_64`,
      `           WM: BlissCube (Compiz Engine)`,
      `           Shell: bliss-term (sandboxed)`,
      v ? `           Electron: ${v.electron} · Chrome: ${v.chrome} · Node: ${v.node}` : '           Runtime: browser',
      s ? `           CPU: ${s.cpu.toFixed(0)}% · RAM: ${gb(s.ramUsed)} / ${gb(s.ramTotal)} GB` : '           CPU: n/a',
    ];
  }

  private async ls(arg: string): Promise<TermResult> {
    const target = arg ? resolvePath(this.cwd, arg) : this.cwd;
    const res = await this.ctx.fsList(target || '.');
    if (!res) return { lines: [`ls: cannot access '${arg || '~'}'`] };
    const lines = res.entries.map((e) =>
      e.kind === 'dir' ? `${e.name}/` : `${e.name}  (${this.fmtSize(e.size)})`,
    );
    if (res.truncated) lines.push('… (listing truncated at 500 entries)');
    return { lines: lines.length ? lines : ['(empty)'] };
  }

  private async cd(arg: string): Promise<TermResult> {
    if (!arg || arg === '~') {
      this.cwd = '';
      return { lines: [] };
    }
    const target = resolvePath(this.cwd, arg);
    const res = await this.ctx.fsList(target || '.');
    if (!res) return { lines: [`cd: no such directory: ${arg}`] };
    this.cwd = target;
    return { lines: [] };
  }

  private async cat(cmd: string, arg?: string): Promise<TermResult> {
    if (!arg) return { lines: [`${cmd}: missing operand`] };
    const target = resolvePath(this.cwd, arg);
    const res = await this.ctx.fsRead(target);
    if ('error' in res) return { lines: [`${cmd}: ${arg}: ${res.error}`] };
    if (cmd === 'stat') return { lines: [`${arg}: ${res.content.length} chars, ${res.content.split('\n').length} lines`] };
    const lines = res.content.split('\n');
    return { lines: lines.length > 200 ? [...lines.slice(0, 200), `… (${lines.length - 200} more lines)`] : lines };
  }

  private open(id?: string): TermResult {
    if (id && this.ctx.openApp(id)) return { lines: [`launching ${id}…`] };
    const ids = this.ctx.apps().map((a) => a.id).join(', ');
    return { lines: [`open: unknown app '${id ?? ''}'`, `available: ${ids}`] };
  }

  private fmtSize(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  }
}
