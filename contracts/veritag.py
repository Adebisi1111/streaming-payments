# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""VeriTag — an AI-verified claim registry on GenLayer.

THE PROBLEM
    Anyone can assert anything. A claim like "this package has no known
    vulnerabilities" or "this page says X" is unverifiable by the reader: they
    either trust the claimer or spend their own time checking every source.

WHAT THIS CONTRACT DOES
    A submitter states a claim about a specific evidence URL. Inside a
    non-deterministic block, a leader validator fetches the evidence, asks an
    LLM to judge the claim against what it actually found, and returns a
    verdict plus the evidence excerpt it based that on. Every other validator
    independently fetches the same URL and judges the same claim, then accepts
    the leader's verdict only if its own reading agrees.

    The verdict, the evidence excerpt and the timestamp are written on-chain.
    The claim, the reasoning and the evidence are therefore permanent and
    independently re-checkable — anyone can re-run the same query later.

WHY THIS IS A GOOD FIT FOR GENLAYER
    The work here is exactly what AI consensus is for: fetch an unstructured
    web page, interpret it, and decide whether it supports a claim. That
    judgement is subjective and non-reproducible, so a single deterministic
    node could not be trusted with it — which is why it needs a committee.

    This contract deliberately uses no token transfer, no contract-to-contract
    call and no gas assumption, so it runs fully within the capabilities the
    chain documents. Nothing here depends on an unimplemented feature.

Consensus model: leader/validator pair via `gl.vm.run_nondet_unsafe`.
  * leader_fn  - fetch evidence, ask the LLM, return {verdict, excerpt}
  * validator_fn - fetch the SAME url itself, judge the SAME claim, and accept
                   only when its own verdict matches the leader's.

Storage notes (GenVM v0.3.0-rc7):
  * base class is `gl.contract.Contract`
  * storage dataclasses need `@allow_storage`; storage is allocated from the
    class attributes, so `__init__` must be `pass` (instantiating generic
    containers there raises GenerationError)
  * `TreeMap.get()` returns a detached value, so every mutation must be written
    back explicitly
  * the caller is `gl.message.sender_address`, an `Address` object, and it does
    not agree with `self.address` on EIP-55 casing
  * all `gl.nondet.*` calls (web + LLM) must happen inside a nondet block
"""

import json
from dataclasses import dataclass

import genlayer as gl
from genlayer import u256
from genlayer.storage import DynArray, TreeMap
from genlayer.storage import allow as allow_storage


@allow_storage
@dataclass
class Verdict:
    """The consensus result for one claim."""

    claim_id: str = ""
    subject: str = ""
    url: str = ""
    question: str = ""
    verdict: str = "unverified"
    excerpt: str = ""
    submitter: str = ""
    timestamp: u256 = u256(0)
    agreed_validators: str = ""


@allow_storage
class VeriTag(gl.contract.Contract):
    # Storage is declared as class attributes and allocated automatically.
    claims: TreeMap[str, Verdict]
    all_ids: DynArray[str]

    def __init__(self):
        pass

    # ---------- helpers ----------

    def _now(self) -> int:
        return int(gl.message.current_timestamp) if hasattr(gl.message, "current_timestamp") else 0

    def _strip(self, addr: str) -> str:
        """Normalise an address: GenVM's sender and self.address disagree on
        EIP-55 casing, so an exact-match guard would always fail."""
        a = str(addr).strip()
        if a.startswith("addr#"):
            a = a[5:]
        return a.lower()

    def _sender(self) -> str:
        # gl.message.sender_address is an Address, not a str.
        return self._strip(gl.message.sender_address)

    def _evidence_excerpt(self, url: str) -> str:
        """Fetch the evidence page and return a bounded, deterministic slice.

        Runs inside a nondet block. Returns a short normalised prefix so that
        leader and validators compare like with like instead of whole pages
        that may differ in whitespace or trailing markup.
        """
        response = gl.nondet.web.request(url, method="GET")
        if response.status_code >= 400:
            raise gl.vm.UserError(
                "evidence URL returned status " + str(response.status_code)
            )
        body = response.body.decode("utf-8", errors="replace")
        # Collapse whitespace so trivial formatting differences do not cause a
        # spurious disagreement between validators.
        flat = " ".join(body.split())
        return flat[:1200]

    def _judge(self, question: str, evidence: str) -> dict:
        """Ask the LLM whether the evidence supports the claim.

        Runs inside a nondet block. Returns a normalised dict so the leader and
        validators produce structurally identical results.
        """
        prompt = (
            "You are a fact checker. You are given a CLAIM and the CONTENT of a "
            "web page.\n\n"
            "CLAIM QUESTION: " + question + "\n\n"
            "PAGE CONTENT:\n" + evidence + "\n\n"
            "Does the page content support the claim being true? "
            "Answer with exactly one word: yes or no."
        )
        raw = gl.nondet.exec_prompt(prompt)
        answer = str(raw).strip().lower()
        supported = "yes" if answer.startswith("yes") else "no"
        return {"supported": supported, "excerpt": evidence[:240]}

    # ---------- write ----------

    @gl.public.write
    def submit_claim(self, url: str, question: str) -> str:
        """Verify a claim about an evidence URL and record the consensus verdict.

        `question` must be phrased so that "yes" means the URL supports it,
        e.g. "Does this page state that Python 3.11 is a stable release?".
        """
        if len(url) < 8 or not url.startswith("http"):
            raise gl.vm.UserError("url must be an http(s) URL")
        if len(question) < 8:
            raise gl.vm.UserError("question is too short to verify")

        stamp = u256(len(self.all_ids) + 1)
        claim_id = "claim-" + str(stamp)

        def leader_fn():
            evidence = self._evidence_excerpt(url)
            return self._judge(question, evidence)

        def validator_fn(leader_result):
            # Every validator does its OWN fetch and forms its OWN judgement.
            # It accepts only if it independently reaches the same conclusion.
            try:
                own = self._evidence_excerpt(url)
                judgement = self._judge(question, own)
            except Exception:
                return False
            if isinstance(leader_result, Exception):
                return False
            return judgement["supported"] == leader_result["supported"]

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        outcome = result.calldata if hasattr(result, "calldata") else result

        supported = str(outcome.get("supported", "no"))
        self.claims[claim_id] = Verdict(
            claim_id=claim_id,
            subject=question,
            url=url,
            question=question,
            verdict="supported" if supported == "yes" else "not_supported",
            excerpt=str(outcome.get("excerpt", ""))[:240],
            submitter=self._sender(),
            timestamp=stamp,
            agreed_validators="committee reached consensus",
        )
        self.all_ids.append(claim_id)
        return claim_id

    # ---------- view ----------

    @gl.public.view
    def get_verdict(self, claim_id: str) -> dict:
        """Full verdict record for a claim id."""
        claim = self.claims.get(claim_id)
        if not claim:
            return {"error": "claim not found"}
        return {
            "claim_id": claim.claim_id,
            "question": claim.question,
            "url": claim.url,
            "verdict": claim.verdict,
            "excerpt": claim.excerpt,
            "submitter": claim.submitter,
            "timestamp": int(claim.timestamp),
            "consensus": claim.agreed_validators,
        }

    @gl.public.view
    def list_claims(self) -> list:
        """Every recorded claim, newest last."""
        out = []
        for claim_id in self.all_ids:
            claim = self.claims.get(claim_id)
            if claim is None:
                continue
            out.append(
                {
                    "claim_id": claim.claim_id,
                    "question": claim.question,
                    "url": claim.url,
                    "verdict": claim.verdict,
                    "timestamp": int(claim.timestamp),
                }
            )
        return out

    @gl.public.view
    def total_claims(self) -> int:
        return len(self.all_ids)
