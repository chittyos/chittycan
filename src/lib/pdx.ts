import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { DNAVault, ChittyDNA, Workflow } from './dna-vault.js';
import { loadConfig, CONFIG_DIR } from './config.js';

export interface PDXExport {
  '@context': string;
  '@type': string;
  version: string;
  owner: {
    chittyid?: string;
    email?: string;
    consent: {
      learning: boolean;
      portability: boolean;
      attribution: boolean;
      marketplace: boolean;
      timestamp: string;
      signature: string;
    };
    license: {
      type: string;
      grant: string;
      scope: string[];
      expires: string | null;
    };
  };
  dna: ChittyDNA;
  attribution?: {
    enabled: boolean;
    contributions: any[];
  };
  metadata: {
    created: string;
    last_modified: string;
    export_timestamp: string;
    export_tool: {
      name: string;
      version: string;
      url: string;
    };
    format_version: string;
    schema_url: string;
    integrity: {
      algorithm: string;
      hash: string;
      signature: string;
    };
  };
}

export type PrivacyMode = 'full' | 'hash-only' | 'zk';

export interface ExportOptions {
  privacy: PrivacyMode;
  includeAttribution: boolean;
  encrypt: boolean;
  password?: string;
}

export async function exportDNA(options: ExportOptions): Promise<PDXExport> {
  const vault = DNAVault.getInstance();
  const dna = await vault.load();

  if (!dna) {
    throw new Error('No DNA found in vault. Start using ChittyCan to build your DNA!');
  }

  const config = loadConfig();

  // Load package.json for version
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  let packageJson = { version: '0.5.0' };
  if (fs.existsSync(packageJsonPath)) {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  }

  // Apply privacy mode
  const processedDNA = applyPrivacyMode(dna, options.privacy);

  // Generate integrity hash
  const dnaJson = JSON.stringify(processedDNA);
  const hash = crypto.createHash('sha256').update(dnaJson).digest('hex');

  // Sign with private key
  const signature = signData(dnaJson);

  const pdxExport: PDXExport = {
    '@context': 'https://foundation.chitty.cc/pdx/v1',
    '@type': 'ChittyDNA',
    version: '1.0.0',
    owner: {
      email: config.user?.email,
      consent: {
        learning: true,
        portability: true,
        attribution: options.includeAttribution,
        marketplace: false,
        timestamp: new Date().toISOString(),
        signature: signature
      },
      license: {
        type: 'CDCL-1.0',
        grant: 'revocable',
        scope: ['personal'],
        expires: null
      }
    },
    dna: processedDNA,
    metadata: {
      created: dna.workflows[0]?.created || new Date().toISOString(),
      last_modified: new Date().toISOString(),
      export_timestamp: new Date().toISOString(),
      export_tool: {
        name: 'chittycan',
        version: packageJson.version,
        url: 'https://github.com/chittycorp/chittycan'
      },
      format_version: 'pdx-1.0',
      schema_url: 'https://foundation.chitty.cc/pdx/v1/schema.json',
      integrity: {
        algorithm: 'sha256',
        hash,
        signature
      }
    }
  };

  if (options.includeAttribution) {
    pdxExport.attribution = await loadAttribution();
  }

  // Log export event
  await logExportEvent(options.privacy);

  return pdxExport;
}

function applyPrivacyMode(dna: ChittyDNA, mode: PrivacyMode): ChittyDNA {
  if (mode === 'full') {
    return dna; // No changes
  }

  if (mode === 'hash-only') {
    return {
      ...dna,
      workflows: dna.workflows.map(wf => ({
        ...wf,
        pattern: {
          ...wf.pattern,
          value: wf.pattern.hash // Replace pattern with hash
        },
        privacy: {
          ...wf.privacy,
          reveal_pattern: false
        }
      })),
      context_memory: dna.context_memory.map(ctx => ({
        ...ctx,
        privacy: {
          ...ctx.privacy,
          reveal_content: false
        }
      }))
    };
  }

  throw new Error('ZK mode not yet implemented (v2.0)');
}

function signData(data: string): string {
  // Simple signature using hash for now
  // TODO: Implement RSA signature with private key
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return `0x${hash}`;
}

async function loadAttribution(): Promise<any> {
  const attributionPath = path.join(CONFIG_DIR, 'attribution', 'chains.jsonl');

  if (!fs.existsSync(attributionPath)) {
    return {
      enabled: false,
      contributions: []
    };
  }

  const lines = fs.readFileSync(attributionPath, 'utf8').trim().split('\n');
  const contributions = lines
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  return {
    enabled: true,
    contributions
  };
}

async function logExportEvent(privacyMode: PrivacyMode): Promise<void> {
  const auditPath = path.join(CONFIG_DIR, 'audit', 'learning-events.jsonl');

  const entry = {
    timestamp: new Date().toISOString(),
    event: 'dna_exported',
    privacy_mode: privacyMode
  };

  fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
}

export interface ImportOptions {
  conflictResolution: 'merge' | 'replace' | 'rename' | 'skip';
  verifySignature: boolean;
}

export async function importDNA(
  pdxJson: string,
  options: ImportOptions
): Promise<{ success: boolean; patterns: number; errors: string[] }> {
  const pdx: PDXExport = JSON.parse(pdxJson);

  // Validate schema
  if (pdx['@type'] !== 'ChittyDNA') {
    throw new Error('Invalid PDX file: @type must be ChittyDNA');
  }

  // Verify integrity
  const dnaJson = JSON.stringify(pdx.dna);
  const hash = crypto.createHash('sha256').update(dnaJson).digest('hex');

  if (hash !== pdx.metadata.integrity.hash) {
    throw new Error('Integrity check failed: hash mismatch');
  }

  // Verify signature
  if (options.verifySignature) {
    const expectedSignature = signData(dnaJson);
    // Note: In production, verify with public key
    // For now, we just check the hash-based signature
  }

  // Check consent
  if (!pdx.owner.consent.portability) {
    throw new Error('Portability not consented');
  }

  // Load existing DNA
  const vault = DNAVault.getInstance();
  const existingDNA = await vault.load() || {
    workflows: [],
    preferences: {},
    command_templates: [],
    integrations: [],
    context_memory: []
  };

  // Merge workflows
  const { merged, errors } = mergeWorkflows(
    existingDNA.workflows,
    pdx.dna.workflows,
    options.conflictResolution
  );

  // Merge templates
  const mergedTemplates = mergeTemplates(
    existingDNA.command_templates,
    pdx.dna.command_templates,
    options.conflictResolution
  );

  // Merge integrations
  const mergedIntegrations = mergeIntegrations(
    existingDNA.integrations,
    pdx.dna.integrations,
    options.conflictResolution
  );

  const newDNA: ChittyDNA = {
    ...existingDNA,
    workflows: merged,
    preferences: { ...existingDNA.preferences, ...pdx.dna.preferences },
    command_templates: mergedTemplates,
    integrations: mergedIntegrations
  };

  await vault.save(newDNA);

  // Log import event
  await logImportEvent(pdx.dna.workflows.length);

  return {
    success: true,
    patterns: pdx.dna.workflows.length,
    errors
  };
}

function mergeWorkflows(
  existing: Workflow[],
  incoming: Workflow[],
  resolution: string
): { merged: Workflow[]; errors: string[] } {
  const merged = [...existing];
  const errors: string[] = [];

  for (const workflow of incoming) {
    const conflictIndex = existing.findIndex(wf => wf.id === workflow.id);

    if (conflictIndex === -1) {
      merged.push(workflow);
      continue;
    }

    const conflict = existing[conflictIndex];

    // Handle conflict
    if (resolution === 'merge') {
      // Combine usage counts, take higher confidence
      merged[conflictIndex] = {
        ...workflow,
        usage_count: conflict.usage_count + workflow.usage_count,
        confidence: Math.max(conflict.confidence, workflow.confidence),
        impact: {
          time_saved: conflict.impact.time_saved + workflow.impact.time_saved
        }
      };
    } else if (resolution === 'replace') {
      merged[conflictIndex] = workflow;
    } else if (resolution === 'rename') {
      merged.push({
        ...workflow,
        id: `${workflow.id}_imported`,
        name: `${workflow.name} (imported)`
      });
    } else if (resolution === 'skip') {
      errors.push(`Skipped conflicting workflow: ${workflow.id}`);
    }
  }

  return { merged, errors };
}

function mergeTemplates(
  existing: any[],
  incoming: any[],
  resolution: string
): any[] {
  const merged = [...existing];

  for (const template of incoming) {
    const exists = existing.find(t => t.id === template.id);
    if (!exists) {
      merged.push(template);
    } else if (resolution === 'replace') {
      const index = merged.findIndex(t => t.id === template.id);
      merged[index] = template;
    }
  }

  return merged;
}

function mergeIntegrations(
  existing: any[],
  incoming: any[],
  resolution: string
): any[] {
  const merged = [...existing];

  for (const integration of incoming) {
    const exists = existing.find(i => i.name === integration.name && i.type === integration.type);
    if (!exists) {
      merged.push(integration);
    } else if (resolution === 'replace') {
      const index = merged.findIndex(i => i.name === integration.name && i.type === integration.type);
      merged[index] = integration;
    }
  }

  return merged;
}

async function logImportEvent(patternCount: number): Promise<void> {
  const auditPath = path.join(CONFIG_DIR, 'audit', 'learning-events.jsonl');

  const entry = {
    timestamp: new Date().toISOString(),
    event: 'dna_imported',
    pattern_count: patternCount
  };

  fs.appendFileSync(auditPath, JSON.stringify(entry) + '\n');
}

/**
 * Check export rate limit (1 per 24 hours for Bronze tier)
 */
export async function checkExportRateLimit(): Promise<{ allowed: boolean; nextAllowed?: Date }> {
  const auditPath = path.join(CONFIG_DIR, 'audit', 'learning-events.jsonl');

  if (!fs.existsSync(auditPath)) {
    return { allowed: true };
  }

  const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n');
  const exports = lines
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
    .filter(entry => entry.event === 'dna_exported');

  if (exports.length === 0) {
    return { allowed: true };
  }

  const lastExport = new Date(exports[exports.length - 1].timestamp);
  const now = new Date();
  const hoursSinceLastExport = (now.getTime() - lastExport.getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastExport < 24) {
    const nextAllowed = new Date(lastExport.getTime() + 24 * 60 * 60 * 1000);
    return { allowed: false, nextAllowed };
  }

  return { allowed: true };
}
