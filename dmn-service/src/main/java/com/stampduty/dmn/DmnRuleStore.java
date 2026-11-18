package com.stampduty.dmn;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeDefinition;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.BillingMode;
import software.amazon.awssdk.services.dynamodb.model.CreateTableRequest;
import software.amazon.awssdk.services.dynamodb.model.DescribeTableRequest;
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement;
import software.amazon.awssdk.services.dynamodb.model.KeyType;
import software.amazon.awssdk.services.dynamodb.model.ResourceNotFoundException;
import software.amazon.awssdk.services.dynamodb.model.ScalarAttributeType;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.ReturnValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemResponse;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Stores DMN XML strings in DynamoDB.
 *
 * Table: partition key "ruleId" (String). Attributes: dmnXml (S), version (N), updatedAt (S).
 * DynamoDB items are limited to 400 KB, which is far above a typical DMN file.
 */
@Component
public class DmnRuleStore {

    private final DynamoDbClient ddb;
    private final String table;

    public DmnRuleStore(DynamoDbClient ddb,
                        @Value("${dmn.table:DmnRules}") String table,
                        @Value("${dmn.create-table-if-missing:true}") boolean createIfMissing) {
        this.ddb = ddb;
        this.table = table;
        if (createIfMissing) {
            ensureTable();
        }
    }

    /** Creates the table (partition key ruleId) if it does not exist yet, e.g. on a fresh LocalStack. */
    private void ensureTable() {
        try {
            ddb.describeTable(DescribeTableRequest.builder().tableName(table).build());
        } catch (ResourceNotFoundException notFound) {
            ddb.createTable(CreateTableRequest.builder()
                    .tableName(table)
                    .attributeDefinitions(AttributeDefinition.builder()
                            .attributeName("ruleId").attributeType(ScalarAttributeType.S).build())
                    .keySchema(KeySchemaElement.builder()
                            .attributeName("ruleId").keyType(KeyType.HASH).build())
                    .billingMode(BillingMode.PAY_PER_REQUEST)
                    .build());
            ddb.waiter().waitUntilTableExists(DescribeTableRequest.builder().tableName(table).build());
        }
    }

    /** Saves the XML and atomically increments the version. Returns the new version. */
    public long save(String ruleId, String dmnXml) {
        UpdateItemResponse resp = ddb.updateItem(UpdateItemRequest.builder()
                .tableName(table)
                .key(Map.of("ruleId", s(ruleId)))
                .updateExpression("SET #x = :x, #t = :t ADD #v :one")
                .expressionAttributeNames(Map.of("#x", "dmnXml", "#t", "updatedAt", "#v", "version"))
                .expressionAttributeValues(Map.of(
                        ":x", s(dmnXml),
                        ":t", s(Instant.now().toString()),
                        ":one", AttributeValue.builder().n("1").build()))
                .returnValues(ReturnValue.UPDATED_NEW)
                .build());
        return Long.parseLong(resp.attributes().get("version").n());
    }

    public Optional<StoredRule> load(String ruleId) {
        GetItemResponse resp = ddb.getItem(GetItemRequest.builder()
                .tableName(table)
                .key(Map.of("ruleId", s(ruleId)))
                .consistentRead(true)
                .build());
        if (!resp.hasItem() || resp.item().isEmpty()) {
            return Optional.empty();
        }
        Map<String, AttributeValue> item = resp.item();
        return Optional.of(new StoredRule(
                ruleId,
                Long.parseLong(item.get("version").n()),
                item.get("dmnXml").s()));
    }

    /** Cheap read of just the version number, used to detect updates made by other instances. */
    public Optional<Long> currentVersion(String ruleId) {
        GetItemResponse resp = ddb.getItem(GetItemRequest.builder()
                .tableName(table)
                .key(Map.of("ruleId", s(ruleId)))
                .projectionExpression("#v")
                .expressionAttributeNames(Map.of("#v", "version"))
                .consistentRead(true)
                .build());
        if (!resp.hasItem() || resp.item().isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(Long.parseLong(resp.item().get("version").n()));
    }

    /** All stored rule ids, sorted. Scans only the key attribute, following pagination. */
    public List<String> listRuleIds() {
        return ddb.scanPaginator(ScanRequest.builder()
                        .tableName(table)
                        .projectionExpression("ruleId")
                        .build())
                .items().stream()
                .map(item -> item.get("ruleId").s())
                .sorted()
                .collect(Collectors.toList());
    }

    private static AttributeValue s(String v) {
        return AttributeValue.builder().s(v).build();
    }

    public static final class StoredRule {
        public final String ruleId;
        public final long version;
        public final String dmnXml;

        public StoredRule(String ruleId, long version, String dmnXml) {
            this.ruleId = ruleId;
            this.version = version;
            this.dmnXml = dmnXml;
        }
    }
}
