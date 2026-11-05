# OpenRouter

[OpenRouter](https://openrouter.ai) lets you run AI enrichment on any model, including Claude, Llama, Gemini and GPT. FormForge uses `@openrouter/ai-sdk-provider` with the Vercel AI SDK's `generateText` with `Output.object`, so the schema and behaviour are the same as for [OpenAI](/docs/integrations/openai).

- Default model: `openai/gpt-4o-mini`. You can use any OpenRouter model id, for example `anthropic/claude-3.5-haiku`.
- Set it as the **preferred** provider in [AI settings](/docs/integrations/ai), or leave it as the fallback for OpenAI.
- **Test connection** calls `GET https://openrouter.ai/api/v1/key`.
- Env: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
