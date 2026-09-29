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
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
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
        java.nio.file.Path maliciousFlavorPath = BrainController.getBrainPath("../../etc");
        Assertions.assertTrue(
            maliciousFlavorPath.endsWith(
                java.nio.file.Path.of(".gemini", "antigravity-cli", "brain")
            )
        );
    }

    @Test
    void testTranscriptPathTraversalEndpoint() {
        String transcript = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc%2Fpasswd/transcript"),
                String.class
            );
        Assertions.assertEquals("[]", transcript);
    }

    @Test
    void testArtifactsPathTraversalEndpoint() {
        List<Map<String, Object>> artifacts = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/artifacts"),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(artifacts);
        Assertions.assertTrue(artifacts.isEmpty());
    }

    @Test
    void testSnapshotsPathTraversalEndpoint() {
        List<Map<String, Object>> snapshots = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/snapshots"),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(snapshots);
        Assertions.assertTrue(snapshots.isEmpty());
    }

    @Test
    void testMessagesPathTraversalEndpoint() {
        List<Map<String, Object>> messages = client
            .toBlocking()
            .retrieve(
                HttpRequest.GET("/api/brain/conversations/..%2F..%2Fetc/messages"),
                Argument.listOf(Argument.mapOf(String.class, Object.class))
            );
        Assertions.assertNotNull(messages);
        Assertions.assertTrue(messages.isEmpty());
    }

    @Test
    void testDiffPathTraversalEndpoint() {
        io.micronaut.http.client.exceptions.HttpClientResponseException ex =
            Assertions.assertThrows(
                io.micronaut.http.client.exceptions.HttpClientResponseException.class,
                () ->
                    client
                        .toBlocking()
                        .exchange(
                            HttpRequest.GET(
                                "/api/brain/conversations/..%2F..%2Fetc/diff?commit=HEAD"
                            )
                        )
            );
        Assertions.assertEquals(io.micronaut.http.HttpStatus.BAD_REQUEST, ex.getStatus());
    }
}
