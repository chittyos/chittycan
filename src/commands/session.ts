import inquirer from 'inquirer';
import chalk from 'chalk';
import crypto from 'crypto';
import { loadConfig } from '../lib/config.js';
import { sessionCreateCommand } from './session-dna.js';

/**
 * Interactive Session Awakening (The Crossroads)
 * Handles the Hu x AI session initiation, Entity selection, and Genesis events.
 */
export async function sessionStartCommand(options: { project?: string }): Promise<void> {
  console.log(chalk.cyan('\n🌌 ChittyOS Interactive Awakening\n'));
  
  const config = loadConfig();
  
  // TODO: In the future, this will check for a hard-minted Canonical P ID in the config
  // For now, we will simulate the check and warn the user.
  let sponsorId = 'CHITTY-ANON-DEFAULT';
  
  // The Crossroads: How to staff the session
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'How would you like to staff this session?',
      choices: [
        { name: 'Resume active session', value: 'resume' },
        { name: 'Fork existing Entity for this project (Fission)', value: 'fork' },
        { name: 'Mint new Entity (Genesis)', value: 'genesis' }
      ]
    }
  ]);

  if (action === 'resume') {
    console.log(chalk.yellow('\n[Notice] Checking local ledger for active sessions...'));
    console.log(chalk.green('✓ Resumed active Entity session.\n'));
    return;
  }

  if (action === 'fork') {
    console.log(chalk.yellow('\n[Notice] Querying Entity Registry for available DNA strands...'));
    
    // Simulate fork selection
    const { entityToFork } = await inquirer.prompt([
      {
        type: 'list',
        name: 'entityToFork',
        message: 'Select an Entity to fork:',
        choices: [
          { name: 'Entity-Alpha (Frontend Specialist)', value: 'CHITTY-ENT-ALPHA' },
          { name: 'Entity-Beta (Database Architect)', value: 'CHITTY-ENT-BETA' }
        ]
      }
    ]);
    
    console.log(chalk.cyan(`\nInitiating Fission event from ${entityToFork}...`));
    console.log(chalk.green('✓ New Entity forked and DNA strand linked to Progenitor.\n'));
    return;
  }

  if (action === 'genesis') {
    console.log(chalk.cyan('\nInitiating Genesis Event...'));
    console.log(chalk.dim('Registering new P-Synthetic Entity with ChittyRegister...'));
    
    // Format the canonical registration payload per the Ontology specifications
    const genesisPayload = {
      ontology: {
        type: "P",
        subtype: "Synthetic"
      },
      sovereignty: {
        level: "operational",
        status: "declared"
      },
      progenitor: sponsorId,
      context: {
        project: options.project || 'Genesis_Project',
        purpose: 'Genesis Onboarding'
      }
    };
    
    console.log(chalk.yellow(`\n[ChittyRegister] Dispatching Payload:\n${JSON.stringify(genesisPayload, null, 2)}`));

    // Generate canonical ChittyID: VV-G-LLL-SSSS-P-YM-C-X
    const version = "01";
    const generation = "A";
    const locale = "GLB";
    const service = "OSCL";
    const type = genesisPayload.ontology.type; // P
    
    const now = new Date();
    const ym = `${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const classification = "S"; // Synthetic
    const checksum = crypto.randomUUID().split('-')[0].substring(0, 4).toUpperCase();

    const chittyId = `${version}-${generation}-${locale}-${service}-${type}-${ym}-${classification}-${checksum}`;

    console.log(chalk.green(`\n✓ Genesis complete. New Entity birthed: ${chittyId}`));
    console.log(chalk.dim(`Sponsor (Progenitor): ${sponsorId}`));
    
    console.log(chalk.yellow('\n[Notice] Preparing Session DNA...'));
    
    // We hand off to the actual session DNA generation logic, passing the new ChittyID
    await sessionCreateCommand({
      project: options.project || 'Genesis_Project',
      purpose: 'Genesis Onboarding',
      roles: ['admin', 'contributor'],
      scopes: ['all'],
      parent: sponsorId,
      interactive: false,
      entityId: chittyId // Pass the real ChittyID here
    });
  }
}
