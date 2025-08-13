# Duckie 2.0 Specification

This document outlines the design and step-by-step implementation plan for **Duckie 2.0**, an advanced MCP server that transforms GitHub coding journeys into compelling LinkedIn stories with duck-themed personality.

The MCP server will scrape GitHub repositories, analyze code patterns using Cloudflare Workers AI, debug code, and generate engaging LinkedIn posts with storytelling elements and duck-themed easter eggs. The system is optimized for n8n workflow integration and AI agent consumption.

The system will be built using Cloudflare Workers with Hono as the API framework, Cloudflare D1 for data persistence, Cloudflare Workers AI for code analysis, and the GitHub API for repository data.

## 1. Technology Stack

- **Edge Runtime:** Cloudflare Workers
- **API Framework:** Hono.js (TypeScript-based API framework)
- **Database:** Cloudflare D1 (serverless SQLite)
- **ORM:** Drizzle ORM for type-safe database operations
- **MCP Framework:** @modelcontextprotocol/sdk and @hono/mcp
- **AI Processing:** Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct for analysis, @cf/google/gemma-3-12b-it for story generation)
- **GitHub Integration:** Octokit for GitHub API interactions
- **Blob Storage:** Cloudflare R2 for duck assets and generated content

## 2. Database Schema Design

The database will store GitHub user data, repository information, code analysis results, generated LinkedIn stories, and duck personality configurations.

### 2.1. github_users Table

- id (INTEGER, Primary Key, Auto Increment)
- username (TEXT, Unique, Not Null)
- github_id (INTEGER, Unique, Not Null)
- avatar_url (TEXT)
- bio (TEXT)
- location (TEXT)
- company (TEXT)
- blog (TEXT)
- public_repos (INTEGER)
- followers (INTEGER)
- following (INTEGER)
- created_at (TEXT, ISO timestamp)
- updated_at (TEXT, ISO timestamp)

### 2.2. repositories Table

- id (INTEGER, Primary Key, Auto Increment)
- github_user_id (INTEGER, Foreign Key to github_users.id)
- repo_name (TEXT, Not Null)
- full_name (TEXT, Not Null)
- description (TEXT)
- language (TEXT)
- stars (INTEGER, Default 0)
- forks (INTEGER, Default 0)
- size (INTEGER)
- default_branch (TEXT, Default 'main')
- is_private (BOOLEAN, Default false)
- created_at (TEXT, ISO timestamp)
- updated_at (TEXT, ISO timestamp)
- last_analyzed (TEXT, ISO timestamp)

### 2.3. code_analysis Table

- id (INTEGER, Primary Key, Auto Increment)
- repository_id (INTEGER, Foreign Key to repositories.id)
- file_path (TEXT, Not Null)
- language (TEXT)
- lines_of_code (INTEGER)
- complexity_score (REAL)
- patterns_detected (TEXT, JSON array)
- bugs_found (TEXT, JSON array)
- improvements_suggested (TEXT, JSON array)
- analysis_summary (TEXT)
- created_at (TEXT, ISO timestamp)

### 2.4. issue_suggestions Table

- id (INTEGER, Primary Key, Auto Increment)
- repository_id (INTEGER, Foreign Key to repositories.id)
- suggestion_type (TEXT) -- 'bug_fix', 'feature', 'improvement', 'refactor', 'documentation', 'testing'
- title (TEXT, Not Null)
- description (TEXT, Not Null)
- priority (TEXT) -- 'low', 'medium', 'high', 'critical'
- difficulty (TEXT) -- 'beginner', 'intermediate', 'advanced'
- estimated_hours (INTEGER)
- tags (TEXT, JSON array of relevant tags)
- ai_reasoning (TEXT) -- Why the AI suggested this
- duck_wisdom (TEXT) -- Duck-themed advice about the suggestion
- github_issue_url (TEXT) -- If actually created as GitHub issue
- is_implemented (BOOLEAN, Default False)
- generated_at (TEXT, ISO timestamp)
- updated_at (TEXT, ISO timestamp)

### 2.5. linkedin_stories Table

- id (INTEGER, Primary Key, Auto Increment)
- github_user_id (INTEGER, Foreign Key to github_users.id)
- repository_id (INTEGER, Foreign Key to repositories.id)
- story_title (TEXT, Not Null)
- story_content (TEXT, Not Null)
- duck_personality (TEXT, Not Null)
- easter_eggs (TEXT, JSON array)
- engagement_hooks (TEXT, JSON array)
- hashtags (TEXT, JSON array)
- story_type (TEXT, Not Null) -- 'debugging', 'feature', 'refactor', 'learning'
- generated_at (TEXT, ISO timestamp)
- is_published (BOOLEAN, Default false)

### 2.6. duck_personalities Table

- id (INTEGER, Primary Key, Auto Increment)
- name (TEXT, Unique, Not Null)
- description (TEXT)
- personality_traits (TEXT, JSON array)
- catchphrases (TEXT, JSON array)
- story_style (TEXT)
- emoji_set (TEXT, JSON array)
- created_at (TEXT, ISO timestamp)

### 2.6. duck_assets Table

- id (INTEGER, Primary Key, Auto Increment)
- asset_name (TEXT, Not Null)
- asset_type (TEXT, Not Null) -- 'image', 'gif', 'emoji'
- r2_key (TEXT, Not Null)
- personality_id (INTEGER, Foreign Key to duck_personalities.id, Nullable)
- tags (TEXT, JSON array)
- created_at (TEXT, ISO timestamp)

## 3. API Endpoints

We will structure our API endpoints into logical groups for GitHub integration, AI analysis, story generation, duck assets, and MCP server functionality.

### 3.1. GitHub Integration Endpoints

- **POST /github/sync-user**
  - Description: Sync GitHub user data and repositories
  - Expected Payload:
    ```json
    {
      "username": "octocat",
      "include_private": false
    }
    ```

- **GET /github/users/:username/repos**
  - Description: Get repositories for a GitHub user
  - Query Params: limit, offset, language, sort_by

- **POST /github/analyze-repo**
  - Description: Trigger code analysis for a specific repository
  - Expected Payload:
    ```json
    {
      "username": "octocat",
      "repo_name": "Hello-World",
      "branch": "main"
    }
    ```

### 3.2. AI Analysis Endpoints

- **POST /analysis/code-patterns**
  - Description: Analyze code patterns and complexity using Cloudflare AI
  - Expected Payload:
    ```json
    {
      "repository_id": 123,
      "file_paths": ["src/main.js", "lib/utils.ts"]
    }
    ```

- **POST /analysis/debug-suggestions**
  - Description: Generate debugging suggestions for code issues
  - Expected Payload:
    ```json
    {
      "code_snippet": "function buggyCode() { ... }",
      "language": "javascript",
      "context": "React component"
    }
    ```

- **GET /analysis/repository/:id/summary**
  - Description: Get comprehensive analysis summary for a repository
  - Query Params: include_files, complexity_threshold

### 3.3. Issue Suggestions Endpoints

- **POST /suggestions/generate**
  - Description: Generate AI-powered issue suggestions for a repository
  - Expected Payload:
    ```json
    {
      "repository_id": 123,
      "suggestion_types": ["feature", "bug_fix", "improvement"],
      "difficulty_levels": ["beginner", "intermediate"],
      "max_suggestions": 10
    }
    ```

- **GET /suggestions/repository/:repo_id**
  - Description: Get all suggestions for a repository
  - Query Params: type, priority, difficulty, implemented, limit

- **PUT /suggestions/:id/implement**
  - Description: Mark a suggestion as implemented
  - Expected Payload:
    ```json
    {
      "github_issue_url": "https://github.com/user/repo/issues/123",
      "implementation_notes": "Completed in PR #456"
    }
    ```

### 3.4. Story Generation Endpoints

- **POST /stories/generate**
  - Description: Generate LinkedIn story from GitHub activity
  - Expected Payload:
    ```json
    {
      "github_user_id": 456,
      "repository_id": 123,
      "story_type": "debugging",
      "duck_personality": "Debug Duck",
      "tone": "professional"
    }
    ```

- **GET /stories/user/:username**
  - Description: Get generated stories for a user
  - Query Params: limit, offset, story_type, published_only

- **PUT /stories/:id/publish**
  - Description: Mark a story as published
  - Expected Payload:
    ```json
    {
      "published_url": "https://linkedin.com/posts/..."
    }
    ```

### 3.4. Duck Assets Endpoints

- **GET /ducks/personalities**
  - Description: Get all available duck personalities
  - Query Params: include_assets

- **GET /ducks/assets/:id**
  - Description: Serve duck asset from R2 storage
  - Returns: Binary asset data with appropriate content-type

- **POST /ducks/easter-eggs/generate**
  - Description: Generate contextual duck-themed easter eggs
  - Expected Payload:
    ```json
    {
      "context": "debugging session",
      "personality": "Rubber Duckie",
      "code_language": "python"
    }
    ```

### 3.5. MCP Server Endpoint

- **ALL /mcp**
  - Description: MCP server endpoint for AI agent communication
  - Handles JSON-RPC requests for:
    - Tool: `analyze_github_repo` - Analyze repository and generate insights
    - Tool: `generate_linkedin_story` - Create engaging LinkedIn post
    - Tool: `get_duck_personality` - Retrieve duck personality details
    - Tool: `debug_code_snippet` - Provide debugging suggestions
    - Resource: Access to generated stories and analysis results

## 4. Integrations

The system integrates with several external services and APIs:

- **GitHub API (Octokit)** for repository data, commit history, and user information
- **Cloudflare Workers AI** for code analysis, pattern detection, and story generation
- **Cloudflare R2** for storing duck assets, generated images, and cached content
- **MCP SDK** for AI agent integration and tool exposure

### 4.1. Duck Personalities

Pre-configured duck personalities with unique traits:

- **Rubber Duckie**: Classic debugging companion, methodical and patient
- **Code Quacker**: Enthusiastic about clean code and best practices  
- **Debug Duck**: Specialist in finding and fixing bugs with humor
- **Refactor Goose**: Focused on code improvement and optimization
- **Feature Mallard**: Excited about new features and innovation
- **Learning Duckling**: Beginner-friendly, educational approach

## 5. Additional Notes

### 5.1. Environment Bindings

The application requires the following Cloudflare Worker bindings:
- `DB`: D1 database binding for data persistence
- `R2`: R2 bucket binding for asset storage
- `AI`: Cloudflare Workers AI binding for code analysis

### 5.2. GitHub Rate Limiting

Implement intelligent rate limiting and caching strategies for GitHub API calls to avoid hitting API limits. Store frequently accessed data in D1 and implement background sync jobs.

### 5.3. Story Templates

Create template system for different story types (debugging adventures, feature launches, refactoring journeys) with duck-themed narrative structures and engagement hooks.

### 5.4. n8n Workflow Optimization

Design API responses to be easily consumable by n8n workflows, with consistent JSON structures and clear error handling for automation scenarios.

## 6. Further Reading

Take inspiration from the project template here: https://github.com/fiberplane/create-honc-app/tree/main/templates/d1

For MCP server implementation patterns, reference: https://github.com/modelcontextprotocol/servers
