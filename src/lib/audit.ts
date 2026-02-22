import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { CONFIG_DIR } from './config.js';

const AUDIT_DIR = path.join(CONFIG_DIR, 'audit');

export type AuditEvent =
  | 'pattern_learned'
  | 'pattern_invoked'
  | 'pattern_evolved'
  | 'dna_exported'
  | 'dna_imported'
  | 'dna_revoked';

export interface AuditEntry {
  timestamp: string;
  event: AuditEvent;
  pattern_hash?: string;
  confidence?: number;
  outcome?: 'success' | 'failure';
  duration_ms?: number;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  private static instance: AuditLogger;

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
      fs.ensureDirSync(AUDIT_DIR);
    }
    return AuditLogger.instance;
  }

  /**
   * Log a learning event (privacy-preserving)
   */
  async log(entry: AuditEntry): Promise<void> {
    const logPath = path.join(AUDIT_DIR, 'learning-events.jsonl');

    const logEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };

    // NEVER log raw content—only hashes
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
  }

  /**
   * Hash sensitive data before logging
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Log pattern learning
   */
  async logPatternLearned(pattern: string, confidence: number): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      event: 'pattern_learned',
      pattern_hash: this.hash(pattern),
      confidence
    });
  }

  /**
   * Log pattern invocation
   */
  async logPatternInvoked(
    pattern: string,
    outcome: 'success' | 'failure',
    duration_ms: number
  ): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      event: 'pattern_invoked',
      pattern_hash: this.hash(pattern),
      outcome,
      duration_ms
    });
  }

  /**
   * Log pattern evolution
   */
  async logPatternEvolved(pattern: string, oldConfidence: number, newConfidence: number): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      event: 'pattern_evolved',
      pattern_hash: this.hash(pattern),
      metadata: {
        old_confidence: oldConfidence,
        new_confidence: newConfidence
      }
    });
  }

  /**
   * Log DNA export/import
   */
  async logPortability(
    event: 'dna_exported' | 'dna_imported',
    metadata: Record<string, any>
  ): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      event,
      metadata
    });
  }

  /**
   * Log DNA revocation
   */
  async logRevocation(): Promise<void> {
    await this.log({
      timestamp: new Date().toISOString(),
      event: 'dna_revoked'
    });
  }

  /**
   * Get all audit entries
   */
  async getEntries(filter?: { event?: AuditEvent; since?: Date }): Promise<AuditEntry[]> {
    const logPath = path.join(AUDIT_DIR, 'learning-events.jsonl');

    if (!fs.existsSync(logPath)) {
      return [];
    }

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    let entries = lines
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line) as AuditEntry);

    if (filter) {
      if (filter.event) {
        entries = entries.filter((e: AuditEntry) => e.event === filter.event);
      }
      if (filter.since) {
        entries = entries.filter((e: AuditEntry) => new Date(e.timestamp) >= filter.since!);
      }
    }

    return entries;
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<{
    total_events: number;
    patterns_learned: number;
    patterns_invoked: number;
    patterns_evolved: number;
    exports: number;
    imports: number;
    revocations: number;
    success_rate: number;
  }> {
    const entries = await this.getEntries();

    const invocations = entries.filter(e => e.event === 'pattern_invoked');
    const successes = invocations.filter(e => e.outcome === 'success');

    return {
      total_events: entries.length,
      patterns_learned: entries.filter(e => e.event === 'pattern_learned').length,
      patterns_invoked: invocations.length,
      patterns_evolved: entries.filter(e => e.event === 'pattern_evolved').length,
      exports: entries.filter(e => e.event === 'dna_exported').length,
      imports: entries.filter(e => e.event === 'dna_imported').length,
      revocations: entries.filter(e => e.event === 'dna_revoked').length,
      success_rate: invocations.length > 0 ? successes.length / invocations.length : 1.0
    };
  }

  /**
   * Verify audit integrity (check for tampering)
   */
  async verifyIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
    const logPath = path.join(AUDIT_DIR, 'learning-events.jsonl');

    if (!fs.existsSync(logPath)) {
      return { valid: true, errors: [] };
    }

    const errors: string[] = [];
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');

    let lineNumber = 0;
    for (const line of lines) {
      lineNumber++;

      if (!line.trim()) {
        continue;
      }

      try {
        const entry = JSON.parse(line);

        // Verify required fields
        if (!entry.timestamp) {
          errors.push(`Line ${lineNumber}: Missing timestamp`);
        }
        if (!entry.event) {
          errors.push(`Line ${lineNumber}: Missing event type`);
        }

        // Verify timestamp is valid ISO 8601
        if (entry.timestamp && isNaN(Date.parse(entry.timestamp))) {
          errors.push(`Line ${lineNumber}: Invalid timestamp format`);
        }

        // Verify no raw content (only hashes)
        if (entry.pattern && !entry.pattern_hash) {
          errors.push(`Line ${lineNumber}: Raw pattern content detected (security violation)`);
        }

      } catch (e) {
        errors.push(`Line ${lineNumber}: Invalid JSON`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clear audit logs (for testing or ethical exit)
   */
  async clear(): Promise<void> {
    const logPath = path.join(AUDIT_DIR, 'learning-events.jsonl');

    if (fs.existsSync(logPath)) {
      fs.removeSync(logPath);
    }
  }
}
