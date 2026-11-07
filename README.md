# FixFlow

**Remote landlords approve maintenance fixes in one tap.** Redhawk Builds 2026.

Small residential investors often own rentals far from home. When a dryer dies or a sink leaks, the owner becomes the dispatcher: calling the tenant, guessing what's wrong, finding a vendor, comparing prices, and keeping records for taxes. FixFlow turns that into: tenant snaps a photo, owner taps Approve.

## How it works
1. **Tenant reports** from their phone with a photo, voice (speech-to-text) or text. No app, no login.
2. **AI triage** (Claude, vision) classifies the issue, sets urgency conservatively, and gives the tenant safe immediate steps.
3. **Three priced options** (e.g. ship a part / handyman / specialist). The AI only picks the issue type; **prices, ETAs and the recommendation are computed in code** from a vendor catalog, with the rule shown to the owner.
4. **Owner approves** one option (or declines). Optional auto-approve limit for small, non-emergency fixes.
5. **Execution:** work order with a not-to-exceed amount, vendor request and tenant update messages, and an **expense ledger** tagged repair (Schedule E line 14) vs. likely capital improvement.

## Owner dashboard
Overview (what needs approval, spend this month, savings, time to decision, maintenance as % of rent), Requests (open and past, by property), Properties (add/edit, per-property tenant link, auto-approve limit), Expenses (estimate vs. actual invoice, repair vs. improvement, CSV export). Protected by an owner PIN.

## Voice (ElevenLabs)
- Tenants report by talking: audio is transcribed with ElevenLabs Scribe v2.
- Owners hear a spoken briefing (ElevenLabs Flash v2.5) for the whole portfolio or one request, and can approve by saying "approve option two". The app shows what it heard and asks for confirmation before acting.

## Run locally
```bash
node server.js          # http://localhost:4300 (tenant)  /owner.html (owner)
npm test
```
Env (server-side only): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `ELEVENLABS_API_KEY`, `OWNER_PIN`; optional `TRIAGE_MODEL`, `ELEVENLABS_VOICE_ID`.
Database: run `supabase/setup.sql` once in the Supabase SQL editor.
Without an API key, triage falls back to a keyword classifier. Without Supabase, data is stored in a local file.

## Honest limitations
- Vendors and prices are a **sample catalog** with fictional names; prices are illustrative, not quotes.
- Dispatch, part orders and messages are **simulated** and labeled as such in the app.
- Tax treatment is a suggestion, not tax advice.
- Owner access is a single shared PIN, not full accounts; the demo database policies are permissive and only the server holds the key.

## Team
Ryan, Cole, Gabe, Michael. Built with Claude.
