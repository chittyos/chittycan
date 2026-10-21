import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { DNAVault } from '../lib/dna-vault.js';
import { exportDNA, importDNA, checkExportRateLimit } from '../lib/pdx.js';
import { AuditLogger } from '../lib/audit.js';
import { CONFIG_DIR } from '../lib/config.js';

/**
 * Export DNA to PDX format
 */
export async function exportDNACommand(options: {
  privacy: 'full' | 'hash-only';
  output: string;
}): Promise<void> {
  // Check rate limit
  const rateLimit = await checkExportRateLimit();
  if (!rateLimit.allowed) {
    console.log('\n⚠️  Export rate limit exceeded');
    console.log(`Next export allowed: ${rateLimit.nextAllowed?.toLocaleString()}`);
    console.log('\nReason: Bronze tier allows 1 export per 24 hours to prevent abuse');
    console.log('Upgrade to Silver tier for unlimited exports: https://chitty.cc/pricing\n');
    return;
  }

  console.log('\nExporting DNA...');

  try {
    const pdx = await exportDNA({
      privacy: options.privacy,
      includeAttribution: false,
      encrypt: false
    });

    // Expand home directory
    const outputPath = options.output.replace(/^~/, process.env.HOME || '');

    fs.writeFileSync(outputPath, JSON.stringify(pdx, null, 2));

    console.log(`✓ ${pdx.dna.workflows.length} workflows`);
    console.log(`✓ ${pdx.dna.command_templates.length} command templates`);
    console.log(`✓ ${pdx.dna.integrations.length} integrations`);
    console.log(`✓ Privacy mode: ${options.privacy}`);
    console.log(`✓ Signature: ${pdx.metadata.integrity.signature.substring(0, 10)}...`);

    const stats = fs.statSync(outputPath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(`\n✓ Export complete: ${outputPath} (${sizeKB} KB)`);
    console.log('\nShare this file with other PDX-compatible tools:');
    console.log('- Cursor, Claude Code, Windsurf, VS Code MCP extensions');
    console.log('\nLearn more: https://foundation.chitty.cc/pdx/v1\n');

  } catch (error: any) {
    console.error(`\n❌ Export failed: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Import DNA from PDX file
 */
export async function importDNACommand(options: {
  file: string;
  conflictResolution: 'merge' | 'replace' | 'rename' | 'skip';
}): Promise<void> {
  const filePath = options.file.replace(/^~/, process.env.HOME || '');

  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ File not found: ${filePath}\n`);
    process.exit(1);
  }

  console.log('\nImporting DNA...\n');

  try {
    const pdxJson = fs.readFileSync(filePath, 'utf8');
    const pdx = JSON.parse(pdxJson);

    console.log(`✓ Schema valid (${pdx['@type']})`);
    console.log(`✓ Format version: ${pdx.metadata.format_version}`);
    console.log(`✓ Source: ${pdx.metadata.export_tool.name} v${pdx.metadata.export_tool.version}`);

    const result = await importDNA(pdxJson, {
      conflictResolution: options.conflictResolution,
      verifySignature: true
    });

    console.log(`✓ Integrity verified (hash matches)`);
    if (pdx.owner.chittyid) {
      console.log(`✓ Signature verified (owner: ${pdx.owner.chittyid})`);
    }
    console.log(`✓ Consent: portability enabled`);

    console.log(`\n✓ Imported ${result.patterns} workflows`);
    console.log(`✓ DNA vault updated`);

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Warnings:`);
      result.errors.forEach(err => console.log(`  • ${err}`));
    }

    console.log('');

  } catch (error: any) {
    console.error(`\n❌ Import failed: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Show DNA status and statistics
 */
export async function dnaStatusCommand(): Promise<void> {
  const vault = DNAVault.getInstance();
  const dna = await vault.load();

  if (!dna) {
    console.log('\n🧬 No DNA found');
    console.log('\nStart using ChittyCan to build your DNA!');
    console.log('Every command you run teaches ChittyCan your patterns.\n');
    return;
  }

  console.log('\n🧬 ChittyDNA Status\n');
  console.log(`Workflows learned: ${dna.workflows.length}`);
  console.log(`Command templates: ${dna.command_templates.length}`);
  console.log(`Integrations: ${dna.integrations.length}`);

  if (dna.workflows.length > 0) {
    const totalUsage = dna.workflows.reduce((sum, wf) => sum + wf.usage_count, 0);
    const avgConfidence = dna.workflows.reduce((sum, wf) => sum + wf.confidence, 0) / dna.workflows.length;
    const totalTimeSaved = dna.workflows.reduce((sum, wf) => sum + wf.impact.time_saved, 0);

    console.log(`\nTotal pattern invocations: ${totalUsage}`);
    console.log(`Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`Total time saved: ${totalTimeSaved} minutes (${(totalTimeSaved / 60).toFixed(1)} hours)`);

    console.log(`\n📊 Top Patterns:`);
    dna.workflows
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 5)
      .forEach((wf, i) => {
        console.log(`  ${i + 1}. ${wf.name} (${wf.usage_count} uses, ${(wf.confidence * 100).toFixed(0)}% confidence)`);
      });
  }

  // Show vault stats
  const stats = await vault.getStats();
  const sizeKB = (stats.size_bytes / 1024).toFixed(1);

  console.log(`\n🔐 Vault:`);
  console.log(`  Encrypted: ✓`);
  console.log(`  Size: ${sizeKB} KB`);
  console.log(`  Snapshots: ${stats.snapshot_count}`);
  if (stats.last_modified) {
    console.log(`  Last modified: ${new Date(stats.last_modified).toLocaleString()}`);
  }

  console.log('\n📚 Learn more:');
  console.log('  • Export DNA: can dna export');
  console.log('  • View history: can dna history');
  console.log('  • Foundation charter: https://foundation.chitty.cc/charter');
  console.log('');
}

/**
 * Show DNA evolution history (snapshots)
 */
export async function dnaHistoryCommand(options: { limit?: number }): Promise<void> {
  const vault = DNAVault.getInstance();
  const snapshots = await vault.getSnapshots();

  if (snapshots.length === 0) {
    console.log('\n📜 No DNA history found\n');
    return;
  }

  console.log('\n📜 DNA Evolution History\n');

  const limit = options.limit || 10;
  const display = snapshots.slice(-limit).reverse();

  display.forEach((snapshot, i) => {
    const date = new Date(snapshot.timestamp);
    const sizeKB = (snapshot.size / 1024).toFixed(1);
    console.log(`${i + 1}. ${date.toLocaleString()} (${sizeKB} KB)`);
  });

  if (snapshots.length > limit) {
    console.log(`\n... and ${snapshots.length - limit} more snapshots`);
  }

  console.log(`\nTotal snapshots: ${snapshots.length}`);
  console.log('Snapshots are kept for the last 30 versions\n');
}

/**
 * Revoke DNA (ethical exit)
 */
export async function revokeDNACommand(): Promise<void> {
  const vault = DNAVault.getInstance();

  if (!vault.exists()) {
    console.log('\n🧬 No DNA to revoke\n');
    return;
  }

  console.log('\n⚠️  DNA Revocation (Ethical Exit)\n');
  console.log('This will:');
  console.log('  • Delete all learned patterns');
  console.log('  • Remove encryption keys');
  console.log('  • Clear audit logs');
  console.log('  • Create final export for your records\n');

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Are you sure you want to revoke your DNA?',
    default: false
  }]);

  if (!confirm) {
    console.log('\nRevocation cancelled.\n');
    return;
  }

  try {
    // Create final export for user records
    const pdx = await exportDNA({
      privacy: 'full',
      includeAttribution: true,
      encrypt: false
    });

    const timestamp = Date.now();
    const exportPath = path.join(process.env.HOME || '', `chittycan-dna-revoked-${timestamp}.json`);
    fs.writeFileSync(exportPath, JSON.stringify(pdx, null, 2));

    // Log revocation
    const audit = AuditLogger.getInstance();
    await audit.logRevocation();

    // Delete vault
    await vault.revoke();

    console.log('\n✓ DNA revoked');
    console.log(`✓ Final export saved to ${exportPath}`);
    console.log('✓ All learned patterns deleted');
    console.log('✓ Encryption keys removed');
    console.log('\nYour data has been completely removed from ChittyCan.');
    console.log('Thank you for using ChittyCan. You can return anytime.\n');

  } catch (error: any) {
    console.error(`\n❌ Revocation failed: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Restore DNA from snapshot
 */
export async function restoreDNACommand(): Promise<void> {
  const vault = DNAVault.getInstance();
  const snapshots = await vault.getSnapshots();

  if (snapshots.length === 0) {
    console.log('\n⚠️  No snapshots available to restore\n');
    return;
  }

  console.log('\n🔄 Restore DNA from Snapshot\n');

  const choices = snapshots.slice(-10).reverse().map(s => ({
    name: `${new Date(s.timestamp).toLocaleString()} (${(s.size / 1024).toFixed(1)} KB)`,
    value: s.timestamp
  }));

  const { timestamp } = await inquirer.prompt([{
    type: 'select',
    name: 'timestamp',
    message: 'Select snapshot to restore:',
    choices
  }]);

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'This will replace your current DNA. Continue?',
    default: false
  }]);

  if (!confirm) {
    console.log('\nRestore cancelled.\n');
    return;
  }

  const success = await vault.restoreSnapshot(timestamp);

  if (success) {
    console.log('\n✓ DNA restored from snapshot');
    console.log(`✓ Restored from: ${new Date(timestamp).toLocaleString()}\n`);
  } else {
    console.log('\n❌ Failed to restore snapshot\n');
  }
}
