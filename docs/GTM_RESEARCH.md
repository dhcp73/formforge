# FormForge → GTM: What to Build Next

_Research date: 5 Nov 2026. Prices are public list prices or widely reported third-party estimates; treat as directional._

## Executive summary

**Recommendation — build "FormForge Inbound" (codename Relay): an inbound revenue engine for SMB and mid-market teams.**
One pipeline from form submit → bot/fraud screen → enrichment waterfall with a hard spend cap → lead-to-account match and dedupe → routing + weighted round robin → instant booking on the right rep's calendar → CRM write-back (HubSpot, Attio, Salesforce) → speed-to-lead SLA alerts and self-reported attribution. API-first, MCP-native.

Why this one:
- **Speed-to-lead is still broken.** 939 B2B companies averaged a 47-hour lead response; only 23% reply within 5 minutes; teams that reply within 5 minutes close ~32% vs ~15% at 24h (Spara / Quo, 2025).
- **The incumbents are priced for enterprise.** Chili Piper starts at $15,000/yr, Default at $12,000/yr + $540/seat, LeanData ~$25,000+/yr, Qualified ~$35–70K/yr. Calendly routing is cheap ($16/seat) but rules-only and gates Salesforce lookup behind a $15K Enterprise plan.
- **FormForge already has ~70% of it**: branching, enrichment (Apollo, Clay, Valyu, OpenAI, OpenRouter), routing + round robin + owner stickiness, Google/Microsoft calendar booking, signed webhooks, API keys, MCP, health monitor.

**Runner-up 1 — "Ledger": a cost-capped enrichment and CRM hygiene layer.** BYOK waterfall with a per-record and per-month budget, preview-before-run, dedupe/merge, decay refresh. Pain: Clay's March 2026 Actions + Data Credits change (reviews cite $1,000 burned by an accidental re-run), data vendors rated 5.9/10 with 75% citing inaccuracy and 60% price.

**Runner-up 2 — "Signup Router": PLG signup qualification.** Screen fake/disposable signups, enrich, score as a product-qualified lead, route to sales or self-serve. Pocus was absorbed into Apollo and Common Room starts at $30,000/yr, leaving a gap for an API-first, developer-priced option.

## Pain-point map

| # | Pain | Who feels it | Why today's tools fail | Willingness to pay | Landscape | FormForge wedge |
|---|------|--------------|------------------------|--------------------|-----------|-----------------|
| 1 | Slow speed-to-lead | Demand gen, SDR managers, founders | Form → MAP → CRM → assignment hops; nights/weekends; no SLA | High (lost pipeline is measurable) | Chili Piper, Default, RevenueHero, Calendly | Strong: routing + booking on submit |
| 2 | Routing is fragile / wrong owner | RevOps | Rules live in 3 tools; no lead-to-account match below LeanData pricing | High | LeanData, Chili Piper Distro, Default | Strong: owner stickiness, domain rules |
| 3 | Junk & bot leads | Marketing ops, SDRs | CAPTCHA only; 15–40% of unprotected form traffic is bot/fake (various 2025 estimates) | Medium | Akismet, Turnstile, CleanTalk, ClearTrust | Strong: disposable-domain + enrichment checks |
| 4 | Enrichment cost unpredictable / inaccurate | RevOps, growth | Credit models, failed lookups billed, single-vendor gaps | High | Clay, Apollo, ZoomInfo, Breeze Intelligence | Strong: multi-provider + BYOK already built |
| 5 | Dirty CRM / duplicates | RevOps, sales leaders | 80% missing data, 75% duplicates (Openprise); no prevention at capture | High | Openprise, Insycle, Dedupely, RingLead | Medium: dedupe at capture |
| 6 | Attribution blind spots (dark funnel) | CMOs, demand gen | Pixels miss podcasts, communities, word of mouth | Medium | HockeyStack, Dreamdata, Factors | Medium: "How did you hear?" field + UTM capture |
| 7 | Demo no-shows | AEs, SDR managers | Median 13.5%, cold-booked 24%; generic reminders | Medium | RevenueHero, Chili Piper, Calendly | Medium: booking + reminder + prep brief |
| 8 | Tool sprawl & shelfware | RevOps, CFO | 23 vendors avg (GTM Partners); 45% have underused tools (State of RevOps 2025) | High in aggregate | Default, HubSpot, Clay | Strong: one engine replaces 3–5 tools |
| 9 | PLG signups ignored by sales | PLG founders, sales | PQL tools priced for enterprise; product data not in CRM | Medium–High | Pocus (Apollo), Common Room, Correlated | Strong: API + webhooks + enrichment |
| 10 | Reps spend 60% of time not selling | AEs | Research, notes, CRM updates (Salesforce State of Sales 2026) | High | Gong, Clari, Attio AI, Momentum | Medium: MCP + Valyu research briefs |
| 11 | Cold email deliverability | SDRs, agencies | Gmail/Yahoo/Microsoft bulk rules; spam rate < 0.3% | High, but crowded | Instantly, Smartlead, lemlist | Weak + ethics risk: avoid |
| 12 | Autonomous AI SDR disappointment | Sales leaders | Hallucinations, churn (11x lost 70–80% of early customers per TechCrunch) | Falling | 11x, Artisan, AiSDR | Weak: avoid; build human-in-the-loop only |
| 13 | Intent / visitor de-anonymisation accuracy and privacy | Marketing | Low person-level match, US-only, GDPR exposure | Medium | 6sense, Bombora, RB2B, Warmly | Weak + privacy risk: avoid |
| 14 | Agent-ready GTM data | RevOps, AI teams | CRMs now ship MCP (HubSpot, Salesforce, Attio) but inbound tools don't | Emerging | HubSpot, Attio, Salesforce MCP | Strong: FormForge MCP already exists |

## Opportunity scorecards (1–5; build size S/M/L)

| Opportunity | Pain | WTP | Wedge | Build | Moat risk | Verdict |
|---|---|---|---|---|---|---|
| **FormForge Inbound (Relay)** | 5 | 5 | 5 | M | Medium (Default, Chili Piper move down-market) | **Build now** |
| **Ledger: enrichment + hygiene** | 4 | 4 | 5 | M | Medium (Clay, Apollo) | Runner-up |
| **Signup Router (PLG/PQL)** | 4 | 4 | 4 | M | Low–Medium | Runner-up |
| Attribution lite (self-reported + UTM) | 3 | 3 | 4 | S | Medium | Add-on to Relay |
| No-show reducer + meeting prep brief | 3 | 3 | 4 | S | Medium | Add-on to Relay |
| Rep research copilot via MCP | 4 | 3 | 3 | M | High (CRMs building it) | Later |
| Composable CDP / reverse ETL | 3 | 4 | 1 | L | High (Hightouch, Fivetran Activations) | Avoid |
| Cold email sequencer | 3 | 4 | 1 | L | High + ethics | Avoid |
| Autonomous AI SDR | 2 | 2 | 2 | L | High + trust | Avoid |
| Visitor de-anonymisation | 3 | 3 | 1 | L | High + privacy | Avoid |

## Competitive matrix (Relay vs market)

| Capability | Relay (planned) | Chili Piper | Default | LeanData | Calendly Teams | Formspree/Formcarry |
|---|---|---|---|---|---|---|
| Entry price | $99–$499/mo target | $15,000/yr | $12,000/yr + seats | ~$25,000+/yr | $16/seat/mo | $5–$30/mo |
| Form backend / headless API | Yes | No | Partial | No | No | Yes |
| Branching forms | Yes | Basic | Yes | No | Routing forms | No |
| Enrichment waterfall + BYOK | Yes, spend cap | AI credits | 4-provider | No | No | No |
| Lead-to-account match | Yes (domain + owner) | Yes | Yes | Best-in-class | HubSpot/SF lookup | No |
| Weighted round robin | Yes | Yes | Yes | Yes | Yes | No |
| Instant booking | Yes | Yes | Yes | No | Yes | No |
| Bot / fake-lead screen | Yes | Limited | Limited | No | No | Spam filter |
| Speed-to-lead SLA alerts | Yes | Partial | Partial | Partial | No | No |
| MCP server + developer API | Yes | No public MCP | API | API | API | API |

## 90-day build sketch (Relay)

**Days 1–30 — Make the pipeline real**
- Persistent DB (Neon Postgres) to replace demo storage; multi-tenant workspaces.
- HubSpot + Attio CRM sync (create/update contact, company, owner; dedupe by email + domain). Salesforce via OAuth in phase 2.
- Bot screen: honeypot, timing, Turnstile, disposable domain, MX check, enrichment-mismatch score.
- Enrichment budget: per-record cap, monthly cap, dry-run preview, cache by domain for 30 days.

**Days 31–60 — Speed and booking**
- Speed-to-lead clock per lead; SLA rules (e.g. 5 minutes) with Slack/email escalation and re-assign.
- Lead-to-account matching (domain, subsidiaries list, existing owner) with an "explain this route" trace.
- Booking: reminders, reschedule links, no-show tracking, Valyu/OpenAI pre-meeting brief to the rep.
- Self-reported attribution field + UTM/first-touch capture.

**Days 61–90 — Prove ROI, ship to users**
- Inbound dashboard: response time, booked rate, no-show rate, cost per enriched lead, source mix.
- MCP tools: `route_lead`, `explain_route`, `get_sla_breaches`, `book_meeting`, `enrich_preview`.
- Embeddable JS snippet that upgrades any existing HTML / HubSpot / Webflow form.
- Billing (Stripe), usage metering, 5 design-partner teams, public launch.

Success metrics: median time-to-first-touch < 5 minutes for design partners; booked-from-form rate +20%; enrichment cost per lead visible and capped; zero routing to wrong owner on matched accounts.

## Risks and ethics

- **No spam tooling.** No bulk cold-email sender, mailbox rotation or warm-up to evade filters. Any email Relay sends is transactional (confirmation, reminder) or from a rep's own mailbox to someone who asked; honour one-click unsubscribe and Gmail/Yahoo/Microsoft sender rules.
- **Privacy.** Enrich only people who submitted a form or signed up; show a notice; support deletion; no person-level visitor de-anonymisation; GDPR/CCPA data processing terms; EU data region later.
- **Honest copy.** No fake urgency, fake government-style notices or scare messaging in templates (the JivOra "MoRTH archive" lesson applies).
- **Anti-bot without abuse.** Use bot screening to protect customers; never sell it as a way to bypass other sites' bot protection or scrape.
- **AI accuracy.** Research briefs are labelled AI-generated with sources; a human approves anything sent to a prospect.
- **Competitive risk.** Default and Chili Piper can drop prices; defend with developer-first API/MCP, transparent pricing and BYOK.
- **Provider dependency.** Apollo/Clay terms and pricing change (Clay's 2026 change); keep a multi-provider abstraction and an offline fallback.

## Sources

- Chili Piper pricing — https://www.chilipiper.com/pricing
- Default pricing — https://www.default.com/pricing ; comparison — https://www.default.com/comparison/chilipiper
- LeanData pricing — https://www.leandata.com/platform/pricing/ ; Vendr — https://www.vendr.com/marketplace/leandata
- Calendly pricing — https://calendly.com/pricing
- Speed to lead (939 B2B cos, 47h avg) — https://www.spara.com/blog/speed-to-lead ; close rates — https://www.quo.com/blog/lead-response-time/
- Hennessey 2025 lead form response study — https://hennessey.com/2025-lead-form-response-time-study/
- Clay credits docs — https://university.clay.com/docs/actions-data-credits ; Clay pricing change — https://www.clay.com/faq/what-is-changing ; review themes — https://reechee.io/complaints/clay ; community thread — https://community.clay.com/x/general/msg_6hWmtnT0nOiB/how-clays-new-actions-quota-severely-limits-high-v
- Q2 2025 RevOps survey (data vendor satisfaction 5.9/10) — https://8279915.fs1.hubspotusercontent-na2.net/hubfs/8279915/Q2%202025%20RevOps%20Survey%20Results/Executive%20Summary%20Survey%20Q2%20RevOps%20Survey_v7.pdf
- State of RevOps 2025 — https://21423273.fs1.hubspotusercontent-na1.net/hubfs/21423273/Guides%20and%20eBook%20PDFs/State%20of%20RevOps%202025.pdf
- Openprise data quality — https://www.openprisetech.com/blog/revops-data-quality-struggles
- MarketingOps RevOps stack — https://marketingops.com/is-your-tech-stack-helping-or-hurting-your-revops-in-2025/
- Salesforce State of Sales 2026 — https://www.salesforce.com/sales/state-of-sales/sales-statistics/
- Gartner rep-free buying (67%) — https://www.gartner.com/en/newsroom/press-releases/2026-03-09-gartner-sales-survey-finds-67-percent-of-b2b-buyers-prefer-a-rep-free-experience
- Gmail sender guidelines — https://support.google.com/mail/answer/81126 ; FAQ — https://support.google.com/mail/answer/14229414 ; Yahoo — https://senders.yahooinc.com/best-practices/
- 11x churn report — https://techcrunch.com/2025/03/24/a16z-and-benchmark-backed-11x-has-been-claiming-customers-it-doesnt-have/
- Demo no-show benchmarks — https://www.revenuehero.io/blog/ways-to-reduce-no-show-rates-in-sales-calls ; https://www.growthcab.com/b2b-meeting-show-rate-study
- Bot leads — https://heyflow.com/blog/global-ad-fraud-report/ ; https://www.leadgen-economy.com/blog/bot-detection-captcha-lead-forms-implementation/
- Self-reported attribution — https://www.hockeystack.com/lab-blog-posts/hockeystacks-sra-report-2024
- Pocus / Apollo — https://salesmotion.io/blog/pocus-pricing ; Common Room pricing — https://www.commonroom.io/pricing/
- Clearbit free tools sunset — https://clearbit.com/blog/the-future-of-clearbits-free-tools
- Fivetran acquires Census — https://www.fivetran.com/press/fivetran-signs-agreement-to-acquire-census-delivering-the-first-end-to-end-data-movement-platform-for-the-ai-era
- Gong pricing — https://www.avoma.com/blog/gong-pricing
- Qualified pricing — https://www.qualified.com/pricing ; Warmly pricing — https://www.warmly.ai/p/pricing
- Customer.io / Braze / Marketo — https://www.getvero.com/resources/iterable-vs-braze-vs-customer-io-full-comparison-guide/
- Cold email tools pricing — https://aiapphunters.com/blog/instantly-vs-lemlist-vs-smartlead-2026
- Form backend pricing — https://b59.link/articles/contact-form-tools-cost-free-alternative-formspree-typeform ; Typeform limits — https://fomr.io/blog/typeform-response-limit
- CRM MCP servers — https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server ; https://docs.attio.com/mcp/overview ; https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html
- RB2B / intent accuracy — https://gtmranked.com/tools/rb2b/
