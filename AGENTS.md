# Antigravity Brain Visualizer

You are an AI coding assistant working on the **Antigravity Brain Visualizer** project. 
This project provides an interactive web UI for inspecting Antigravity AI agent JSONL execution transcripts.
*(Context: Transcripts consist of sequential JSON objects like `USER_INPUT`, `MODEL`, and `TOOL_CALL`, which the frontend parses and renders into a timeline).*

## Technology Stack
- **Backend**: Java 21+, Micronaut
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3 (No framework)
- **AI Integration**: LangChain4j, Google Gemini models (Docs: https://docs.langchain4j.dev/integrations/language-models/google-genai/)
- **Build Tool**: Gradle

## Development Environment & Commands

### Running the Application
- The application requires the `GEMINI_API_KEY` environment variable to be set at runtime for the LangChain4j integration.
- Start the server: `export GEMINI_API_KEY="..." && ./gradlew run`
- By default, the application runs on `http://localhost:8080`.

### Testing
- Run the test suite: `./gradlew test`

### Formatting & Linting
- Always format code before committing: `./gradlew spotlessApply`
- Check formatting: `./gradlew spotlessCheck`

### Frontend Workflow
- Frontend files are located in `src/main/resources/public/`.
- No Node.js, npm, or build step is required for the frontend.
- When modifying CSS or JS, you need to run `./gradlew processResources` to update the classpath resources, and then refresh your browser.

## Code Style & Conventions

### Java (Backend)
- Follow standard Java conventions.
- Format code using Spotless (`./gradlew spotlessApply`). This applies Prettier formatting to Java files and automatically injects the Apache 2.0 license header.
- Use dependency injection via Micronaut (`@Singleton`, `@Controller`).
- Do not use fully-qualified names (FQN) for classes in the code; always add the appropriate `import` statements at the top of the file.
- Do not use wildcard/star imports (e.g., `import java.util.*;`); always list each individual import explicitly.
- Do not expose sensitive endpoints or tokens.
- When searching for Java dependencies, use the Maven Central repository's REST API (documented here: https://central.sonatype.org/search/rest-api-guide/) and parse its `json` output.

### JavaScript (Frontend)
- Use modern Vanilla JS (ES6+).
- Organize code into modules (`import`/`export`) in `src/main/resources/public/modules/`.
- Do not use any UI frameworks (React, Vue, Angular, Tailwind).
- Prefer `document.querySelector` and standard DOM manipulation APIs.
- Keep rendering functions isolated and maintainable.

### CSS
- Use Vanilla CSS with CSS variables (`:root`) for theming and color palettes.
- Use Flexbox and CSS Grid for complex layouts.
- Keep a clean, responsive, and modern aesthetic (e.g. glassmorphism, transitions).

## Project Structure
- `src/main/java/io/github/glaforge/agybrainviz/` - Backend source code
  - `AnalysisController.java` - REST API for LangChain4j/Gemini processing and local file serving
  - `ChatModelFactory.java` - Configuration for the Gemini LLM
  - `BrainVisualizer.java` - Application entry point
- `src/main/resources/public/` - Frontend assets
  - `index.html` - Main HTML entry point
  - `style.css` - Global styles
  - `app.js` - Main frontend application logic
  - `modules/` - JS modules for specific domains (`timeline.js`, `stats.js`, `analysis.js`, `utils.js`, `ui.js`)
- `build.gradle` - Gradle build configuration

## Safety & Permissions

### Allowed without prompting
- Read files, list directories, search project code.
- Perform single-file edits or multi-file refactoring.
- Run `./gradlew spotlessApply` for formatting.
- Run `./gradlew processResources` to refresh UI assets.

### Require approval first
- Executing `./gradlew run`.
- Modifying `build.gradle` dependencies.
- Modifying `.gitignore`.
- Git operations (`commit`, `push`).

## Pull Request & Git Requirements
- Ensure all code is formatted (`./gradlew spotlessApply`).
- Do not commit any sensitive data or API keys (e.g. `GEMINI_API_KEY`).
- Use Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`).
