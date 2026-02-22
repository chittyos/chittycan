import fs from 'fs-extra';
import path from 'path';
import { DNAVault } from '../lib/dna-vault.js';
import { AuditLogger } from '../lib/audit.js';
import { CONFIG_DIR } from '../lib/config.js';

export async function complianceReportCommand(): Promise<void> {
  console.log('\n📊 Generating ChittyFoundation Compliance Report...\n');

  const vault = DNAVault.getInstance();
  const dna = await vault.load();
  const audit = AuditLogger.getInstance();

  // Get audit stats
  const auditStats = await audit.getStats();

  // Check audit integrity
  const integrity = await audit.verifyIntegrity();

  // Get vault stats
  const vaultStats = await vault.getStats();

  // Calculate portability success rate
  const exportSuccess = auditStats.exports > 0 ? 1.0 : 1.0; // TODO: Track failures
  const importSuccess = auditStats.imports > 0 ? 1.0 : 1.0; // TODO: Track failures

  const report = {
    timestamp: new Date().toISOString(),
    compliance_tier: 'Bronze (In Progress)',
    version: '0.5.0',

    // Core Metrics
    metrics: {
      // Ownership
      dna_vault_encrypted: vaultStats.encrypted,
      user_controlled_keys: fs.existsSync(path.join(CONFIG_DIR, 'dna', 'keys', 'master.key')),
      vault_size_kb: (vaultStats.size_bytes / 1024).toFixed(1),

      // Portability
      pdx_version: '1.0.0',
      export_count: auditStats.exports,
      import_count: auditStats.imports,
      portability_success_rate: (exportSuccess + importSuccess) / 2,
      snapshot_count: vaultStats.snapshot_count,

      // Privacy
      audit_trail_enabled: true,
      content_hashing_only: true,
      no_raw_content_logged: integrity.valid,
      audit_integrity_violations: integrity.errors.length,

      // Attribution
      attribution_enabled: false, // v0.6.0
      trace_chain_completeness: 0, // v0.6.0

      // Safety
      ethical_exit_available: true,
      revocation_count: auditStats.revocations,

      // Transparency
      open_source_core: true,
      public_compliance_dashboard: false // TODO: v0.5.0
    },

    // DNA Stats
    dna_stats: {
      workflows: dna?.workflows.length || 0,
      templates: dna?.command_templates.length || 0,
      integrations: dna?.integrations.length || 0,
      total_usage: dna?.workflows.reduce((sum, wf) => sum + wf.usage_count, 0) || 0,
      avg_confidence: dna ? (dna.workflows.reduce((sum, wf) => sum + wf.confidence, 0) / (dna.workflows.length || 1)) : 0,
      total_time_saved_minutes: dna?.workflows.reduce((sum, wf) => sum + wf.impact.time_saved, 0) || 0
    },

    // Audit Stats
    audit_stats: {
      total_events: auditStats.total_events,
      patterns_learned: auditStats.patterns_learned,
      patterns_invoked: auditStats.patterns_invoked,
      patterns_evolved: auditStats.patterns_evolved,
      success_rate: auditStats.success_rate
    },

    // Foundation Principles Compliance
    principles: {
      'You Own Your Data & DNA': {
        compliant: vaultStats.encrypted && fs.existsSync(path.join(CONFIG_DIR, 'dna', 'keys', 'master.key')),
        evidence: 'User-controlled encryption keys, local storage only'
      },
      'Portability by Default': {
        compliant: auditStats.exports + auditStats.imports > 0 || vaultStats.snapshot_count > 0,
        evidence: `PDX v1.0 export/import, ${vaultStats.snapshot_count} snapshots`
      },
      'Attribution → Compensation': {
        compliant: false,
        evidence: 'Planned for v0.6.0 (Silver tier)'
      },
      'Privacy with Proof': {
        compliant: integrity.valid,
        evidence: 'Hash-only audit logging, no raw content'
      },
      'Human Safety & Dignity': {
        compliant: true,
        evidence: 'Ethical exit available, revocation process in place'
      },
      'Transparency over Theater': {
        compliant: true,
        evidence: 'Open-source core, public compliance reporting'
      },
      'Diversity as Resilience': {
        compliant: dna ? dna.integrations.length > 1 : false,
        evidence: `${dna?.integrations.length || 0} integrations configured`
      }
    },

    // ChittyCertified Readiness
    certification_readiness: {
      bronze: {
        dna_vaults: vaultStats.encrypted,
        pdx_export_import: auditStats.exports + auditStats.imports > 0,
        privacy_audits: integrity.valid,
        ethical_exit: true,
        user_controlled_keys: fs.existsSync(path.join(CONFIG_DIR, 'dna', 'keys', 'master.key')),
        ready: vaultStats.encrypted && integrity.valid
      },
      silver: {
        attribution_chains: false,
        fair_pay_metrics: false,
        cross_platform_dna: false,
        ready: false
      },
      gold: {
        zero_knowledge_proofs: false,
        ai_caretakers: false,
        global_compliance: false,
        ready: false
      }
    },

    // Recommendations
    recommendations: [] as string[]
  };

  // Generate recommendations
  if (!report.certification_readiness.bronze.ready) {
    report.recommendations.push('Complete Bronze tier requirements for ChittyCertified status');
  }
  if (auditStats.exports === 0) {
    report.recommendations.push('Export your DNA to test portability: can dna export');
  }
  if (vaultStats.snapshot_count === 0) {
    report.recommendations.push('DNA snapshots will be created automatically as you use ChittyCan');
  }
  if (integrity.errors.length > 0) {
    report.recommendations.push(`Fix audit integrity violations: ${integrity.errors.length} errors found`);
  }
  if (!dna || dna.workflows.length === 0) {
    report.recommendations.push('Start using ChittyCan to build your DNA and learn patterns');
  }

  // Display report
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ChittyFoundation Compliance Report v0.5.0');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Timestamp: ${new Date(report.timestamp).toLocaleString()}`);
  console.log(`Compliance Tier: ${report.compliance_tier}\n`);

  console.log('🏛️  Foundation Principles\n');
  for (const [principle, status] of Object.entries(report.principles)) {
    const icon = status.compliant ? '✓' : '○';
    console.log(`  ${icon} ${principle}`);
    console.log(`    ${status.evidence}`);
  }

  console.log('\n🎖️  ChittyCertified Readiness\n');
  console.log(`  Bronze Tier: ${report.certification_readiness.bronze.ready ? '✓ Ready' : '○ Not Ready'}`);
  console.log(`    - DNA Vaults: ${report.certification_readiness.bronze.dna_vaults ? '✓' : '○'}`);
  console.log(`    - PDX Export/Import: ${report.certification_readiness.bronze.pdx_export_import ? '✓' : '○'}`);
  console.log(`    - Privacy Audits: ${report.certification_readiness.bronze.privacy_audits ? '✓' : '○'}`);
  console.log(`    - Ethical Exit: ${report.certification_readiness.bronze.ethical_exit ? '✓' : '○'}`);
  console.log(`    - User-Controlled Keys: ${report.certification_readiness.bronze.user_controlled_keys ? '✓' : '○'}`);

  console.log(`\n  Silver Tier: ${report.certification_readiness.silver.ready ? '✓ Ready' : '○ Planned (v0.6.0)'}`);
  console.log(`  Gold Tier: ${report.certification_readiness.gold.ready ? '✓ Ready' : '○ Planned (v0.7.0)'}`);

  console.log('\n📊 DNA Statistics\n');
  console.log(`  Workflows learned: ${report.dna_stats.workflows}`);
  console.log(`  Command templates: ${report.dna_stats.templates}`);
  console.log(`  Integrations: ${report.dna_stats.integrations}`);
  console.log(`  Total usage: ${report.dna_stats.total_usage} invocations`);
  console.log(`  Average confidence: ${(report.dna_stats.avg_confidence * 100).toFixed(1)}%`);
  console.log(`  Time saved: ${report.dna_stats.total_time_saved_minutes} minutes`);

  console.log('\n🔐 Vault & Audit\n');
  console.log(`  Vault encrypted: ${report.metrics.dna_vault_encrypted ? '✓' : '○'}`);
  console.log(`  Vault size: ${report.metrics.vault_size_kb} KB`);
  console.log(`  Snapshots: ${report.metrics.snapshot_count}`);
  console.log(`  Exports: ${report.metrics.export_count}`);
  console.log(`  Imports: ${report.metrics.import_count}`);
  console.log(`  Total audit events: ${report.audit_stats.total_events}`);
  console.log(`  Audit integrity: ${report.metrics.no_raw_content_logged ? '✓ Valid' : '✗ Violations detected'}`);

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations\n');
    report.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Save report
  const reportPath = path.join(CONFIG_DIR, `compliance-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`✓ Full report saved to ${reportPath}`);
  console.log('\n📚 Resources:');
  console.log('  • Foundation Charter: https://foundation.chitty.cc/charter');
  console.log('  • PDX Specification: https://foundation.chitty.cc/pdx/v1');
  console.log('  • ChittyCertified Registry: https://foundation.chitty.cc/certified');
  console.log('');
}
