# AI settings

- **Preferred provider**: `openai` or `openrouter`. If both are configured, the other one is the fallback.
- **Ideal customer profile (ICP)**: free text that's included in the prompt and used to produce `icpScore`, `icpReason` and the lead's `fitScore`.

If neither provider has a key, AI enrichment is skipped. The fit score then comes from a deterministic heuristic based on company size, seniority, email quality and spam signals.
