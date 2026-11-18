# DMN rule service

Upload DMN XML (built and tested in Business Central) through an API, store it in DynamoDB,
and evaluate it against inputs at runtime. No redeploy is needed when a rule changes.

## Flow

```
Business Central ──(Download .dmn)──► PUT /rules/{ruleId} ──► compile check ──► DynamoDB
                                                                         │
POST /rules/{ruleId}/evaluate ──► cache hit? ──yes──► evaluate ──► decisions JSON
                                     │no / newer version in DynamoDB
                                     └──► load XML from DynamoDB ──► compile ──► cache
```

* Invalid DMN is rejected with HTTP 400 and is never stored.
* Each instance caches compiled rules. Every `dmn.version-check-millis` (default 30 s) it reads
  only the `version` attribute from DynamoDB; if another instance uploaded a newer version,
  it reloads and recompiles.

## Run locally (LocalStack)

```bash
chmod +x localstack/init-dynamodb.sh
docker compose up -d            # LocalStack on :4566, creates table DmnRules
mvn spring-boot:run             # service on :9090, uses dmn.dynamodb.endpoint=http://localhost:4566
```

Check the table exists:

```bash
aws --endpoint-url http://localhost:4566 --region ap-south-1 dynamodb list-tables
```

## Real AWS

Remove `dmn.dynamodb.endpoint` (or set it empty) in `application.properties`; credentials and
region then come from the default AWS chain (env vars, profile, or IAM role). Create the table:

```bash
aws dynamodb create-table \
  --table-name DmnRules \
  --attribute-definitions AttributeName=ruleId,AttributeType=S \
  --key-schema AttributeName=ruleId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Upload the rule

```bash
curl -X PUT http://localhost:9090/rules/stamp-duty \
  -H "Content-Type: application/xml" \
  --data-binary @sample-stamp-duty.dmn
# {"ruleId":"stamp-duty","version":1}
```

## Evaluate

Input keys are the **Input Data node names** in the DMN (for a structured Input Data, nested keys are the fields of its type).
`sample-stamp-duty.dmn` has three inputs: `Loan Amount`, `Is Gram Panchayat`, `Is MSME`.

```bash
curl -X POST http://localhost:9090/rules/stamp-duty/evaluate \
  -H "Content-Type: application/json" \
  -d '{"Loan Amount": 3000000, "Is Gram Panchayat": true, "Is MSME": false}'
```

```json
{
  "ruleId": "stamp-duty",
  "version": 1,
  "hasErrors": false,
  "decisions": {
    "Final Amount": 4600000.0,
    "Rule Params": { "pct": 0.2, "cap": 5000000, "category": "GP: 20% of (loan + 2 Cr), max 50 L", "base": 20000000 }
  },
  "messages": []
}
```

| Input | Expected Final Amount |
|---|---|
| GP, 3000000 | 4600000 |
| GP, 8000000 | 5000000 |
| MSME, 500000 | 0 |
| MSME, 4000000 | 2500000 |
| General, 15000000 | 10000000 |

## Read APIs

```bash
curl http://localhost:9090/rules                 # {"ruleIds":["stamp-duty", ...]}
curl -i http://localhost:9090/rules/stamp-duty   # stored DMN XML, header X-Rule-Version: <n>; 404 JSON if unknown
curl http://localhost:9090/schema                # JSON Schema of the rule input
```

`GET /schema` returns the fixed JSON Schema in `src/main/resources/schema.json` (draft-07). The frontend
converts it into data types for the KIE DMN editor. It covers every field kind the editor needs:
`string` (plus enum and `format: date`), `integer`, `number` with `format: double`, `boolean`, `string[]`,
nested `object`, `object[]`, and `object[]` inside `object[]` (`properties[].owners[]`, two levels deep).

## Browser frontends (CORS)

Origins allowed to call the API are set by `dmn.cors.allowed-origins` (comma-separated patterns, default
`http://localhost:*`). Add your frontend's origin there for other environments. `X-Rule-Version` is exposed
so browser code can read it.

## Failed uploads

Every failed `PUT /rules/{ruleId}` (invalid DMN, compile error or storage error) saves the raw body as
`failed-uploads/<ruleId>_<utc-timestamp>.xml`, plus a `.error.txt` with the reason, and logs a WARN with the
path. Change the folder with `dmn.failed-upload-dir`. The PUT accepts any content type, so a wrongly labelled
body is still validated (and saved if invalid) instead of being rejected with 415.

## Postman collection

`postman/dmn-service.postman_collection.json` tests every endpoint (happy path, the 5 evaluation cases above,
the schema shape, and the 404 / 400 error cases). Import it into Postman and run it with the Collection Runner,
or from the terminal:

```bash
postman collection run postman/dmn-service.postman_collection.json --report-events=false
```

Run the requests in order: later ones use the version saved by the upload. The collection uploads the sample
under ruleId `postman-test-stamp-duty`, so the real `stamp-duty` rule is untouched. Change `baseUrl` in the
collection variables to target another environment.

## Notes

* `kie.version` in `pom.xml` should match your Business Central version.
* `DMNRuntimeBuilder` (`org.kie.dmn.core.internal.utils`) is available in KIE 7.30+.
* One DMN model per uploaded XML string is enforced.
