// Real writes to VeriTag.
//
// Why this file exists: the steward was right that "Submit in GenLayer Studio"
// never called the contract — it was an <a href> that navigated away. A frontend
// that only reads state is not a dApp. This module sends an actual consensus
// transaction.
//
// Chain notes (verified against studio-dev, chain 61997):
//  * `studioDevnet` from genlayer-js/chains is the correct chain definition. Do
//    not substitute `studionet` (61999): chain identity, RPC and consensus
//    addresses must move together.
//  * A write is a rollup transaction with a fee policy. It is NOT an EVM
//    eth_sendRawTransaction, so it needs `estimateTransactionFeesForWrite`
//    before `writeContract`, otherwise admission rejects it.
//  * ACCEPTED/FINALIZED does not prove the contract succeeded. Always check
//    `isSuccessful` on the finalized transaction.
//  * The fee distribution is a property of the contract's actual message use,
//    so we probe it once at runtime and cache it rather than hardcoding a
//    number that would silently break the write.

import { createClient, isSuccessful } from 'genlayer-js'
import { studioDevnet } from 'genlayer-js/chains'
import { CONTRACT_ADDRESS } from './genlayer'

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export function hasWallet(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum
}

/**
 * Connect the browser wallet and return the first account.
 * Throws a human-readable message rather than a raw provider error, because
 * "user rejected request" tells the user nothing about what to do next.
 */
export async function connectWallet(): Promise<string> {
  if (!hasWallet()) {
    throw new Error(
      'No browser wallet found. Install MetaMask, or open this page inside the MetaMask app browser.',
    )
  }
  const provider = window.ethereum!
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts?.length) throw new Error('Wallet returned no accounts.')

  await provider.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x' + studioDevnet.id.toString(16) }],
  })

  return accounts[0]
}

// CONTRACT_ADDRESS is a plain `string` constant; the SDK wants the 0x-branded
// literal type. Narrow it once here rather than casting at every call site.
const CONTRACT = CONTRACT_ADDRESS as `0x${string}`

function clientFor(account?: string) {
  return createClient({
    chain: studioDevnet,
    ...(account ? { account: account as `0x${string}` } : {}),
    ...(hasWallet() ? { provider: window.ethereum } : {}),
  })
}

// The fee distribution reflects how much leader/validator work the call causes,
// which is stable for a given contract+method but unknown ahead of time. Probe it
// once per page load and reuse it.
// The distribution shape comes from the SDK's estimate type; infer it rather
// than writing `unknown` and casting later.
type FeeEstimate = Awaited<
  ReturnType<ReturnType<typeof createClient>['estimateTransactionFeesForWrite']>
>
let feeCache: Pick<FeeEstimate, 'distribution' | 'feeValue'> | null = null

export interface SubmitResult {
  /** The consensus transaction hash. */
  hash: string
}

/**
 * Submit a claim and wait for consensus.
 *
 * `submit_claim` enters the AI consensus lifecycle, so this can take tens of
 * seconds: it fetches the evidence URL and runs an LLM judgement on every
 * validator. The caller is expected to show that it is waiting.
 */
export async function submitClaim(
  url: string,
  question: string,
  onStage?: (stage: string) => void,
): Promise<SubmitResult> {
  const account = await connectWallet()
  const client = clientFor(account)

  const call = {
    address: CONTRACT,
    functionName: 'submit_claim',
    args: [url, question],
  }

  onStage?.('estimating fees…')
  if (!feeCache) {
    const est = await client.estimateTransactionFeesForWrite(call)
    feeCache = { distribution: est.distribution, feeValue: est.feeValue }
  }

  onStage?.('submitting to the committee…')
  const hash = await client.writeContract({
    ...call,
    fees: feeCache,
  })

  onStage?.('waiting for consensus…')
  const tx = await client.waitForFinalization({ hash })

  if (!isSuccessful(tx)) {
    const status = (tx as { statusName?: string }).statusName ?? 'unknown'
    const exec = (tx as { txExecutionResultName?: string }).txExecutionResultName ?? ''
    throw new Error(`Consensus did not accept the claim (${status}${exec ? ' / ' + exec : ''}).`)
  }

  return { hash }
}

/** Clear the cached fee policy (used after a contract redeploy). */
export function resetFeeCache() {
  feeCache = null
}
