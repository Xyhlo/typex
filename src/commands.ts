export interface Command {
  id: string;
  title: string;
  subtitle?: string;
  shortcut?: string[];
  section?: string;
  icon?: string;
  run: () => void | Promise<void>;
}

const commands = new Map<string, Command>();

export const registerCommand = (cmd: Command): void => {
  commands.set(cmd.id, cmd);
};

export const registerCommands = (cmds: Command[]): void => {
  cmds.forEach(registerCommand);
};

export const allCommands = (): Command[] => Array.from(commands.values());

export const runCommand = async (id: string): Promise<void> => {
  const cmd = commands.get(id);
  if (!cmd) return;
  await cmd.run();
};

/**
 * Fuzzy-ish filter: every query char must appear in order in the title.
 * Scored by position + contiguity, so "th" strongly matches "Toggle theme".
 */
export const filterCommands = (query: string): Command[] => {
  const q = query.trim().toLowerCase();
  if (!q) return allCommands();
  const scored: Array<{ cmd: Command; score: number }> = [];
  for (const cmd of commands.values()) {
    const hay = `${cmd.title} ${cmd.subtitle ?? ""} ${cmd.section ?? ""}`.toLowerCase();
    let qi = 0;
    let score = 0;
    let lastIdx = -2;
    for (let i = 0; i < hay.length && qi < q.length; i++) {
      if (hay[i] === q[qi]) {
        score += i === lastIdx + 1 ? 3 : 1;
        if (i === 0 || hay[i - 1] === " ") score += 4;
        lastIdx = i;
        qi++;
      }
    }
    if (qi === q.length) scored.push({ cmd, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.cmd);
};
