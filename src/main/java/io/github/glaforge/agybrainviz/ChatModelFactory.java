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
import dev.langchain4j.model.chat.listener.ChatModelErrorContext;
import dev.langchain4j.model.chat.listener.ChatModelListener;
import dev.langchain4j.model.chat.listener.ChatModelRequestContext;
import dev.langchain4j.model.chat.listener.ChatModelResponseContext;
import dev.langchain4j.model.chat.request.ResponseFormat;
import dev.langchain4j.model.google.genai.GoogleGenAiChatModel;
import io.micronaut.context.annotation.Factory;
import io.micronaut.context.annotation.Value;
import jakarta.inject.Singleton;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Factory
public class ChatModelFactory {

    private static final Logger LOG = LoggerFactory.getLogger(ChatModelFactory.class);
    private static final String REPRODUCER_LOG_FILE = "gemini-reproducers.log";

    @Value("${gemini.model:gemini-3.6-flash}")
    protected String modelName;

    @Value("${gemini.debug:false}")
    protected boolean debugConfig;

    public static String resolveModelName(String configured) {
        String sys = System.getProperty("gemini.model");
        if (sys != null && !sys.isBlank()) return sys.trim();
        String env = System.getenv("GEMINI_MODEL");
        if (env != null && !env.isBlank()) return env.trim();
        if (configured != null && !configured.isBlank()) return configured.trim();
        return "gemini-3.6-flash";
    }

    public static boolean resolveDebug(Boolean configured) {
        String sys = System.getProperty("gemini.debug");
        if (sys != null && !sys.isBlank()) return Boolean.parseBoolean(sys.trim());
        sys = System.getProperty("gemini.verbose");
        if (sys != null && !sys.isBlank()) return Boolean.parseBoolean(sys.trim());

        String env = System.getenv("GEMINI_DEBUG");
        if (env != null && !env.isBlank()) return Boolean.parseBoolean(env.trim());
        env = System.getenv("GEMINI_VERBOSE");
        if (env != null && !env.isBlank()) return Boolean.parseBoolean(env.trim());

        return configured != null ? configured : false;
    }

    private static synchronized void logToFile(String content) {
        try (PrintWriter pw = new PrintWriter(new FileWriter(REPRODUCER_LOG_FILE, true))) {
            pw.println(content);
            pw.flush();
        } catch (Exception e) {
            LOG.error("Failed to write to reproducer log file: {}", e.getMessage(), e);
        }
    }

    @Singleton
    public ChatModel chatModel() {
        String apiKey = System.getenv("GEMINI_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            apiKey = System.getProperty("gemini.api.key", "dummy");
        }
        String resolvedModel = resolveModelName(modelName);
        boolean verboseDebug = resolveDebug(debugConfig);

        ChatModelListener loggerListener = new ChatModelListener() {
            @Override
            public void onRequest(ChatModelRequestContext requestContext) {
                StringBuilder sb = new StringBuilder();
                sb.append(
                    "\n================================================================================\n"
                );
                sb.append("=== GEMINI REQUEST [").append(LocalDateTime.now()).append("] ===\n");
                sb.append("Model: ").append(resolvedModel).append("\n");

                if (requestContext.chatRequest() != null) {
                    if (requestContext.chatRequest().parameters() != null) {
                        var params = requestContext.chatRequest().parameters();
                        sb
                            .append("Parameters: ")
                            .append("temperature=")
                            .append(params.temperature())
                            .append(", topP=")
                            .append(params.topP())
                            .append(", topK=")
                            .append(params.topK())
                            .append(", maxOutputTokens=")
                            .append(params.maxOutputTokens())
                            .append(", responseFormat=")
                            .append(params.responseFormat())
                            .append("\n");
                    }

                    sb.append("--- REQUEST PROMPTS & MESSAGES ---\n");
                    requestContext
                        .chatRequest()
                        .messages()
                        .forEach(msg -> {
                            sb.append("[").append(msg.type()).append("]:\n");
                            if (msg instanceof dev.langchain4j.data.message.SystemMessage sm) {
                                sb.append(sm.text()).append("\n");
                            } else if (msg instanceof dev.langchain4j.data.message.UserMessage um) {
                                sb.append(um.singleText()).append("\n");
                            } else if (msg instanceof dev.langchain4j.data.message.AiMessage am) {
                                sb.append(am.text()).append("\n");
                            } else {
                                sb.append(msg).append("\n");
                            }
                            sb.append("\n");
                        });
                }
                sb.append(
                    "================================================================================\n"
                );
                logToFile(sb.toString());
            }

            @Override
            public void onResponse(ChatModelResponseContext responseContext) {
                StringBuilder sb = new StringBuilder();
                sb.append("=== GEMINI RESPONSE [").append(LocalDateTime.now()).append("] ===\n");
                if (responseContext.chatResponse() != null) {
                    if (responseContext.chatResponse().aiMessage() != null) {
                        sb.append("Response Text:\n");
                        sb.append(responseContext.chatResponse().aiMessage().text()).append("\n");
                    }
                    if (responseContext.chatResponse().tokenUsage() != null) {
                        sb
                            .append("Token Usage: ")
                            .append(responseContext.chatResponse().tokenUsage())
                            .append("\n");
                    }
                    if (responseContext.chatResponse().finishReason() != null) {
                        sb
                            .append("Finish Reason: ")
                            .append(responseContext.chatResponse().finishReason())
                            .append("\n");
                    }
                }
                sb.append(
                    "================================================================================\n"
                );
                logToFile(sb.toString());
            }

            @Override
            public void onError(ChatModelErrorContext errorContext) {
                StringBuilder sb = new StringBuilder();
                sb.append("=== GEMINI ERROR [").append(LocalDateTime.now()).append("] ===\n");
                if (errorContext.error() != null) {
                    sb.append("Error: ").append(errorContext.error().getMessage()).append("\n");
                }
                sb.append(
                    "================================================================================\n"
                );
                logToFile(sb.toString());
            }
        };

        var builder = GoogleGenAiChatModel
            .builder()
            .apiKey(apiKey)
            .modelName(resolvedModel)
            .temperature(0.0)
            .maxRetries(0)
            .timeout(Duration.ofMinutes(2))
            .responseFormat(ResponseFormat.JSON)
            .logRequests(verboseDebug)
            .logResponses(verboseDebug);

        if (verboseDebug) {
            LOG.info("Gemini verbose logging is ENABLED");
            builder.listeners(List.of(loggerListener));
        }

        return builder.build();
    }
}
