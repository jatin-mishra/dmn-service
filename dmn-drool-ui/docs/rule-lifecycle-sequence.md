# Rule lifecycle: sequence diagrams

How a rule is created, published, modified and evaluated across the UI, the DMN editor, the backend and DynamoDB.
Two diagrams, because the editor part differs:

| | A. React component editor | B. Classic iframe editor (current app) |
|---|---|---|
| Who holds the rule while editing | The UI | The editor |
| How the UI gets the rule | Editor sends every change to the UI | UI asks the editor on Publish |
| Converting to XML | UI calls the DMN marshaller, which comes with the DMN editor (both `@kie-tools`) | Editor returns XML |
| Backend needed | Drools 10.2+ | Any Drools 7.x+ |

Steps marked *(proposed)* are not built yet.

## A. React component editor (target)

![Rule lifecycle with React component](diagrams/rule-lifecycle-react.png)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as UI
    participant ED as DMN editor<br/>(React component)
    participant MM as DMN marshaller<br/>(comes with the DMN editor,<br/>@kie-tools)
    participant BE as Backend<br/>(Drools 10.2+)
    participant DB as DynamoDB

    Note over U,DB: App start
    UI->>BE: Get rules
    BE->>DB: Read rule ids
    BE-->>UI: Rule list
    UI->>BE: Get input schema
    BE-->>UI: Schema
    UI->>UI: Build starting model from schema

    Note over U,DB: Create rule
    U->>UI: Create rule (name)
    UI->>MM: Convert starting XML to model
    MM-->>UI: Model
    UI->>ED: Show starting model
    U->>ED: Define decisions and tables
    ED-->>UI: Updated model (on every change)

    Note over U,DB: Publish
    U->>UI: Publish
    UI->>MM: Convert model to DMN XML
    MM-->>UI: DMN XML
    UI->>BE: Save rule (DMN XML, type DMN)
    BE->>BE: Resolve references (proposed), validate
    alt invalid
        BE-->>UI: Errors
        UI-->>U: Show errors
    else valid
        BE->>DB: Store rule, type, new version
        BE-->>UI: Saved (version)
        UI-->>U: Published
    end

    Note over U,DB: Modify
    U->>UI: Open existing rule
    UI->>BE: Get rule
    BE->>DB: Read latest version
    BE-->>UI: DMN XML
    UI->>MM: Convert XML to model
    MM-->>UI: Model
    UI->>ED: Show rule
    U->>ED: Edit
    Note over U,DB: Publish again (new version)

    Note over U,DB: Evaluate
    U->>UI: Run rule with input
    UI->>BE: Evaluate rule (input)
    BE->>DB: Read rule (if not cached)
    alt type DMN
        BE->>BE: Run with DMN runtime
    else type DROOL (proposed)
        BE->>BE: Run with Drools session
    end
    BE-->>UI: Decisions / results
    UI-->>U: Show result
```

## B. Classic iframe editor (current app)

![Rule lifecycle with classic iframe editor](diagrams/rule-lifecycle-iframe.png)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant UI as UI
    participant ED as DMN editor<br/>(classic, iframe)
    participant BE as Backend<br/>(Drools 7.x+)
    participant DB as DynamoDB

    Note over U,DB: App start
    UI->>BE: Get rules
    BE->>DB: Read rule ids
    BE-->>UI: Rule list
    UI->>BE: Get input schema
    BE-->>UI: Schema
    UI->>UI: Build starting model from schema

    Note over U,DB: Create rule
    U->>UI: Create rule (name)
    UI->>ED: Open editor with starting model
    U->>ED: Define decisions and tables
    Note over UI,ED: Edits stay inside the editor

    Note over U,DB: Publish
    U->>UI: Publish
    UI->>ED: Ask for current rule
    ED-->>UI: DMN XML
    UI->>BE: Save rule (DMN XML, type DMN)
    BE->>BE: Resolve references (proposed), validate
    alt invalid
        BE-->>UI: Errors
        UI-->>U: Show errors
    else valid
        BE->>DB: Store rule, type, new version
        BE-->>UI: Saved (version)
        UI-->>U: Published
    end

    Note over U,DB: Modify
    U->>UI: Open existing rule
    UI->>BE: Get rule
    BE->>DB: Read latest version
    BE-->>UI: DMN XML
    UI->>ED: Open editor with rule
    U->>ED: Edit
    Note over U,DB: Publish again (new version)

    Note over U,DB: Evaluate
    U->>UI: Run rule with input
    UI->>BE: Evaluate rule (input)
    BE->>DB: Read rule (if not cached)
    alt type DMN
        BE->>BE: Run with DMN runtime
    else type DROOL (proposed)
        BE->>BE: Run with Drools session
    end
    BE-->>UI: Decisions / results
    UI-->>U: Show result
```
