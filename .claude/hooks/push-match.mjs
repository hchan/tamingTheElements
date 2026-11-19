// Parser for the pre-push hook: finds real `git push` invocations in a Bash command string.
// Library: findPushes(command, {cwd, home}). CLI: `node push-match.mjs --cli` reads the hook JSON on stdin and prints
// one line per finding: `dir<TAB>path`, `unknown<TAB>reason` or `moved<TAB>subcommand`. No lines = not a push.
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RESERVED = new Set(['!', '{', '}', 'if', 'then', 'elif', 'else', 'do', 'while', 'until', 'time']);
const MOVERS = new Set(['commit', 'merge', 'rebase', 'pull', 'cherry-pick', 'revert', 'am', 'reset', 'checkout', 'switch', 'update-ref']);
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const NAME = /[A-Za-z0-9_{@#?!*$-]/;

// s[i] is just after "(": returns the index of the matching ")" (or s.length).
const matchParen = (s, i) => {
  let depth = 1;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') i++;
    else if (c === "'") {
      const e = s.indexOf("'", i + 1);
      i = e < 0 ? s.length : e;
    } else if (c === '"') {
      for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === '\\') i++;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return s.length;
};
const matchTick = (s, i) => {
  for (; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '`') return i;
  }
  return s.length;
};

export function findPushes(command, { cwd, home = homedir() } = {}) {
  const st = { cwd: cwd ?? null, found: [], moved: null, home };
  runScript(command, st);
  const seen = new Set();
  return st.found.filter((f) => {
    const k = `${f.kind}\t${f.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Text where only substitutions run (unquoted heredoc bodies).
function scanSubs(text, st) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '$' && text[i + 1] === '(') {
      const e = matchParen(text, i + 2);
      runScript(text.slice(i + 2, e), st);
      i = e;
    } else if (text[i] === '`') {
      const e = matchTick(text, i + 1);
      runScript(text.slice(i + 1, e), st);
      i = e;
    }
  }
}

function runScript(src, st) {
  let i = 0;
  let words = [];
  let cur = null;
  let lit = true;
  let quoted = false;
  let redir = false; // the next word is a redirection target
  let heredoc = null; // ... and it is a heredoc delimiter
  const pending = [];
  const add = (t) => {
    cur = (cur ?? '') + t;
  };
  const flush = () => {
    if (cur !== null) {
      if (heredoc) pending.push({ delim: cur, strip: heredoc.strip, quoted });
      else if (!redir) words.push({ t: cur, lit });
      redir = false;
      heredoc = null;
    }
    cur = null;
    lit = true;
    quoted = false;
  };
  const endCmd = () => {
    flush();
    handle(words, st);
    words = [];
    redir = false;
    heredoc = null;
  };
  const sub = (inner) => {
    runScript(inner, st);
    lit = false;
    add('');
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      if (src[i + 1] === '\n') i += 2;
      else {
        add(src[i + 1] ?? '');
        quoted = true;
        i += 2;
      }
    } else if (c === "'") {
      const e = src.indexOf("'", i + 1) < 0 ? src.length : src.indexOf("'", i + 1);
      add(src.slice(i + 1, e));
      quoted = true;
      i = e + 1;
    } else if (c === '$' && src[i + 1] === "'") {
      let j = i + 2;
      let t = '';
      for (; j < src.length && src[j] !== "'"; j++) {
        if (src[j] === '\\') j++;
        t += src[j] ?? '';
      }
      add(t);
      quoted = true;
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let t = '';
      quoted = true;
      add('');
      for (; j < src.length && src[j] !== '"'; j++) {
        const d = src[j];
        if (d === '\\') {
          j++;
          if (src[j] !== '\n') t += '$`"\\'.includes(src[j]) ? src[j] : `\\${src[j] ?? ''}`;
        } else if (d === '$' && src[j + 1] === '(') {
          const e = matchParen(src, j + 2);
          sub(src.slice(j + 2, e));
          j = e;
        } else if (d === '`') {
          const e = matchTick(src, j + 1);
          sub(src.slice(j + 1, e));
          j = e;
        } else {
          if (d === '$' && NAME.test(src[j + 1] ?? ' ')) lit = false;
          t += d;
        }
      }
      add(t);
      i = j + 1;
    } else if (c === '$' && src[i + 1] === '(') {
      const e = matchParen(src, i + 2);
      sub(src.slice(i + 2, e));
      i = e + 1;
    } else if (c === '`') {
      const e = matchTick(src, i + 1);
      sub(src.slice(i + 1, e));
      i = e + 1;
    } else if (c === '$') {
      if (NAME.test(src[i + 1] ?? ' ')) lit = false;
      add('$');
      i++;
    } else if (c === '#' && cur === null) {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === ' ' || c === '\t') {
      flush();
      i++;
    } else if (c === '\n') {
      endCmd();
      i++;
      for (const h of pending.splice(0)) {
        const lines = [];
        while (i < src.length) {
          let e = src.indexOf('\n', i);
          if (e < 0) e = src.length;
          const line = src.slice(i, e);
          i = e + 1;
          if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
          lines.push(line);
        }
        if (!h.quoted) scanSubs(lines.join('\n'), st);
      }
    } else if (c === ';' || c === '|' || c === '(' || c === ')' || (c === '&' && src[i + 1] !== '>')) {
      endCmd();
      i++;
    } else if ((c === '<' || c === '>') && src[i + 1] === '(') {
      const e = matchParen(src, i + 2);
      sub(src.slice(i + 2, e));
      i = e + 1;
    } else if (c === '<' || c === '>' || c === '&') {
      if (cur !== null && /^\d+$/.test(cur)) cur = null; // fd number prefix
      else flush();
      let op = c;
      while (op.length < 3 && /[<>&|-]/.test(src[i + op.length] ?? ' ')) {
        if (src[i + op.length] === '-' && op !== '<<') break;
        op += src[i + op.length];
      }
      redir = true;
      if (op.startsWith('<<') && op !== '<<<') heredoc = { strip: op === '<<-' };
      i += op.length;
    } else {
      add(c);
      i++;
    }
  }
  endCmd();
}

function handle(words, st) {
  let w = words;
  for (let guard = 0; guard < 50 && w.length > 0; guard++) {
    const t = w[0].t;
    const base = t.slice(t.lastIndexOf('/') + 1);
    if (w[0].lit && RESERVED.has(t)) w = w.slice(1);
    else if (ASSIGN.test(t)) w = w.slice(1);
    else if (base === 'command' || base === 'builtin' || base === 'exec' || base === 'nohup') {
      w = w.slice(1);
      while (w[0] && /^-/.test(w[0].t)) w = w.slice(1);
    } else if (base === 'nice') {
      w = w.slice(w[1]?.t === '-n' ? 3 : /^-\d+$/.test(w[1]?.t ?? '') ? 2 : 1);
    } else if (base === 'env') {
      w = w.slice(1);
      while (w[0] && (/^-/.test(w[0].t) || ASSIGN.test(w[0].t))) w = w.slice(w[0].t === '-u' ? 2 : 1);
    } else if (base === 'timeout') {
      w = w.slice(1);
      while (w[0] && /^-/.test(w[0].t)) w = w.slice(w[0].t === '-k' || w[0].t === '-s' ? 2 : 1);
      w = w.slice(1);
    } else if (base === 'caffeinate') {
      w = w.slice(1);
      while (w[0] && /^-/.test(w[0].t)) w = w.slice(w[0].t === '-t' || w[0].t === '-w' ? 2 : 1);
    } else break;
  }
  if (w.length === 0) return;
  const cmd = w[0].t;
  const base = cmd.slice(cmd.lastIndexOf('/') + 1);
  if (cmd === 'cd' || cmd === 'pushd') {
    const target = w.slice(1).find((x) => !x.t.startsWith('-') || x.t === '-');
    if (!target) st.cwd = st.home;
    else if (!target.lit || target.t === '-') st.cwd = null;
    else st.cwd = chdir(st.cwd, target.t, st.home);
  } else if (cmd === 'popd') st.cwd = null;
  else if (['bash', 'sh', 'zsh', 'dash'].includes(base)) {
    const k = w.findIndex((x, n) => n > 0 && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(x.t));
    if (k > 0 && w[k + 1]) runScript(w[k + 1].t, st);
  } else if (cmd === 'eval') runScript(w.slice(1).map((x) => x.t).join(' '), st);
  else if (base === 'git' && (cmd === 'git' || cmd.endsWith('/git'))) gitCmd(w.slice(1), st);
}

function chdir(cur, target, home) {
  if (target === '~' || target.startsWith('~/')) target = home + target.slice(1);
  if (isAbsolute(target)) return resolve(target);
  return cur === null ? null : resolve(cur, target);
}

function gitCmd(a, st) {
  let dir = st.cwd;
  let unknown = null;
  let k = 0;
  for (; k < a.length; k++) {
    const t = a[k].t;
    if (t === '-C') {
      const p = a[k + 1];
      k++;
      if (!p || !p.lit) unknown = '-C with a non-literal path';
      else dir = chdir(dir, p.t, st.home);
    } else if (t === '-c' || t === '--config-env' || t === '--namespace' || t === '--attr-source') k++;
    else if (/^--(git-dir|work-tree)/.test(t)) unknown = `${t.split('=')[0]} is used`;
    else if (t.startsWith('-')) continue;
    else break;
  }
  const sub = a[k];
  if (!sub) return;
  if (sub.lit && sub.t !== 'push') {
    if (MOVERS.has(sub.t) && !st.moved) st.moved = sub.t;
    return;
  }
  if (st.moved) st.found.push({ kind: 'moved', value: st.moved });
  else if (unknown) st.found.push({ kind: 'unknown', value: unknown });
  else if (dir === null) st.found.push({ kind: 'unknown', value: 'the working directory is not known here' });
  else st.found.push({ kind: 'dir', value: dir });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--cli') {
  let raw = '';
  for await (const ch of process.stdin) raw += ch;
  const p = JSON.parse(raw);
  const command = p?.tool_input?.command;
  if (typeof command === 'string') {
    const cwd = p.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    for (const f of findPushes(command, { cwd })) console.log(`${f.kind}\t${f.value}`);
  }
}
