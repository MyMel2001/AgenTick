// Virtual CLI — sandboxed unix-like shell operating on the virtual filesystem
const { files } = require('../db');

class VirtualCLI {
  constructor(userId) {
    this.userId = userId;
    this.cwd = '/';
  }

  async execute(commandLine) {
    const parts = commandLine.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const commands = {
      ls: () => this.ls(args),
      cat: () => this.cat(args),
      echo: () => this.echo(args),
      mkdir: () => this.mkdirCmd(args),
      rm: () => this.rm(args),
      cp: () => this.cp(args),
      mv: () => this.mv(args),
      pwd: () => this.pwd(),
      cd: () => this.cd(args),
      touch: () => this.touch(args),
      find: () => this.find(args),
      head: () => this.head(args),
      tail: () => this.tail(args),
      wc: () => this.wc(args),
      grep: () => this.grep(args),
      clear: () => ({ output: '\x1Bc', success: true }),
      help: () => this.help(),
    };

    if (!cmd) return { output: '', success: true };
    if (!commands[cmd]) return { output: `agentick-sh: command not found: ${cmd}`, success: false };

    try {
      return await commands[cmd]();
    } catch (err) {
      return { output: `Error: ${err.message}`, success: false };
    }
  }

  resolvePath(p) {
    if (!p) return this.cwd;
    if (p.startsWith('/')) return p.replace(/\/+$/, '') || '/';
    const parts = this.cwd.split('/').filter(Boolean);
    for (const seg of p.split('/')) {
      if (seg === '..') parts.pop();
      else if (seg !== '.' && seg !== '') parts.push(seg);
    }
    return '/' + parts.join('/') || '/';
  }

  async getAllFiles() {
    const all = await files.all();
    const prefix = `file_${this.userId}_`;
    return all.filter(e => e.id.startsWith(prefix)).map(e => e.value);
  }

  async ls(args) {
    const flags = args.filter(a => a.startsWith('-'));
    const target = args.find(a => !a.startsWith('-'));
    const dir = this.resolvePath(target);
    const all = await this.getAllFiles();
    const entries = [];
    const seen = new Set();
    for (const f of all) {
      const fp = f.path;
      const prefix = dir === '/' ? '/' : dir + '/';
      if (dir === '/' ? true : fp.startsWith(prefix)) {
        const rel = dir === '/' ? fp.substring(1) : fp.substring(prefix.length);
        const name = rel.split('/')[0];
        if (name && !seen.has(name)) {
          seen.add(name);
          const isDir = rel.includes('/') || f.isDirectory;
          if (flags.includes('-l')) {
            entries.push(`${isDir ? 'd' : '-'}rw-r--r--  ${(f.encryptedContent || '').length}\t${f.updatedAt || '-'}\t${name}${isDir ? '/' : ''}`);
          } else {
            entries.push(isDir ? name + '/' : name);
          }
        }
      }
    }
    return { output: entries.length ? entries.join('\n') : '', success: true };
  }

  async cat(args) {
    if (!args.length) return { output: 'cat: missing operand', success: false };
    const results = [];
    for (const a of args) {
      const path = this.resolvePath(a);
      const file = await files.get(`file_${this.userId}_${path}`);
      if (!file) { results.push(`cat: ${a}: No such file`); continue; }
      if (file.isDirectory) { results.push(`cat: ${a}: Is a directory`); continue; }
      results.push(file.encryptedContent ? '[encrypted content]' : '[empty]');
    }
    return { output: results.join('\n'), success: true };
  }

  async echo(args) {
    // Check for redirect
    const redirectIdx = args.indexOf('>');
    const appendIdx = args.indexOf('>>');
    if (appendIdx !== -1 || redirectIdx !== -1) {
      return { output: 'echo: use file-write or file-append tools for file operations', success: false };
    }
    return { output: args.join(' '), success: true };
  }

  async mkdirCmd(args) {
    if (!args.length) return { output: 'mkdir: missing operand', success: false };
    for (const a of args.filter(x => !x.startsWith('-'))) {
      const path = this.resolvePath(a);
      await files.set(`file_${this.userId}_${path}`, {
        path, encryptedContent: '', iv: '', salt: '', isDirectory: true,
        description: '', mimeType: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
    }
    return { output: '', success: true };
  }

  async rm(args) {
    const flags = args.filter(a => a.startsWith('-'));
    const targets = args.filter(a => !a.startsWith('-'));
    if (!targets.length) return { output: 'rm: missing operand', success: false };
    for (const t of targets) {
      const path = this.resolvePath(t);
      const key = `file_${this.userId}_${path}`;
      const file = await files.get(key);
      if (!file) return { output: `rm: ${t}: No such file or directory`, success: false };
      if (file.isDirectory && !flags.includes('-r') && !flags.includes('-rf')) {
        return { output: `rm: ${t}: is a directory (use -r)`, success: false };
      }
      if (file.isDirectory) {
        const all = await files.all();
        for (const e of all) {
          if (e.id.startsWith(`file_${this.userId}_${path}/`)) await files.delete(e.id);
        }
      }
      await files.delete(key);
    }
    return { output: '', success: true };
  }

  async cp(args) {
    const nonFlags = args.filter(a => !a.startsWith('-'));
    if (nonFlags.length < 2) return { output: 'cp: missing operand', success: false };
    const src = this.resolvePath(nonFlags[0]);
    const dst = this.resolvePath(nonFlags[1]);
    const file = await files.get(`file_${this.userId}_${src}`);
    if (!file) return { output: `cp: ${nonFlags[0]}: No such file`, success: false };
    const now = new Date().toISOString();
    await files.set(`file_${this.userId}_${dst}`, { ...file, path: dst, createdAt: now, updatedAt: now });
    return { output: '', success: true };
  }

  async mv(args) {
    const nonFlags = args.filter(a => !a.startsWith('-'));
    if (nonFlags.length < 2) return { output: 'mv: missing operand', success: false };
    const src = this.resolvePath(nonFlags[0]);
    const dst = this.resolvePath(nonFlags[1]);
    const file = await files.get(`file_${this.userId}_${src}`);
    if (!file) return { output: `mv: ${nonFlags[0]}: No such file`, success: false };
    await files.set(`file_${this.userId}_${dst}`, { ...file, path: dst, updatedAt: new Date().toISOString() });
    await files.delete(`file_${this.userId}_${src}`);
    return { output: '', success: true };
  }

  pwd() { return { output: this.cwd, success: true }; }

  cd(args) {
    if (!args.length || args[0] === '~') { this.cwd = '/'; return { output: '', success: true }; }
    this.cwd = this.resolvePath(args[0]);
    return { output: '', success: true };
  }

  async touch(args) {
    if (!args.length) return { output: 'touch: missing operand', success: false };
    const now = new Date().toISOString();
    for (const a of args) {
      const path = this.resolvePath(a);
      const key = `file_${this.userId}_${path}`;
      const existing = await files.get(key);
      if (!existing) {
        await files.set(key, { path, encryptedContent: '', iv: '', salt: '', isDirectory: false, description: '', mimeType: 'text/plain', createdAt: now, updatedAt: now });
      } else {
        await files.set(key, { ...existing, updatedAt: now });
      }
    }
    return { output: '', success: true };
  }

  async find(args) {
    const dir = args[0] ? this.resolvePath(args[0]) : this.cwd;
    const all = await this.getAllFiles();
    const prefix = dir === '/' ? '/' : dir;
    const found = all.filter(f => f.path.startsWith(prefix)).map(f => f.path);
    return { output: found.join('\n'), success: true };
  }

  async head(args) { return { output: '[encrypted content — use file-read tool]', success: true }; }
  async tail(args) { return { output: '[encrypted content — use file-read tool]', success: true }; }
  async wc(args) {
    if (!args.length) return { output: 'wc: missing operand', success: false };
    const path = this.resolvePath(args.find(a => !a.startsWith('-')) || args[0]);
    const file = await files.get(`file_${this.userId}_${path}`);
    if (!file) return { output: `wc: ${args[0]}: No such file`, success: false };
    return { output: `${(file.encryptedContent || '').length} bytes (encrypted)`, success: true };
  }
  async grep(args) { return { output: '[encrypted content — use file-read tool for content search]', success: true }; }

  help() {
    return {
      output: `AgenTick Virtual Shell
Commands: ls, cat, echo, mkdir, rm, cp, mv, pwd, cd, touch, find, head, tail, wc, grep, clear, help
Note: File contents are encrypted. Use file-read/file-write tools for content operations.`,
      success: true
    };
  }
}

module.exports = { VirtualCLI };
