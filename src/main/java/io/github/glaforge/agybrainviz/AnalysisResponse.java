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

import dev.langchain4j.model.output.structured.Description;
import io.micronaut.core.annotation.ReflectiveAccess;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

@ReflectiveAccess
@Serdeable
public record AnalysisResponse(
    @Description("A very short title (max 50 chars) summarizing the session") String shortTitle,

    @Description(
        "List of short strings representing the flow. MAX 1 SENTENCE PER ITEM. DO NOT REPEAT WORDS."
    )
    List<String> flow,

    @Description("List of agent actions taken during the session") List<AgentAction> agentActions,

    @Description("List of issues or errors encountered and how they were circumvented")
    List<Issue> issues,

    @Description(
        "List of potential improvements (e.g., missing CLI tools, skills to create, or advice for AGENTS.md) that could help future sessions go faster or circumvent errors"
    )
    List<String> recommendations,

    @Description("A short paragraph explaining the overall outcome") String summary
) {}
