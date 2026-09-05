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

import com.fasterxml.jackson.annotation.JsonProperty;
import dev.langchain4j.model.output.structured.Description;
import io.micronaut.core.annotation.ReflectiveAccess;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

@ReflectiveAccess
@Serdeable
public record AnalysisResponse(
    @JsonProperty(required = true)
    @Description("A concise title (max 50 chars) summarizing the session")
    String shortTitle,

    @JsonProperty(required = true)
    @Description("Chronological sequence of key steps or milestones in the session flow")
    List<String> flow,

    @JsonProperty(required = true)
    @Description("Key actions performed by the agent during the session")
    List<AgentAction> agentActions,

    @JsonProperty(required = true)
    @Description("Issues or obstacles encountered and how they were resolved or circumvented")
    List<Issue> issues,

    @JsonProperty(required = true)
    @Description(
        "Actionable recommendations (e.g. missing tools, skills, or AGENTS.md rules) to improve future sessions"
    )
    List<String> recommendations,

    @JsonProperty(required = true)
    @Description("A coherent summary explaining the overall session outcome")
    String summary
) {}
