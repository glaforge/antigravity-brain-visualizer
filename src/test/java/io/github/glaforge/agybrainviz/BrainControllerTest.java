/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package io.github.glaforge.agybrainviz;

import io.micronaut.core.type.Argument;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

@MicronautTest
class BrainControllerTest {

    @Inject
    @Client("/")
    HttpClient client;

    @Test
    void testFlavorsEndpoint() {
        List<String> flavors = client
            .toBlocking()
            .retrieve(HttpRequest.GET("/api/brain/flavors"), Argument.listOf(String.class));
        Assertions.assertNotNull(flavors);
    }

    @Test
    void testConversationsEndpoint() {
        List<ConversationSummary> conversations = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations?flavor=antigravity"),
                Argument.listOf(ConversationSummary.class)
            );
        Assertions.assertNotNull(conversations);
        if (!conversations.isEmpty()) {
            ConversationSummary first = conversations.get(0);
            Assertions.assertNotNull(first.id());
            Assertions.assertNotNull(first.summary());
        }
    }

    @Test
    void testArtifactsEndpointNonExistent() {
        List<Map<String, Object>> artifacts = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET(
                    "/api/brain/conversations/non-existent-id-12345/artifacts?flavor=antigravity"
                ),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(artifacts);
        Assertions.assertTrue(artifacts.isEmpty());
    }

    @Test
    void testSnapshotsEndpointNonExistent() {
        List<Map<String, Object>> snapshots = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET(
                    "/api/brain/conversations/non-existent-id-12345/snapshots?flavor=antigravity"
                ),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(snapshots);
        Assertions.assertTrue(snapshots.isEmpty());
    }

    @Test
    void testMessagesEndpointNonExistent() {
        List<Map<String, Object>> messages = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET(
                    "/api/brain/conversations/non-existent-id-12345/messages?flavor=antigravity"
                ),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(messages);
        Assertions.assertTrue(messages.isEmpty());
    }

    @Test
    void testResolveConversationDirValidation() {
        Optional<java.nio.file.Path> valid = BrainController.resolveConversationDir(
            "valid-session-123",
            Optional.of("antigravity")
        );
        Assertions.assertTrue(valid.isPresent());
        Assertions.assertTrue(valid.get().endsWith("valid-session-123"));

        // Path traversal attempts
        Assertions.assertTrue(
            BrainController.resolveConversationDir("../..", Optional.of("antigravity")).isEmpty()
        );
        Assertions.assertTrue(
            BrainController.resolveConversationDir("foo/bar", Optional.of("antigravity")).isEmpty()
        );
        Assertions.assertTrue(
            BrainController.resolveConversationDir("..\\bar", Optional.of("antigravity")).isEmpty()
        );
        Assertions.assertTrue(
            BrainController.resolveConversationDir(".", Optional.of("antigravity")).isEmpty()
        );
        Assertions.assertTrue(
            BrainController.resolveConversationDir("", Optional.of("antigravity")).isEmpty()
        );
        Assertions.assertTrue(
            BrainController.resolveConversationDir(null, Optional.of("antigravity")).isEmpty()
        );
    }

    @Test
    void testGetBrainPathFlavorWhitelisting() {
        java.nio.file.Path validFlavorPath = BrainController.getBrainPath("antigravity");
        Assertions.assertTrue(
            validFlavorPath.endsWith(java.nio.file.Path.of(".gemini", "antigravity", "brain"))
        );

        // Unrecognized or malicious flavor should safely fallback to antigravity-cli
        Path maliciousFlavorPath = BrainController.getBrainPath("../../etc");
        Assertions.assertTrue(
            maliciousFlavorPath.endsWith(Path.of(".gemini", "antigravity-cli", "brain"))
        );
    }

    @Test
    void testTranscriptPathTraversalEndpoint() {
        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(
                        HttpRequest.GET(
                            "/api/brain/conversations/..%2F..%2Fetc%2Fpasswd/transcript"
                        )
                    )
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        String transcript = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/foo..bar/transcript"),
                String.class
            );
        Assertions.assertEquals("[]", transcript);
    }

    @Test
    void testArtifactsPathTraversalEndpoint() {
        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/artifacts"))
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        List<Map<String, Object>> artifacts = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/foo..bar/artifacts"),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(artifacts);
        Assertions.assertTrue(artifacts.isEmpty());
    }

    @Test
    void testSnapshotsPathTraversalEndpoint() {
        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/snapshots"))
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        List<Map<String, Object>> snapshots = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/foo..bar/snapshots"),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(snapshots);
        Assertions.assertTrue(snapshots.isEmpty());
    }

    @Test
    void testMessagesPathTraversalEndpoint() {
        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/messages"))
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        List<Map<String, Object>> messages = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/foo..bar/messages"),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(messages);
        Assertions.assertTrue(messages.isEmpty());
    }

    @Test
    void testDiffPathTraversalEndpoint() {
        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(
                        HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/diff?commit=HEAD")
                    )
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        HttpClientResponseException ex = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/foo..bar/diff?commit=HEAD"))
        );
        Assertions.assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }

    @Test
    void testWidgetPathTraversalEndpoint() {
        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/widget"))
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        HttpClientResponseException ex = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/foo..bar/widget"))
        );
        Assertions.assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }

    @Test
    void testMediaEndpointSecurityAndMissingFile() {
        String outsidePath = URLEncoder.encode("/etc/passwd", StandardCharsets.UTF_8);
        HttpClientResponseException unauthEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/media?path=" + outsidePath))
        );
        Assertions.assertEquals(HttpStatus.UNAUTHORIZED, unauthEx.getStatus());

        Path insideGeminiMissing = Paths.get(
            System.getProperty("user.home"),
            ".gemini",
            "non-existent-media-12345.png"
        );
        String missingParam = URLEncoder.encode(
            insideGeminiMissing.toAbsolutePath().toString(),
            StandardCharsets.UTF_8
        );
        HttpClientResponseException notFoundEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/media?path=" + missingParam))
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, notFoundEx.getStatus());
    }

    @Test
    void testSwarmEndpointNonExistentAndTraversal() {
        Map<String, Object> nonExistent = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET(
                    "/api/brain/conversations/non-existent-id-12345/swarm?flavor=antigravity"
                ),
                Argument.mapOf(String.class, Object.class)
            );
        Assertions.assertNotNull(nonExistent);
        Assertions.assertEquals(Boolean.FALSE, nonExistent.get("hasSwarm"));

        HttpClientResponseException encodedEx = Assertions.assertThrows(
            HttpClientResponseException.class,
            () ->
                client
                    .toBlocking()
                    .exchange(HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/swarm"))
        );
        Assertions.assertEquals(HttpStatus.NOT_FOUND, encodedEx.getStatus());

        Map<String, Object> traversal = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/foo..bar/swarm"),
                Argument.mapOf(String.class, Object.class)
            );
        Assertions.assertNotNull(traversal);
        Assertions.assertEquals(Boolean.FALSE, traversal.get("hasSwarm"));
    }
}
