package com.stampduty.dmn;

import org.kie.api.io.Resource;
import org.kie.dmn.api.marshalling.DMNMarshaller;
import org.kie.dmn.backend.marshalling.v1x.DMNMarshallerFactory;
import org.kie.dmn.api.core.DMNContext;
import org.kie.dmn.api.core.DMNDecisionResult;
import org.kie.dmn.api.core.DMNMessage;
import org.kie.dmn.api.core.DMNModel;
import org.kie.dmn.api.core.DMNResult;
import org.kie.dmn.api.core.DMNRuntime;
import org.kie.dmn.core.internal.utils.DMNRuntimeBuilder;
import org.kie.internal.io.ResourceFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.StringReader;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

/**
 * Compiles DMN XML strings at runtime and evaluates them.
 *
 * - register(): validates (compiles) the XML first, then stores it in DynamoDB.
 *   Invalid XML is rejected and never stored.
 * - evaluate(): uses a compiled copy from the in-memory cache. On a cache miss
 *   (or when another instance has uploaded a newer version) it loads the XML
 *   from DynamoDB and recompiles. Compilation is the expensive step (~1s);
 *   evaluation is milliseconds.
 */
@Component
public class DmnEngine {

    private static final DMNMarshaller MARSHALLER = DMNMarshallerFactory.newDefaultMarshaller();

    private final DmnRuleStore store;
    private final FailedUploadDumper failedUploads;
    private final long versionCheckMillis;
    private final Map<String, CompiledRule> cache = new ConcurrentHashMap<>();

    public DmnEngine(DmnRuleStore store,
                     FailedUploadDumper failedUploads,
                     @Value("${dmn.version-check-millis:30000}") long versionCheckMillis) {
        this.store = store;
        this.failedUploads = failedUploads;
        this.versionCheckMillis = versionCheckMillis;
    }

    /** Compile-check, store, and cache a new version of a rule. Returns the stored version. */
    public long register(String ruleId, String dmnXml) {
        try {
            CompiledRule compiled = compile(ruleId, 0, dmnXml);   // throws DmnCompileException if invalid
            long version = store.save(ruleId, dmnXml);
            cache.put(ruleId, compiled.withVersion(version));
            return version;
        } catch (RuntimeException e) {
            failedUploads.dump(ruleId, dmnXml, e);
            throw e;
        }
    }

    /**
     * Evaluate all decisions of the rule.
     *
     * @param inputs top-level DMN inputs keyed by Input Data node name,
     *               e.g. {"Rule Attribute": {"is_gram_panchayat": true, "is_msme": false, "loan_amount": 3000000}}
     */
    public Map<String, Object> evaluate(String ruleId, Map<String, Object> inputs) {
        CompiledRule rule = getCompiled(ruleId);

        DMNContext ctx = rule.runtime.newContext();
        inputs.forEach(ctx::set);

        DMNResult result = rule.runtime.evaluateAll(rule.model, ctx);

        Map<String, Object> decisions = new LinkedHashMap<>();
        for (DMNDecisionResult dr : result.getDecisionResults()) {
            decisions.put(dr.getDecisionName(), dr.getResult());
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ruleId", ruleId);
        response.put("version", rule.version);
        response.put("hasErrors", result.hasErrors());
        response.put("decisions", decisions);
        response.put("messages", result.getMessages().stream()
                .map(m -> m.getLevel() + ": " + m.getText())
                .collect(Collectors.toList()));
        return response;
    }

    // ---------------------------------------------------------------------------------

    private CompiledRule getCompiled(String ruleId) {
        long now = System.currentTimeMillis();
        CompiledRule cached = cache.get(ruleId);

        if (cached != null && now - cached.checkedAt < versionCheckMillis) {
            return cached;
        }
        if (cached != null) {
            Long latest = store.currentVersion(ruleId)
                    .orElseThrow(() -> new RuleNotFoundException(ruleId));
            if (latest == cached.version) {
                cached.checkedAt = now;
                return cached;
            }
        }

        DmnRuleStore.StoredRule stored = store.load(ruleId)
                .orElseThrow(() -> new RuleNotFoundException(ruleId));
        CompiledRule fresh = compile(ruleId, stored.version, stored.dmnXml);
        cache.put(ruleId, fresh);
        return fresh;
    }

    private CompiledRule compile(String ruleId, long version, String dmnXml) {
        // The KIE unmarshaller logs and returns null for XML that is not a DMN document;
        // DMNRuntimeBuilder would then fail with an NPE (HTTP 500). Reject it up front instead.
        if (MARSHALLER.unmarshal(dmnXml) == null) {
            throw new DmnCompileException(ruleId, List.of("Not a valid DMN document (XML could not be parsed as DMN definitions)"));
        }

        Resource resource = ResourceFactory.newReaderResource(new StringReader(dmnXml), "UTF-8");
        resource.setSourcePath(ruleId.replaceAll("[^A-Za-z0-9_-]", "_") + ".dmn");

        DMNRuntime runtime = DMNRuntimeBuilder.fromDefaults()
                .buildConfiguration()
                .fromResources(Collections.singletonList(resource))
                .getOrElseThrow(e -> new DmnCompileException(ruleId, List.of(String.valueOf(e.getMessage()))));

        List<DMNModel> models = runtime.getModels();
        if (models.size() != 1) {
            throw new DmnCompileException(ruleId,
                    List.of("Expected exactly 1 DMN model in the XML, found " + models.size()));
        }
        DMNModel model = models.get(0);
        if (model.hasErrors()) {
            throw new DmnCompileException(ruleId, model.getMessages(DMNMessage.Severity.ERROR).stream()
                    .map(DMNMessage::getText)
                    .collect(Collectors.toList()));
        }
        return new CompiledRule(version, runtime, model, System.currentTimeMillis());
    }

    // ---------------------------------------------------------------------------------

    private static final class CompiledRule {
        final long version;
        final DMNRuntime runtime;
        final DMNModel model;
        volatile long checkedAt;

        CompiledRule(long version, DMNRuntime runtime, DMNModel model, long checkedAt) {
            this.version = version;
            this.runtime = runtime;
            this.model = model;
            this.checkedAt = checkedAt;
        }

        CompiledRule withVersion(long v) {
            return new CompiledRule(v, runtime, model, System.currentTimeMillis());
        }
    }

    public static class RuleNotFoundException extends RuntimeException {
        public RuleNotFoundException(String ruleId) {
            super("No DMN rule stored with ruleId '" + ruleId + "'");
        }
    }

    public static class DmnCompileException extends RuntimeException {
        public final List<String> errors;

        public DmnCompileException(String ruleId, List<String> errors) {
            super("DMN for '" + ruleId + "' failed to compile: " + errors);
            this.errors = errors;
        }
    }
}
