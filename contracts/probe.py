# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""Diagnostic: isolate which nondeterministic primitive fails."""
import genlayer as gl
from genlayer.storage import allow as allow_storage


@allow_storage
class Probe(gl.contract.Contract):
    last: str = ""

    def __init__(self):
        pass

    def _report(self, tag: str, fn) -> str:
        """Run fn() inside a nondet block and record whatever comes back,
        including the error text, so the cause is visible on-chain."""
        def leader_fn():
            try:
                return "ok:" + fn()
            except Exception as e:
                return "err:" + type(e).__name__ + ":" + str(e)[:120]

        def validator_fn(leader_res):
            expected = leader_res.calldata if hasattr(leader_res, "calldata") else leader_res
            try:
                return leader_fn() == expected
            except Exception:
                return False

        res = gl.vm.run_nondet(leader_fn, validator_fn)
        out = res.calldata if hasattr(res, "calldata") else res
        self.last = tag + "->" + str(out)[:200]
        return self.last

    @gl.public.write
    def probe_llm(self, prompt: str) -> str:
        def call():
            return str(gl.nondet.exec_prompt(prompt)).strip().lower()[:40]
        return self._report("llm", call)

    @gl.public.write
    def probe_web(self, url: str) -> str:
        def call():
            r = gl.nondet.web.request(url, method="GET")
            return "attrs=" + ",".join(sorted(a for a in dir(r) if not a.startswith("_")))[:180]
        return self._report("web", call)

    @gl.public.write
    def probe_webget(self, url: str) -> str:
        def call():
            r = gl.nondet.web.get(url)
            return "status=" + str(int(r.status_code)) + " len=" + str(len(r.body))
        return self._report("webget", call)

    @gl.public.write
    def probe_webrender(self, url: str) -> str:
        def call():
            out = gl.nondet.web.render(url, mode="html")
            return "len=" + str(len(str(out)))
        return self._report("render", call)

    @gl.public.write
    def probe_both(self, url: str, question: str) -> str:
        def call():
            r = gl.nondet.web.request(url, method="GET")
            text = " ".join(r.body.decode("utf-8", "replace").split())[:1200]
            raw = gl.nondet.exec_prompt(
                "CLAIM QUESTION: " + question + "\n\nPAGE CONTENT:\n" + text
                + "\n\nDoes the page support the claim? Answer yes or no."
            )
            a = str(raw).strip().lower()
            return "yes" if a.startswith("yes") else "no"
        return self._report("both", call)

    @gl.public.view
    def get_last(self) -> str:
        return self.last