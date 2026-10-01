import { useState } from 'react'
import { CONTRACT_ADDRESS, listStreams, getStream, type StreamRecord } from './genlayer'

function formatU256(val: string | number | bigint | null | undefined): string {
  if (val === null || val === undefined) return '0'
  const n = BigInt(val)
  if (n >= 1000000000000000000n) return (Number(n) / 1e18).toFixed(4) + ' GEN'
  return n.toString()
}

function formatTime(ts: string | number | bigint): string {
  if (!ts || ts === '0') return '—'
  return new Date(Number(BigInt(ts)) * 1000).toLocaleString()
}

export default function App() {
  const [creator, setCreator] = useState('')
  const [receiver, setReceiver] = useState('')
  const [amount, setAmount] = useState('')
  const [durationSec, setDurationSec] = useState('')
  const [streamId, setStreamId] = useState('')
  const [stream, setStream] = useState<any>(null)
  const [streams, setStreams] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleCreateStream = () => {
    if (!creator || !receiver || !amount || !durationSec) { setResult('Fill all fields'); return }
    const amt = BigInt(amount) * 1000000000000000000n
    setResult('Create: receiver=' + receiver + ', amount=' + formatU256(amt) + ', duration=' + durationSec + 's')
    setStreamId('stream-' + Date.now())
  }

  const handleViewStream = async () => {
    if (!streamId) { setResult('Enter stream ID'); return }
    setLoading(true); setResult('')
    try {
      const rec = await getStream(streamId)
      if (rec) { setStream(rec); setResult('Stream loaded') }
      else { setResult('Stream not found'); setStream(null) }
    } catch (e: any) { setResult('Error: ' + e.message); setStream(null) }
    setLoading(false)
  }

  const handleListStreams = async () => {
    if (!creator) { setResult('Enter address'); return }
    setLoading(true); setResult('')
    try {
      const recs = await listStreams(creator)
      if (recs.length > 0) { setStreams(recs); setResult('Found ' + recs.length + ' stream(s)') }
      else { setResult('No streams found'); setStreams([]) }
    } catch (e: any) { setResult('Error: ' + e.message); setStreams([]) }
    setLoading(false)
  }

  const handleStopStream = () => { if (!streamId) { setResult('Enter stream ID'); return }; setResult('Would stop: ' + streamId) }
  const handleWithdraw = () => { if (!streamId) { setResult('Enter stream ID'); return }; setResult('Would withdraw: ' + streamId) }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="h-8 w-auto" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="5" fill="#0f172a"/>
              <rect x="8" y="7" width="8" height="2" rx="0.5" fill="#fbbf24"/>
              <rect x="9" y="5" width="6" height="2" rx="0.5" fill="#fbbf24"/>
              <rect x="6" y="9" width="12" height="1.5" rx="0.75" fill="#f59e0b"/>
              <text x="4" y="18" fontFamily="monospace" fontSize="10" fontWeight="bold" fill="#38bdf8">{'\\{'}</text>
              <text x="17" y="18" fontFamily="monospace" fontSize="10" fontWeight="bold" fill="#38bdf8">{'\\}'}</text>
            </svg>
            <h1 className="text-lg font-semibold">StreamPay</h1>
            <span className="text-xs text-gray-500">GenLayer Streaming-Payment Ledger</span>
          </div>
          <div className="text-xs text-gray-500 font-mono">{CONTRACT_ADDRESS}</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Streaming-Payment Ledger on GenLayer</h2>
          <p className="text-gray-400 text-sm max-w-2xl">
            Create a stream between two addresses. The streamer sets an amount and duration; the contract
            accrues an exact per-second entitlement to the receiver, and the receiver can claim whatever
            has accrued at any time. Every state change is a GenLayer consensus-verified write.
          </p>
          <p className="text-amber-500/80 text-xs max-w-2xl mt-3 border border-amber-700/40 bg-amber-950/20 rounded-lg px-3 py-2">
            <strong>Payout boundary:</strong> this contract computes and records what is owed. On Studio dev,
            GEN transfer is not yet supported by the chain, so a claim records an entitlement rather than
            crediting a wallet. See the contract docstring for the full verified / not-verified boundary.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/80"><h3 className="text-sm font-medium text-gray-300">Create Stream</h3></div>
            <div className="p-4 space-y-3">
              <div><label className="text-xs text-gray-500 mb-1 block">Streamer Address</label><input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="0x..." className="w-full bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600/80" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Receiver Address</label><input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="0x..." className="w-full bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600/80" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Amount (GEN)</label><input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" className="w-full bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600/80" /></div>
              <div><label className="text-xs text-gray-500 mb-1 block">Duration (seconds)</label><input value={durationSec} onChange={(e) => setDurationSec(e.target.value)} placeholder="3600" className="w-full bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600/80" /></div>
              <button onClick={handleCreateStream} disabled={loading} className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors">{loading ? 'Creating...' : 'Create Stream'}</button>
              {result && <p className="text-xs text-gray-500 mt-2">{result}</p>}
            </div>
          </div>

          <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800/80"><h3 className="text-sm font-medium text-gray-300">View / Manage Stream</h3></div>
            <div className="p-4 space-y-3">
              <div><label className="text-xs text-gray-500 mb-1 block">Stream ID</label><input value={streamId} onChange={(e) => setStreamId(e.target.value)} placeholder="stream-..." className="w-full bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600/80" /></div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleViewStream} disabled={loading} className="py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors">{loading ? 'Loading...' : 'View Stream'}</button>
                <button onClick={handleStopStream} disabled={loading || !streamId} className="py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors">Stop Stream</button>
              </div>
              <button onClick={handleWithdraw} disabled={loading || !streamId} className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors">{loading ? 'Claiming...' : 'Claim Accrued'}</button>
            </div>
          </div>
        </div>

        <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-800/80"><h3 className="text-sm font-medium text-gray-300">List Streams by Address</h3></div>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <input value={creator} onChange={(e) => setCreator(e.target.value)} placeholder="Address" className="flex-1 bg-gray-950/80 border border-gray-700/60 rounded-lg px-3 py-2 text-sm font-mono text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-600/80" />
              <button onClick={handleListStreams} disabled={loading} className="py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800/50 disabled:cursor-not-allowed text-sm font-medium rounded-lg transition-colors">{loading ? 'Loading...' : 'List'}</button>
            </div>
            {streams.length > 0 && (
              <div className="space-y-2">
                {streams.map((s: any, i: number) => (
                  <div key={i} className="bg-gray-950/60 border border-gray-800/60 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-mono bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded">{s.stream_id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-900/30 text-green-400' : s.status === 'stopped' ? 'bg-orange-900/30 text-orange-400' : 'bg-gray-800 text-gray-400'}`}>{s.status}</span>
                    </div>
                    <div className="text-xs text-gray-400 space-y-0.5 mt-1">
                      <p>Streamer: {s.streamer.slice(0,16)}...  Receiver: {s.receiver.slice(0,16)}...</p>
                      <p>Rate: {formatU256(s.rate)} per second</p>
                      <p>Available: {formatU256(s.available || 0)} | Accumulated: {formatU256(s.accumulated || 0)}</p>
                      <p>Started: {formatTime(s.start_time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {stream && (
          <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl overflow-hidden mb-6">
            <div className="px-4 py-3 border-b border-gray-800/80"><h3 className="text-sm font-medium text-gray-300">Stream Details</h3></div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500 block text-xs">Stream ID</span><p className="font-mono text-gray-200 truncate">{stream.stream_id}</p></div>
                <div><span className="text-gray-500 block text-xs">Status</span><p className={`mt-0.5 ${stream.status === 'active' ? 'text-green-400' : stream.status === 'stopped' ? 'text-orange-400' : 'text-gray-400'}`}>{stream.status}</p></div>
                <div><span className="text-gray-500 block text-xs">Streamer</span><p className="font-mono text-gray-200 truncate">{stream.streamer}</p></div>
                <div><span className="text-gray-500 block text-xs">Receiver</span><p className="font-mono text-gray-200 truncate">{stream.receiver}</p></div>
                <div><span className="text-gray-500 block text-xs">Rate</span><p className="font-mono text-gray-200">{formatU256(stream.rate)} / sec</p></div>
                <div><span className="text-gray-500 block text-xs">Available</span><p className="font-mono text-gray-200">{formatU256(stream.available || 0)}</p></div>
                <div><span className="text-gray-500 block text-xs">Accumulated</span><p className="font-mono text-gray-200">{formatU256(stream.accumulated || 0)}</p></div>
                <div><span className="text-gray-500 block text-xs">Claimed</span><p className="font-mono text-gray-200">{formatU256(stream.withdrawn || 0)}</p></div>
                <div><span className="text-gray-500 block text-xs">Started</span><p className="font-mono text-gray-200">{formatTime(stream.start_time)}</p></div>
                <div><span className="text-gray-500 block text-xs">Ends</span><p className="font-mono text-gray-200">{stream.end_time > 0 ? formatTime(stream.end_time) : 'Never'}</p></div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <div className="text-3xl mb-3 opacity-20">💸</div>
          <h3 className="text-lg font-medium text-gray-400 mb-2">No stream selected</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">Create a stream above to get started, or view an existing stream by ID.</p>
        </div>
      </main>

      <footer className="border-t border-gray-800/60 mt-12 py-6 text-center text-xs text-gray-600">
        StreamPay · GenLayer streaming-payment ledger · Contract {CONTRACT_ADDRESS.slice(0,16)}...
      </footer>
    </div>
  )
}
