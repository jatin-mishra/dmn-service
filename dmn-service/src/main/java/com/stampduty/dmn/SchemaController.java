package com.stampduty.dmn;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

/**
 * Serves the JSON Schema of the rule input. The frontend turns it into data types
 * for the KIE DMN editor. The schema is a fixed classpath file (schema.json), read once at startup.
 */
@RestController
public class SchemaController {

    private final String schema;

    public SchemaController() {
        try (InputStream in = new ClassPathResource("schema.json").getInputStream()) {
            this.schema = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read classpath:schema.json", e);
        }
    }

    @GetMapping(value = "/schema", produces = MediaType.APPLICATION_JSON_VALUE)
    public String get() {
        return schema;
    }
}
