# Contract code BOC

Place the compiled Meus contract **code** cell here as `meus.code.boc` so the backend can deploy escrow contracts.

**How to generate it:**

1. From the **Smart-contract** folder run:
   ```bash
   npm run export-code
   ```
   This creates `Smart-contract/build/Meus.code.boc`.

2. Copy it into this folder. From repo root:
   ```bash
   cp Smart-contract/build/Meus.code.boc backend/contract/meus.code.boc
   ```
