#!/usr/bin/env node
import { validateConfigFile } from './config-validator.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
ClaudeForge Config Validator

Usage:
  npm run validate-config [config-file]
  
Options:
  --help, -h    Show this help message
  --json        Output results as JSON
  
Examples:
  npm run validate-config                  # Validate default config.json
  npm run validate-config my-config.json   # Validate specific file
  npm run validate-config --json           # Output as JSON
`);
    process.exit(0);
  }

  const jsonOutput = args.includes('--json');
  const configFile = args.find(arg => !arg.startsWith('--')) || 
                     process.env.CLAUDEFORGE_CONFIG || 
                     path.join(__dirname, '..', 'config.json');

  try {
    console.log(`Validating config file: ${configFile}\n`);
    
    const validation = await validateConfigFile(configFile);
    
    if (jsonOutput) {
      console.log(JSON.stringify(validation, null, 2));
    } else {
      if (validation.valid) {
        console.log('✅ Configuration is valid!\n');
      } else {
        console.log('❌ Configuration is invalid!\n');
      }
      
      if (validation.errors.length > 0) {
        console.log('Errors:');
        for (const error of validation.errors) {
          console.log(`  ❌ ${error.field}: ${error.message}`);
        }
        console.log();
      }
      
      if (validation.warnings.length > 0) {
        console.log('Warnings:');
        for (const warning of validation.warnings) {
          console.log(`  ⚠️  ${warning.field}: ${warning.message}`);
        }
        console.log();
      }
      
      if (validation.valid && validation.warnings.length === 0) {
        console.log('No issues found!');
      }
    }
    
    process.exit(validation.valid ? 0 : 1);
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});