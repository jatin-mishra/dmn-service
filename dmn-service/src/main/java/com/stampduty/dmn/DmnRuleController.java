package com.stampduty.dmn;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/rules")
public class DmnRuleController {

    private final DmnEngine engine;
    private final DmnRuleStore store;

    public DmnRuleController(DmnEngine engine, DmnRuleStore store) {
        this.engine = engine;
        this.store = store;
    }

    /** List the ids of all stored rules. */
    @GetMapping
    public Map<String, Object> list() {
        return Map.of("ruleIds", store.listRuleIds());
    }

    /** Return the stored DMN XML of a rule (latest version, also sent in the X-Rule-Version header). */
    @GetMapping("/{ruleId}")
    public ResponseEntity<String> get(@PathVariable String ruleId) {
        DmnRuleStore.StoredRule rule = store.load(ruleId)
                .orElseThrow(() -> new DmnEngine.RuleNotFoundException(ruleId));
        // Content type set here (not via `produces`) so the 404 handler can still answer in JSON.
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_XML)
                .header("X-Rule-Version", String.valueOf(rule.version))
                .body(rule.dmnXml);
    }

    /**
     * Upload / replace the DMN XML for a rule. Body = the raw .dmn file content.
     * Any content type is accepted: the DMN compile check validates the body, and a rejected
     * body is saved by FailedUploadDumper (a 415 would drop it unseen).
     */
    @PutMapping("/{ruleId}")
    public Map<String, Object> upload(@PathVariable String ruleId, @RequestBody String dmnXml) {
        long version = engine.register(ruleId, dmnXml);
        return Map.of("ruleId", ruleId, "version", version);
    }

    /** Evaluate the stored rule. Body = DMN inputs keyed by Input Data node name. */
    @PostMapping(value = "/{ruleId}/evaluate", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Map<String, Object> evaluate(@PathVariable String ruleId, @RequestBody Map<String, Object> inputs) {
        return engine.evaluate(ruleId, inputs);
    }

    // Errors are always JSON (content type preset), even when the client asked for XML.
    @ExceptionHandler(DmnEngine.RuleNotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(DmnEngine.RuleNotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).contentType(MediaType.APPLICATION_JSON).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(DmnEngine.DmnCompileException.class)
    public ResponseEntity<Map<String, Object>> badDmn(DmnEngine.DmnCompileException e) {
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(Map.of("error", "DMN compile failed", "details", e.errors));
    }
}
