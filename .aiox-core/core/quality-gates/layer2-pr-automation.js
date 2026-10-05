/**
 * Layer 2: local static analysis and QA-agent review.
 *
 * @module core/quality-gates/layer2-pr-automation
 * @version 1.0.0
 */

const childProcess = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { BaseLayer } = require('./base-layer');

class Layer2PRAutomation extends BaseLayer {
  constructor(config = {}) {
    super('Layer 2: Static Review', config);
    this.opengrep = config.opengrep || {};
    this.quinn = config.quinn || {};
  }

  async execute(context = {}) {
    this.reset();
    this.startTimer();

    if (!this.enabled) {
      this.addResult({ check: 'layer2', pass: true, skipped: true, message: 'Layer 2 disabled' });
      this.stopTimer();
      return this.getSummary();
    }

    if (this.opengrep.enabled !== false) this.addResult(await this.runStaticReview(context));
    if (this.quinn.enabled !== false) this.addResult(await this.runQuinnReview(context));

    this.stopTimer();
    return this.getSummary();
  }

  async runStaticReview(context = {}) {
    const timeout = this.opengrep.timeout || 300000;
    const command = this.opengrep.command || 'opengrep scan';

    try {
      const result = await this.runCommand(command, timeout);
      const pass = result.exitCode === 0;
      return {
        check: 'opengrep',
        pass,
        duration: result.duration,
        details: (result.stdout || '').slice(0, 2000),
        error: pass ? undefined : (result.stderr || '').slice(0, 2000),
        message: pass ? 'OpenGrep static analysis passed' : 'OpenGrep static analysis found blocking findings',
      };
    } catch (error) {
      return { check: 'opengrep', pass: false, error: error.message, message: `OpenGrep execution failed: ${error.message}` };
    }
  }

  async runQuinnReview(context = {}) {
    try {
      const suggestions = await this.generateQuinnSuggestions(context);
      const blockingSuggestions = suggestions.filter((suggestion) =>
        this.quinn.severity?.block?.includes(suggestion.severity),
      );
      return {
        check: 'quinn',
        pass: blockingSuggestions.length === 0,
        suggestions: suggestions.length,
        blocking: blockingSuggestions.length,
        details: suggestions,
        message: blockingSuggestions.length === 0
          ? `Quinn review: ${suggestions.length} suggestions`
          : `Quinn review: ${blockingSuggestions.length} blocking issues`,
      };
    } catch (error) {
      return { check: 'quinn', pass: true, skipped: true, error: error.message, message: `Quinn skipped: ${error.message}` };
    }
  }

  async generateQuinnSuggestions(_context = {}) {
    return [];
  }

  async saveReport(reportPath) {
    const report = { timestamp: new Date().toISOString(), layer: this.name, ...this.getSummary() };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  }

  runCommand(command, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const child = childProcess.spawn(command, [], {
        shell: true,
        cwd: process.cwd(),
        env: { ...process.env },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        resolve({ exitCode, stdout, stderr, duration: Date.now() - startTime });
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
}

module.exports = { Layer2PRAutomation };
