import { fromByteArray, toByteArray } from 'base64-js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}
export function decodeUtf8(value: Uint8Array): string {
  return decoder.decode(value);
}

export function bytesToBase64(value: Uint8Array): string {
  return fromByteArray(value);
}

export function base64ToBytes(value: string): Uint8Array {
  return toByteArray(value);
}

export function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
