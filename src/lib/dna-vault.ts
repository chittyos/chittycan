import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { CONFIG_DIR } from './config.js';

const DNA_DIR = path.join(CONFIG_DIR, 'dna');
const VAULT_PATH = path.join(DNA_DIR, 'vault.enc');
const KEY_PATH = path.join(DNA_DIR, 'keys', 'master.key');

export interface Workflow {
  id: string;
  name: string;
  pattern: {
    type: 'regex' | 'semantic' | 'hybrid';
    value: string;
    hash: string;
  };
  confidence: number;
  usage_count: number;
  success_rate: number;
  created: string; // ISO 8601
  last_evolved: string; // ISO 8601
  impact: {
    time_saved: number; // minutes
  };
  tags: string[];
  privacy: {
    content_hash: string;
    reveal_pattern: boolean;
  };
}

export interface CommandTemplate {
  id: string;
  name: string;
  pattern: string;
  expands_to: string;
  description?: string;
  usage_count: number;
}

export interface Integration {
  type: string;
  name: string;
  endpoint?: string;
  enabled: boolean;
}

export interface ContextMemory {
  session_id: string;
  timestamp: string;
  context: {
    working_directory?: string;
    active_files?: string[];
    last_command?: string;
    outcome?: 'success' | 'failure';
  };
  privacy: {
    hash: string;
    reveal_content: boolean;
  };
}

export interface ChittyDNA {
  workflows: Workflow[];
  preferences: Record<string, any>;
  command_templates: CommandTemplate[];
  integrations: Integration[];
  context_memory: ContextMemory[];
}

export class DNAVault {
  private static instance: DNAVault;
  private encryptionKey: Buffer;

  private constructor() {
    this.ensureVaultStructure();
    this.encryptionKey = this.loadOrCreateKey();
  }

  static getInstance(): DNAVault {
    if (!DNAVault.instance) {
      DNAVault.instance = new DNAVault();
    }
    return DNAVault.instance;
  }

  private ensureVaultStructure(): void {
    fs.ensureDirSync(path.join(DNA_DIR, 'snapshots'));
    fs.ensureDirSync(path.join(DNA_DIR, 'keys'));
    fs.ensureDirSync(path.join(CONFIG_DIR, 'audit'));
    fs.ensureDirSync(path.join(CONFIG_DIR, 'attribution'));
  }

  private loadOrCreateKey(): Buffer {
    if (fs.existsSync(KEY_PATH)) {
      return fs.readFileSync(KEY_PATH);
    }

    // Generate new 256-bit key
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_PATH, key, { mode: 0o600 }); // User-only read/write

    console.log('\n🔐 DNA Vault initialized');
    console.log('✓ Encryption key generated');
    console.log('✓ Your DNA is now encrypted and secure');
    console.log('\nLearn more: https://foundation.chitty.cc/charter\n');

    return key;
  }

  /**
   * Encrypt and save DNA to vault
   */
  async save(dna: ChittyDNA): Promise<void> {
    const json = JSON.stringify(dna, null, 2);
    const encrypted = this.encrypt(json);

    fs.writeFileSync(VAULT_PATH, encrypted);

    // Create snapshot
    await this.snapshot(encrypted);

    // Update manifest
    await this.updateManifest(dna);

    // Log mutation
    await this.logMutation('save', dna);
  }

  /**
   * Load and decrypt DNA from vault
   */
  async load(): Promise<ChittyDNA | null> {
    if (!fs.existsSync(VAULT_PATH)) {
      return null;
    }

    const encrypted = fs.readFileSync(VAULT_PATH);
    const json = this.decrypt(encrypted);

    return JSON.parse(json);
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(data, 'utf8'),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Format: [IV (16 bytes)] [Auth Tag (16 bytes)] [Encrypted Data]
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  private decrypt(data: Buffer): string {
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Create versioned snapshot
   */
  private async snapshot(encryptedData: Buffer): Promise<void> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, 'Z');
    const snapshotPath = path.join(DNA_DIR, 'snapshots', `${timestamp}.dna.enc`);

    fs.writeFileSync(snapshotPath, encryptedData);

    // Update snapshot index
    const indexPath = path.join(DNA_DIR, 'snapshots', 'index.json');
    const index = fs.existsSync(indexPath)
      ? JSON.parse(fs.readFileSync(indexPath, 'utf8'))
      : { snapshots: [] };

    index.snapshots.push({
      timestamp,
      path: snapshotPath,
      size: encryptedData.length
    });

    // Keep last 30 snapshots
    if (index.snapshots.length > 30) {
      const removed = index.snapshots.shift();
      if (fs.existsSync(removed.path)) {
        fs.removeSync(removed.path);
      }
    }

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Update PDX-compliant manifest
   */
  private async updateManifest(dna: ChittyDNA): Promise<void> {
    const manifestPath = path.join(DNA_DIR, 'manifest.json');

    const manifest = {
      '@context': 'https://foundation.chitty.cc/pdx/v1',
      '@type': 'ChittyDNA',
      version: '1.0.0',
      last_modified: new Date().toISOString(),
      workflow_count: dna.workflows.length,
      template_count: dna.command_templates.length,
      integration_count: dna.integrations.length
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Log DNA mutation (privacy-preserving)
   */
  private async logMutation(action: string, dna: ChittyDNA): Promise<void> {
    const auditPath = path.join(CONFIG_DIR, 'audit', 'mutations.jsonl');

    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(dna))
      .digest('hex');

    const entry = {
      timestamp: new Date().toISOString(),
      action,
      workflow_count: dna.workflows.length,
      content_hash: hash
    };

    fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
  }

  /**
   * Get snapshot history
   */
  async getSnapshots(): Promise<Array<{ timestamp: string; path: string; size: number }>> {
    const indexPath = path.join(DNA_DIR, 'snapshots', 'index.json');

    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return index.snapshots || [];
  }

  /**
   * Restore from snapshot
   */
  async restoreSnapshot(timestamp: string): Promise<boolean> {
    const snapshotPath = path.join(DNA_DIR, 'snapshots', `${timestamp}.dna.enc`);

    if (!fs.existsSync(snapshotPath)) {
      return false;
    }

    // Copy snapshot to main vault
    fs.copyFileSync(snapshotPath, VAULT_PATH);

    return true;
  }

  /**
   * Delete all DNA (ethical exit)
   */
  async revoke(): Promise<void> {
    if (fs.existsSync(DNA_DIR)) {
      fs.removeSync(DNA_DIR);
    }
  }

  /**
   * Check if vault exists
   */
  exists(): boolean {
    return fs.existsSync(VAULT_PATH);
  }

  /**
   * Get vault statistics
   */
  async getStats(): Promise<{
    encrypted: boolean;
    size_bytes: number;
    snapshot_count: number;
    last_modified: string | null;
  }> {
    if (!this.exists()) {
      return {
        encrypted: true,
        size_bytes: 0,
        snapshot_count: 0,
        last_modified: null
      };
    }

    const stats = fs.statSync(VAULT_PATH);
    const snapshots = await this.getSnapshots();

    return {
      encrypted: true,
      size_bytes: stats.size,
      snapshot_count: snapshots.length,
      last_modified: stats.mtime.toISOString()
    };
  }
}
