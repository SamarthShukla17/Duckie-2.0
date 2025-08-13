import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, real, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const githubUsers = sqliteTable("github_users", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  githubId: integer("github_id").notNull().unique(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  location: text("location"),
  company: text("company"),
  blog: text("blog"),
  publicRepos: integer("public_repos"),
  followers: integer("followers"),
  following: integer("following"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (t) => [
  index("github_users_username_idx").on(t.username),
  index("github_users_github_id_idx").on(t.githubId),
]);

export const repositories = sqliteTable("repositories", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  githubUserId: integer("github_user_id").notNull().references(() => githubUsers.id),
  repoName: text("repo_name").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  language: text("language"),
  stars: integer("stars").default(0),
  forks: integer("forks").default(0),
  size: integer("size"),
  defaultBranch: text("default_branch").default("main"),
  isPrivate: integer("is_private", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  lastAnalyzed: text("last_analyzed"),
}, (t) => [
  index("repositories_github_user_id_idx").on(t.githubUserId),
  index("repositories_full_name_idx").on(t.fullName),
  index("repositories_language_idx").on(t.language),
]);

export const codeAnalysis = sqliteTable("code_analysis", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  repositoryId: integer("repository_id").notNull().references(() => repositories.id),
  filePath: text("file_path").notNull(),
  language: text("language"),
  linesOfCode: integer("lines_of_code"),
  complexityScore: real("complexity_score"),
  patternsDetected: text("patterns_detected", { mode: "json" }).$type<string[]>(),
  bugsFound: text("bugs_found", { mode: "json" }).$type<string[]>(),
  improvementsSuggested: text("improvements_suggested", { mode: "json" }).$type<string[]>(),
  analysisSummary: text("analysis_summary"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (t) => [
  index("code_analysis_repository_id_idx").on(t.repositoryId),
  index("code_analysis_language_idx").on(t.language),
]);

export const linkedinStories = sqliteTable("linkedin_stories", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  githubUserId: integer("github_user_id").notNull().references(() => githubUsers.id),
  repositoryId: integer("repository_id").notNull().references(() => repositories.id),
  storyTitle: text("story_title").notNull(),
  storyContent: text("story_content").notNull(),
  duckPersonality: text("duck_personality").notNull(),
  easterEggs: text("easter_eggs", { mode: "json" }).$type<string[]>(),
  engagementHooks: text("engagement_hooks", { mode: "json" }).$type<string[]>(),
  hashtags: text("hashtags", { mode: "json" }).$type<string[]>(),
  storyType: text("story_type", { enum: ["debugging", "feature", "refactor", "learning"] }).notNull(),
  generatedAt: text("generated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  isPublished: integer("is_published", { mode: "boolean" }).default(false),
}, (t) => [
  index("linkedin_stories_github_user_id_idx").on(t.githubUserId),
  index("linkedin_stories_repository_id_idx").on(t.repositoryId),
  index("linkedin_stories_story_type_idx").on(t.storyType),
  index("linkedin_stories_is_published_idx").on(t.isPublished),
]);

export const duckPersonalities = sqliteTable("duck_personalities", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  personalityTraits: text("personality_traits", { mode: "json" }).$type<string[]>(),
  catchphrases: text("catchphrases", { mode: "json" }).$type<string[]>(),
  storyStyle: text("story_style"),
  emojiSet: text("emoji_set", { mode: "json" }).$type<string[]>(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (t) => [
  index("duck_personalities_name_idx").on(t.name),
]);

export const issueSuggestions = sqliteTable("issue_suggestions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  repositoryId: integer("repository_id").notNull().references(() => repositories.id),
  suggestionType: text("suggestion_type", { enum: ["bug_fix", "feature", "improvement", "refactor", "documentation", "testing"] }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  difficulty: text("difficulty", { enum: ["beginner", "intermediate", "advanced"] }).notNull(),
  estimatedHours: integer("estimated_hours"),
  tags: text("tags"), // JSON array of relevant tags
  aiReasoning: text("ai_reasoning"), // Why the AI suggested this
  duckWisdom: text("duck_wisdom"), // Duck-themed advice about the suggestion
  githubIssueUrl: text("github_issue_url"), // If actually created as GitHub issue
  isImplemented: integer("is_implemented", { mode: "boolean" }).default(false),
  generatedAt: text("generated_at").notNull(),
  updatedAt: text("updated_at")
});

export const duckAssets = sqliteTable("duck_assets", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  assetName: text("asset_name").notNull(),
  assetType: text("asset_type", { enum: ["image", "gif", "emoji"] }).notNull(),
  r2Key: text("r2_key").notNull(),
  personalityId: integer("personality_id").references(() => duckPersonalities.id),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (t) => [
  index("duck_assets_asset_type_idx").on(t.assetType),
  index("duck_assets_personality_id_idx").on(t.personalityId),
]);

export const githubUsersRelations = relations(githubUsers, ({ many }) => ({
  repositories: many(repositories),
  linkedinStories: many(linkedinStories),
}));

export const repositoriesRelations = relations(repositories, ({ one, many }) => ({
  githubUser: one(githubUsers, {
    fields: [repositories.githubUserId],
    references: [githubUsers.id],
  }),
  codeAnalysis: many(codeAnalysis),
  linkedinStories: many(linkedinStories),
}));

export const codeAnalysisRelations = relations(codeAnalysis, ({ one }) => ({
  repository: one(repositories, {
    fields: [codeAnalysis.repositoryId],
    references: [repositories.id],
  }),
}));

export const linkedinStoriesRelations = relations(linkedinStories, ({ one }) => ({
  githubUser: one(githubUsers, {
    fields: [linkedinStories.githubUserId],
    references: [githubUsers.id],
  }),
  repository: one(repositories, {
    fields: [linkedinStories.repositoryId],
    references: [repositories.id],
  }),
}));

export const duckPersonalitiesRelations = relations(duckPersonalities, ({ many }) => ({
  assets: many(duckAssets),
}));

export const duckAssetsRelations = relations(duckAssets, ({ one }) => ({
  personality: one(duckPersonalities, {
    fields: [duckAssets.personalityId],
    references: [duckPersonalities.id],
  }),
}));
