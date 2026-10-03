const fs = require('fs');
const path = require('path');

// Read from stdin
const input = fs.readFileSync(0, 'utf-8');

// Filter out the Co-Authored-By line for Claude
const output = input
  .split('\n')
  .filter(line => !line.toLowerCase().includes('co-authored-by: claude'))
  .join('\n');

// Write to stdout
process.stdout.write(output);
