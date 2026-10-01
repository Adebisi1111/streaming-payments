# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""StreamPay — streaming payments Intelligent Contract (GenLayer Studio).

A streamer locks an amount and a duration; tokens accrue to the receiver
continuously until the stream ends or is stopped. The receiver withdraws
whatever has accrued at any time.

Studio runtime notes (GenVM v0.3.0-rc7):
  * base class is `gl.contract.Contract`
  * storage dataclasses need `@allow_storage`, and the contract needs at least
    one storage slot
  * storage is allocated automatically from the class attributes — `__init__`
    must be `pass`, because instantiating generic containers there fails at
    runtime with `GenerationError`
  * `TreeMap[str, list]` is rejected by the schema generator — lists are
    stored as a `DynArray[str]` index
"""

from dataclasses import dataclass
from datetime import datetime, timezone

import genlayer as gl
from genlayer import u256
from genlayer.storage import DynArray, TreeMap
from genlayer.storage import allow as allow_storage


def _now() -> int:
    """Current unix timestamp. Module level so methods can call it directly."""
    return int(datetime.now(timezone.utc).timestamp())


@allow_storage
@dataclass
class StreamState:
    streamer: str = ""
    receiver: str = ""
    rate: u256 = u256(0)
    start_time: u256 = u256(0)
    end_time: u256 = u256(0)
    withdrawn: u256 = u256(0)
    status: str = "active"


@allow_storage
class StreamPay(gl.contract.Contract):
    # Storage is declared as class attributes and allocated automatically by the
    # GenVM. Instantiating generic containers in __init__ (TreeMap[K, V]()) is
    # rejected at runtime with GenerationError, so __init__ must not do it.
    streams: TreeMap[str, StreamState]
    # every stream id, appended in create_stream
    all_ids: DynArray[str]

    def __init__(self):
        pass

    # ---------- helpers ----------

    def _strip(self, addr: str) -> str:
        """Normalise an address for comparison.

        Accepts `addr#0x...` and bare hex, and lower-cases it: GenVM's
        `sender_address` and `self.address` do not agree on EIP-55 checksum
        casing, so an exact-match guard would always fail.
        """
        a = str(addr).strip()
        if a.startswith("addr#"):
            a = a[5:]
        return a.lower()

    def _me(self) -> str:
        return self.address.as_hex

    def _sender(self) -> str:
        """Address that submitted the current transaction.

        `gl.message.sender_address` is an `Address`, not a str — calling
        `.strip()` on it directly raises, so coerce via `str()`.
        """
        return str(gl.message.sender_address)

    def _accumulated(self, stream: StreamState) -> u256:
        if stream.status == "withdrawn":
            return stream.withdrawn
        now_ts = u256(_now())
        if stream.end_time > u256(0):
            end = now_ts if now_ts < stream.end_time else stream.end_time
        else:
            end = now_ts
        elapsed = end - stream.start_time
        if elapsed < u256(0):
            elapsed = u256(0)
        return stream.rate * elapsed

    def _format(self, stream_id: str, stream: StreamState) -> dict:
        acc = self._accumulated(stream)
        return {
            "stream_id": stream_id,
            "streamer": stream.streamer,
            "receiver": stream.receiver,
            "rate": stream.rate,
            "start_time": stream.start_time,
            "end_time": stream.end_time,
            "status": stream.status,
            "withdrawn": stream.withdrawn,
            "accumulated": acc,
            "available": acc - stream.withdrawn,
        }

    # ---------- write ----------

    @gl.public.write
    def create_stream(self, receiver: str, amount: u256, duration_seconds: u256) -> str:
        """Create a new stream. Returns the stream id."""
        rcv = self._strip(receiver)
        if len(rcv) < 40:
            raise Exception("invalid receiver address")
        if amount <= u256(0) or duration_seconds <= u256(0):
            raise Exception("invalid amount or duration")

        now_ts = u256(_now())
        rate = amount // duration_seconds
        stream_id = f"{self._me()}-{rcv}-{now_ts}"

        self.streams[stream_id] = StreamState(
            streamer=self._me(),
            receiver=rcv,
            rate=rate,
            start_time=now_ts,
            end_time=now_ts + duration_seconds,
        )

        self.all_ids.append(stream_id)
        return stream_id

    @gl.public.write
    def stop_stream(self, stream_id: str) -> None:
        """Stop an active stream early. Only the streamer may do this."""
        stream = self.streams.get(stream_id)
        if not stream:
            raise Exception("stream not found")
        if self._strip(stream.streamer) != self._strip(self._sender()):
            raise Exception("only the streamer can stop")
        if stream.status != "active":
            raise Exception("stream already stopped")
        stream.status = "stopped"
        stream.end_time = u256(_now())
        self.streams[stream_id] = stream

    @gl.public.write
    def withdraw(self, stream_id: str) -> u256:
        """Receiver withdraws everything accrued so far."""
        stream = self.streams.get(stream_id)
        if not stream:
            raise Exception("stream not found")
        if self._strip(stream.receiver) != self._strip(self._sender()):
            raise Exception("only the receiver can withdraw")

        accumulated = self._accumulated(stream)
        payable_now = accumulated - stream.withdrawn
        if payable_now <= u256(0):
            return u256(0)

        stream.withdrawn += payable_now
        if stream.status == "active" and stream.end_time > u256(0):
            if u256(_now()) >= stream.end_time:
                stream.status = "withdrawn"
        self.streams[stream_id] = stream
        return payable_now

    # ---------- view ----------

    @gl.public.view
    def get_stream(self, stream_id: str) -> dict:
        """Stream details by full stream id."""
        stream = self.streams.get(stream_id)
        if not stream:
            return {"error": "stream not found"}
        return self._format(stream_id, stream)

    @gl.public.view
    def list_streams(self, address: str) -> list:
        """All streams where `address` is the streamer or the receiver."""
        addr = self._strip(address)
        result = []
        for stream_id in self.all_ids:
            stream = self.streams.get(stream_id)
            if stream is None:
                continue
            if stream.streamer == addr or stream.receiver == addr:
                result.append(self._format(stream_id, stream))
        return result
