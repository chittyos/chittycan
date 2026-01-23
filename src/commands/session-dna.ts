import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { loadConfig, CONFIG_DIR } from '../lib/config.js';

/**
 * Session DNA Governance Commands
 *
 * These commands manage session DNA strands for session lifecycle governance.
 * Session strands encode what sessions can do - roles, scopes, context expansion.
 *
 * @see chittycanon://specs/chittydna-session-governance
 */

// ============================================================================
// TYPES (local copies - runtime only, no import from chittycore)
// ============================================================================

interface SessionStartAllele {
  session_chitty_id: string;
  parent_chitty_id: string;
  project_id: string;
  purpose: string;
  initiated_by: 'person' | 'agent' | 'system';
  expires_at: string;
}

interface AllowedRolesAllele {
  roles: string[];
}

interface ConsentScopeAllele {
  scopes: string[];
  grantor: string;
  granted_at: string;
}

interface Gene<T = unknown> {
  locus_id: string;
  tag: string;
  allele: T;
  allele_type?: 'json' | 'string' | 'jwt';
  provenance?: {
    signed_by: string;
    sig: string;
    ts: string;
  };
  confidence?: number;
  mutable?: boolean;
}

interface DNAStrand {
  dna_id: string;
  strand_type: 'session' | 'person' | 'project' | 'agent' | 'document' | 'memory';
  version: string;
  created_at: string;
  created_by: string;
  parent_ids?: string[];
  genes: Gene[];
  strand_hash: string;
  chain_anchor?: {
    type: 'chittychain' | 'drand' | 'ethereum' | 'none';
    ptr: string;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SESSION_DNA_DIR = path.join(CONFIG_DIR, 'session-dna');

async function ensureSessionDnaDir(): Promise<void> {
  await fs.ensureDir(SESSION_DNA_DIR);
}

function generateDnaId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase();
  return `CHITTY-DNA-${uuid}`;
}

function generateLocusId(sequence: number): string {
  return `L${sequence}`;
}

function computeStrandHash(strand: Omit<DNAStrand, 'strand_hash'>): string {
  const canonical = JSON.stringify({
    dna_id: strand.dna_id,
    strand_type: strand.strand_type,
    version: strand.version,
    created_at: strand.created_at,
    created_by: strand.created_by,
    parent_ids: strand.parent_ids || [],
    genes: strand.genes.map(g => ({
      locus_id: g.locus_id,
      tag: g.tag,
      allele: g.allele
    }))
  });
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Get ChittyID from config or generate anonymous
 */
function getChittyIdFromConfig(): string {
  const config = loadConfig();

  // Check ChittyConnect remote for configured identity
  const connectRemote = Object.values(config.remotes || {}).find(
    (r): r is { type: 'chittyconnect'; baseUrl: string; apiToken?: string } =>
      r.type === 'chittyconnect'
  );

  // If we have a ChittyConnect config with token, use derived ID
  if (connectRemote?.apiToken) {
    // Generate deterministic ID from token hash (first 8 chars of sha256)
    const hash = crypto.createHash('sha256').update(connectRemote.apiToken).digest('hex');
    return `CHITTY-USR-${hash.substring(0, 8).toUpperCase()}`;
  }

  // Fall back to machine-specific anonymous ID
  const machineId = crypto.createHash('sha256')
    .update(process.env.USER || 'anon')
    .update(process.env.HOME || '/tmp')
    .digest('hex');
  return `CHITTY-ANON-${machineId.substring(0, 8).toUpperCase()}`;
}

/**
 * Create a new session DNA strand
 */
export async function sessionCreateCommand(options: {
  project?: string;
  purpose?: string;
  roles?: string[];
  scopes?: string[];
  ttl?: number;
  parent?: string;
  interactive?: boolean;
}): Promise<void> {
  await ensureSessionDnaDir();

  console.log('\n🧬 Create Session DNA Strand\n');

  const chittyId = getChittyIdFromConfig();

  // Interactive mode if not all required fields provided
  let projectId = options.project;
  let purpose = options.purpose;
  let roles = options.roles || ['reader'];
  let scopes = options.scopes || ['read:self'];
  let ttlHours = options.ttl || 24;

  if (options.interactive !== false && (!projectId || !purpose)) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectId',
        message: 'Project ID:',
        default: projectId || 'CHITTY-PRJ-DEFAULT',
        when: !projectId
      },
      {
        type: 'input',
        name: 'purpose',
        message: 'Session purpose:',
        default: purpose || 'Development session',
        when: !purpose
      },
      {
        type: 'checkbox',
        name: 'roles',
        message: 'Allowed roles:',
        choices: [
          { name: 'reader - View data', value: 'reader', checked: true },
          { name: 'contributor - Edit data', value: 'contributor' },
          { name: 'reviewer - Approve changes', value: 'reviewer' },
          { name: 'admin - Full access', value: 'admin' }
        ],
        when: !options.roles
      },
      {
        type: 'checkbox',
        name: 'scopes',
        message: 'Consent scopes:',
        choices: [
          { name: 'read:self - Read own data', value: 'read:self', checked: true },
          { name: 'read:project - Read project data', value: 'read:project' },
          { name: 'write:self - Write own data', value: 'write:self' },
          { name: 'write:project - Write project data', value: 'write:project' },
          { name: 'expand:cross-project - Access other projects', value: 'expand:cross-project' }
        ],
        when: !options.scopes
      },
      {
        type: 'number',
        name: 'ttlHours',
        message: 'Session TTL (hours):',
        default: 24,
        when: !options.ttl
      }
    ]);

    projectId = projectId || answers.projectId;
    purpose = purpose || answers.purpose;
    roles = options.roles || answers.roles || roles;
    scopes = options.scopes || answers.scopes || scopes;
    ttlHours = options.ttl || answers.ttlHours || ttlHours;
  }

  // Generate session ChittyID
  const sessionChittyId = `CHITTY-SES-${crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase()}`;

  // Calculate expiration
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  // Build genes
  const genes: Gene[] = [
    {
      locus_id: 'L1',
      tag: 'session_start',
      allele: {
        session_chitty_id: sessionChittyId,
        parent_chitty_id: options.parent || chittyId,
        project_id: projectId,
        purpose: purpose,
        initiated_by: 'person',
        expires_at: expiresAt
      } as SessionStartAllele,
      allele_type: 'json',
      confidence: 1.0,
      mutable: false
    },
    {
      locus_id: 'L2',
      tag: 'allowed_roles',
      allele: { roles } as AllowedRolesAllele,
      allele_type: 'json',
      confidence: 1.0,
      mutable: false
    },
    {
      locus_id: 'L3',
      tag: 'consent_scope',
      allele: {
        scopes,
        grantor: chittyId,
        granted_at: createdAt
      } as ConsentScopeAllele,
      allele_type: 'json',
      confidence: 1.0,
      mutable: false
    }
  ];

  // Create strand (without hash first)
  const strandWithoutHash = {
    dna_id: generateDnaId(),
    strand_type: 'session' as const,
    version: '1.0',
    created_at: createdAt,
    created_by: chittyId,
    parent_ids: options.parent ? [options.parent] : undefined,
    genes
  };

  // Compute hash
  const strand: DNAStrand = {
    ...strandWithoutHash,
    strand_hash: computeStrandHash(strandWithoutHash)
  };

  // Save to local file
  const strandFile = path.join(SESSION_DNA_DIR, `${strand.dna_id}.json`);
  await fs.writeJson(strandFile, strand, { spaces: 2 });

  console.log('Created session DNA strand:\n');
  console.log(`  DNA ID:      ${strand.dna_id}`);
  console.log(`  Session ID:  ${sessionChittyId}`);
  console.log(`  Project:     ${projectId}`);
  console.log(`  Purpose:     ${purpose}`);
  console.log(`  Roles:       ${roles.join(', ')}`);
  console.log(`  Scopes:      ${scopes.join(', ')}`);
  console.log(`  Expires:     ${new Date(expiresAt).toLocaleString()}`);
  console.log(`  Hash:        ${strand.strand_hash.substring(0, 20)}...`);
  console.log(`\n  Saved to: ${strandFile}\n`);

  console.log('Usage:');
  console.log(`  Export header: X-Session-DNA: ${strand.dna_id}`);
  console.log(`  Validate:      can dna session validate ${strand.dna_id}`);
  console.log(`  Inspect:       can dna session inspect ${strand.dna_id}`);
  console.log('');
}

/**
 * Validate a session DNA strand
 */
export async function sessionValidateCommand(dnaId: string): Promise<void> {
  await ensureSessionDnaDir();

  console.log('\n🔍 Validating Session DNA Strand\n');

  const strandFile = path.join(SESSION_DNA_DIR, `${dnaId}.json`);

  if (!await fs.pathExists(strandFile)) {
    console.error(`Strand not found: ${dnaId}`);
    console.error(`Expected file: ${strandFile}\n`);
    process.exit(1);
  }

  const strand: DNAStrand = await fs.readJson(strandFile);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Verify strand type
  if (strand.strand_type !== 'session') {
    errors.push(`Invalid strand type: ${strand.strand_type} (expected: session)`);
  }

  // Verify required genes
  const sessionStart = strand.genes.find(g => g.tag === 'session_start');
  const allowedRoles = strand.genes.find(g => g.tag === 'allowed_roles');
  const consentScope = strand.genes.find(g => g.tag === 'consent_scope');

  if (!sessionStart) {
    errors.push('Missing required gene: session_start (L1)');
  }
  if (!allowedRoles) {
    errors.push('Missing required gene: allowed_roles (L2)');
  }
  if (!consentScope) {
    errors.push('Missing required gene: consent_scope (L3)');
  }

  // Check expiration
  if (sessionStart) {
    const startAllele = sessionStart.allele as SessionStartAllele;
    const expiresAt = new Date(startAllele.expires_at);

    if (expiresAt < new Date()) {
      errors.push(`Session expired at: ${expiresAt.toLocaleString()}`);
    } else {
      const hoursRemaining = Math.round((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
      if (hoursRemaining < 1) {
        warnings.push(`Session expires in less than 1 hour`);
      }
    }
  }

  // Verify hash
  const computedHash = computeStrandHash({
    dna_id: strand.dna_id,
    strand_type: strand.strand_type,
    version: strand.version,
    created_at: strand.created_at,
    created_by: strand.created_by,
    parent_ids: strand.parent_ids,
    genes: strand.genes
  });

  if (computedHash !== strand.strand_hash) {
    errors.push(`Hash mismatch: computed ${computedHash.substring(0, 20)}... vs stored ${strand.strand_hash.substring(0, 20)}...`);
  }

  // Check for signatures
  const signedGenes = strand.genes.filter(g => g.provenance?.signed_by);
  if (signedGenes.length === 0) {
    warnings.push('No genes are signed (consider signing for production use)');
  }

  // Output results
  console.log(`DNA ID: ${strand.dna_id}`);
  console.log(`Type:   ${strand.strand_type}`);
  console.log(`Genes:  ${strand.genes.length}`);
  console.log('');

  if (errors.length === 0) {
    console.log('Status: VALID\n');
  } else {
    console.log('Status: INVALID\n');
    console.log('Errors:');
    errors.forEach(e => console.log(`  - ${e}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
    console.log('');
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Inspect a session DNA strand
 */
export async function sessionInspectCommand(dnaId: string, options: {
  json?: boolean;
}): Promise<void> {
  await ensureSessionDnaDir();

  const strandFile = path.join(SESSION_DNA_DIR, `${dnaId}.json`);

  if (!await fs.pathExists(strandFile)) {
    console.error(`\nStrand not found: ${dnaId}`);
    console.error(`Expected file: ${strandFile}\n`);
    process.exit(1);
  }

  const strand: DNAStrand = await fs.readJson(strandFile);

  if (options.json) {
    console.log(JSON.stringify(strand, null, 2));
    return;
  }

  console.log('\n🧬 Session DNA Strand\n');
  console.log(`DNA ID:     ${strand.dna_id}`);
  console.log(`Type:       ${strand.strand_type}`);
  console.log(`Version:    ${strand.version}`);
  console.log(`Created:    ${new Date(strand.created_at).toLocaleString()}`);
  console.log(`Created By: ${strand.created_by}`);
  console.log(`Hash:       ${strand.strand_hash}`);

  if (strand.parent_ids && strand.parent_ids.length > 0) {
    console.log(`Parents:    ${strand.parent_ids.join(', ')}`);
  }

  if (strand.chain_anchor) {
    console.log(`Anchor:     ${strand.chain_anchor.type}:${strand.chain_anchor.ptr}`);
  }

  console.log('\nGenes:');
  strand.genes.forEach(gene => {
    console.log(`\n  [${gene.locus_id}] ${gene.tag}`);

    if (gene.tag === 'session_start') {
      const allele = gene.allele as SessionStartAllele;
      console.log(`      Session ID:   ${allele.session_chitty_id}`);
      console.log(`      Parent ID:    ${allele.parent_chitty_id}`);
      console.log(`      Project:      ${allele.project_id}`);
      console.log(`      Purpose:      ${allele.purpose}`);
      console.log(`      Initiated By: ${allele.initiated_by}`);
      console.log(`      Expires:      ${new Date(allele.expires_at).toLocaleString()}`);
    } else if (gene.tag === 'allowed_roles') {
      const allele = gene.allele as AllowedRolesAllele;
      console.log(`      Roles: ${allele.roles.join(', ')}`);
    } else if (gene.tag === 'consent_scope') {
      const allele = gene.allele as ConsentScopeAllele;
      console.log(`      Scopes:  ${allele.scopes.join(', ')}`);
      console.log(`      Grantor: ${allele.grantor}`);
      console.log(`      Granted: ${new Date(allele.granted_at).toLocaleString()}`);
    } else {
      console.log(`      Allele: ${JSON.stringify(gene.allele)}`);
    }

    if (gene.provenance) {
      console.log(`      Signed by: ${gene.provenance.signed_by}`);
      console.log(`      Signature: ${gene.provenance.sig.substring(0, 20)}...`);
    }
  });

  console.log('');
}

/**
 * End a session DNA strand
 */
export async function sessionEndCommand(dnaId: string, options: {
  reason?: 'completed' | 'cancelled' | 'timeout' | 'revoked' | 'error';
}): Promise<void> {
  await ensureSessionDnaDir();

  console.log('\n🔚 Ending Session DNA Strand\n');

  const strandFile = path.join(SESSION_DNA_DIR, `${dnaId}.json`);

  if (!await fs.pathExists(strandFile)) {
    console.error(`Strand not found: ${dnaId}`);
    console.error(`Expected file: ${strandFile}\n`);
    process.exit(1);
  }

  const strand: DNAStrand = await fs.readJson(strandFile);

  // Check if already ended
  const existingEnd = strand.genes.find(g => g.tag === 'session_end');
  if (existingEnd) {
    console.error('Session already ended.');
    console.error(`End reason: ${(existingEnd.allele as any).exit_reason}`);
    console.error(`Ended at: ${(existingEnd.allele as any).ended_at || 'unknown'}\n`);
    process.exit(1);
  }

  const reason = options.reason || 'completed';
  const endedAt = new Date().toISOString();
  const nextLocus = generateLocusId(strand.genes.length + 1);

  // Add session_end gene
  const endGene: Gene = {
    locus_id: nextLocus,
    tag: 'session_end',
    allele: {
      outputs_hash: 'sha256:' + crypto.createHash('sha256').update(dnaId + endedAt).digest('hex'),
      exit_reason: reason,
      ended_at: endedAt,
      consulted_contexts: [],
      metrics: {
        genes_added: strand.genes.length,
        duration_seconds: Math.round((Date.now() - new Date(strand.created_at).getTime()) / 1000)
      }
    },
    allele_type: 'json',
    confidence: 1.0,
    mutable: false
  };

  strand.genes.push(endGene);

  // Recompute hash
  strand.strand_hash = computeStrandHash({
    dna_id: strand.dna_id,
    strand_type: strand.strand_type,
    version: strand.version,
    created_at: strand.created_at,
    created_by: strand.created_by,
    parent_ids: strand.parent_ids,
    genes: strand.genes
  });

  // Save updated strand
  await fs.writeJson(strandFile, strand, { spaces: 2 });

  console.log(`DNA ID:      ${strand.dna_id}`);
  console.log(`End Reason:  ${reason}`);
  console.log(`Ended At:    ${new Date(endedAt).toLocaleString()}`);
  console.log(`New Hash:    ${strand.strand_hash.substring(0, 20)}...`);
  console.log(`\nSession ended successfully.\n`);
}

/**
 * List session DNA strands
 */
export async function sessionListCommand(options: {
  limit?: number;
  active?: boolean;
}): Promise<void> {
  await ensureSessionDnaDir();

  console.log('\n📋 Session DNA Strands\n');

  const files = await fs.readdir(SESSION_DNA_DIR);
  const strandFiles = files.filter(f => f.startsWith('CHITTY-DNA-') && f.endsWith('.json'));

  if (strandFiles.length === 0) {
    console.log('No session strands found.\n');
    console.log('Create one with: can dna session create\n');
    return;
  }

  const strands: { strand: DNAStrand; file: string; active: boolean }[] = [];

  for (const file of strandFiles) {
    const strand: DNAStrand = await fs.readJson(path.join(SESSION_DNA_DIR, file));
    if (strand.strand_type !== 'session') continue;

    const sessionEnd = strand.genes.find(g => g.tag === 'session_end');
    const sessionStart = strand.genes.find(g => g.tag === 'session_start');
    const expiresAt = sessionStart ? new Date((sessionStart.allele as SessionStartAllele).expires_at) : null;
    const isExpired = expiresAt ? expiresAt < new Date() : false;
    const isActive = !sessionEnd && !isExpired;

    if (options.active !== undefined && options.active !== isActive) continue;

    strands.push({ strand, file, active: isActive });
  }

  // Sort by creation date (newest first)
  strands.sort((a, b) => new Date(b.strand.created_at).getTime() - new Date(a.strand.created_at).getTime());

  const limit = options.limit || 10;
  const display = strands.slice(0, limit);

  display.forEach(({ strand, active }) => {
    const sessionStart = strand.genes.find(g => g.tag === 'session_start');
    const startAllele = sessionStart?.allele as SessionStartAllele | undefined;

    const status = active ? '🟢' : '🔴';
    const sessionId = startAllele?.session_chitty_id || 'unknown';
    const purpose = startAllele?.purpose || 'unknown';
    const created = new Date(strand.created_at).toLocaleString();

    console.log(`${status} ${strand.dna_id}`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   Purpose: ${purpose}`);
    console.log(`   Created: ${created}`);
    console.log('');
  });

  console.log(`Showing ${display.length} of ${strands.length} strands`);
  if (strands.length > limit) {
    console.log(`Use --limit to show more`);
  }
  console.log('');
}

/**
 * Add a gene to an existing session strand
 */
export async function sessionAddGeneCommand(dnaId: string, options: {
  tag: string;
  allele: string;
}): Promise<void> {
  await ensureSessionDnaDir();

  console.log('\n➕ Adding Gene to Session Strand\n');

  const strandFile = path.join(SESSION_DNA_DIR, `${dnaId}.json`);

  if (!await fs.pathExists(strandFile)) {
    console.error(`Strand not found: ${dnaId}`);
    process.exit(1);
  }

  const strand: DNAStrand = await fs.readJson(strandFile);

  // Check if session is already ended
  const sessionEnd = strand.genes.find(g => g.tag === 'session_end');
  if (sessionEnd) {
    console.error('Cannot add genes to ended session.\n');
    process.exit(1);
  }

  // Parse allele JSON
  let allele: unknown;
  try {
    allele = JSON.parse(options.allele);
  } catch {
    console.error('Invalid allele JSON. Please provide valid JSON.\n');
    process.exit(1);
  }

  const nextLocus = generateLocusId(strand.genes.length + 1);

  const newGene: Gene = {
    locus_id: nextLocus,
    tag: options.tag,
    allele,
    allele_type: 'json',
    confidence: 1.0,
    mutable: false
  };

  strand.genes.push(newGene);

  // Recompute hash
  strand.strand_hash = computeStrandHash({
    dna_id: strand.dna_id,
    strand_type: strand.strand_type,
    version: strand.version,
    created_at: strand.created_at,
    created_by: strand.created_by,
    parent_ids: strand.parent_ids,
    genes: strand.genes
  });

  await fs.writeJson(strandFile, strand, { spaces: 2 });

  console.log(`Added gene [${nextLocus}] ${options.tag}`);
  console.log(`New hash: ${strand.strand_hash.substring(0, 20)}...`);
  console.log('');
}
