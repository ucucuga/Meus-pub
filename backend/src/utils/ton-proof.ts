import { createHash } from 'node:crypto';
import { Address, Cell, contractAddress, loadStateInit } from '@ton/core';
import { signVerify } from '@ton/crypto';
import { TonClient } from '@ton/ton';
import { config } from '../config/index.js';

const TON_PROOF_PREFIX = 'ton-proof-item-v2/';
const TON_CONNECT_PREFIX = Buffer.from('ton-connect', 'utf8');
const PAYLOAD_TTL_SEC = 300; // 5 minutes
const PROOF_TIMESTAMP_DRIFT_SEC = 300; // allow 5 min clock drift

export { PAYLOAD_TTL_SEC };

export interface TonConnectProof {
  address: string;
  network: string; // "-239" = mainnet, "-3" = testnet
  proof: {
    timestamp: number;
    domain: {
      lengthBytes: number;
      value: string;
    };
    payload: string;
    signature: string;
    state_init?: string;
  };
}

function buildProofMessage(proof: TonConnectProof): Buffer {
  const addr = Address.parse(proof.address);

  const wcBuf = Buffer.alloc(4);
  wcBuf.writeInt32BE(addr.workChain);

  const domainLenBuf = Buffer.alloc(4);
  domainLenBuf.writeUInt32LE(proof.proof.domain.lengthBytes);

  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64LE(BigInt(proof.proof.timestamp));

  return Buffer.concat([
    Buffer.from(TON_PROOF_PREFIX, 'utf8'),
    wcBuf,
    addr.hash,
    domainLenBuf,
    Buffer.from(proof.proof.domain.value, 'utf8'),
    tsBuf,
    Buffer.from(proof.proof.payload, 'utf8'),
  ]);
}

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/**
 * Build the message that the wallet actually signed:
 *   sha256( 0xffff ++ "ton-connect" ++ sha256(proof_message) )
 */
function buildSignedMessage(proof: TonConnectProof): Buffer {
  const proofMsg = buildProofMessage(proof);
  const innerHash = sha256(proofMsg);
  const outer = Buffer.concat([Buffer.from([0xff, 0xff]), TON_CONNECT_PREFIX, innerHash]);
  return sha256(outer);
}

/**
 * Extract ed25519 public key from a wallet's stateInit cell.
 * Works for standard wallet contracts v3r1, v3r2, v4r1, v4r2.
 * Layout: seqno (32) + subwallet_id/wallet_id (32) + public_key (256)
 */
function extractPubKeyV3V4(data: Cell): Buffer {
  const ds = data.beginParse();
  ds.loadUint(32); // seqno
  ds.loadUint(32); // subwallet_id
  return ds.loadBuffer(32);
}

/**
 * Wallet v5 layout:
 *   is_signature_auth_allowed (1 bit) + seqno (32) + wallet_id (32) + public_key (256)
 */
function extractPubKeyV5(data: Cell): Buffer {
  const ds = data.beginParse();
  ds.loadBit(); // is_signature_auth_allowed
  ds.loadUint(32); // seqno
  ds.loadUint(32); // wallet_id
  return ds.loadBuffer(32);
}

export function extractPublicKeyFromStateInit(
  stateInitBase64: string,
  address: Address,
): Buffer {
  const cell = Cell.fromBase64(stateInitBase64);
  const si = loadStateInit(cell.beginParse());

  const computed = contractAddress(address.workChain, si);
  if (!computed.equals(address)) {
    throw new Error('StateInit address mismatch');
  }

  if (!si.data) {
    throw new Error('StateInit has no data cell');
  }

  // Try v3/v4 layout first, then v5
  try {
    return extractPubKeyV3V4(si.data);
  } catch {
    return extractPubKeyV5(si.data);
  }
}

export async function fetchPublicKeyOnChain(address: Address): Promise<Buffer> {
  const client = new TonClient({
    endpoint: config.TON_ENDPOINT,
    apiKey: config.TON_API_KEY || undefined,
  });

  const result = await client.runMethod(address, 'get_public_key');
  const keyInt = result.stack.readBigNumber();
  return Buffer.from(keyInt.toString(16).padStart(64, '0'), 'hex');
}

export interface VerifyResult {
  address: Address;
  publicKey: Buffer;
}

/**
 * Verify a TON Connect proof.
 * Nonce/payload validation must be done by the caller (via Redis lookup) before calling this.
 */
export async function verifyTonProof(
  proof: TonConnectProof,
  allowedDomains?: string[],
): Promise<VerifyResult> {
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - proof.proof.timestamp) > PROOF_TIMESTAMP_DRIFT_SEC) {
    throw new Error('Proof timestamp expired or too far in the future');
  }

  if (allowedDomains && allowedDomains.length > 0) {
    if (!allowedDomains.includes(proof.proof.domain.value)) {
      throw new Error(`Domain "${proof.proof.domain.value}" not allowed`);
    }
  }

  const expectedNetwork = config.TON_NETWORK === 'mainnet' ? '-239' : '-3';
  if (proof.network !== expectedNetwork) {
    throw new Error(`Wrong network: expected ${expectedNetwork}, got ${proof.network}`);
  }

  const address = Address.parse(proof.address);

  let publicKey: Buffer;
  if (proof.proof.state_init) {
    publicKey = extractPublicKeyFromStateInit(proof.proof.state_init, address);
  } else {
    publicKey = await fetchPublicKeyOnChain(address);
  }

  const msgHash = buildSignedMessage(proof);
  const signature = Buffer.from(proof.proof.signature, 'base64');

  if (signature.length !== 64) {
    throw new Error('Invalid signature length');
  }

  const valid = signVerify(msgHash, signature, publicKey);
  if (!valid) {
    throw new Error('Invalid signature');
  }

  return { address, publicKey };
}
