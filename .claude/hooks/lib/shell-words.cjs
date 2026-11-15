'use strict';

/**
 * Minimal shell word splitter for PreToolUse guards (project-owned).
 *
 * It is NOT a full POSIX parser. It only needs to answer two questions
 * conservatively: "which words start each command segment?" and "is a word
 * built at run time?". Quotes and backslashes are removed from words, so
 * `git p''ush`, `git "push"` and `git pu\sh` all read as `git push`.
 * A word that contains `$` or a backtick outside single quotes is marked
 * `dynamic`, because its final value is unknown before the shell runs.
 */

const SEGMENT_BREAKS = new Set([';', '|', '&', '(', ')', '\n']);

/**
 * @param {string} input
 * @returns {Array<Array<{ text: string, dynamic: boolean }>>}
 */
function splitSegments(input) {
  const source = String(input || '');
  const segments = [];
  let words = [];
  let current = '';
  let dynamic = false;
  let inWord = false;

  const pushWord = () => {
    if (inWord) words.push({ text: current, dynamic });
    current = '';
    dynamic = false;
    inWord = false;
  };
  const pushSegment = () => {
    pushWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };

  let index = 0;
  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      const next = source[index + 1];
      if (next === undefined) {
        index += 1;
        continue;
      }
      if (next === '\n') {
        index += 2;
        continue;
      }
      current += next;
      inWord = true;
      index += 2;
      continue;
    }

    if (char === "'") {
      const end = source.indexOf("'", index + 1);
      current += end === -1 ? source.slice(index + 1) : source.slice(index + 1, end);
      inWord = true;
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    if (char === '"') {
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== '"') {
        if (source[cursor] === '\\' && cursor + 1 < source.length) {
          current += source[cursor + 1];
          cursor += 2;
          continue;
        }
        if (source[cursor] === '$' || source[cursor] === '`') dynamic = true;
        current += source[cursor];
        cursor += 1;
      }
      inWord = true;
      index = cursor + 1;
      continue;
    }

    if (SEGMENT_BREAKS.has(char)) {
      pushSegment();
      index += 1;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\r') {
      pushWord();
      index += 1;
      continue;
    }

    if (char === '$' || char === '`') dynamic = true;
    current += char;
    inWord = true;
    index += 1;
  }

  pushSegment();
  return segments;
}

const PREFIX_COMMANDS = new Set([
  'env', 'command', 'builtin', 'exec', 'nohup', 'time', 'sudo', 'nice', 'stdbuf', 'xargs', 'timeout',
  'ionice', 'setsid', 'flock', 'watch', 'parallel',
]);
const SHELL_WRAPPERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function baseName(word) {
  const text = String(word || '');
  const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  return slash === -1 ? text : text.slice(slash + 1);
}

/**
 * Drop leading `VAR=value` words and wrapper commands (`env`, `command`,
 * `sudo`, `xargs`, `timeout 5` ...) with their options.
 * @param {Array<{ text: string, dynamic: boolean }>} words
 */
function stripPrefixes(words) {
  let index = 0;
  while (index < words.length) {
    const text = words[index].text;
    if (ASSIGNMENT.test(text)) {
      index += 1;
      continue;
    }
    if (PREFIX_COMMANDS.has(baseName(text))) {
      const wrapper = baseName(text);
      index += 1;
      while (index < words.length && (words[index].text.startsWith('-') || /^\d+[smhd]?$/.test(words[index].text) || ASSIGNMENT.test(words[index].text))) {
        index += 1;
      }
      // `flock LOCKFILE command ...`: the lock file is a positional before the command.
      if (wrapper === 'flock' && index < words.length) index += 1;
      continue;
    }
    break;
  }
  const rest = words.slice(index);
  // The dropped prefix words (assignments, wrapper options) stay readable for
  // guards that look for environment overrides; the property is not enumerable.
  Object.defineProperty(rest, 'dropped', { value: words.slice(0, index).map((word) => word.text), enumerable: false });
  return rest;
}

/**
 * True when the command writes through an unquoted output redirection (`>`,
 * `>>`, `>|`). `2>/dev/null` is ignored. Quote-aware, not a full parser.
 * @param {string} command
 */
function hasOutputRedirect(command) {
  const raw = String(command || '')
    .replace(/(^|\s)[0-9]?>\s*\/dev\/null(?=\s|$)/g, '$1')
    // `2>&1`, `>&2`, `1>&-`: duplicating or closing a descriptor writes no file.
    .replace(/[0-9]?>&(?:[0-9]+|-)(?=\s|$|[;&|)])/g, ' ');
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '\\' && !inSingle) {
      index += 1;
      continue;
    }
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (char === '>' && !inSingle && !inDouble) return true;
  }
  return false;
}

/**
 * Text inside `$(...)` and backticks, also inside double quotes (not inside
 * single quotes). Nested substitutions are found by the recursive call of the
 * caller. Conservative: an unbalanced substitution takes the rest of the text.
 * @param {string} command
 * @returns {string[]}
 */
function substitutions(command) {
  const source = String(command || '');
  const found = [];
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\' && !inSingle) {
      index += 1;
      continue;
    }
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === '"' && !inSingle) inDouble = !inDouble;
    else if (inSingle) continue;
    else if (char === '$' && source[index + 1] === '(') {
      let level = 1;
      let cursor = index + 2;
      while (cursor < source.length && level > 0) {
        if (source[cursor] === '\\') cursor += 1;
        else if (source[cursor] === '(') level += 1;
        else if (source[cursor] === ')') level -= 1;
        cursor += 1;
      }
      found.push(source.slice(index + 2, level === 0 ? cursor - 1 : cursor));
    } else if (char === '`') {
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== '`') cursor += source[cursor] === '\\' ? 2 : 1;
      found.push(source.slice(index + 1, cursor).replace(/\\`/g, '`'));
      index = cursor;
    }
  }
  return found;
}

/**
 * Strings that a wrapper hands to a shell or splits into a command:
 * `env -S '...'`, `flock ... -c '...'`, `watch '...'`, `parallel '...'`.
 * @param {Array<{ text: string, dynamic: boolean }>} raw
 * @returns {string[]}
 */
function wrappedStrings(raw) {
  const found = [];
  let index = 0;
  while (index < raw.length && ASSIGNMENT.test(raw[index].text)) index += 1;
  const head = raw[index] ? baseName(raw[index].text) : '';
  const rest = raw.slice(index + 1).map((word) => word.text);
  if (head === 'env') {
    rest.forEach((text, position) => {
      if (text === '--split-string' || /^-[a-zA-Z]*S$/.test(text)) found.push(rest[position + 1] || '');
      else if (text.startsWith('--split-string=')) found.push(text.slice('--split-string='.length));
      else if (/^-[a-zA-Z]*S.+/.test(text)) found.push(text.replace(/^-[a-zA-Z]*S/, ''));
    });
  } else if (head === 'flock') {
    rest.forEach((text, position) => {
      if (text === '-c' || text === '--command') found.push(rest[position + 1] || '');
      else if (text.startsWith('--command=')) found.push(text.slice('--command='.length));
    });
  } else if (head === 'watch' || head === 'parallel') {
    found.push(rest.join(' '));
  }
  return found.filter(Boolean);
}

/**
 * Expand `sh -c '...'`, `bash -lc "..."` and `eval ...` into their inner
 * segments, recursively, so wrapped commands are inspected too.
 * @param {string} command
 * @param {number} [depth]
 */
function commandSegments(command, depth = 0) {
  const result = [];
  if (depth < 4) {
    for (const inner of substitutions(command)) result.push(...commandSegments(inner, depth + 1));
  }
  for (const raw of splitSegments(command)) {
    if (depth < 4) {
      for (const inner of wrappedStrings(raw)) result.push(...commandSegments(inner, depth + 1));
    }
    const words = stripPrefixes(raw);
    if (words.length === 0) continue;
    const head = baseName(words[0].text);
    if (depth < 4 && SHELL_WRAPPERS.has(head)) {
      const flagIndex = words.findIndex((word, position) => position > 0 && /^-[a-z]*c[a-z]*$/.test(word.text));
      if (flagIndex !== -1 && words[flagIndex + 1]) {
        result.push(words);
        result.push(...commandSegments(words[flagIndex + 1].text, depth + 1));
        continue;
      }
    }
    if (depth < 4 && head === 'eval') {
      result.push(words);
      result.push(...commandSegments(words.slice(1).map((word) => word.text).join(' '), depth + 1));
      continue;
    }
    // `find . -exec git push \;` — inspect the command after -exec/-execdir/-ok too.
    const execIndex = words.findIndex((word) => ['-exec', '-execdir', '-ok', '-okdir'].includes(word.text));
    if (execIndex !== -1 && words[execIndex + 1]) result.push(words.slice(execIndex + 1));
    result.push(words);
  }
  return result;
}

module.exports = { splitSegments, stripPrefixes, commandSegments, baseName, hasOutputRedirect };
