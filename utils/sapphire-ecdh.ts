import { hmac } from "@noble/hashes/hmac";
import { sha512_256 } from "@noble/hashes/sha2";

/**
 * Derive the Deoxys-II key the same way Sapphire does on-chain:
 * key = HMAC-SHA512/256("MRAE_Box_Deoxys-II-256-128", x25519_shared_secret)
 *
 * @param shared Raw 32-byte X25519 shared secret (scalarMult(private, public))
 * @returns 32-byte symmetric key for Deoxys-II
 */
export function deriveSapphireSymmetricKeyFromShared(shared: Uint8Array): Uint8Array {
  // Fixed domain-separation label used by Sapphire for MRAE boxes.
  const label = new TextEncoder().encode("MRAE_Box_Deoxys-II-256-128");
  const out = hmac(sha512_256, label, shared);
  // hmac(sha512_256) outputs 32 bytes; Deoxys-II key size is 32 bytes.
  return out;
}