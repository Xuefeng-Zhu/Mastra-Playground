import { access, cp, rm } from 'node:fs/promises';

const source = '.next/static';
const destination = '.next/standalone/.next/static';

try {
  await access(source);
} catch {
  console.error('Missing .next/static. Run `npm run build` before `npm run start`.');
  process.exit(1);
}

await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
