# StreamPay — GenLayer Streaming Payments

A decentralized streaming payments application built on GenLayer. Streamers can create token streams that pay receivers continuously over time — perfect for subscriptions, bounties, or any time-based payment.

## What it does

- **Create Stream**: Streamer sends tokens to a receiver; tokens stream at a constant rate over a set duration
- **Stop Stream**: Streamer can stop an active stream early
- **Withdraw**: Receiver withdraws accumulated tokens at any time
- **List Streams**: View all streams for an address

## How to use

1. Open [https://adebisi1111.github.io/streaming-payments/](https://adebisi1111.github.io/streaming-payments/)
2. Click **Connect Wallet** and approve with GenLayer Studio
3. Fill in receiver address, amount (in GEN), and duration (seconds)
4. Click **Create Stream** — the stream starts immediately
5. Use the stream ID to view, stop, or withdraw

## Contract

- **Address**: `0xE08E5C82DeF279FE3f8A7A1771919cca0eFcC0f8`
- **Source**: `contracts/stream_payments.py`
- **Explorer**: [GenLayer Studio Explorer](https://explorer-studio.genlayer.com/address/0xE08E5C82DeF279FE3f8A7A1771919cca0eFcC0f8)

## Tech stack

- **Contract**: Python via `genlayer_py` (GenLayer Intelligent Contracts)
- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Vite
- **Network**: GenLayer Studio (`https://studio.genlayer.com/api`)

## Project structure

```
streaming-payments/
├── contracts/stream_payments.py   # GenLayer contract (Python)
├── src/App.tsx                     # React frontend
├── src/main.tsx                    # Entry point
├── src/index.css                   # Tailwind import
├── vite.config.ts                  # Vite + Tailwind plugin
├── package.json                   # Dependencies
├── tsconfig.json                   # TypeScript config
└── index.html                      # HTML entry
```

## Local development

```bash
npm install
npm run dev      # Vite dev server on port 5173
npm run build    # Production build to dist/
```

## Contract methods

| Method | Type | Description |
|--------|------|-------------|
| `create_stream(receiver, amount, duration_seconds)` | write | Create a new stream, returns stream ID |
| `stop_stream(stream_id)` | write | Stop an active stream |
| `withdraw(stream_id)` | write | Receiver withdraws accumulated tokens |
| `get_stream(stream_id)` | view | Get stream details |
| `list_streams(address)` | view | List streams for an address |
