// Duckie 2.0 - GitHub Storytelling MCP Server
import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, desc, and, gte } from "drizzle-orm";
import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { z } from "zod";
import { Octokit } from "octokit";
import * as schema from "./db/schema";

type Bindings = {
  DB: D1Database;
  AI: Ai;
  R2: R2Bucket;
  GITHUB_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// GitHub API client helper
function createGitHubClient(token?: string) {
  return new Octokit({
    auth: token,
    request: {
      fetch: globalThis.fetch.bind(globalThis)
    }
  });
}

// Duck personalities data
const DUCK_PERSONALITIES = [
  {
    name: "Rubber Duckie",
    description: "Classic debugging companion, methodical and patient",
    personalityTraits: ["methodical", "patient", "analytical", "supportive"],
    catchphrases: ["Let's debug this step by step!", "Quack! What's the issue here?", "Time to rubber duck this problem!"],
    storyStyle: "methodical and educational",
    emojiSet: ["🦆", "🔍", "🐛", "✨", "💡"]
  },
  {
    name: "Code Quacker",
    description: "Enthusiastic about clean code and best practices",
    personalityTraits: ["enthusiastic", "perfectionist", "organized", "helpful"],
    catchphrases: ["Clean code is happy code!", "Quack! Let's refactor this beauty!", "Best practices make the best code!"],
    storyStyle: "enthusiastic and educational",
    emojiSet: ["🦆", "✨", "🎯", "🏆", "💎"]
  },
  {
    name: "Debug Duck",
    description: "Specialist in finding and fixing bugs with humor",
    personalityTraits: ["humorous", "persistent", "clever", "encouraging"],
    catchphrases: ["Another bug bites the dust!", "Quack! Found the culprit!", "Debugging is just detective work!"],
    storyStyle: "humorous and engaging",
    emojiSet: ["🦆", "🐛", "🔨", "🎭", "🕵️"]
  }
];

// Initialize duck personalities in database
async function initializeDuckPersonalities(db: any) {
  for (const personality of DUCK_PERSONALITIES) {
    try {
      await db.insert(schema.duckPersonalities).values(personality);
    } catch (error) {
      // Personality already exists, continue
    }
  }
}

// GitHub Integration Endpoints
app.post("/github/sync-user", async (c) => {
  const db = drizzle(c.env.DB);
  const { username, include_private = false } = await c.req.json();

  if (!username) {
    return c.json({ error: "Username is required" }, 400);
  }

  try {
    const github = createGitHubClient(c.env.GITHUB_TOKEN);
    
    // Get user data
    const { data: user } = await github.rest.users.getByUsername({ username });
    
    // Upsert user
    const [githubUser] = await db.insert(schema.githubUsers).values({
      username: user.login,
      githubId: user.id,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      location: user.location,
      company: user.company,
      blog: user.blog,
      publicRepos: user.public_repos,
      followers: user.followers,
      following: user.following,
    }).onConflictDoUpdate({
      target: schema.githubUsers.username,
      set: {
        avatarUrl: user.avatar_url,
        bio: user.bio,
        location: user.location,
        company: user.company,
        blog: user.blog,
        publicRepos: user.public_repos,
        followers: user.followers,
        following: user.following,
        updatedAt: new Date().toISOString(),
      }
    }).returning();

    // Get repositories
    const { data: repos } = await github.rest.repos.listForUser({
      username,
      type: include_private ? "all" : "public" as "all" | "owner" | "member",
      per_page: 100
    });

    // Sync repositories
    const syncedRepos = [];
    for (const repo of repos) {
      const [repository] = await db.insert(schema.repositories).values({
        githubUserId: githubUser.id,
        repoName: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        size: repo.size,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
      }).onConflictDoUpdate({
        target: schema.repositories.fullName,
        set: {
          description: repo.description,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          size: repo.size,
          defaultBranch: repo.default_branch,
          updatedAt: new Date().toISOString(),
        }
      }).returning();
      
      syncedRepos.push(repository);
    }

    return c.json({
      user: githubUser,
      repositories: syncedRepos,
      synced_count: syncedRepos.length
    });

  } catch (error) {
    return c.json({
      error: "Failed to sync GitHub user",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.get("/github/users/:username/repos", async (c) => {
  const db = drizzle(c.env.DB);
  const username = c.req.param("username");
  const limit = Number.parseInt(c.req.query("limit") || "20");
  const offset = Number.parseInt(c.req.query("offset") || "0");
  const language = c.req.query("language");
  const sortBy = c.req.query("sort_by") || "updated_at";

  try {
    const [user] = await db.select()
      .from(schema.githubUsers)
      .where(eq(schema.githubUsers.username, username));

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const conditions = [eq(schema.repositories.githubUserId, user.id)];
    if (language) {
      conditions.push(eq(schema.repositories.language, language));
    }

    const repositories = await db.select()
      .from(schema.repositories)
      .where(and(...conditions))
      .orderBy(sortBy === "stars" ? desc(schema.repositories.stars) : desc(schema.repositories.updatedAt!))
      .limit(limit)
      .offset(offset);

    return c.json({
      user: { username: user.username, id: user.id },
      repositories,
      pagination: { limit, offset, count: repositories.length }
    });

  } catch (error) {
    return c.json({
      error: "Failed to fetch repositories",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.post("/github/analyze-repo", async (c) => {
  const db = drizzle(c.env.DB);
  const { username, repo_name, branch = "main" } = await c.req.json();

  if (!username || !repo_name) {
    return c.json({ error: "Username and repo_name are required" }, 400);
  }

  try {
    const github = createGitHubClient(c.env.GITHUB_TOKEN);
    
    // Get repository from database
    const [repository] = await db.select()
      .from(schema.repositories)
      .where(eq(schema.repositories.fullName, `${username}/${repo_name}`));

    if (!repository) {
      return c.json({ error: "Repository not found in database. Please sync user first." }, 404);
    }

    // Get repository contents
    const { data: contents } = await github.rest.repos.getContent({
      owner: username,
      repo: repo_name,
      path: "",
      ref: branch
    });

    const analysisResults = [];
    const fileContents = Array.isArray(contents) ? contents : [contents];

    for (const file of fileContents.slice(0, 10)) { // Limit to first 10 files
      if (file.type === "file" && "download_url" in file && file.download_url) {
        try {
          const response = await fetch(file.download_url!);
          const content = await response.text();
          
          // Analyze with Cloudflare AI
          const aiResponse = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
            messages: [
              {
                role: "system",
                content: "You are a code analysis expert. Analyze the provided code and return a JSON object with: complexity_score (0-10), patterns_detected (array), bugs_found (array), improvements_suggested (array), analysis_summary (string)."
              },
              {
                role: "user",
                content: `Analyze this ${file.name} file:\n\n${content.slice(0, 2000)}`
              }
            ]
          });

          let analysisData;
          try {
            analysisData = JSON.parse(aiResponse.response);
          } catch {
            analysisData = {
              complexity_score: 5,
              patterns_detected: ["standard patterns"],
              bugs_found: [],
              improvements_suggested: ["code review recommended"],
              analysis_summary: "Analysis completed"
            };
          }

          const [analysis] = await db.insert(schema.codeAnalysis).values({
            repositoryId: repository.id,
            filePath: ("path" in file) ? file.path! : (("name" in file) ? file.name! : "unknown"),
            language: repository.language,
            linesOfCode: content.split('\n').length,
            complexityScore: analysisData.complexity_score,
            patternsDetected: analysisData.patterns_detected,
            bugsFound: analysisData.bugs_found,
            improvementsSuggested: analysisData.improvements_suggested,
            analysisSummary: analysisData.analysis_summary,
          }).returning();

          analysisResults.push(analysis);
        } catch (fileError) {
          console.error(`Error analyzing file ${("name" in file) ? file.name : "unknown"}:`, fileError);
        }
      }
    }

    // Update repository last_analyzed timestamp
    await db.update(schema.repositories)
      .set({ lastAnalyzed: new Date().toISOString() })
      .where(eq(schema.repositories.id, repository.id));

    return c.json({
      repository: { id: repository.id, name: repository.repoName },
      analysis_results: analysisResults,
      analyzed_files: analysisResults.length
    });

  } catch (error) {
    return c.json({
      error: "Failed to analyze repository",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// AI Analysis Endpoints
app.post("/analysis/debug-suggestions", async (c) => {
  const { code_snippet, language, context } = await c.req.json();

  if (!code_snippet) {
    return c.json({ error: "Code snippet is required" }, 400);
  }

  try {
    const aiResponse = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: "You are a debugging expert. Analyze the code and provide specific debugging suggestions, potential issues, and fixes. Respond in JSON format with: issues (array), suggestions (array), fixes (array)."
        },
        {
          role: "user",
          content: `Debug this ${language} code in ${context} context:\n\n${code_snippet}`
        }
      ]
    });

    let debugData;
    try {
      debugData = JSON.parse(aiResponse.response);
    } catch {
      debugData = {
        issues: ["Code analysis completed"],
        suggestions: ["Review code logic and error handling"],
        fixes: ["Consider adding proper error handling"]
      };
    }

    return c.json({
      code_snippet: code_snippet.slice(0, 200) + "...",
      language,
      context,
      debug_analysis: debugData
    });

  } catch (error) {
    return c.json({
      error: "Failed to analyze code",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.get("/analysis/repository/:id/summary", async (c) => {
  const db = drizzle(c.env.DB);
  const repositoryId = Number.parseInt(c.req.param("id"));
  const includeFiles = c.req.query("include_files") === "true";
  const complexityThreshold = Number.parseFloat(c.req.query("complexity_threshold") || "5");

  try {
    const [repository] = await db.select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repositoryId));

    if (!repository) {
      return c.json({ error: "Repository not found" }, 404);
    }

    const conditions = [eq(schema.codeAnalysis.repositoryId, repositoryId)];
    if (complexityThreshold) {
      conditions.push(gte(schema.codeAnalysis.complexityScore, complexityThreshold));
    }

    const analyses = await db.select()
      .from(schema.codeAnalysis)
      .where(and(...conditions))
      .orderBy(desc(schema.codeAnalysis.createdAt));

    const summary = {
      repository: {
        id: repository.id,
        name: repository.repoName,
        language: repository.language,
        last_analyzed: repository.lastAnalyzed
      },
      analysis_summary: {
        total_files_analyzed: analyses.length,
        average_complexity: analyses.length > 0 
          ? analyses.reduce((sum, a) => sum + (a.complexityScore || 0), 0) / analyses.length 
          : 0,
        total_bugs_found: analyses.reduce((sum, a) => sum + (a.bugsFound?.length || 0), 0),
        total_improvements_suggested: analyses.reduce((sum, a) => sum + (a.improvementsSuggested?.length || 0), 0),
      },
      files: includeFiles ? analyses : undefined
    };

    return c.json(summary);

  } catch (error) {
    return c.json({
      error: "Failed to get repository summary",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Issue Suggestions Endpoints
app.post("/api/suggestions/generate", async (c) => {
  try {
    const { repository_id, suggestion_types = ["feature", "bug_fix", "improvement"], difficulty_levels = ["beginner", "intermediate"], max_suggestions = 10 } = await c.req.json();
    
    const db = drizzle(c.env.DB);
    
    // Get repository details
    const [repository] = await db.select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repository_id));
    
    if (!repository) {
      return c.json({ error: "Repository not found" }, 404);
    }

    // Get recent code analysis for context
    const codeAnalysis = await db.select()
      .from(schema.codeAnalysis)
      .where(eq(schema.codeAnalysis.repositoryId, repository_id))
      .limit(5);

    // Generate suggestions using AI
    const suggestions = [];
    
    for (const suggestionType of suggestion_types.slice(0, 3)) { // Limit to 3 types
      const prompt = `Analyze this ${repository.language} repository "${repository.repoName}" and suggest ${suggestionType} improvements.

Repository Description: ${repository.description || "No description"}
Language: ${repository.language}
Stars: ${repository.stars}

Recent Code Analysis:
${codeAnalysis.map(analysis => `- ${analysis.analysisSummary}`).join('\\n')}

Generate ${Math.ceil(max_suggestions / suggestion_types.length)} specific ${suggestionType} suggestions with:
1. Clear title
2. Detailed description  
3. Priority (low/medium/high/critical)
4. Difficulty (${difficulty_levels.join('/')})
5. Estimated hours
6. Relevant tags
7. Duck-themed wisdom

Format as JSON array with these fields: title, description, priority, difficulty, estimated_hours, tags, duck_wisdom`;

      try {
        const aiResponse = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [{ role: "user", content: prompt }]
        });

        let aiSuggestions = [];
        try {
          // Try to parse as JSON
          const jsonMatch = aiResponse.response.match(/\\[.*\\]/s);
          if (jsonMatch) {
            aiSuggestions = JSON.parse(jsonMatch[0]);
          } else {
            // Fallback: create suggestions from text
            aiSuggestions = [{
              title: `${suggestionType.replace('_', ' ')} suggestion for ${repository.repoName}`,
              description: (aiResponse.response || "").substring(0, 500),
              priority: "medium",
              difficulty: difficulty_levels[0],
              estimated_hours: 4,
              tags: [repository.language?.toLowerCase(), suggestionType],
              duck_wisdom: "🦆 Every great feature starts with a quack of inspiration!"
            }];
          }
        } catch (parseError) {
          console.error("Failed to parse AI response:", parseError);
          aiSuggestions = [{
            title: `AI-suggested ${suggestionType.replace('_', ' ')} for ${repository.repoName}`,
            description: (aiResponse.response || "").substring(0, 500),
            priority: "medium", 
            difficulty: difficulty_levels[0],
            estimated_hours: 4,
            tags: [repository.language?.toLowerCase(), suggestionType],
            duck_wisdom: "🦆 Sometimes the best ideas come from unexpected places!"
          }];
        }

        // Store suggestions in database
        for (const suggestion of aiSuggestions.slice(0, Math.ceil(max_suggestions / suggestion_types.length))) {
          const [savedSuggestion] = await db.insert(schema.issueSuggestions).values({
            repositoryId: repository_id,
            suggestionType: suggestionType as "bug_fix" | "feature" | "improvement" | "refactor" | "documentation" | "testing",
            title: suggestion.title,
            description: suggestion.description,
            priority: suggestion.priority as "low" | "medium" | "high" | "critical",
            difficulty: suggestion.difficulty as "beginner" | "intermediate" | "advanced",
            estimatedHours: suggestion.estimated_hours || 4,
                 tags: JSON.stringify(suggestion.tags || []),
            aiReasoning: `Generated based on repository analysis and ${suggestionType} patterns`,
            duckWisdom: suggestion.duck_wisdom || "🦆 Quack! Every improvement makes the code happier!",
            generatedAt: new Date().toISOString()
          }).returning();
          
          suggestions.push(savedSuggestion);
        }
      } catch (aiError) {
        console.error("AI generation error:", aiError);
        // Create fallback suggestion
        const [fallbackSuggestion] = await db.insert(schema.issueSuggestions).values({
          repositoryId: repository_id,
          suggestionType: suggestionType as "bug_fix" | "feature" | "improvement" | "refactor" | "documentation" | "testing",
          title: `Improve ${suggestionType.replace('_', ' ')} in ${repository.repoName}`,
          description: `Consider enhancing the ${suggestionType.replace('_', ' ')} aspects of this ${repository.language} project to improve code quality and user experience.`,
          priority: "medium" as "low" | "medium" | "high" | "critical",
          difficulty: difficulty_levels[0] as "beginner" | "intermediate" | "advanced",
          estimatedHours: 4,
          tags: JSON.stringify([repository.language?.toLowerCase(), suggestionType]),
          aiReasoning: "Fallback suggestion due to AI processing error",
          duckWisdom: "🦆 Even when AI gets confused, there's always room for improvement!",
          generatedAt: new Date().toISOString()
        }).returning();
        
        suggestions.push(fallbackSuggestion);
      }
    }

    return c.json({
      repository: {
        id: repository.id,
        name: repository.repoName,
        language: repository.language
      },
      suggestions: suggestions,
      generated_count: suggestions.length,
      duck_message: "🦆 Fresh ideas hatched! These suggestions are ready to make your code shine!"
    });

  } catch (error) {
    console.error("Error generating suggestions:", error);
    return c.json({ error: "Failed to generate suggestions" }, 500);
  }
});

app.get("/api/suggestions/repository/:repo_id", async (c) => {
  try {
    const repoId = parseInt(c.req.param("repo_id"));
    const { type, priority, difficulty, implemented, limit = "20" } = c.req.query();
    
    const db = drizzle(c.env.DB);
    
    // Add filters
    const conditions = [eq(schema.issueSuggestions.repositoryId, repoId)];
    
    if (type) {
      conditions.push(eq(schema.issueSuggestions.suggestionType, type as any));
    }
    if (priority) {
      conditions.push(eq(schema.issueSuggestions.priority, priority as any));
    }
    if (difficulty) {
      conditions.push(eq(schema.issueSuggestions.difficulty, difficulty as any));
    }
    if (implemented !== undefined) {
      conditions.push(eq(schema.issueSuggestions.isImplemented, implemented === "true"));
    }
    
    const suggestions = await db.select()
      .from(schema.issueSuggestions)
      .where(and(...conditions))
      .orderBy(desc(schema.issueSuggestions.generatedAt))
      .limit(parseInt(limit));

    return c.json({
      suggestions: suggestions.map(s => ({
        ...s,
        tags: s.tags ? JSON.parse(s.tags) : []
      })),
      count: suggestions.length,
      duck_message: suggestions.length > 0 
        ? "🦆 Here are your brilliant ideas! Ready to turn them into reality?"
        : "🦆 No suggestions yet, but every great project starts somewhere!"
    });

  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return c.json({ error: "Failed to fetch suggestions" }, 500);
  }
});

// Story Generation Endpoints
app.post("/stories/generate", async (c) => {
  const db = drizzle(c.env.DB);
  const { github_user_id, repository_id, story_type, duck_personality, tone = "professional" } = await c.req.json();

  if (!github_user_id || !repository_id || !story_type || !duck_personality) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    // Get repository and user data
    const [repository] = await db.select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, repository_id));

    const [user] = await db.select()
      .from(schema.githubUsers)
      .where(eq(schema.githubUsers.id, github_user_id));

    if (!repository || !user) {
      return c.json({ error: "Repository or user not found" }, 404);
    }

    // Get recent code analysis for context
    const analyses = await db.select()
      .from(schema.codeAnalysis)
      .where(eq(schema.codeAnalysis.repositoryId, repository_id))
      .orderBy(desc(schema.codeAnalysis.createdAt))
      .limit(3);

    // Get duck personality
    const personality = DUCK_PERSONALITIES.find(p => p.name === duck_personality) || DUCK_PERSONALITIES[0];

    // Generate story with AI
    const contextData = {
      repository: repository.repoName,
      language: repository.language,
      description: repository.description,
      story_type,
      personality_traits: personality.personalityTraits,
      catchphrases: personality.catchphrases,
      recent_analysis: analyses.map(a => a.analysisSummary).join("; ")
    };

    const aiResponse = await c.env.AI.run("@cf/google/gemma-3-12b-it", {
      messages: [
        {
          role: "system",
          content: `You are ${duck_personality}, a duck-themed coding storyteller. Create engaging LinkedIn posts about coding journeys. Use duck puns, programming humor, and the personality traits: ${personality.personalityTraits.join(", ")}. Include relevant hashtags and engagement hooks.`
        },
        {
          role: "user",
          content: `Create a ${tone} LinkedIn story about a ${story_type} experience with the ${repository.repoName} repository (${repository.language}). Context: ${contextData.recent_analysis}. Make it engaging with duck-themed elements and programming insights.`
        }
      ]
    });

    // Generate easter eggs and hashtags
    const easterEggs = [
      `🦆 ${personality.catchphrases[Math.floor(Math.random() * personality.catchphrases.length)]}`,
      `Rubber duck debugging level: ${story_type}`,
      `Quack! Another day, another ${repository.language} adventure`
    ];

    const hashtags = [
      "#coding", "#programming", "#github", "#developer", "#rubberduck",
      `#${repository.language?.toLowerCase()}`, `#${story_type}`, "#techstory"
    ];

    const engagementHooks = [
      "What's your favorite debugging technique?",
      "Have you ever had a similar coding adventure?",
      "Drop a 🦆 if you've been there too!"
    ];

    // Save story to database
    const [story] = await db.insert(schema.linkedinStories).values({
      githubUserId: github_user_id,
      repositoryId: repository_id,
      storyTitle: `${duck_personality}'s ${story_type} Adventure`,
      storyContent: aiResponse.response,
      duckPersonality: duck_personality,
      easterEggs,
      engagementHooks,
      hashtags,
      storyType: story_type,
    }).returning();

    return c.json({
      story,
      preview: {
        title: story.storyTitle,
        content: story.storyContent.slice(0, 200) + "...",
        personality: duck_personality,
        hashtags: hashtags.slice(0, 5)
      }
    });

  } catch (error) {
    return c.json({
      error: "Failed to generate story",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.get("/stories/user/:username", async (c) => {
  const db = drizzle(c.env.DB);
  const username = c.req.param("username");
  const limit = Number.parseInt(c.req.query("limit") || "10");
  const offset = Number.parseInt(c.req.query("offset") || "0");
  const storyType = c.req.query("story_type");
  const publishedOnly = c.req.query("published_only") === "true";

  try {
    const [user] = await db.select()
      .from(schema.githubUsers)
      .where(eq(schema.githubUsers.username, username));

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    const conditions = [eq(schema.linkedinStories.githubUserId, user.id)];
    if (storyType && ["debugging", "feature", "refactor", "learning"].includes(storyType)) {
      conditions.push(eq(schema.linkedinStories.storyType, storyType as "debugging" | "feature" | "refactor" | "learning"));
    }
    if (publishedOnly) {
      conditions.push(eq(schema.linkedinStories.isPublished, true));
    }

    const stories = await db.select()
      .from(schema.linkedinStories)
      .where(and(...conditions))
      .orderBy(desc(schema.linkedinStories.generatedAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      user: { username: user.username, id: user.id },
      stories,
      pagination: { limit, offset, count: stories.length }
    });

  } catch (error) {
    return c.json({
      error: "Failed to fetch stories",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.put("/stories/:id/publish", async (c) => {
  const db = drizzle(c.env.DB);
  const storyId = Number.parseInt(c.req.param("id"));
  const { published_url } = await c.req.json();

  try {
    const [story] = await db.update(schema.linkedinStories)
      .set({ isPublished: true })
      .where(eq(schema.linkedinStories.id, storyId))
      .returning();

    if (!story) {
      return c.json({ error: "Story not found" }, 404);
    }

    return c.json({
      story,
      published_url,
      message: "Story marked as published"
    });

  } catch (error) {
    return c.json({
      error: "Failed to update story",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Duck Assets Endpoints
app.get("/ducks/personalities", async (c) => {
  const db = drizzle(c.env.DB);
  const includeAssets = c.req.query("include_assets") === "true";

  try {
    await initializeDuckPersonalities(db);

    const personalities = await db.select()
      .from(schema.duckPersonalities)
      .orderBy(schema.duckPersonalities.name);

    if (includeAssets) {
      const personalitiesWithAssets = [];
      for (const personality of personalities) {
        const assets = await db.select()
          .from(schema.duckAssets)
          .where(eq(schema.duckAssets.personalityId, personality.id));
        
        personalitiesWithAssets.push({
          ...personality,
          assets
        });
      }
      return c.json({ personalities: personalitiesWithAssets });
    }

    return c.json({ personalities });

  } catch (error) {
    return c.json({
      error: "Failed to fetch personalities",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.get("/ducks/assets/:id", async (c) => {
  const db = drizzle(c.env.DB);
  const assetId = Number.parseInt(c.req.param("id"));

  try {
    const [asset] = await db.select()
      .from(schema.duckAssets)
      .where(eq(schema.duckAssets.id, assetId));

    if (!asset) {
      return c.json({ error: "Asset not found" }, 404);
    }

    // Get asset from R2
    const object = await c.env.R2.get(asset.r2Key);
    
    if (!object) {
      return c.json({ error: "Asset file not found in storage" }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    return new Response(object.body, { headers });

  } catch (error) {
    return c.json({
      error: "Failed to fetch asset",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

app.post("/ducks/easter-eggs/generate", async (c) => {
  const { context, personality, code_language } = await c.req.json();

  if (!context || !personality) {
    return c.json({ error: "Context and personality are required" }, 400);
  }

  try {
    const duckPersonality = DUCK_PERSONALITIES.find(p => p.name === personality) || DUCK_PERSONALITIES[0];
    
    const aiResponse = await c.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `You are ${personality}. Generate 3-5 duck-themed easter eggs and programming puns for the given context. Be creative and use duck/water/pond metaphors with coding concepts.`
        },
        {
          role: "user",
          content: `Generate easter eggs for: ${context} in ${code_language}. Personality traits: ${duckPersonality.personalityTraits.join(", ")}`
        }
      ]
    });

    const easterEggs = [
      `🦆 ${duckPersonality.catchphrases[Math.floor(Math.random() * duckPersonality.catchphrases.length)]}`,
      `Swimming through ${code_language} like a duck in water!`,
      `Quack! Time to debug this pond of code`,
      aiResponse.response
    ];

    return c.json({
      context,
      personality,
      code_language,
      easter_eggs: easterEggs,
      emojis: duckPersonality.emojiSet
    });

  } catch (error) {
    return c.json({
      error: "Failed to generate easter eggs",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// MCP Server Implementation
function createMcpServer(env: Bindings) {
  const server = new McpServer({
    name: "duckie-storyteller",
    version: "1.0.0",
    description: "MCP server for GitHub code analysis and LinkedIn story generation with duck personalities"
  });

  const db = drizzle(env.DB);

  // Tool: Analyze GitHub Repository
  server.tool(
    "analyze_github_repo",
    {
      username: z.string().describe("GitHub username"),
      repo_name: z.string().describe("Repository name"),
      branch: z.string().default("main").describe("Branch to analyze")
    },
    async ({ username, repo_name, branch }) => {
      try {
        const github = createGitHubClient(env.GITHUB_TOKEN);
        
        // Get repository info
        const { data: repo } = await github.rest.repos.get({
          owner: username,
          repo: repo_name
        });

        // Get recent commits for context
        const { data: commits } = await github.rest.repos.listCommits({
          owner: username,
          repo: repo_name,
          sha: branch,
          per_page: 5
        });

        const analysis = {
          repository: {
            name: repo.name,
            description: repo.description,
            language: repo.language,
            stars: repo.stargazers_count,
            forks: repo.forks_count
          },
          recent_activity: commits.map(commit => ({
            message: commit.commit.message,
            author: commit.commit.author?.name,
            date: commit.commit.author?.date
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: `Repository Analysis for ${username}/${repo_name}:\n\n${JSON.stringify(analysis, null, 2)}`
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error analyzing repository: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool: Generate LinkedIn Story
  server.tool(
    "generate_linkedin_story",
    {
      username: z.string().describe("GitHub username"),
      repo_name: z.string().describe("Repository name"),
      story_type: z.enum(["debugging", "feature", "refactor", "learning"]).describe("Type of story"),
      duck_personality: z.enum(["Rubber Duckie", "Code Quacker", "Debug Duck"]).describe("Duck personality to use"),
      tone: z.enum(["professional", "casual", "humorous"]).default("professional").describe("Story tone")
    },
    async ({ username, repo_name, story_type, duck_personality, tone }) => {
      try {
        // Get user and repository from database
        const [user] = await db.select()
          .from(schema.githubUsers)
          .where(eq(schema.githubUsers.username, username));

        if (!user) {
          return {
            content: [
              {
                type: "text",
                text: `User ${username} not found. Please sync the user first using analyze_github_repo.`
              }
            ],
            isError: true
          };
        }

        const [repository] = await db.select()
          .from(schema.repositories)
          .where(and(
            eq(schema.repositories.githubUserId, user.id),
            eq(schema.repositories.repoName, repo_name)
          ));
           if (!repository) {
          return {
            content: [
              {
                type: "text",
                text: `Repository ${repo_name} not found for user ${username}.`
              }
            ],
            isError: true
          };
        }

        // Get duck personality
        const personality = DUCK_PERSONALITIES.find(p => p.name === duck_personality) || DUCK_PERSONALITIES[0];

        // Generate story
        const aiResponse = await env.AI.run("@cf/google/gemma-3-12b-it", {
          messages: [
            {
              role: "system",
              content: `You are ${duck_personality}, a duck-themed coding storyteller. Create engaging LinkedIn posts about coding journeys with duck puns and programming humor.`
            },
            {
              role: "user",
              content: `Create a ${tone} LinkedIn story about a ${story_type} experience with ${repo_name} (${repository.language}). Include duck-themed elements and programming insights.`
            }
          ]
        });

        const hashtags = ["#coding", "#programming", "#github", "#developer", "#rubberduck", `#${repository.language?.toLowerCase()}`, `#${story_type}`];

        return {
          content: [
            {
              type: "text",
              text: `Generated LinkedIn Story:\n\n${aiResponse.response}\n\nSuggested hashtags: ${hashtags.join(" ")}\n\nPersonality: ${duck_personality}\nCatchphrase: ${personality.catchphrases[0]}`
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating story: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool: Get Duck Personality
  server.tool(
    "get_duck_personality",
    {
      name: z.string().describe("Duck personality name")
    },
    async ({ name }) => {
      const personality = DUCK_PERSONALITIES.find(p => p.name === name);
      
      if (!personality) {
        return {
          content: [
            {
              type: "text",
              text: `Duck personality "${name}" not found. Available personalities: ${DUCK_PERSONALITIES.map(p => p.name).join(", ")}`
            }
          ],
          isError: true
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(personality, null, 2)
          }
        ]
      };
    }
  );

  // Tool: Debug Code Snippet
  server.tool(
    "debug_code_snippet",
    {
      code: z.string().describe("Code snippet to debug"),
      language: z.string().describe("Programming language"),
      context: z.string().optional().describe("Additional context about the code")
    },
    async ({ code, language, context }) => {
      try {
        const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
          messages: [
            {
              role: "system",
              content: "You are Debug Duck, a debugging expert. Analyze code and provide specific debugging suggestions with duck-themed humor."
            },
            {
              role: "user",
              content: `Debug this ${language} code${context ? ` (${context})` : ""}:\n\n${code}`
            }
          ]
        });

        return {
          content: [
            {
              type: "text",
              text: `🦆 Debug Duck's Analysis:\n\n${aiResponse.response}\n\nQuack! Remember: debugging is just detective work with more coffee! ☕`
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error debugging code: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Tool: Generate Issue Suggestions
  server.tool(
    "generate_issue_suggestions",
    {
      username: z.string().describe("GitHub username"),
      repo_name: z.string().describe("Repository name"),
      suggestion_types: z.array(z.enum(["feature", "bug_fix", "improvement", "refactor", "documentation", "testing"])).default(["feature", "improvement"]).describe("Types of suggestions to generate"),
      difficulty_levels: z.array(z.enum(["beginner", "intermediate", "advanced"])).default(["beginner", "intermediate"]).describe("Difficulty levels to target"),
      max_suggestions: z.number().default(5).describe("Maximum number of suggestions to generate")
    },
    async ({ username, repo_name, suggestion_types, difficulty_levels, max_suggestions }) => {
      try {
        const db = drizzle(env.DB);
        
        // First, find the repository
        const [repository] = await db.select()
          .from(schema.repositories)
          .where(and(
            eq(schema.repositories.repoName, repo_name),
            eq(schema.repositories.fullName, `${username}/${repo_name}`)
          ));

        if (!repository) {
          return {
            content: [
              {
                type: "text",
                text: `🦆 Repository ${username}/${repo_name} not found in database. Please analyze the repository first using analyze_github_repo tool.`
              }
            ]
          };
        }

        // Generate suggestions using the API endpoint logic
        const suggestions = [];
        
        for (const suggestionType of suggestion_types.slice(0, 3)) {
          const prompt = `Analyze this ${repository.language} repository "${repository.repoName}" and suggest ${suggestionType} improvements.

Repository Description: ${repository.description || "No description"}
Language: ${repository.language}
Stars: ${repository.stars}

Generate ${Math.ceil(max_suggestions / suggestion_types.length)} specific ${suggestionType} suggestions with:
1. Clear title
2. Detailed description
3. Priority (low/medium/high/critical)
4. Difficulty (${difficulty_levels.join('/')})
5. Estimated hours
6. Relevant tags
7. Duck-themed wisdom

Format as JSON array with these fields: title, description, priority, difficulty, estimated_hours, tags, duck_wisdom`;

          try {
            const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
              messages: [{ role: "user", content: prompt }]
            });

            let aiSuggestions = [];
            try {
              const jsonMatch = (aiResponse.response || "").match(/\\[.*\\]/s);
              if (jsonMatch) {
                aiSuggestions = JSON.parse(jsonMatch[0]);
              } else {
                aiSuggestions = [{
                  title: `${suggestionType.replace('_', ' ')} suggestion for ${repository.name}`,
                  description: aiResponse.response.substring(0, 500),
                  priority: "medium",
                  difficulty: difficulty_levels[0],
                  estimated_hours: 4,
                  tags: [repository.language?.toLowerCase(), suggestionType],
                  duck_wisdom: "🦆 Every great feature starts with a quack of inspiration!"
                }];
              }
            } catch (parseError) {
              aiSuggestions = [{
                title: `AI-suggested ${suggestionType.replace('_', ' ')} for ${repository.name}`,
                description: aiResponse.response.substring(0, 500),
                priority: "medium",
                difficulty: difficulty_levels[0],
                estimated_hours: 4,
                tags: [repository.language?.toLowerCase(), suggestionType],
                duck_wisdom: "🦆 Sometimes the best ideas come from unexpected places!"
              }];
            }

            // Store suggestions in database
            for (const suggestion of aiSuggestions.slice(0, Math.ceil(max_suggestions / suggestion_types.length))) {
              const [savedSuggestion] = await db.insert(schema.issueSuggestions).values({
                repositoryId: repository.id,
                suggestionType: suggestionType as "bug_fix" | "feature" | "improvement" | "refactor" | "documentation" | "testing",
                title: suggestion.title,
                description: suggestion.description,
                priority: suggestion.priority as "low" | "medium" | "high" | "critical",
                difficulty: suggestion.difficulty as "beginner" | "intermediate" | "advanced",
                estimatedHours: suggestion.estimated_hours || 4,
                tags: JSON.stringify(suggestion.tags || []),
                aiReasoning: `Generated based on repository analysis and ${suggestionType} patterns`,
                duckWisdom: suggestion.duck_wisdom || "🦆 Quack! Every improvement makes the code happier!",
                generatedAt: new Date().toISOString()
              }).returning();
              
              suggestions.push(savedSuggestion);
            }
          } catch (aiError) {
            console.error("AI generation error:", aiError);
            // Create fallback suggestion
            const [fallbackSuggestion] = await db.insert(schema.issueSuggestions).values({
              repositoryId: repository.id,
              suggestionType: suggestionType as "bug_fix" | "feature" | "improvement" | "refactor" | "documentation" | "testing",
              title: `Improve ${suggestionType.replace('_', ' ')} in ${repository.name}`,
              description: `Consider enhancing the ${suggestionType.replace('_', ' ')} aspects of this ${repository.language} project to improve code quality and user experience.`,
              priority: "medium" as "low" | "medium" | "high" | "critical",
              difficulty: difficulty_levels[0] as "beginner" | "intermediate" | "advanced",
              estimatedHours: 4,
              tags: JSON.stringify([repository.language?.toLowerCase(), suggestionType]),
              aiReasoning: "Fallback suggestion due to AI processing error",
              duckWisdom: "🦆 Even when AI gets confused, there's always room for improvement!",
              generatedAt: new Date().toISOString()
            }).returning();
            
            suggestions.push(fallbackSuggestion);
          }
        }

        const formattedSuggestions = suggestions.map(s => ({
          id: s.id,
          type: s.suggestionType,
          title: s.title,
          description: s.description,
          priority: s.priority,
          difficulty: s.difficulty,
          estimated_hours: s.estimatedHours,
          tags: s.tags ? JSON.parse(s.tags) : [],
          duck_wisdom: s.duckWisdom
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                repository: {
                  name: repository.repoName,
                  language: repository.language,
                  stars: repository.stars
                },
                suggestions: formattedSuggestions,
                generated_count: suggestions.length,
                duck_message: "🦆 Fresh ideas hatched! These suggestions are ready to make your code shine!"
              }, null, 2)
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error generating issue suggestions: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Resource: Generated Stories  
  server.resource(
    "stories://user/(.+)",
    "Generated stories for a user",
    async (uri: string) => {
      const username = uri.replace("stories://user/", "");
      
      try {
        const [user] = await db.select()
          .from(schema.githubUsers)
          .where(eq(schema.githubUsers.username, username));

        if (!user) {
          return {
            content: [
              {
                type: "text",
                text: `User ${username} not found`
              }
            ]
          };
        }

        const stories = await db.select()
          .from(schema.linkedinStories)
          .where(eq(schema.linkedinStories.githubUserId, user.id))
          .orderBy(desc(schema.linkedinStories.generatedAt))
          .limit(10);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                user: { username: user.username, id: user.id },
                stories: stories.map(story => ({
                  id: story.id,
                  title: story.storyTitle,
                  type: story.storyType,
                  personality: story.duckPersonality,
                  generated_at: story.generatedAt,
                  is_published: story.isPublished
                }))
              }, null, 2)
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching stories: ${error instanceof Error ? error.message : "Unknown error"}`
            }
          ]
        };
      }
    }
  );

  return server;
}

// MCP Server Endpoint
app.all("/mcp", async (c) => {
  const mcpServer = createMcpServer(c.env);
  const transport = new StreamableHTTPTransport();

  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ 
    status: "healthy", 
    service: "duckie-storyteller",
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get("/", (c) => {
  return c.json({
    message: "🦆 Welcome to Duckie Storyteller for GitHub!",
    description: "Transform your GitHub coding journeys into compelling LinkedIn stories with duck-themed personality",
    endpoints: {
      github: "/github/*",
      analysis: "/analysis/*", 
      stories: "/stories/*",
      ducks: "/ducks/*",
      mcp: "/mcp",
      health: "/health"
    }
  });
});

// OpenAPI specification
app.get("/openapi.json", c => {
  return c.json(createOpenAPISpec(app, {
    info: {
      title: "Duckie 2.0",
      version: "2.0.0",
      description: "Advanced MCP server that transforms GitHub coding journeys into compelling LinkedIn stories with duck-themed personality"
    },
  }));
});

// Fiberplane API explorer
app.use("/fp/*", createFiberplane({
  app,
  openapi: { url: "/openapi.json" }
}));

export default app;
