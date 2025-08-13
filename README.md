🦆 Duckie 2.0 - GitHub Storytelling MCP Server
Transform your GitHub coding journey into compelling LinkedIn stories with duck-themed personality!

Duckie 2.0 is an advanced MCP (Model Context Protocol) server that analyzes GitHub repositories, generates AI-powered insights, creates engaging LinkedIn content, and provides actionable issue suggestions for developers.

Deploy to Cloudflare WorkersMCP Servern8n Ready

🚀 Features
🔍 GitHub Integration
Complete repository scraping and analysis
User profile synchronization
Commit history analysis
Code pattern detection
🤖 AI-Powered Analysis
Code complexity scoring using Cloudflare Workers AI
Bug detection and improvement suggestions
Pattern recognition across repositories
Duck-themed debugging assistance
📝 LinkedIn Story Generation
Automated story creation from coding activities
Multiple duck personalities (Rubber Duckie, Code Quacker, Debug Duck)
Customizable tones (professional, casual, humorous)
Engagement-optimized content with hashtags
💡 Issue Suggestions (NEW!)
AI-generated feature ideas and improvements
Bug fix suggestions based on code analysis
Difficulty-based recommendations (beginner to advanced)
Priority scoring and time estimates
Duck-themed wisdom for each suggestion
🔌 n8n Workflow Integration
MCP server endpoint for direct integration
REST API endpoints for HTTP requests
Webhook support for automated triggers
Perfect for hackathon projects and automation
🌐 Live Demo
🔗 Live URL: https://duckie-story-generator-775owf.fp.dev
🔌 MCP Endpoint: https://duckie-story-generator-775owf.fp.dev/mcp

📚 API Endpoints
GitHub Integration
POST /api/github/scrape              # Scrape user repositories
GET  /api/github/user/:username/repositories  # Get repository list
GET  /api/github/user/:username/status        # Check scraping status
AI Analysis
POST /api/analysis/code-patterns     # Analyze code patterns
POST /api/analysis/debug-suggestions # Get debugging help
Issue Suggestions ✨
POST /api/suggestions/generate       # Generate AI-powered issue suggestions
GET  /api/suggestions/repository/:repo_id    # Get suggestions for a repository
PUT  /api/suggestions/:id/implement  # Mark suggestion as implemented
Story Generation
POST /api/stories/generate           # Create LinkedIn stories
GET  /api/stories/:username          # Get user's stories
GET  /api/stories/:id/preview        # Preview story with assets
Duck Assets
GET /api/ducks/avatar/:personality   # Get duck avatars
GET /api/ducks/personality/:name     # Get personality details
🛠️ MCP Tools
Connect to the MCP server to access these tools:

analyze_github_repo
Analyze a GitHub repository and extract insights.

{
  "username": "microsoft",
  "repo_name": "vscode",
  "branch": "main"
}
generate_linkedin_story
Create duck-themed LinkedIn posts from GitHub data.

{
  "username": "microsoft",
  "repo_name": "vscode", 
  "story_type": "feature",
  "duck_personality": "Code Quacker",
  "tone": "professional"
}
generate_issue_suggestions ✨
Generate AI-powered feature ideas and improvements.

{
  "username": "microsoft",
  "repo_name": "vscode",
  "suggestion_types": ["feature", "improvement"],
  "difficulty_levels": ["intermediate", "advanced"],
  "max_suggestions": 5
}
get_duck_personality
Get details about duck personalities.

{
  "name": "Code Quacker"
}
debug_code_snippet
Get AI-powered debugging assistance.

{
  "code": "function buggyCode() { return undefined.property; }",
  "language": "javascript",
  "context": "This function crashes when called"
}
🦆 Duck Personalities
Duck	Personality	Specialty
🦆 Rubber Duckie	Classic debugging companion	Methodical problem-solving
🦆 Code Quacker	Clean code enthusiast	Best practices & refactoring
🦆 Debug Duck	Bug-hunting specialist	Error detection with humor
Each personality has unique traits, catchphrases, and storytelling styles!

🔧 n8n Integration Examples
1. Daily Developer Digest
graph LR
    A[Schedule Daily] --> B[HTTP: Analyze Repo]
    B --> C[Generate Story]
    C --> D[Post to LinkedIn]
2. Issue Suggestion Workflow
graph LR
    A[GitHub Webhook] --> B[Analyze Repository]
    B --> C[Generate Suggestions]
    C --> D[Create GitHub Issues]
3. Team Insights Dashboard
graph LR
    A[Schedule Weekly] --> B[Loop Team Repos]
    B --> C[Generate Insights]
    C --> D[Send to Slack]
🏗️ Technology Stack
Runtime: Cloudflare Workers
API Framework: Hono.js
Database: Cloudflare D1 with Drizzle ORM
AI: Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
Storage: Cloudflare R2 for assets
GitHub Integration: Octokit REST API
MCP: @modelcontextprotocol/sdk
🎯 Perfect for n8n Challenge
Duckie 2.0 is designed specifically for the n8n + Cloudflare Workers challenge:

✅ MCP Server: Direct integration with n8n MCP client
✅ REST API: HTTP request nodes for all endpoints
✅ Webhooks: Automated workflow triggers
✅ AI-Powered: Cloudflare Workers AI integration
✅ Real Value: Transforms boring GitHub data into engaging content
✅ Unique Theme: Duck-themed storytelling stands out

🚀 Getting Started
For n8n Users
Connect MCP Server: Use https://duckie-story-generator-775owf.fp.dev/mcp
Analyze Repository: Call analyze_github_repo tool
Generate Content: Use generate_linkedin_story or generate_issue_suggestions
Build Workflows: Create n8n automations with the tools
For Developers
Clone Repository: git clone [your-repo-url]
Install Dependencies: npm install
Set Environment Variables: Add GITHUB_TOKEN
Deploy: Use Fiberplane Codegen or Wrangler
📊 Database Schema
The system uses Cloudflare D1 with the following tables:

github_users - User profiles and metadata
repositories - Repository information and stats
code_analysis - AI analysis results and patterns
issue_suggestions - Generated feature ideas and improvements
linkedin_stories - Generated stories and content
duck_personalities - Duck character configurations
duck_assets - Duck-themed visual assets
🏆 Why Duckie 2.0 Wins
🦆 Unique Concept: Duck-themed GitHub storytelling
🔗 Complete Integration: MCP + REST + Webhooks
🤖 AI-Powered: Smart analysis and content generation
💡 Actionable Insights: Issue suggestions provide real value
✨ Professional Polish: Comprehensive database and error handling
🚀 n8n Ready: Built specifically for workflow automation
🦆 Duck Wisdom
"Every great feature starts with a quack of inspiration!"
— Code Quacker

"Debug with persistence, code with joy!"
— Debug Duck

"Clean code is happy code!"
— Rubber Duckie

🤝 Contributing
Fork the repository
Create a feature branch (git checkout -b feature/amazing-feature)
Commit your changes (git commit -m 'Add amazing feature')
Push to the branch (git push origin feature/amazing-feature)
Open a Pull Request
📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

🙏 Acknowledgments
Built for the n8n + Cloudflare Workers Challenge
Powered by Fiberplane Codegen
Inspired by rubber duck debugging methodology
Special thanks to the duck community 🦆
Ready to transform your GitHub journey into compelling stories? Let Duckie 2.0 help you quack the code! 🦆✨
