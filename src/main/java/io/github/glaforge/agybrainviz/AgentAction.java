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

@ReflectiveAccess
@Serdeable
public record AgentAction(
    @JsonProperty(required = true)
    @Description(
        "Name of the tool or action taken (e.g. view_file, run_command, replace_file_content)"
    )
    String action,

    @JsonProperty(required = true)
    @Description("Concise description of what was done and why")
    String description
) {}
