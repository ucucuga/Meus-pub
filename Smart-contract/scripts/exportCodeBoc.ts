import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { compile } from '@ton/blueprint';

async function main() {
  const result = (await compile('Meus')) as unknown;
  const code = typeof result === 'object' && result !== null && 'code' in result
    ? (result as { code: import('@ton/core').Cell }).code
    : (result as import('@ton/core').Cell);
  const boc = code.toBoc();
  const outDir = join(__dirname, '..', 'build');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'Meus.code.boc');
  writeFileSync(outPath, Buffer.from(boc));
  console.log('Written:', outPath);
  console.log('Copy to backend: cp Smart-contract/build/Meus.code.boc backend/contract/meus.code.boc');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
