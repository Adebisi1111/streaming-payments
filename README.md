# VeriTag — an AI-verified claim registry on GenLayer

Anyone can claim anything. A tweet says a package is safe. A vendor says a
dependency has no known CVEs. A marketplace listing says an item is genuine.
None of those claims carry weight on their own — there is nothing stopping the
claimant from writing whatever is convenient.

VeriTag makes the claim checkable.

A claim is submitted together with an **evidence URL**. A leader validator
fetches that page, extracts a bounded excerpt, and asks an LLM whether the
content actually supports the claim. The other validators repeat the check
independently — each does its own fetch and forms its own judgement — and
consensus only commits when they agree. The verdict, the evidence excerpt, the
submitter and a timestamp are recorded on-chain, so anyone can re-read the
result and re-run the check themselves.

## Why this needs GenLayer

VeriTag does not compute anything a normal contract could compute. The task is
"fetch a page you have never seen, and decide whether it says what the claimant
says it says." That needs a live HTTP request and a language model — exactly the
two primitives that only an Intelligent Contract can do.

The AI is load-bearing, not decorative:

- the leader's fetch result is **not** trusted by the validators
- each validator repeats the fetch and the judgement independently
- a validator accepts only if it independently reaches the same conclusion
- the commit happens only through `gl.vm.run_nondet_unsafe`, so a verdict the
  committee cannot agree on is never written

## What it does and does not do

| | |
|---|---|
| **Verified** | evidence page is fetched over HTTP by the contract |
| **Verified** | an LLM judges the excerpt against the claim |
| **Verified** | validators independently repeat both steps |
| **Verified** | verdict, excerpt, submitter and timestamp are stored on-chain |
| **Verified** | consensus required — a split committee writes nothing |
| **Not verified** | that the *source page itself* is truthful |
| **Not verified** | long-term immutability of the underlying website |

VeriTag answers "does this page support this claim?" — not "is this claim true
in the world". The evidence is named in every record precisely so a reader can
judge the source for themselves.

## Contract

`contracts/veritag.py` — a GenLayer Intelligent Contract in Python.

| method | kind | returns |
|---|---|---|
| `submit_claim(url, question)` | write | the new claim id |
| `get_verdict(claim_id)` | view | the full verdict record |
| `list_claims()` | view | every recorded claim |
| `total_claims()` | view | count |

`question` must be phrased so that **yes** means the page supports the claim:

> "Does this page list Python 3.13 as a stable release?"

The verdict is `supported` when the committee agrees the excerpt supports the
claim, `not_supported` when it agrees it does not.

## Real uses

- **supply chain** — "this dependency version has no known advisories"
- **content attestation** — "this page states X", with a permanent timestamp
- **abuse filtering** — "this message contains a phishing link"
- **off-chain event binding** — "this event happened", corroborated by independent fetches

## Network

Built and verified on **GenLayer Studio Next (dev)**, chain `61997`.

- RPC: `https://studio-dev.genlayer.com/api`
- Studio: `https://studio-next.genlayer.com`
- Runtime: `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`

The contract performs no token transfer and no contract-to-contract call, so
none of the Studio dev limitations around those apply to VeriTag.

## Frontend

React + Vite + TypeScript + Tailwind CSS v4. Reads go through `gen_call` with
GenVM's own tagged-varint codec; writes are handed to Studio, which signs them
as consensus transactions.

```
npm install
npm run dev
npm run build
```

## Project structure

```
streaming-payments/
├── contracts/veritag.py      # Intelligent Contract (Python)
├── src/genlayer.ts           # Studio RPC + GenVM codec
├── src/App.tsx               # React UI
└── vite.config.ts
```

## Licence

MIT