package com.stampduty.dmn;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClientBuilder;

import java.net.URI;

@SpringBootApplication
public class DmnServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(DmnServiceApplication.class, args);
    }

    /**
     * If dmn.dynamodb.endpoint is set (e.g. <a href="http://localhost:4566">...</a> for LocalStack), the client
     * points there with dummy credentials. Otherwise, the default AWS credential/region chain is used.
     */
    @Bean
    public DynamoDbClient dynamoDbClient(
            @Value("${dmn.dynamodb.endpoint:}") String endpoint,
            @Value("${dmn.dynamodb.region:ap-south-1}") String region) {

        DynamoDbClientBuilder builder = DynamoDbClient.builder().region(Region.of(region));
        if (!endpoint.isBlank()) {
            builder.endpointOverride(URI.create(endpoint))
                   .credentialsProvider(StaticCredentialsProvider.create(
                           AwsBasicCredentials.create("test", "test")));
        }
        return builder.build();
    }

    /**
     * Lets a browser frontend (e.g. the DMN editor app) call the API. Without this, the browser's
     * preflight for PUT /rules/{id} is rejected with 403 and the upload is never sent.
     * dmn.cors.allowed-origins is a comma-separated list of origin patterns.
     */
    @Bean
    public WebMvcConfigurer corsConfigurer(@Value("${dmn.cors.allowed-origins:http://localhost:*}") String[] allowedOrigins) {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        .allowedOriginPatterns(allowedOrigins)
                        .allowedMethods("GET", "PUT", "POST", "OPTIONS")
                        .allowedHeaders("*")
                        .exposedHeaders("X-Rule-Version");
            }
        };
    }
}
