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

import io.micronaut.runtime.Micronaut;

public class Application {

    public static void main(String[] args) {
        for (String arg : args) {
            if ("-h".equals(arg) || "--help".equals(arg)) {
                printHelp();
                System.exit(0);
            } else if ("-v".equals(arg) || "--version".equals(arg)) {
                System.out.println("Antigravity Brain Visualizer version " + Version.VERSION);
                System.exit(0);
            }
        }
        Micronaut.run(Application.class, args);
    }

    private static void printHelp() {
        System.out.println("""
                Antigravity Brain Visualizer
                ============================
                A web interface for inspecting Antigravity AI agent execution transcripts.

                Usage:
                  export GEMINI_API_KEY="<your-key>"
                  ./agy-brain-viz [options]

                Options:
                  -Dmicronaut.server.port=<port>   Run on a custom port (default: 8080)
                  -Dgemini.model=<model>           Override Gemini model (default: gemini-3.6-flash)
                  -Dgemini.debug=<true|false>      Enable verbose LLM request/response debug logging
                  -h, --help                       Show this help message and exit
                  -v, --version                    Print the version information and exit

                Environment Variables:
                  GEMINI_API_KEY                   Required to generate transcript summaries and use chat
                  MICRONAUT_SERVER_PORT            Overrides the default server port
                  GEMINI_MODEL                     Overrides the default Gemini model
                  GEMINI_DEBUG / GEMINI_VERBOSE    Enables verbose LLM request/response debug logging
                """);
    }
}
