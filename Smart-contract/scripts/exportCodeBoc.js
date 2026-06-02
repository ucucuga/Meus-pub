/**
 * Export compiled Meus contract code to build/Meus.code.boc
 * Run from Smart-contract: npm run export-code
 */
const { compile } = require('@ton/blueprint');
const fs = require('fs');
const path = require('path');

compile('Meus')
  .then(({ code }) => {
    const outDir = path.join(__dirname, '..', 'build');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'Meus.code.boc'), Buffer.from(code.toBoc()));
    console.log('Written:', path.join(outDir, 'Meus.code.boc'));
    console.log('Copy to backend: cp Smart-contract/build/Meus.code.boc backend/contract/meus.code.boc');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
