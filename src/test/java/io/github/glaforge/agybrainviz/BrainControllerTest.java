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
}
