# Cyan Notepad collaboration server

This service provides authenticated Yjs rooms over WebSocket. It validates every Supabase access token, checks workspace membership, enforces viewer read-only mode, and stores Yjs snapshots in `document_states`.

## Local development

1. Copy `.env.example` to `.env`.
2. Keep `SUPABASE_SERVICE_ROLE_KEY` only in this server environment.
3. Run `npm install` and `npm run dev`.

The desktop app connects to `ws://127.0.0.1:1234` by default. Production deployments must use `wss://`.
