# DMN Rules UI

React + TypeScript (Vite) frontend for `dmn-service`. Rules are written in the **Apache KIE DMN editor**
(`@kie-tools/kie-editors-standalone`, classic editor), published to the backend as DMN XML, and run there
by the Drools DMN runtime.

## Setup

Requirements: Node 18+, `dmn-service` running (default `http://localhost:9090`).

```bash
cp .env.example .env     # first time only; adjust BACKEND_URL if the backend is not on :9090
npm install              # first time, or after package.json changes
```

## Run

```bash
# 1. Check the backend is up (should print {"ruleIds":[...]})
curl http://localhost:9090/rules

# 2. Start the UI (dev server + /api proxy to the backend)
npm run dev              # open http://localhost:5173

# Stop: Ctrl+C in that terminal, or from anywhere:
pkill -f vite

# Restart after pulling code changes: stop, then `npm run dev` again,
# and hard-reload the browser tab (Cmd+Shift+R) so it runs the new code.
```

Production build: `npm run build` (output in `dist/`), preview with `npm run preview`.
Publishing works in current Chrome versions without XSLT; see note 6 below.

The first time you open a rule, the editor takes about 10–30 s to load (it is a ~16 MB bundle).
Unpublished editor changes are lost when the page reloads, so publish before restarting.

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | browser | `/api` | Base URL for API calls. `/api` goes through the Vite dev proxy. |
| `BACKEND_URL` | Vite dev server | `http://localhost:9090` | Where the proxy forwards `/api/*`. |

The backend has no CORS configuration, so the browser cannot call `:9090` directly from `:5173`.
In dev the Vite proxy makes the calls same-origin. For a deployed build, either serve `dist/` behind a
reverse proxy that routes `/api` to the backend, or add CORS to the backend and set `VITE_API_BASE_URL`
to its URL.

## Backend APIs used

| Operation | Request | Response |
|---|---|---|
| Get Schema | `GET /schema` | JSON Schema draft-07 (`title: LoanApplication`) |
| List Rules | `GET /rules` | `{ "ruleIds": string[] }` |
| Get DMN XML | `GET /rules/{ruleId}` | DMN XML body, `X-Rule-Version` header; 404 `{ error }` |
| Add DMN XML | `PUT /rules/{ruleId}`, `Content-Type: application/xml`, raw DMN XML | `{ ruleId, version }`; 400 `{ error: "DMN compile failed", details[] }` |
| Evaluate | `POST /rules/{ruleId}/evaluate`, JSON keyed by Input Data name | `{ ruleId, version, hasErrors, decisions, messages[] }`; 404 `{ error }` |

No authentication. Add DMN XML accepts DMN XML (no DRL anywhere in the flow).

| UI operation | APIs |
|---|---|
| App start / Create Rule | Get Schema → DMN template (in browser) |
| View / Modify Rules | List Rules → Get DMN XML |
| Publish | Add DMN XML |
| Execute Rule | List Rules + Get Schema (form) → Evaluate |

## Architecture

Flow diagrams (UI ↔ backend for create, list/modify, publish, evaluate): [docs/flows.md](docs/flows.md).

```
src/
  types/            schema.ts (JSON Schema subset), rule.ts (API request/response types)
  services/         api.ts (fetch + ApiError), ruleService.ts (the five calls)
  dmn/              schemaToDmn.ts (schema -> DMN 1.2 template), drgElements.ts (publish safety check)
  hooks/            useDmnEditor.ts (editor lifecycle + ruleId -> editor registry)
  components/       DmnEditor, RuleList, RuleForm (new rule name), ExecutionForm (schema-driven form)
  pages/            Home, Editor, Execute
  App.tsx           loads schema once, builds template, switches views, beforeunload warning
```

**Schema → DMN model.** `buildDmnTemplate` turns the schema into one Input Data node named after
`schema.title` (`LoanApplication`, type `tLoanApplication`) plus item definitions:
objects → structures (`tApplicant`, `tAddress`, `tProperty`, `tLocation`, `tOwner`), arrays → `isCollection`,
enums → enumeration constraint, `format: date` → `date`, integer/number → `number`.
In FEEL, rule authors write `LoanApplication.applicant.age`, `sum(LoanApplication.properties.marketValue)`,
`count(flatten(LoanApplication.properties.owners))`, and so on.
Each new rule gets a copy of the template, with the model name and namespace set from its rule ID.

**Editor instances.** `useDmnEditor` calls `DmnEditor.open({ container, initialContent, readOnly: false })`
and keeps a module-level `Map<ruleId, editor>`. Every rule gets its own editor (its own iframe) and its own XML string.
The editor is `close()`d when you leave or switch rules. Publish reads the latest XML with `getContent()`.
After the backend confirms, it calls `markAsSaved()`. The unsaved-changes indicator comes from
`subscribeToContentChanges`. A new rule counts as unsaved until its first successful publish.

**Execute.** The form is generated from the schema. Primitives use typed inputs (text, number, date,
enum/boolean selects), objects are grouped fieldsets, and object lists start with one entry and have
Add/Remove. The request body is keyed by the selected rule's own Input Data node name (read from its saved DMN), e.g. `{ "LoanApplication": <form data> }`, with empty optional fields left out. Rules with more or fewer than one Input Data node are reported instead of run.
An expandable "Request body" shows the exact JSON sent to Evaluate.

**Rule name = rule ID.** The backend has no separate name field. Names are restricted to
`[A-Za-z0-9][A-Za-z0-9_-]*`, and existing IDs are refused at creation so a publish cannot overwrite another rule.

## Compatibility notes and backend gaps

1. **DMN version.** The backend uses KIE **7.74.1**, which reads DMN 1.1–1.4. The newer
   `@kie-tools/dmn-editor(-standalone)` always upgrades models to **DMN 1.5**, which this backend cannot compile.
   This app therefore uses the classic Apache KIE DMN editor, which writes DMN 1.2 (the same format as the Postman sample).
   To move to the new editor, upgrade the backend to a Drools version that supports DMN 1.5 (10.x).
2. **Dates are not converted.** `evaluate` puts the JSON map into the DMN context unchanged, so
   `"2025-03-01"` stays a string. `LoanApplication.applicationDate > date("2024-01-01")` evaluates to `null`.
   Workaround in FEEL: `date(LoanApplication.applicationDate)`. Real fix: convert ISO strings for `date`-typed
   inputs in the backend before evaluating.
3. **No CORS** on the backend (see Setup).
4. **No delete endpoint.** Rules can't be removed from the UI.
5. **Nodes without a diagram shape.** The classic editor drops DRG nodes that have no DMNDI shape, which can
   happen with hand-written XML. Before publishing, the app compares node names with the last saved version
   and asks for confirmation if any are missing. Models created in the editor always have shapes.
6. **Chrome removed XSLT** (`XSLTProcessor`, gone in recent Chrome such as 157). The classic editor used it in
   `getContent()` only to re-indent the XML, so `src/dmn/xsltPolyfill.ts` puts a pass-through stand-in into
   the editor iframe right before reading the XML. The XML content is the same; it just isn't re-indented.
7. **Schema is fixed per backend build**, so rules made before a schema change keep their old item definitions.
