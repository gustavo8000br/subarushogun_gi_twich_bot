import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const rootPath = fileURLToPath(root);
const automationPath = fileURLToPath(
  new URL('.aiox-core/core/quality-gates/layer2-pr-automation.js', root),
);
const workflowExecutorPath = fileURLToPath(
  new URL('.aiox-core/core/orchestration/workflow-executor.js', root),
);

function loadAutomation() {
  class BaseLayer {
    constructor(name, config) {
      this.name = name;
      this.config = config;
      this.enabled = true;
      this.results = [];
    }

    reset() { this.results = []; }
    startTimer() {}
    stopTimer() {}
    addResult(result) { this.results.push(result); }
    getSummary() { return { pass: this.results.every((result) => result.pass), results: this.results }; }
    formatDuration() { return '0ms'; }
  }

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(id) {
      if (id === './base-layer') return { BaseLayer };
      if (id === 'child_process') return { spawn: () => { throw new Error('unexpected child process'); } };
      if (id === 'fs') return { promises: {} };
      if (id === 'os') return { homedir: () => '/tmp' };
      if (id === 'path') return { dirname: () => '/tmp' };
      throw new Error(`unexpected dependency: ${id}`);
    },
    process: { env: {}, platform: 'linux', cwd: () => '/tmp' },
    console,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(readFileSync(automationPath, 'utf8'), sandbox, { filename: automationPath });
  return module.exports.Layer2PRAutomation;
}

function loadWorkflowExecutor() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(id) {
      if (id === 'fs') return { promises: {}, existsSync: () => false };
      if (id === 'os') return {};
      if (id === 'path') return path;
      if (id === 'js-yaml') return {};
      if (id === './executor-assignment' || id === './terminal-spawner') return class {};
      if (id === './session-state') return { SessionState: class {}, ActionType: {} };
      throw new Error(`unexpected dependency: ${id}`);
    },
    process: { env: {}, platform: 'linux', cwd: () => '/tmp' },
    console,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(readFileSync(workflowExecutorPath, 'utf8'), sandbox, { filename: workflowExecutorPath });
  return module.exports.WorkflowExecutor;
}

describe('AIOX local static review gate', () => {
  it('runs the configured scanner and reports success or failure from its exit code', async () => {
    const Layer2PRAutomation = loadAutomation();
    const gate = new Layer2PRAutomation({
      opengrep: { enabled: true, command: 'npm run review:static', timeout: 300000 },
      quinn: { enabled: false },
    });
    const commands = [];
    gate.runCommand = async (command) => {
      commands.push(command);
      return { exitCode: 0, stdout: '0 findings', stderr: '', duration: 12 };
    };

    const success = await gate.execute();
    expect(commands).toEqual(['npm run review:static']);
    expect(success.results).toContainEqual(expect.objectContaining({ check: 'opengrep', pass: true }));

    gate.runCommand = async () => ({ exitCode: 2, stdout: '', stderr: 'findings present', duration: 9 });
    const failure = await gate.execute();
    expect(failure.pass).toBe(false);
    expect(failure.results).toContainEqual(expect.objectContaining({ check: 'opengrep', pass: false }));
  });

  it('runs static analysis as a reporting phase and never applies automated fixes', async () => {
    const WorkflowExecutor = loadWorkflowExecutor();
    const executor = Object.create(WorkflowExecutor.prototype);
    executor.options = { debug: false };
    executor.config = { opengrep_integration: { enabled: true, command: 'npm run review:static' } };
    const commands = [];
    executor.runStaticReviewCommand = async (config) => {
      commands.push(config.command);
      return { success: true, exitCode: 0, output: 'scan complete' };
    };

    const result = await executor.executeStaticReviewPhase({}, '@dev');

    expect(commands).toEqual(['npm run review:static']);
    expect(result.status).toBe('completed');
    expect(result.static_review.output).toBe('scan complete');
    expect(executor.attemptAutoFix).toBeUndefined();
  });

  it('removes the superseded provider from all tracked AIOX and project files', () => {
    const obsoleteName = ['code', 'rabbit'].join('');
    const skippedDirectories = new Set(['.git', 'node_modules', 'coverage', 'dist']);
    const files = [];
    const visit = (directory) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) {
          if (!skippedDirectories.has(name)) visit(path);
        } else {
          files.push(path);
        }
      }
    };
    visit(rootPath);

    const remaining = files.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return new RegExp(obsoleteName, 'i').test(content) || new RegExp(obsoleteName, 'i').test(file);
    });

    expect(remaining).toEqual([]);
  });
});
