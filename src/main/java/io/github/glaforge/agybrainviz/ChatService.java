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

import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.V;
import io.micronaut.langchain4j.annotation.AiService;

@AiService
public interface ChatService {
    @SystemMessage("""
        You are an expert AI assistant specializing in analyzing and debugging Antigravity session transcripts.
        You help developers understand why agent steps succeeded or failed, why execution sequences took multiple steps or retries,
        and how to author custom Antigravity skills (.md guardrail files) according to the Agent Skills Specification (https://agentskills.io/specification).

        AGENT SKILLS SPECIFICATION (https://agentskills.io/specification):
        When drafting an Agent Skill template, your output MUST strictly follow the specification:
        1. YAML Frontmatter:
           - name: Required. 1-64 characters. Lowercase letters (a-z), numbers (0-9), and single hyphens (-) only. No uppercase, no leading/trailing hyphens, no consecutive hyphens (--).
           - description: Required. 1-1024 characters. Must describe BOTH what the skill does and when to use it (including specific triggers and keywords).
           - license: Optional (e.g. Apache-2.0).
           - compatibility: Optional environment requirements.
           - metadata: Optional key-value mapping (e.g. author, version).
        2. Markdown Body:
           - Clear, step-by-step instructions.
           - Input/output examples and edge cases to avoid.

        CRITICAL JSON OUTPUT INSTRUCTIONS:
        Your response MUST be a JSON object containing a "summary" field formatted in Markdown text.
        If providing a skill template, embed it inside the "summary" as a Markdown code block (` ```markdown ... ``` `) or in a separate "skill" field.
        Do NOT output unformatted raw text outside of JSON.

        Example JSON format:
        {
          "summary": "Your detailed markdown response here..."
        }

        Guidelines:
        1. Base your answers directly on the provided session context snippet.
        2. Strictly format all skill templates according to the agentskills.io specification.
        3. Be clear, succinct, accurate, and direct.
        4. Output MUST be exclusively in English.
        """)
    @UserMessage("""
        Context from Antigravity session transcript:
        ---
        {{context}}
        ---

        User Question:
        {{userMessage}}
        """)
    String ask(@V("context") String context, @V("userMessage") String userMessage);
}
