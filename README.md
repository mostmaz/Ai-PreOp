# Pre-Op Anesthesia AI Check

This is a lightweight local web app for an AI-assisted pre-operative
anesthesia workflow using Gemini on the backend with a rule-based fallback.

## What it does

1. Collects first-visit patient information:
   - age
   - comorbidities
   - previous anesthesia history
   - drug history
   - examination findings
   - PR, BP, SpO2
2. Sends intake data to a local backend.
3. Uses Gemini to recommend investigations and explain why they were chosen.
4. Accepts returned investigation results.
5. Uses Gemini plus rule-based guardrails to suggest optimization and a provisional ASA classification.

## Files

- `index.html`: app structure
- `styles.css`: UI styling
- `script.js`: browser-side form handling and API calls
- `clinical-engine.js`: deterministic fallback rules and ASA support logic
- `server.js`: local backend and Gemini integration

## How to use

1. Start the local server:

```powershell
node server.js
```

2. Open [http://localhost:3000](http://localhost:3000)

## Gemini configuration

The local server reads `GEMINI_API_KEY` from `.env`.

The key stays on the server side and is not exposed to browser JavaScript.

## Important note

This prototype is a decision-support demo. It is not a replacement for
consultant anesthesiology judgment, formal institutional protocols, or
local pre-operative investigation guidelines.
