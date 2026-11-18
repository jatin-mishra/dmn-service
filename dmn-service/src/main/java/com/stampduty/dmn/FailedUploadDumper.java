package com.stampduty.dmn;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Saves the raw input of a failed rule upload so it can be debugged later.
 *
 * Writes {dir}/{ruleId}_{utc timestamp}.xml (the body exactly as received) and a matching
 * .error.txt with the failure reason. A failure to write is logged and never hides the original error.
 */
@Component
public class FailedUploadDumper {

    private static final Logger log = LoggerFactory.getLogger(FailedUploadDumper.class);
    private static final DateTimeFormatter TIMESTAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss.SSS'Z'").withZone(ZoneOffset.UTC);

    private final Path dir;

    public FailedUploadDumper(@Value("${dmn.failed-upload-dir:failed-uploads}") String dir) {
        this.dir = Paths.get(dir);
    }

    public void dump(String ruleId, String dmnXml, RuntimeException cause) {
        try {
            Files.createDirectories(dir);
            String base = ruleId.replaceAll("[^A-Za-z0-9_-]", "_") + "_" + TIMESTAMP.format(Instant.now());
            Path xmlFile = dir.resolve(base + ".xml");
            Files.writeString(xmlFile, dmnXml);
            Files.writeString(dir.resolve(base + ".error.txt"), describe(cause));
            log.warn("Upload of rule '{}' failed: {}. Input saved to {}", ruleId, cause.getMessage(), xmlFile.toAbsolutePath());
        } catch (IOException | RuntimeException e) {
            log.error("Upload of rule '{}' failed and its input could not be saved to {}", ruleId, dir.toAbsolutePath(), e);
        }
    }

    private static String describe(RuntimeException cause) {
        if (cause instanceof DmnEngine.DmnCompileException) {
            return "DMN compile failed:\n- " + String.join("\n- ", ((DmnEngine.DmnCompileException) cause).errors) + "\n";
        }
        return cause.toString() + "\n";
    }
}
