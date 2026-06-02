# Backend setup: getting escrow deployment running

To deploy escrow contracts from the backend you need to do three things.

---

## 1. Set `DEPLOYER_MNEMONIC` (testnet wallet with TON for gas)

The backend uses a **deployer wallet** to send the StateInit transaction. You need a TON wallet and its 24-word mnemonic.

### Option A: Create a new testnet wallet

1. Install [Tonkeeper](https://tonkeeper.com) or another TON wallet.
2. Create a new wallet and switch it to **testnet** (Tonkeeper: Settings → Developer Settings → Testnet).
3. Get testnet TON from a faucet, e.g.:
   - https://t.me/testgiver_ton_bot  
   - Or search “TON testnet faucet” and send your wallet address.
4. Export the mnemonic (24 words). In Tonkeeper: Settings → Backup → show recovery phrase. **Never share this or use it on mainnet with real funds.**
5. In `backend/.env` set:
   ```env
   DEPLOYER_MNEMONIC=word1 word2 word3 ... word24
   ```

### Option B: Use an existing testnet wallet

If you already have a testnet wallet, export its 24-word mnemonic and set `DEPLOYER_MNEMONIC` in `backend/.env` the same way. Ensure the wallet has enough TON to pay for deployment (e.g. 0.1 TON is plenty).

---

## 2. Set `ARBITER_ADDRESS`

The escrow contract needs an arbiter address. Use any valid TON address (e.g. your own wallet or a dedicated arbiter).

In `backend/.env`:

```env
ARBITER_ADDRESS=UQYourArbiterAddressHere
```

Example (same as commission wallet):

```env
ARBITER_ADDRESS=UQAKFKgE5rjD6c7RfX9hIIpJljj2h5oMwkKgfOrAB_zJiucg
```

Use a single address; it will be used for every new escrow contract.

---

## 3. Place the compiled contract BOC at `CONTRACT_CODE_PATH`

The backend loads the **compiled contract code** from a file. That file must be the **code cell** of the Meus contract (not the full StateInit), in BOC format.

### Step 3a: Export the code BOC from the Smart-contract project

From the **Smart-contract** directory:

```bash
cd Smart-contract
npm install   # if you haven’t already
npm run export-code
```

This creates `Smart-contract/build/Meus.code.boc`.

If `npm run export-code` fails (e.g. module/Node version issues), run the contract tests once so the project is built, then from `Smart-contract` run:

```bash
node -e "
const { compile } = require('@ton/blueprint');
const fs = require('fs');
const path = require('path');
compile('Meus').then(({ code }) => {
  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync(path.join('build', 'Meus.code.boc'), Buffer.from(code.toBoc()));
  console.log('Written build/Meus.code.boc');
}).catch(e => { console.error(e); process.exit(1); });
"
```

Or use `npx tsx scripts/exportCodeBoc.ts` from `Smart-contract` if you have `tsx` installed.

### Step 3b: Copy the BOC into the backend

From the **Meus** repo root:

```bash
mkdir -p backend/contract
cp Smart-contract/build/Meus.code.boc backend/contract/meus.code.boc
```

### Step 3c: Point the backend at the file

In `backend/.env`:

```env
CONTRACT_CODE_PATH=./contract/meus.code.boc
```

If you run the server from a different directory, use an absolute path or a path relative to the process working directory.

---

## Database schema

**Development** (first-time or local iteration):

```bash
npx prisma migrate dev
```

This applies pending migrations in `prisma/migrations/` and regenerates the Prisma client.

**Production** (deployments):

```bash
npx prisma migrate deploy
```

Use `migrate deploy` in production — do not use `db:push`, which skips migration history and is unsafe for shared databases.

For a quick local reset without migration history you can still run `npx prisma db push`, but prefer `migrate dev` so your database matches the committed migrations.

---

## Background job on-chain triggers

The backend’s **deployer wallet** (`DEPLOYER_MNEMONIC`) automatically sends permissionless contract ops when deadlines pass. The `check-deadlines` BullMQ job (every 5 minutes) verifies on-chain status via `get_escrow_data` before sending, logs the transaction, and still enqueues user notifications. The `sync-all` job (every 60 seconds) reconciles DB state from chain.

| Op | Name | When the backend sends it |
|----|------|---------------------------|
| `0x7` | `auto_release` | DB status `SUBMITTED` and `reviewDeadline` has passed; on-chain status still `SUBMITTED` |
| `0x8` | `resolve_timeout` | DB status `DISPUTE` and `reviewDeadline + 30 days` has passed; on-chain status still `DISPUTE` |
| `0x9` | `refund_expired` | DB status `FUNDED` and `deadline` has passed; on-chain status still `FUNDED` |

**Deployer wallet balance:** keep enough TON on the deployer wallet for gas on these automated txs. Recommended minimum: **≥ 1 TON on testnet**, **≥ 2 TON on mainnet**. Failed sends are logged and retried on the next scheduler run; they do not crash the worker.

**User-initiated ops** (always sent from the user’s wallet via TON Connect; the backend only records DB state and syncs from chain):

| Op | Name | Who sends on-chain |
|----|------|--------------------|
| `0x1` | `deposit` | Employer |
| `0x2` | `submit` | Freelancer |
| `0x3` | `approve` | Employer |
| `0x4` | `dispute` | Employer |
| `0x5` | `resolve` | Arbiter |
| `0x6` | `cancel` | Employer |

REST endpoints such as `POST /api/v1/escrows/:id/approve` and `POST /api/v1/disputes/:id/resolve` update PostgreSQL and enqueue notifications; the corresponding on-chain message is sent by the user’s wallet, not the deployer.

---

## Verify

1. Start Postgres and Redis: `docker compose up -d` (from `backend/`).
2. Apply migrations: `npx prisma migrate dev` (development) or `npx prisma migrate deploy` (production).
3. Start the backend: `npm run dev`.
4. Call `POST /api/v1/escrows` with a valid JWT and body, e.g.:
   - `projectName`, `freelancerWallet`, `amount` (nanotons string), `deadlineDays`.

If something fails, check the server logs and that:

- `DEPLOYER_MNEMONIC` is 24 words, testnet, and the wallet has TON.
- `ARBITER_ADDRESS` is a valid TON address.
- `CONTRACT_CODE_PATH` points to the existing `meus.code.boc` file (code-only BOC from the Meus contract).

---

## Telegram Bot Setup

The backend uses [@meus_escrow_bot](https://t.me/meus_escrow_bot) to send HTML notifications and register Mini App deep links.

1. Create a bot via [@BotFather](https://t.me/BotFather) with `/newbot`.
2. Copy the token into `TELEGRAM_BOT_TOKEN` in `backend/.env`.
3. Optionally set `ARBITER_TELEGRAM_ID` to the arbiter’s numeric Telegram user ID for direct dispute alerts when no arbiter `User` row exists in the database.
4. Bot commands (`/start`, `/escrows`, `/help`) are registered automatically when the API starts (`setupBotCommands` in `src/server.ts`).
5. For the Mini App to open from notification buttons, register the web app in BotFather:
   - `/newapp` → select your bot → set the web app URL to your frontend deployment URL.
   - Deep links use `https://t.me/meus_escrow_bot/app?startapp=escrow_{escrowId}`.
6. Users must send `/start` to the bot at least once before it can message them. Remind users during Mini App onboarding.

Apply the notification enum migration if you have not already:

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## Production deployment (Docker Compose)

For a simple single-server deployment, use `docker-compose.prod.yml` from the `backend/` directory. It runs PostgreSQL, Redis, and the API in one stack.

### Prerequisites

1. Copy and fill in environment variables:
   ```bash
   cp .env.example .env
   # Edit .env — use strong JWT_SECRET and production TON settings
   ```
2. Export the contract BOC (from repo root):
   ```bash
   npm run export-boc
   ```
3. Ensure `backend/contract/meus.code.boc` exists before building the image.

### Start the stack

From `backend/`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The backend container runs `prisma migrate deploy` on startup, then starts the API on port 3000 (or `${PORT}` from `.env`).

### Verify

```bash
curl http://localhost:3000/health
```

### Notes

- Postgres and Redis data persist in Docker volumes (`pgdata`, `redisdata`).
- Point `DATABASE_URL` and `REDIS_URL` at the Docker service hostnames when running inside Compose, e.g.:
  ```env
  DATABASE_URL=postgresql://meus:meus_secret@postgres:5432/meus
  REDIS_URL=redis://redis:6379
  ```
- The deployer wallet must hold enough TON for automated on-chain ops (see **Background job on-chain triggers** above).
- This setup is suitable for a single VPS; it is not a full HA or Kubernetes deployment.
