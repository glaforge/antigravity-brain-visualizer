package io.github.glaforge.agybrainviz;

import io.micronaut.context.annotation.Factory;
import jakarta.inject.Singleton;
import dev.langchain4j.model.chat.ChatModel;
import dev.langchain4j.model.google.genai.GoogleGenAiChatModel;
import dev.langchain4j.model.chat.request.ResponseFormat;
import java.time.Duration;

@Factory
public class ChatModelFactory {

    @Singleton
    public ChatModel chatModel() {
        String apiKey = System.getenv("GEMINI_API_KEY");
        if (apiKey == null || apiKey.isEmpty()) {
            apiKey = "dummy";
        }
        return GoogleGenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName("gemini-3.5-flash")
                .temperature(0.7)
                .maxRetries(0)
                .timeout(Duration.ofMinutes(15))
                .logResponses(false)
                .responseFormat(ResponseFormat.JSON)
                .build();
    }
}
