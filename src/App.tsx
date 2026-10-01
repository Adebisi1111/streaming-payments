import { useCallback, useEffect, useState } from 'react'
import {
  CONTRACT_ADDRESS,
  STUDIO_URL,
  getVerdict,
  listClaims,
  totalClaims,
  type VerdictRecord,
} from './genlayer'

// ---------------------------------------------------------------------------
// VeriTag — an AI-verified claim registry on GenLayer
//
// The contract fetches the evidence URL, has an LLM judge whether the page
// actually supports the claim, and records the consensus verdict on-chain.
// Nothing here needs a token transfer or contract-to-contract call.
// ---------------------------------------------------------------------------

type VerdictTone = 'supported' | 'refuted' | 'unverified'

function tone(v: string): VerdictTone {
  const s = (v || '').toLowerCase()
  if (s.includes('support') || s === 'true' || s === 'yes') return 'supported'
  if (s.includes('refut') || s === 'false' || s === 'no') return 'refuted'
  return 'unverified'
}

const TONE_CLASS: Record<VerdictTone, string> = {
  supported: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  refuted: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  unverified: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
}

function fmtTime(ts: bigint): string {
  const n = Number(ts)
  if (!n) return '—'
  return new Date(n * 1000).toISOString().replace('T', ' ').slice(0, 19) + 'Z'
}

const SAMPLE = {
  url: 'https://www.python.org/downloads/',
  question: 'Does this page list Python 3.13 as a stable release?',
}

export default function App() {
  const [claims, setClaims] = useState<VerdictRecord[]>([])
  const [count, setCount] = useState<bigint | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [lookup, setLookup] = useState('')
  const [found, setFound] = useState<VerdictRecord | null>(null)

  const [url, setUrl] = useState(SAMPLE.url)
  const [question, setQuestion] = useState(SAMPLE.question)

  const refresh = useCallback(async () => {
    setLoading(true)
    setStatus('reading the registry…')
    try {
      const [c, n] = await Promise.all([listClaims(), totalClaims()])
      setClaims(c)
      setCount(n)
      setStatus(`read ${c.length} claim(s) from chain`)
    } catch (e) {
      setStatus(`read failed: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleLookup = async () => {
    if (!lookup.trim()) return
    setLoading(true)
    setFound(null)
    setStatus(`looking up ${lookup.trim()}…`)
    try {
      const v = await getVerdict(lookup.trim())
      setFound(v)
      setStatus(v ? 'verdict read from chain' : 'no verdict recorded for that id')
    } catch (e) {
      setStatus(`lookup failed: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const submitHref = `${STUDIO_URL}/contracts?contract=${CONTRACT_ADDRESS}`

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-sm font-bold">
            V
          </div>
          <div>
            <h1 className="font-semibold text-white leading-tight">VeriTag</h1>
            <p className="text-xs text-gray-500 leading-tight">AI-verified claim registry on GenLayer</p>
          </div>
        </div>
        <div className="text-xs text-gray-500 font-mono text-right">
          <div>Studio dev · chain 61997</div>
          <div className="text-gray-600">{CONTRACT_ADDRESS.slice(0, 14)}…</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-white mb-2">Anyone can claim anything.</h2>
          <p className="text-gray-400 leading-relaxed max-w-3xl">
            VeriTag makes the claim checkable. A leader validator fetches the evidence page and asks an LLM
            whether it actually supports the claim. The other validators repeat the check independently and
            consensus only commits when they agree. The verdict, the evidence excerpt and the timestamp are
            recorded on-chain — and anyone can re-check them.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Claims recorded</div>
            <div className="text-3xl font-mono text-white mt-1">{count?.toString() ?? '—'}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 md:col-span-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Status</div>
            <div className="text-sm font-mono text-gray-300 mt-2 break-all">{status || 'idle'}</div>
            <button
              onClick={refresh}
              disabled={loading}
              className="mt-3 px-3 py-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
            >
              {loading ? 'Reading…' : 'Refresh registry'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="font-semibold text-white mb-1">Submit a claim for verification</h3>
          <p className="text-xs text-gray-500 mb-4">
            Phrase the question so that <span className="text-gray-400">yes</span> means the page supports
            the claim.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Evidence URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg font-mono text-sm focus:border-violet-500 focus:outline-none"
                placeholder="https://example.com/page"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Claim question</label>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-sm focus:border-violet-500 focus:outline-none"
                placeholder="Does this page state that …?"
              />
            </div>
            <a
              href={submitHref}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
            >
              Submit in GenLayer Studio →
            </a>
            <p className="text-xs text-gray-600">
              Writes are signed in Studio: VeriTag runs as an Intelligent Contract, so a write is a consensus
              transaction rather than an EVM signature.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <h3 className="font-semibold text-white mb-3">Look up a verdict</h3>
          <div className="flex gap-2">
            <input
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg font-mono text-sm focus:border-violet-500 focus:outline-none"
              placeholder="claim id"
            />
            <button
              onClick={handleLookup}
              disabled={loading || !lookup.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
            >
              {loading ? '…' : 'Verify'}
            </button>
          </div>
          {found && <VerdictCard v={found} />}
        </section>

        <section>
          <h3 className="font-semibold text-white mb-3">Registry</h3>
          {claims.length === 0 ? (
            <p className="text-sm text-gray-500 border border-dashed border-white/10 rounded-xl p-6 text-center">
              {loading ? 'Reading the chain…' : 'No claims recorded yet.'}
            </p>
          ) : (
            <div className="space-y-3">
              {claims.map((c) => (
                <VerdictCard key={c.claim_id} v={c} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function VerdictCard({ v }: { v: VerdictRecord }) {
  const t = tone(v.verdict)
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-md border text-xs font-medium ${TONE_CLASS[t]}`}>{t}</span>
            <span className="font-mono text-xs text-gray-600">{v.claim_id}</span>
          </div>
          {v.question && <p className="mt-2 text-sm text-gray-200">{v.question}</p>}
          {v.url && (
            <a
              href={v.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-violet-400 hover:text-violet-300 break-all"
            >
              {v.url}
            </a>
          )}
        </div>
        <div className="text-xs text-gray-600 font-mono shrink-0">{fmtTime(v.timestamp)}</div>
      </div>
      {v.excerpt && (
        <p className="mt-3 text-xs text-gray-400 bg-black/30 border border-white/5 rounded-lg p-3 leading-relaxed max-h-32 overflow-y-auto">
          {v.excerpt}
        </p>
      )}
      {v.agreed_validators && <p className="mt-2 text-xs text-gray-500">Agreed by {v.agreed_validators}</p>}
    </div>
  )
}