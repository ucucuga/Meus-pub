# Meus

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`

## Security notes

- **Tiered commission** — Rate depends on escrow amount: **3%** up to 100 TON (`<= 100_000_000_000` nanotons), **2%** from 100 TON through 500 TON (`<= 500_000_000_000`), **1%** above 500 TON. Boundaries are inclusive at each tier cap.
- **Commission `> 0` guard** — Commission is only sent when `floor(amount × rate / 10000) > 0`, so tiny amounts do not trigger a sub-minimum transfer to the commission wallet.
- **Empty message body** — After the bounced-message check, an empty body is accepted only in `STATUS_INIT` (deploy). In any other status it throws `0xffff`, so stray internal messages cannot hit opcode parsing with no data.
- **Submit ref guard (exit 204)** — Op `0x2` requires at least one cell ref in the body before loading the work-hash ref; a body with only op + query_id is rejected.
- **Resolve winner byte (exit 503)** — Op `0x5` requires at least 8 bits after op + query_id for the winner flag; truncated bodies are rejected (wrong status still uses exit `502`).
- **Send modes** — Commission uses `PAY_FEES_SEPARATELY | IGNORE_ERRORS` so a failed commission send cannot block the main payout. Final payouts (approve, resolve, auto-release, timeout) and full refunds (cancel, refund_expired) use `CARRY_ALL_BALANCE | DESTROY` to send all remaining balance and destroy the escrow contract.
- **Extra body data** — Ops `0x1`, `0x3`, `0x4`, `0x6`, `0x7`, `0x8`, `0x9` only read op + query_id; any trailing bits or refs are left unread and do not crash the contract.
