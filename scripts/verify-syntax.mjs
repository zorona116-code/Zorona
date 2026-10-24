import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const skip = new Set(['node_modules', 'dist']);
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|mjs)$/.test(entry.name)) files.push(full);
  }
};
walk('apps');

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed += 1;
    console.error(`Syntax error in ${file}\n${error.stderr?.toString() || error.message}`);
  }
}
if (failed) process.exit(1);
console.log(`Syntax check passed: ${files.length} files.`);
