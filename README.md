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
submitter and a timestamp are recorded on-chain.

- **Live app**: <https://adebisi1111.github.io/veritag/>
- **Deployed contract**: `0x9973a029E5E0b6AdfA8aa5f56fA4F9bd1C60584f`
- **Network**: GenLayer Studio **dev** (chain `61997`), RPC `https://studio-dev.genlayer.com/api`
- **Source**: [`contracts/veritag.py`](contracts/veritag.py)

---

## Verified working

Deployed and exercised against the live network. A real claim was submitted and
resolved by AI consensus:

| Field | On-chain value |
|---|---|
| `claim_id` | `claim-1` |
| `question` | Does this page mention Python downloads? |
| `url` | https://www.python.org/downloads/ |
| `verdict` | `supported` |
| `excerpt` | `<!doctype html> <html class="no-js" lang="en" …` |
| `submitter` | `0x61fd0047595a30a067f1f21f3b28c4ae8a8e3dc3` |
| `timestamp` | 2026-10-01T15:42:51Z (transaction time) |
| `consensus` | committee reached consensus |

A second claim — *"Does this page list Python 3.13 as a stable release?"* —
against the same URL was **refused with no majority**: the committee split, so
nothing was written. That is the intended behaviour. A verdict only exists when
the validators agree.

## Why this needs GenLayer

VeriTag does not compute anything a normal contract could compute. The task is
"fetch a page you have never seen, and decide whether it says what the claimant
says it says." That needs a live HTTP request and a language model — exactly the
two primitives only an Intelligent Contract can do.

The AI is load-bearing, not decorative:

- the leader's fetch result is **not** trusted by the validators
- each validator repeats the fetch and the judgement independently
- a validator accepts only if it independently reaches the same conclusion
- the commit happens only through `gl.vm.run_nondet`, so a verdict the
  committee cannot agree on is never written

## What it does and does not do

| | |
|---|---|
| **Verified** | evidence page is fetched over HTTP by the contract |
| **Verified** | an LLM judges the excerpt against the claim |
| **Verified** | validators independently repeat both steps |
| **Verified** | verdict, excerpt, submitter and timestamp stored on-chain |
| **Verified** | consensus required — a split committee writes nothing |
| **Not verified** | that the *source page itself* is truthful |
| **Not verified** | that the source page stays unchanged later |

VeriTag answers "does this page support this claim?" — not "is this claim true
in the world". The evidence is named in every record precisely so a reader can
judge the source for themselves.

## Real uses

- **supply chain** — "this dependency version has no known advisories"
- **content attestation** — "this page states X", with a permanent timestamp
- **abuse filtering** — "this message contains a phishing link"
- **off-chain event binding** — "this event happened", corroborated by independent fetches

---

## Contract

| method | kind | returns |
|---|---|---|
| `submit_claim(url, question)` | write | the new claim id |
| `get_verdict(claim_id)` | view | the full record, including `excerpt` and `submitter` |
| `list_claims()` | view | every claim (id, question, url, verdict, timestamp) |
| `total_claims()` | view | count |

`question` must be phrased so that **yes** means the page supports the claim:

> "Does this page list Python 3.13 as a stable release?"

The verdict is `supported` when the committee agrees the excerpt supports the
claim, and `not_supported` when it agrees it does not.

### Runtime notes

Three API details that are easy to get wrong, all confirmed on-chain:

- `gl.nondet.web.request(url, method="GET")` returns a `Response` whose fields
  are `.status`, `.headers` and `.body`. **There is no `.status_code`.**
- The nondeterministic entry point is `gl.vm.run_nondet(leader, validator)`.
- The validator receives a `Result` wrapper, so it must compare against
  `leader_res.calldata`, not the raw value.
- There is no `gl.message.current_timestamp`. Transaction time comes from
  `datetime.now(timezone.utc)`, which GenVM pins so every validator sees the
  same value.

Consensus v0.6 charges fees on deploy and write. Hand-signed EVM transactions
are rejected at admission with `NO_MAJORITY` and zero rounds, because they
carry no fee distribution. Use the CLI so it can build the estimate:

```bash
genlayer network set studio-dev
genlayer deploy --contract contracts/veritag.py --fees '<preset>' --fee-value <wei>
genlayer write <address> submit_claim --args <url> <question> --fees '<preset>' --fee-value <wei>
```

`genlayer estimate-fees <address> <method> --args ...` prints a ready-to-use
preset. Studio dev needs CLI **v0.40 RC** — earlier CLIs do not list the
network at all.

## Frontend

React + Vite + TypeScript + Tailwind CSS v4. Reads go through `gen_call` with
GenVM's own tagged-varint codec in `src/genlayer.ts`. Writes are submitted from
the GenLayer CLI, which builds the v0.6 fee fields the chain requires.

```bash
npm install
npm run dev
npm run build
```

## Project structure

```
veritag/
├── contracts/veritag.py   # Intelligent Contract (Python)
├── src/genlayer.ts        # Studio RPC + GenVM codec
├── src/App.tsx            # React UI
└── vite.config.ts
```

## Licence

MIT