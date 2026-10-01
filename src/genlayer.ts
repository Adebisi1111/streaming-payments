// GenLayer Studio Next integration.
//
// Studio Next runs the v0.3.0-rc7 GenVM, which is NOT EVM-compatible:
//   * reads go through `gen_call`, not `eth_call`
//   * calldata/results use GenVM's own tagged-varint codec, not ABI encoding
//   * deploys and writes need a signed rollup transaction, so the browser
//     delegates writes to the GenLayer Studio UI at studio-next.genlayer.com
//
// Verified against the live network: contract 0x77ba…9Be7 on Studio Next.

export const RPC_URL = 'https://studio-dev.genlayer.com/api'
export const STUDIO_URL = 'https://studio-next.genlayer.com'
export const CONTRACT_ADDRESS = '0x88668efE0255DE94979595Bda111DeBD1E0DB8Cb'
export const ONE_GEN = 1000000000000000000n

// ---------------------------------------------------------------------------
// GenVM codec
// ---------------------------------------------------------------------------
// varint: base-128, low 7 bits per byte, high bit signals continuation.
// tagged value: varint tag = (count << 3) | kind
//   kind 0 = none, 1/2 = int, 3 = bytes, 4 = string, 5 = array, 6 = dict

function writeVarint(value: number): number[] {
  const out: number[] = []
  let v = value
  do {
    const byte = v & 0x7f
    v >>>= 7
    out.push(v > 0 ? byte | 0x80 : byte)
  } while (v > 0)
  return out
}

const utf8 = new TextEncoder()

/**
 * Dict keys are written as a raw length-prefixed string with no kind tag —
 * only dict *values* go through the tagged encoding.
 */
function encodeKey(key: string): number[] {
  const bytes = utf8.encode(key)
  return [...writeVarint(bytes.length), ...bytes]
}

function encodeValue(value: unknown): number[] {
  if (value === null || value === undefined) return writeVarint(0 << 3 | 0)

  if (typeof value === 'boolean') {
    return writeVarint((0 << 3) | (value ? 2 : 1))
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    const n = typeof value === 'bigint' ? Number(value) : value
    if (n < 0) throw new Error('negative integers are not supported by the codec')
    return writeVarint(n << 3 | 2)
  }

  if (typeof value === 'string') {
    const bytes = utf8.encode(value)
    // string tag: byte length << 3 | 4, followed by the raw utf-8 bytes
    return [...writeVarint((bytes.length << 3) | 4), ...bytes]
  }

  if (Array.isArray(value)) {
    const out = writeVarint((value.length << 3) | 5)
    for (const item of value) out.push(...encodeValue(item))
    return out
  }

  // plain object -> dict, keys sorted by code point like the GenVM codec
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  )
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  const out = writeVarint((entries.length << 3) | 6)
  for (const [k, v] of entries) {
    out.push(...encodeKey(k))
    out.push(...encodeValue(v))
  }
  return out
}

/** Encode `{"": method, "args": [...]}` as calldata hex. */
export function encodeCalldata(method: string, args: unknown[] = []): string {
  const bytes = encodeValue({ '': method, args })
  return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Read a base-128 varint as a BigInt. u256 values exceed Number's safe integer
 * range (2^53), so the tag must stay exact — 32-bit shifts and float division
 * both corrupt large values such as token rates.
 */
function readVarint(bytes: Uint8Array, i: number): [bigint, number] {
  let val = 0n
  let mul = 1n
  for (;;) {
    const byte = bytes[i++]
    val += BigInt(byte & 0x7f) * mul
    if ((byte & 0x80) === 0) return [val, i]
    mul <<= 7n
  }
}

type Decoded = string | number | bigint | boolean | null | Decoded[] | { [k: string]: Decoded }

/** Decode a GenVM codec payload into JS values. */
export function decodePayload(hex: string): Decoded {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  if (!h) return null
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16)

  const decoder = new TextDecoder()
  let i = 0

  const read = (): Decoded => {
    let tag: bigint
    ;[tag, i] = readVarint(bytes, i)
    const kind = Number(tag & 0x07n)
    const countBig = tag >> 3n
    // Lengths and collection sizes are small enough to use as Numbers; the
    // integer *value* may be a full u256 and stays a bigint.
    const count = Number(countBig)

    switch (kind) {
      case 0:
        return null
      case 1:
      case 2:
        return countBig
      case 3: {
        const slice = bytes.slice(i, i + count)
        i += count
        return '0x' + Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join('')
      }
      case 4: {
        // string: `count` is already the byte length — no second length prefix
        const slice = bytes.slice(i, i + count)
        i += count
        return decoder.decode(slice)
      }
      case 5: {
        const arr: Decoded[] = []
        for (let n = 0; n < count; n++) arr.push(read())
        return arr
      }
      case 6: {
        // keys are raw length-prefixed strings (no kind tag)
        const obj: { [k: string]: Decoded } = {}
        for (let n = 0; n < count; n++) {
          let len: bigint
          ;[len, i] = readVarint(bytes, i)
          const keyLen = Number(len)
          const key = decoder.decode(bytes.slice(i, i + keyLen))
          i += keyLen
          obj[key] = read()
        }
        return obj
      }
      default:
        return null
    }
  }

  return read()
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface StreamRecord {
  stream_id: string
  streamer: string
  receiver: string
  /** wei per second — a u256, so it arrives as a bigint */
  rate: bigint
  start_time: bigint
  end_time: bigint
  withdrawn: bigint
  status: string
  /** total that has accrued so far (contract-computed) */
  accumulated: bigint
  /** accumulated - withdrawn (contract-computed) */
  available: bigint
}

/** Call a read method on the deployed contract. */
export async function callRead(
  method: string,
  args: unknown[] = [],
  from = '0x0000000000000000000000000000000000000000',
): Promise<Decoded> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'gen_call',
      params: [
        {
          type: 'read',
          to: CONTRACT_ADDRESS,
          from,
          data: encodeCalldata(method, args),
          transaction_hash_variant: 'latest-final',
        },
      ],
    }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? 'RPC error')
  return decodePayload(json.result)
}

/** Normalise a decoded contract record into a StreamRecord. */
function toRecord(rec: Record<string, Decoded>, fallbackId: string): StreamRecord {
  const num = (v: Decoded | undefined): bigint =>
    typeof v === 'bigint' ? v : typeof v === 'number' ? BigInt(v) : 0n
  return {
    stream_id: String(rec.stream_id ?? fallbackId),
    streamer: String(rec.streamer ?? ''),
    receiver: String(rec.receiver ?? ''),
    rate: num(rec.rate),
    start_time: num(rec.start_time),
    end_time: num(rec.end_time),
    withdrawn: num(rec.withdrawn),
    status: String(rec.status ?? 'unknown'),
    accumulated: num(rec.accumulated),
    available: num(rec.available),
  }
}

export async function listStreams(address: string): Promise<StreamRecord[]> {
  const out = await callRead('list_streams', [address])
  if (!Array.isArray(out)) return []
  return (out as Record<string, Decoded>[]).map((rec) => toRecord(rec, ''))
}

export async function getStream(streamId: string): Promise<StreamRecord | null> {
  const out = await callRead('get_stream', [streamId])
  if (!out || typeof out !== 'object' || Array.isArray(out)) return null
  const rec = out as Record<string, Decoded>
  if (rec.error) return null
  return toRecord(rec, streamId)
}

/** Read the deployed contract's balance (GEN). */
export async function getBalance(address: string): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
  })
  const json = await res.json()
  return BigInt(json.result ?? '0x0')
}