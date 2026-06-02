/**
 * Export compiled Meus contract code to build/Meus.code.boc
 * Run from Smart-contract: node scripts/exportCodeBoc.mjs
 */
import { compile } from '@ton/blueprint';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { code } = await compile('Meus');
const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'Meus.code.boc');
fs.writeFileSync(outPath, Buffer.from(code.toBoc()));
console.log('Written:', outPath);
console.log('Copy to backend: cp Smart-contract/build/Meus.code.boc backend/contract/meus.code.boc');
