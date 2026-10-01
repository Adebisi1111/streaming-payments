# StreamPay — a verifiable streaming-payment ledger on GenLayer

StreamPay is an Intelligent Contract that computes and records **who is owed
what, by whom, and when**, for a time-based payment stream. A streamer opens a
stream against a receiver; the contract accrues an exact per-second entitlement
that the receiver can claim at any time, and the streamer can stop early.

Every state transition is a GenLayer consensus-verified write, so the ledger is
tamper-evident: the entitlement is provable, not merely asserted.

- **Live app**: <https://adebisi1111.github.io/streaming-payments/>
- **Deployed contract**: `0xCfe4C1082CB61195d51Db48b871656FB3b5B4Ae4` on GenLayer Studio dev
- **Source**: [`contracts/stream_payments.py`](contracts/stream_payments.py)

---

## Scope: what is and is not claimed

This project is deliberately scoped to what it can prove. Please read this
section before evaluating it.

| Verified on-chain | Not claimed |
|---|---|
| `create_stream` — creates a stream, derives exact per-second rate | That GEN reaches the receiver's wallet on Studio dev |
| `get_stream` / `list_streams` — read back accrued state | Any off-chain settlement guarantee |
| `stop_stream` — freezes `end_time`, halts accrual at that instant | |
| `withdraw` — claims only accrued, never more; no double-spend | |
| Access control — only receiver claims, only streamer stops | |
| Guards — zero-rate and over-withdrawal are rejected | |

**Why payout is out of scope.** `withdraw` does invoke `emit_transfer`, the
official Intelligent-Contract-to-EOA transfer path. On Studio dev that call
finalises but moves no balance, because the chain itself states in its own UI:

> "The Studio currently does not support token transfers, contract-to-contract
> interactions, or gas consumption."

So payout is a **documented chain-layer boundary**, not a contract bug and not
a contract guarantee. The internal accounting is complete and correct
regardless. `emit_transfer` remains in the code as the intended settlement path
for a chain that supports it.

This project should be described as a **streaming-payment ledger**, not as
"payments that move funds".

---

## The accounting model

For a stream of `amount` wei over `duration` seconds:

```
rate        = amount // duration_seconds        # exact integer division
elapsed     = min(now, end_time) - start_time   # whole seconds
accumulated = rate * elapsed
available   = accumulated - claimed
```

Key properties:

- **Exactness** — the rate is fixed at creation, so accrual never drifts and
  whole-second accounting is exact. Verified: `5e18 // 3600 == 1388888888888888`.
- **No double-spend** — `claimed` is cumulative and `available` is derived, so
  repeated claims return the next slice rather than replaying the same one.
- **Freeze on stop** — `stop_stream` pins `end_time` to the current instant, so
  accrual stops there and cannot be extended by a later call.
- **Zero-rate rejection** — a stream whose `amount // duration` would truncate
  to `0` is rejected rather than silently created as unclaimable.
- **Escrow guard** — a claim larger than the contract's held value is rejected,
  so the ledger can never record an entitlement the contract could not honour.

---

## Contract methods

| Method | Type | Description |
|---|---|---|
| `create_stream(receiver, amount, duration_seconds)` | write | Create a stream; returns the stream ID |
| `stop_stream(stream_id)` | write | Streamer stops a stream early and freezes accrual |
| `withdraw(stream_id)` | write | Receiver claims the accrued portion; returns that amount |
| `fund()` | payable write | Escrow GEN to back future claims |
| `escrowed()` | view | Value currently held by the contract |
| `get_stream(stream_id)` | view | Full stream record |
| `list_streams(address)` | view | Streams where the address is streamer or receiver |

Amounts are denominated in **wei**. The app converts whole-GEN input for you;
calling the contract with `2` means 2 wei.

---

## Tech stack

- **Contract**: Python, GenLayer GenVM (runtime `py-genlayer:5jycge4q…`)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Network**: GenLayer Studio dev — RPC `https://studio-dev.genlayer.com/api`, chain `61997`

The frontend talks to the chain directly over JSON-RPC. `gen_call` carries reads;
`src/genlayer.ts` contains a GenVM calldata/result codec, including exact
`bigint` handling because values such as the per-second rate exceed `2^53`.

---

## Project structure

```
streaming-payments/
├── contracts/stream_payments.py   # Intelligent Contract (Python)
├── src/genlayer.ts                # Studio RPC + GenVM codec
├── src/App.tsx                    # React UI
├── src/main.tsx                   # Entry point
├── src/index.css                  # Tailwind import
├── vite.config.ts                 # Vite + Tailwind plugin
└── package.json
```

## Local development

```bash
npm install
npm run dev      # Vite dev server on port 5173
npm run build    # Production build to dist/
```
