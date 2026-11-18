# UI ↔ Backend flows

How the React UI (`dmn-drool-ui`) and `dmn-service` work together to create, list, edit, publish and evaluate rules.

Rendered PNGs (regenerate after editing a diagram, see below): [components](diagrams/1-components.png) ·
[app start](diagrams/2-app-start.png) · [create → publish](diagrams/3-create-publish.png) ·
[list → modify → publish](diagrams/4-list-modify-publish.png) · [evaluate](diagrams/5-evaluate.png)

## 1. Components

```mermaid
flowchart LR
    subgraph Browser
        UI["React UI<br/>Home / Editor / Execute"]
        ED["Apache KIE DMN editor<br/>(classic, iframe per rule)"]
        UI -- "open() / getContent()<br/>markAsSaved() / close()" --> ED
    end

    VP["Vite dev server<br/>/api proxy"]

    subgraph SVC ["dmn-service :9090"]
        CTRL["REST controllers<br/>/schema, /rules"]
        ENG["DmnEngine<br/>compile + evaluate<br/>(Drools 7.74 DMN runtime)"]
        CACHE[("In-memory cache<br/>compiled rules")]
    end

    DB[("DynamoDB / LocalStack<br/>DmnRules table<br/>DMN XML + version")]

    UI -- "fetch /api/..." --> VP
    VP -- "strips /api" --> CTRL
    CTRL --> ENG
    ENG <--> CACHE
    ENG <--> DB
```

## 2. App start: schema → DMN template

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI as React UI
    participant BE as dmn-service

    U->>UI: Open http://localhost:5173
    UI->>BE: GET /schema
    BE-->>UI: JSON Schema (title LoanApplication)
    UI->>UI: buildDmnTemplate(schema)
    Note over UI: DMN 1.2 template in memory:<br/>Input Data "LoanApplication" (tLoanApplication)<br/>+ item definitions tApplicant, tAddress,<br/>tProperty, tLocation, tOwner
    UI-->>U: Home: Create Rule / View-Modify / Execute
```

## 3. Create rule → publish

Core flow only. Not shown: `subscribeToContentChanges` / `markAsSaved` (they power the unsaved-changes indicator and leave warnings, not publishing).

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI as React UI
    participant ED as KIE DMN editor
    participant BE as dmn-service
    participant DB as DynamoDB

    U->>UI: Create Rule, enter name
    UI->>BE: GET /rules
    BE-->>UI: ruleIds
    alt name already exists
        UI-->>U: Error - open it from View / Modify
    else new name
        UI->>UI: instantiateTemplate(template, ruleId)
        UI->>ED: open(container, template XML, readOnly false)
        ED-->>U: Canvas with LoanApplication input
        U->>ED: Add decisions, tables, FEEL
        U->>UI: Publish
        UI->>ED: getContent()
        ED-->>UI: DMN 1.2 XML
        UI->>BE: PUT /rules/ruleId (application/xml)
        BE->>BE: Compile DMN (validate)
        alt compile error
            BE-->>UI: 400 error + details
            UI-->>U: Publish failed + details (nothing stored)
        else compiles
            BE->>DB: Save XML, version + 1
            BE-->>UI: 200 ruleId, version
            UI-->>U: Published as version N
        end
    end
```

## 4. List → open → modify → publish

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI as React UI
    participant ED as KIE DMN editor
    participant BE as dmn-service
    participant DB as DynamoDB

    U->>UI: View / Modify Rules
    UI->>BE: GET /rules
    BE->>DB: List rule ids
    BE-->>UI: ruleIds (sorted)
    U->>UI: Select rule
    UI->>BE: GET /rules/ruleId
    BE->>DB: Load latest XML
    BE-->>UI: DMN XML + X-Rule-Version header
    UI->>ED: open(container, saved XML)
    U->>ED: Edit model
    U->>UI: Publish
    UI->>ED: getContent()
    ED-->>UI: DMN XML
    UI->>UI: Compare nodes with saved XML
    opt nodes missing (editor dropped them)
        UI-->>U: Confirm before publishing
    end
    UI->>BE: PUT /rules/ruleId
    BE-->>UI: 200 version N+1 (or 400 + details)
    U->>UI: Back
    UI->>ED: close() (iframe removed)
```

## 5. Evaluate

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI as React UI
    participant BE as dmn-service
    participant DB as DynamoDB

    U->>UI: Execute Rule
    UI->>BE: GET /rules
    BE-->>UI: ruleIds
    U->>UI: Select rule
    UI->>BE: GET /rules/ruleId
    BE-->>UI: DMN XML
    UI->>UI: Read Input Data node names
    alt exactly one Input Data
        UI-->>U: Form built from schema
        U->>UI: Fill fields, add/remove list items, Evaluate
        UI->>BE: POST /rules/ruleId/evaluate<br/>body = { "LoanApplication": form data }
        opt cache miss or stale version
            BE->>DB: Load latest XML
            BE->>BE: Compile and cache
        end
        BE->>BE: DMNContext.set(each top-level key)<br/>evaluateAll(model)
        BE-->>UI: ruleId, version, hasErrors,<br/>decisions, messages
        UI-->>U: Decisions + messages
    else zero or several Input Data
        UI-->>U: Rule can't be run from this form
    end
```

Key rule for evaluate: the body's top-level keys must equal the rule's Input Data node names.
`{"LoanApplication": {...}}` works; the bare `{...}` fails with `Required dependency 'LoanApplication' not found`.

## Regenerating the PNGs

```bash
npx -y @mermaid-js/mermaid-cli@11.4.2 -i docs/flows.md -o docs/diagrams/flow.png -b white -s 2
```
This writes one `flow-N.png` per diagram; rename to the names above. If Puppeteer has no browser, add
`-p puppeteer.json` containing `{"executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}`.
