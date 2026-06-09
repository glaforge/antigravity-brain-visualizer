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

import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.google.genai.GoogleGenAiChatModel;
import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;
import java.time.Duration;

@Factory
public class ChatModelFactory {

    @Singleton
    public ChatModel chatModel() {
        String apiKey = System.getenv("GEMINI_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            apiKey = "dummy";
        }
        return GoogleGenAiChatModel
            .builder()
            .apiKey(apiKey)
            .modelName("gemini-3.5-flash")
            .temperature(0.0)
            .maxRetries(0)
            .timeout(Duration.ofMinutes(2))
            .responseFormat(ResponseFormat.JSON)
            .build();
    }
}
