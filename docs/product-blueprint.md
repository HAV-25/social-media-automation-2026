# AI Social Content Engine
## Phase 1 Product and Implementation Blueprint

**Document status:** Build-ready Phase 1 specification
**Primary output:** Evidence-backed social posts with generated images
**Primary platform:** Facebook
**Architecture:** Next.js + Supabase + n8n + OpenAI
**Implementation method:** Codex-generated repository and importable n8n workflows

---

## 1. Executive Decision

Phase 1 should not be built entirely inside n8n.

The recommended structure is:

- **Next.js application:** Dashboard, content editor and brand management.
- **Supabase:** Authentication, database, storage, permissions and application state.
- **n8n:** RSS monitoring, ingestion, research orchestration, generation pipelines and retries.
- **OpenAI Responses API:** Research, source analysis, structured generation, evaluation and factchecking.
- **GPT Image:** Base-image generation.
- **Deterministic image compositor:** Logos, typography, headlines and branded layouts.
- **Codex:** Builds and maintains the application, migrations, workflows, tests and documentation.

This creates a real internal product rather than a collection of loosely connected automations.

Codex is well suited to this approach because it can work inside configured repository environments, apply reusable Skills, implement end-to-end changes and run parallel engineering tasks. OpenAI has also documented an agent-first software project in which Codex produced application logic, tests, CI, documentation and internal tooling under human direction.

---

## 2. Product Definition

The product transforms source material into original, authoritative and highly shareable social content packages.

Each package contains:

1. A finished social post.
2. A generated or composed image.
3. Alternative hooks.
4. The selected content style.
5. Internal source references.
6. Fact and confidence information.
7. Performance-quality scores.
8. Copy and download actions.
9. Regeneration and editing controls.

The system should optimize for:

- Strong attention capture.
- High information value.
- Original framing.
- Audience relevance.
- Emotional or intellectual resonance.
- Discussion potential.
- Shareability.
- Brand authority.
- Factual reliability.

The product must not claim that it can guarantee virality. Its promise is to systematically improve the characteristics associated with stronger social performance.

---

## 3. Phase 1 Operating Assumptions

### 3.1 Users

Phase 1 is an internal application for:

- One organization.
- Multiple internal brands.
- Administrators, editors and reviewers.
- No external clients.
- No billing or subscription system.

### 3.2 Platforms

**Required**

- Facebook-ready text.
- Facebook-ready image.
- Copy text.
- Download image.

**Architecture-ready but not required for initial acceptance**

- Instagram captions.
- Threads posts.
- LinkedIn posts.
- X posts and threads.

All content should carry a platform field from the beginning so platform adapters can be introduced without changing the core data model.

### 3.3 Language

- English-first interface and generation.
- Brand-level output-language setting.
- Database and prompt contracts must support multilingual generation.

### 3.4 Review model

- No automatic publishing.
- No automatic scheduling.
- Every post remains editable.
- Every post requires human selection before external use.

### 3.5 Suggested initial operating limits

These should be configurable rather than hard-coded:

- Up to 20 internal brands.
- Up to 100 active RSS feeds.
- Up to 1,000 ingested feed items per day.
- Up to 50 one-off submissions per day.
- Up to three post variants per approved opportunity.
- Up to four image-style presets per brand.

---

## 4. Core Product Principles

### 4.1 Evidence before writing

The system must build an evidence package before it writes a finished post.

It must not:

- Invent statistics.
- Add unattributed factual claims.
- Treat an opinion as an established fact.
- Use outdated information as current.
- Copy large portions of source wording.
- Allow a persuasive writing model to become its own fact-checker.

### 4.2 Deterministic orchestration, agentic intelligence

Use normal software logic for:

- Status transitions.
- Permissions.
- File processing.
- Thresholds.
- Deduplication rules.
- Retry logic.
- Database writes.
- Output validation.

Use AI agents for:

- Understanding the significance of a source.
- Identifying valuable angles.
- Planning research.
- Synthesizing evidence.
- Writing.
- Critiquing.
- Reframing.
- Developing visual concepts.

Do not create one uncontrolled "super-agent" responsible for the entire pipeline.

### 4.3 Brand memory

Every generation must be grounded in:

- Brand audience.
- Content pillars.
- Brand positioning.
- Approved tone.
- Restricted topics.
- Previous published content.
- Positive examples.
- Negative examples.
- Preferred calls to action.
- Visual identity.

### 4.4 Explainable scoring

The dashboard must show why a source or post scored highly.

Avoid presenting only an opaque "viral score."

### 4.5 Human control

Users must be able to:

- Change the selected angle.
- Change the content style.
- Change tone.
- Regenerate only the hook.
- Regenerate only the body.
- Shorten or expand the post.
- Correct a claim.
- exclude a source.
- Change the image concept.
- Regenerate the image without rewriting the post.

---

## 5. Brand Workspace

Each internal brand receives an isolated workspace.

### 5.1 Brand profile

Required fields:

- Brand name.
- Description.
- Website.
- Primary audience.
- Audience knowledge level.
- Audience problems.
- Brand positioning.
- Content pillars.
- Topics to avoid.
- Competitors or comparison brands.
- Default output language.
- Default platform.
- Default call-to-action style.
- Geographic relevance.
- Political or regulatory sensitivity.
- Risk tolerance.
- Maximum post length.
- Emoji preference.
- Hashtag preference.

### 5.2 Voice profile

Store structured settings rather than relying on a paragraph alone:

- Formality: 1–5.
- Energy: 1–5.
- Directness: 1–5.
- Humor: 1–5.
- Emotionality: 1–5.
- Technical depth: 1–5.
- Contrarian intensity: 1–5.
- Sentence length preference.
- Paragraph length preference.
- Use of questions.
- Use of first-person voice.
- Preferred vocabulary.
- Disallowed expressions.
- Common opening patterns to avoid.

### 5.3 Brand examples

Users can provide:

- Five to twenty approved posts.
- Posts that performed well.
- Posts that did not fit the brand.
- Preferred images.
- Visual identity references.

These examples should be embedded and retrieved during generation, but they should not be pasted indiscriminately into every prompt.

---

## 6. Product Interface

### 6.1 Main navigation

1. Content Inbox
2. Ready Posts
3. Create
4. Sources
5. Brands
6. Styles
7. Runs and Errors
8. Settings

### 6.2 Content Inbox

The Content Inbox is the operational homepage.

Each opportunity card displays:

- Source title.
- Source type.
- Source publication date.
- Brand.
- Topic.
- Opportunity score.
- Recommended content style.
- Reason the item matters.
- Number of corroborating sources.
- Duplicate or cluster status.
- Current pipeline status.
- Generate or review action.

Filters:

- Brand.
- Source type.
- Topic.
- Date.
- Score.
- Status.
- Content style.
- Feed.
- Risk level.

### 6.3 Create screen

The user can submit:

- A URL.
- A PDF.
- A text document.
- A pasted transcript.
- A transcript file.
- A pasted article.
- A pasted social post.
- A social-post URL plus pasted content.
- General notes or an original idea.

Generation options:

- Target brand.
- Platform.
- Content style.
- Tone.
- Number of variants.
- Image style.
- Research depth.
- Desired call to action.
- Post length.
- Additional instructions.

### 6.4 Opportunity detail

Show:

- Source preview.
- Extracted key facts.
- Key lessons.
- Newsworthiness analysis.
- Audience relevance.
- Related source cluster.
- Research sources.
- Claims ledger.
- Suggested angles.
- Risk flags.
- Generate controls.

### 6.5 Post review screen

The review screen should contain:

- Editable post text.
- Image preview.
- Hook alternatives.
- Content-style label.
- Quality-score breakdown.
- Claims and sources.
- Similarity warning.
- Brand-fit warning.
- Copy button.
- Download image.
- Download package.
- Regenerate controls.
- Approve, reject and archive actions.

---

## 7. Input Layer

### 7.1 RSS feeds

Each feed configuration requires:

- Feed name.
- RSS URL.
- Assigned brand or brands.
- Topic tags.
- Source-authority rating.
- Poll frequency.
- Included keywords.
- Excluded keywords.
- Minimum opportunity score.
- Generation policy.
- Maximum auto-generated posts per day.
- Active or paused status.

**Generation policies**

Each feed can use one of three modes:

1. **Opportunity only** — Ingest and score, but do not generate.
2. **Best style** — Generate one post using the most appropriate style.
3. **All styles** — Generate News, Education and Perspective variants.

n8n provides a native RSS Feed Trigger, supports reusable sub-workflows, workflow JSON import and error workflows. Queue mode can be introduced when processing volume requires additional workers.

### 7.2 One-off sources

**URL**

The system should:

1. Fetch the page.
2. Extract readable article content.
3. Record canonical URL.
4. Record title, author and publication date where available.
5. Preserve the raw extraction.
6. Store a normalized text version.

**PDF**

The system should:

1. Upload the original file to Supabase Storage.
2. Extract page-level text.
3. Retain page numbers.
4. Identify headings and sections.
5. Chunk the text.
6. Store the extracted document.
7. Flag extraction failures.

Scanned PDFs requiring extensive OCR may be marked for manual handling during Phase 1.

**Video transcript**

Phase 1 accepts:

- Pasted transcripts.
- TXT, DOCX, PDF or subtitle transcript files.
- Transcript text obtained through an authorized external source.

Downloading and transcribing arbitrary videos is not required for Phase 1.

**Social post**

Because some social networks restrict automated access, the reliable Phase 1 input should be:

- Pasted post content.
- Optional source URL.
- Optional screenshot.
- Optional engagement information entered by the user.

**Plain text and notes**

Users can submit an original observation, internal memo or rough idea without an external source.

The system must label this as `source_type = original_input` and avoid implying external verification unless research is subsequently performed.

---

## 8. Ingestion and Normalization

All inputs become a normalized `source_document`.

Required normalized properties:

- Source ID.
- Brand IDs.
- Source type.
- Original URL.
- Canonical URL.
- Title.
- Author.
- Publisher.
- Publication timestamp.
- Ingestion timestamp.
- Raw text.
- Clean text.
- Language.
- Topic tags.
- Named entities.
- Content hash.
- Embedding.
- Rights or usage notes.
- Extraction confidence.
- Processing status.

### 8.1 Deduplication

Use three layers:

1. **Exact duplication**
   - Canonical URL.
   - Source GUID.
   - Content hash.
2. **Near duplication**
   - Normalized-title similarity.
   - Text embedding similarity.
   - Shared named entities and event date.
3. **Event clustering**
   - Multiple publications covering the same development.
   - Stored as one content cluster with several sources.

Event clustering is especially important for RSS feeds. Five articles about the same announcement should generally become one stronger research opportunity, not five repetitive posts.

---

## 9. Content Intelligence Pipeline

### Stage 1: Extract

Produce a structured source analysis containing:

- One-sentence summary.
- Primary event or lesson.
- Important people and organizations.
- Dates.
- Numbers.
- Claims.
- Quotable ideas expressed as paraphrases.
- Uncertainties.
- Potential audience relevance.
- Possible risks.

### Stage 2: Classify

Classify the source as one or more of:

- Breaking development.
- Emerging trend.
- Major announcement.
- Research finding.
- Data insight.
- Tactical guide.
- Strategic lesson.
- Case study.
- Contrarian argument.
- Human story.
- Opinion.
- Evergreen reference.
- Low-value or promotional material.

### Stage 3: Score the opportunity

Calculate the opportunity dimensions described in Section 12.

### Stage 4: Cluster

Check whether:

- The development already exists in the database.
- Other sources corroborate it.
- The brand has recently covered the topic.
- The proposed angle resembles a previous post.

### Stage 5: Select the value nucleus

The system must identify the single most valuable nucleus from the source:

- The most consequential development.
- The most surprising fact.
- The strongest lesson.
- The most useful framework.
- The most meaningful implication.
- The most emotionally resonant human detail.

This prevents the finished post from becoming a generic summary of the entire source.

### Stage 6: Plan research

Generate a bounded research plan:

- What must be verified?
- What background would improve understanding?
- Which statistics would add real value?
- What opposing perspective is relevant?
- What primary sources may exist?
- What context is unnecessary?

### Stage 7: Research

Use web search to gather:

- Primary sources.
- Official announcements.
- Original studies.
- Credible reporting.
- Historical context.
- Relevant statistics.
- Contradictory evidence.

The OpenAI Responses API supports integrated web search with source information, while Structured Outputs and strict function schemas can enforce predictable machine-readable research records.

### Stage 8: Build the evidence package

The evidence package contains:

- Verified claims.
- Supporting sources.
- Publication dates.
- Source type.
- Confidence level.
- Conflicting information.
- Claims that must not be used.
- Optional context.
- Recommended caveats.

### Stage 9: Generate angles

Generate five to seven potential angles.

Every angle contains:

- Angle title.
- Core thesis.
- Intended reader reaction.
- Content style.
- Main supporting evidence.
- Originality assessment.
- Brand relevance.
- Risk.
- Suggested hook direction.

Rank the angles and retain the best three.

### Stage 10: Write

Generate post candidates using:

- Evidence package.
- Selected angle.
- Brand profile.
- Retrieved brand examples.
- Platform specification.
- Content-style specification.
- Tone overlay.
- Previous-content exclusions.

### Stage 11: Critique

A separate evaluator reviews:

- Hook strength.
- Value density.
- Originality.
- Readability.
- Evidence.
- Brand fit.
- Repetition.
- Exaggeration.
- Unsupported certainty.
- Unnecessary length.
- Call-to-action quality.

### Stage 12: Revise

The writer receives only actionable critique and produces a revised version.

Limit automatic revision to two passes.

### Stage 13: Verify

The final verifier maps factual sentences back to the claims ledger.

Any unsupported material must be:

- Removed.
- Softened.
- Marked as interpretation.
- Sent for manual review.

### Stage 14: Create image

Generate the visual concept, create the base image and apply deterministic brand composition.

### Stage 15: Publish to dashboard

The completed package receives the status `ready_for_review`.

---

## 10. Content Styles

Content style and tone should be treated as separate controls.

### Style A: Newsworthy Authority

**Purpose**

Turn a development into the clearest and most compelling explanation of:

- What happened.
- Why it matters.
- Who it affects.
- What changes next.
- What most coverage is missing.

**Typical structure**

1. High-impact opening.
2. Clear statement of the development.
3. Critical facts.
4. Context.
5. Implications.
6. Distinctive interpretation.
7. Discussion-oriented close.

**Best suited for**

- Announcements.
- Regulatory developments.
- Product launches.
- Market changes.
- Research releases.
- Industry news.
- Emerging trends.

**Avoid**

- Rewriting the headline.
- Empty urgency.
- "Breaking news" language for old information.
- Generic summary.
- Unsupported predictions.

### Style B: Educational Breakdown

**Purpose**

Extract the strongest learning value and turn it into a practical lesson, explanation or framework.

**Typical structure**

1. Problem or misconception.
2. Key lesson.
3. Explanation.
4. Framework, steps or examples.
5. Application.
6. Memorable takeaway.
7. Optional save/share prompt.

**Best suited for**

- Guides.
- PDFs.
- Reports.
- Long-form articles.
- Video transcripts.
- Case studies.
- Research.
- Internal expertise.

**Avoid**

- Excessive bullet lists.
- Obvious advice.
- Repeating the source's table of contents.
- Teaching without a clear application.

### Style C: Perspective and Conversation

This is the recommended third style.

**Purpose**

Turn source material into a distinctive point of view that encourages reflection, agreement, disagreement or conversation.

It should feel like an intelligent person interpreting the development—not like an automated news summary.

**Typical structure**

1. Surprising, provocative or human opening.
2. Clear perspective.
3. Supporting evidence or story.
4. Tension, contradiction or overlooked implication.
5. Balanced qualification.
6. Strong concluding thought.
7. Natural conversation question where appropriate.

**Best suited for**

- Contrarian insight.
- Founder or expert commentary.
- Human stories.
- Cultural developments.
- Strategic implications.
- Common misconceptions.
- Topics where interpretation is more valuable than summary.

**Avoid**

- Manufactured outrage.
- Polarization for its own sake.
- Unsupported hot takes.
- Engagement bait.
- False certainty.

---

## 11. Tone Overlays

A content style determines the post's strategic structure. A tone overlay determines how it sounds.

Phase 1 tone presets:

1. **Authoritative**
   - Confident.
   - Precise.
   - Calm.
   - Evidence-led.
2. **Conversational**
   - Natural.
   - Accessible.
   - Human.
   - Less formal.
3. **Bold**
   - Direct.
   - High-energy.
   - Strong viewpoint.
   - Shorter sentences.
4. **Thoughtful**
   - Reflective.
   - Nuanced.
   - Emotionally intelligent.
   - Avoids exaggeration.
5. **Witty**
   - Intelligent humor.
   - Light irony.
   - Never flippant about serious topics.

A brand can have one default overlay, but users can override it per generation.

---

## 12. Scoring System

### 12.1 Opportunity score

Score each source or cluster from 0 to 100.

| Dimension | Weight |
| --- | --- |
| News or learning value | 18 |
| Audience relevance | 16 |
| Consequence or usefulness | 14 |
| Novelty | 12 |
| Evidence strength | 12 |
| Shareability | 10 |
| Conversation potential | 8 |
| Brand-authority fit | 6 |
| Timeliness | 4 |
| **Total** | **100** |

Apply a separate risk penalty of 0–30.

**Suggested thresholds**

- 85–100: Priority opportunity.
- 72–84: Strong opportunity.
- 58–71: Review before generation.
- Below 58: Store but do not generate automatically.

### 12.2 Draft-quality score

| Dimension | Weight |
| --- | --- |
| Value density | 18 |
| Hook strength | 15 |
| Evidence and credibility | 15 |
| Originality | 14 |
| Audience relevance | 12 |
| Clarity and readability | 10 |
| Brand fit | 8 |
| Emotional or intellectual resonance | 5 |
| Closing quality | 3 |
| **Total** | **100** |

**Minimum readiness rules**

A post cannot become `ready_for_review` when:

- Evidence score is below 70.
- Brand fit is below 65.
- Any high-risk claim is unsupported.
- Similarity with a recent brand post exceeds the configured limit.
- The post contains prohibited phrases or claims.
- The verifier detects a factual contradiction.

### 12.3 Performance labels

Instead of displaying "This will go viral," show:

- Strong share potential.
- Strong discussion potential.
- High save value.
- High authority value.
- High emotional resonance.
- Strong timeliness.
- Needs a stronger hook.
- Too similar to recent content.

---

## 13. Research and Fact-Checking Rules

### 13.1 Source hierarchy

Prefer sources in this order:

1. Primary official source.
2. Original research or dataset.
3. Regulatory or governmental source.
4. Direct company or institutional announcement.
5. High-quality established reporting.
6. Credible specialist publication.
7. Secondary commentary.
8. Social posts and unverified claims.

### 13.2 Claim states

Every factual claim has one of these states:

- `verified`
- `supported`
- `single_source`
- `disputed`
- `interpretation`
- `unverified`
- `rejected`

### 13.3 Verification rules

- Time-sensitive claims require a recent source.
- Important numerical claims should use an original or authoritative source where possible.
- High-impact claims should ideally have two independent sources.
- Interpretations must be written as interpretations.
- Conflicting information must be surfaced.
- A source being repeated by many websites does not make it independently corroborated.
- Generated quotations are prohibited.
- Direct quotations may only be used when the exact wording exists in a recorded source.

### 13.4 Internal citation ledger

The finished Facebook post does not need academic-style inline citations.

However, the dashboard must retain:

- Claim.
- Supporting URL.
- Source title.
- Publisher.
- Publication date.
- Retrieved date.
- Relevant source excerpt.
- Confidence.
- Whether the claim appears in the final post.

Users can optionally add a short "Source" line to the copied output.

---

## 14. Image System

Images must be treated as a structured creative system, not as an afterthought.

### 14.1 Image Style 1: Editorial Hero

- One strong visual subject.
- Editorial composition.
- Premium photography or illustration feel.
- Minimal or no text.
- Suitable for news and perspective posts.

### 14.2 Image Style 2: Insight Card

- Strong central number, fact or insight.
- Branded typography.
- Clean visual hierarchy.
- Supporting visual or abstract background.
- Suitable for education and data-led posts.

### 14.3 Image Style 3: Conceptual Illustration

- Visual metaphor for the core idea.
- Distinctive editorial illustration.
- Avoids generic stock-photo aesthetics.
- Suitable for abstract, strategic and future-facing subjects.

### 14.4 Image Style 4: Branded Headline Card

- Short headline.
- Brand colors and fonts.
- Logo.
- Simple supporting graphic.
- Optimized for consistency and rapid production.

### 14.5 Image-generation workflow

1. Extract the visual nucleus.
2. Determine whether a literal or conceptual image is stronger.
3. Generate three visual concepts.
4. Rank concepts for relevance, originality and clarity.
5. Create the base image.
6. Validate the image.
7. Add text, logo and layout through deterministic software.
8. Save source and final versions.

The latest OpenAI image model documented for API use is GPT Image 2, which supports generation, editing, flexible dimensions and image inputs.

### 14.6 Deterministic typography

Do not rely on the image model to produce final branded typography.

Use:

- Satori or an equivalent HTML-to-SVG renderer.
- Resvg.
- Sharp.
- Brand font files stored securely.
- Predefined layout templates.
- Safe text-length rules.

The image model creates the visual background or illustration. Application code adds:

- Headline.
- Statistic.
- Logo.
- Source label.
- Brand elements.

This provides consistent spelling, alignment and visual identity.

### 14.7 Image validation

Check for:

- Incorrect text inside the generated base image.
- Deformed hands or faces.
- Misleading representations of real events.
- Logos or protected characters.
- Irrelevant visual elements.
- Unsafe imagery.
- Unintended political or cultural symbolism.
- Poor focal placement.
- Insufficient contrast for overlays.

---

## 15. Technical Architecture

### 15.1 Frontend

Recommended stack:

- Next.js.
- TypeScript.
- App Router.
- Tailwind CSS.
- Accessible component library.
- React Hook Form.
- Zod.
- Server Actions or typed API routes.
- TanStack Query only where server-rendered data is insufficient.

### 15.2 Supabase

Use Supabase for:

- PostgreSQL database.
- Authentication.
- Row Level Security.
- File storage.
- Realtime status updates.
- Database webhooks where useful.
- Database migrations.
- Application audit records.

Supabase provides a full PostgreSQL database alongside Auth, Storage, Realtime and Edge Functions. Its pgvector integration supports embedding storage and semantic similarity, while Row Level Security can be applied to vector retrieval.

### 15.3 n8n

n8n owns workflow orchestration, not core application state.

Responsibilities:

- RSS polling.
- Scheduled feed runs.
- Manual-ingestion callbacks.
- Extraction orchestration.
- Research orchestration.
- AI processing calls.
- Image-processing orchestration.
- Retries.
- Notifications.
- Failure workflows.
- Operational logging.

All durable state must be written to Supabase.

### 15.4 Application AI gateway

Create an internal AI service package that:

- Selects models.
- Applies prompt versions.
- Validates outputs.
- Records token and tool usage.
- Handles retries.
- Supports provider replacement.
- Disables direct model access from the browser.
- Redacts secrets.
- Logs response IDs and model snapshots.
- Supports test doubles.

n8n should call this controlled service rather than contain large prompts in many individual workflow nodes.

### 15.5 Model routing

As of July 2026, OpenAI recommends GPT-5.6 Sol for complex professional work, Terra for balanced cost and intelligence, and Luna for cost-sensitive high-volume workloads. The family supports the Responses API, structured outputs, tool use and image input.

Recommended routing:

| Task | Default model |
| --- | --- |
| Language detection | GPT-5.6 Luna |
| Metadata extraction | GPT-5.6 Luna |
| Initial classification | GPT-5.6 Luna |
| Opportunity scoring | GPT-5.6 Terra |
| Research planning | GPT-5.6 Terra |
| Research synthesis | GPT-5.6 Terra |
| Complex or disputed synthesis | GPT-5.6 Sol |
| Angle generation | GPT-5.6 Terra |
| Initial writing | GPT-5.6 Terra |
| Priority final writing | GPT-5.6 Sol |
| Draft critique | GPT-5.6 Terra |
| Claim verification | GPT-5.6 Terra |
| Embeddings | text-embedding-3-small |
| Higher-precision brand retrieval | text-embedding-3-large |
| Image generation | GPT Image 2 |
| Safety classification | omni-moderation |

The model router must use configuration variables so individual models can be replaced without rewriting workflows.

### 15.6 Background processing

Phase 1 can begin with standard n8n executions.

Introduce n8n queue mode when:

- RSS volume grows significantly.
- Several image jobs run concurrently.
- Research jobs cause long execution queues.
- Workflows require independent worker scaling.

---

## 16. Database Model

### 16.1 Identity and organization

**organizations**

- id
- name
- created_at

**profiles**

- id
- user_id
- display_name
- role
- created_at

**organization_members**

- organization_id
- user_id
- role

### 16.2 Brands

**brands**

- id
- organization_id
- name
- slug
- description
- website
- default_language
- default_platform
- status

**brand_profiles**

- brand_id
- audience_definition
- positioning
- content_pillars
- restricted_topics
- cta_preferences
- geographic_focus
- risk_tolerance
- voice_settings
- generation_defaults

**brand_examples**

- id
- brand_id
- example_type
- content
- performance_notes
- embedding
- approved

**brand_assets**

- id
- brand_id
- asset_type
- storage_path
- metadata

### 16.3 Sources

**rss_feeds**

- id
- brand_id
- name
- feed_url
- topic_tags
- authority_score
- generation_policy
- minimum_score
- daily_generation_limit
- active
- last_polled_at

**source_documents**

- id
- organization_id
- source_type
- canonical_url
- title
- author
- publisher
- published_at
- raw_text
- clean_text
- language
- content_hash
- embedding
- storage_path
- extraction_confidence
- status

**source_brand_links**

- source_document_id
- brand_id
- relevance_score
- routing_reason

**source_chunks**

- id
- source_document_id
- page_number
- section
- content
- embedding

### 16.4 Intelligence

**content_clusters**

- id
- cluster_type
- canonical_topic
- event_date
- embedding
- status

**cluster_sources**

- cluster_id
- source_document_id
- relationship_type

**opportunities**

- id
- brand_id
- source_document_id
- cluster_id
- value_nucleus
- recommended_style
- opportunity_score
- risk_penalty
- score_breakdown
- status

**research_runs**

- id
- opportunity_id
- research_plan
- status
- started_at
- completed_at
- cost_metadata

**research_sources**

- id
- research_run_id
- url
- title
- publisher
- published_at
- source_type
- authority_score
- relevant_excerpt

**claims**

- id
- research_run_id
- claim_text
- claim_type
- verification_state
- confidence
- risk_level

**claim_sources**

- claim_id
- research_source_id
- support_type

### 16.5 Generation

**angles**

- id
- opportunity_id
- title
- thesis
- content_style
- intended_reaction
- supporting_claim_ids
- score
- selected

**post_drafts**

- id
- brand_id
- opportunity_id
- angle_id
- platform
- content_style
- tone
- status
- current_version_id
- quality_score
- score_breakdown

**post_versions**

- id
- post_draft_id
- version_number
- hook
- body
- closing
- full_text
- generation_type
- model
- prompt_version
- created_by
- created_at

**post_claims**

- post_version_id
- claim_id
- sentence_text

**image_assets**

- id
- post_draft_id
- image_style
- concept
- prompt
- base_image_path
- final_image_path
- dimensions
- status
- model
- metadata

### 16.6 Operations

**generation_runs**

- id
- run_type
- entity_type
- entity_id
- workflow_name
- workflow_execution_id
- status
- started_at
- completed_at
- model_usage
- error

**evaluation_scores**

- id
- entity_type
- entity_id
- evaluator
- score_type
- score
- details

**feedback_events**

- id
- brand_id
- post_draft_id
- event_type
- reason
- user_id
- created_at

**audit_logs**

- id
- organization_id
- actor_id
- action
- entity_type
- entity_id
- metadata
- created_at

---

## 17. Status Model

**Source**

```
received → extracting → normalized → clustered → analyzed → completed
```

Failure states:

- extraction_failed
- unsupported
- duplicate
- rejected

**Opportunity**

```
identified → research_pending → researching → evidence_ready → generating → ready
```

Alternative states:

- below_threshold
- manual_review
- rejected
- failed

**Post**

```
drafting → evaluating → verifying → image_pending → ready_for_review → approved
```

Alternative states:

- needs_revision
- rejected
- archived
- failed

**Image**

```
concept_pending → generating → validating → composing → ready
```

Alternative states:

- rejected
- failed

Every transition should be validated server-side.

---

## 18. n8n Workflow Package

Codex should produce each workflow as an importable JSON file.

### WF-01: RSS Feed Intake

Trigger: Scheduled trigger or RSS trigger.

Steps:

1. Load active feeds.
2. Retrieve new entries.
3. Normalize feed metadata.
4. Check GUID and canonical URL.
5. Call source-ingestion API.
6. Record feed polling result.
7. Trigger normalization.
8. Route failures to the error workflow.

### WF-02: Manual Input Intake

Trigger: Signed webhook from the application.

Steps:

1. Validate signature.
2. Retrieve submitted input.
3. Select adapter by source type.
4. Start normalization.
5. Update user-visible status.

### WF-03: Extract and Normalize

Steps:

1. Fetch source or file.
2. Extract text.
3. Clean boilerplate.
4. Detect language.
5. Calculate hash.
6. Generate metadata.
7. Chunk document.
8. Generate embeddings.
9. Check duplicates.
10. Persist normalized record.
11. Trigger opportunity analysis.

### WF-04: Cluster and Score

Steps:

1. Retrieve recent related items.
2. Run exact and semantic matching.
3. Create or join cluster.
4. Extract value nucleus.
5. Calculate opportunity score.
6. Calculate risk penalty.
7. Select recommended content style.
8. Apply feed generation policy.
9. Trigger research or stop at opportunity.

### WF-05: Research and Evidence

Steps:

1. Generate research plan.
2. Run bounded web research.
3. Normalize returned sources.
4. Extract candidate claims.
5. Verify claims against sources.
6. Detect conflicting claims.
7. Create evidence package.
8. Trigger angle generation.

### WF-06: Angle and Post Generation

Steps:

1. Retrieve brand profile.
2. Retrieve relevant brand examples.
3. Retrieve recent brand posts.
4. Generate candidate angles.
5. Rank angles.
6. Generate configured post variants.
7. Validate output schema.
8. Trigger evaluation.

### WF-07: Evaluate, Revise and Verify

Steps:

1. Score each draft.
2. Detect factual issues.
3. Detect similarity.
4. Detect brand violations.
5. Send actionable critique to revision.
6. Re-evaluate.
7. Map claims to sentences.
8. Approve for image generation or require review.

### WF-08: Image Generation

Steps:

1. Generate image concepts.
2. Rank concepts.
3. Generate base image.
4. Save the original.
5. Run image validation.
6. Call image-compositor endpoint.
7. Save final formats.
8. Mark post ready.

### WF-09: Selective Regeneration

Trigger: Dashboard webhook.

Supported actions:

- Regenerate hook.
- Regenerate body.
- Regenerate closing.
- Change tone.
- Change style.
- Change length.
- Generate another angle.
- Regenerate image concept.
- Regenerate base image.
- Change image template.

### WF-10: Error and Recovery

Steps:

1. Receive failure metadata.
2. Classify failure.
3. Record redacted error.
4. Retry transient failures.
5. Stop repeated permanent failures.
6. Mark affected entity.
7. Expose recovery action in dashboard.
8. Notify an administrator for critical failures.

---

## 19. API Surface

**User-facing APIs**

`POST /api/inputs`
Create a one-off source.

`GET /api/opportunities`
List filtered content opportunities.

`GET /api/opportunities/:id`
Retrieve source, research, scores and angles.

`POST /api/opportunities/:id/generate`
Generate one or more post variants.

`GET /api/posts`
List drafts and ready posts.

`GET /api/posts/:id`
Retrieve the complete post package.

`PATCH /api/posts/:id`
Save manual edits.

`POST /api/posts/:id/regenerate`
Regenerate a selected component.

`POST /api/posts/:id/approve`
Approve the post.

`POST /api/posts/:id/reject`
Reject the post and record feedback.

`GET /api/posts/:id/download`
Download a ZIP package containing text, image and source summary.

**Internal workflow APIs**

`POST /api/internal/n8n/source`
Create or update a normalized source.

`POST /api/internal/n8n/status`
Update a pipeline status.

`POST /api/internal/n8n/run`
Create or update a generation run.

`POST /api/internal/n8n/composite-image`
Create a deterministic branded image.

All internal endpoints require:

- Signed request.
- Timestamp.
- Replay protection.
- Service identity.
- Schema validation.
- Rate limits.

---

## 20. Structured Output Contract

Every final post generation should return a strict schema similar to:

```json
{
  "platform": "facebook",
  "content_style": "newsworthy_authority",
  "tone": "authoritative",
  "angle": {
    "title": "string",
    "thesis": "string",
    "intended_reaction": "string"
  },
  "post": {
    "hook": "string",
    "body": "string",
    "closing": "string",
    "full_text": "string",
    "character_count": 0,
    "word_count": 0
  },
  "hook_alternatives": [
    "string",
    "string"
  ],
  "claims_used": [
    {
      "claim_id": "uuid",
      "sentence": "string"
    }
  ],
  "image_brief": {
    "visual_nucleus": "string",
    "style": "editorial_hero",
    "concept": "string",
    "headline_overlay": "string",
    "avoid": ["string"]
  },
  "self_assessment": {
    "primary_strength": "string",
    "possible_weakness": "string"
  }
}
```

All agent-to-system responses should use strict schemas.

---

## 21. Prompt and Agent Design

Do not create one giant prompt.

Create independent prompt modules.

### 21.1 Source Analyst

Goal:

- Extract facts, lessons, uncertainties and possible value nuclei.
- Never write the finished post.

### 21.2 Opportunity Analyst

Goal:

- Determine whether the source deserves a post.
- Recommend the best content style.
- Produce score explanations.

### 21.3 Research Planner

Goal:

- Identify the smallest useful research plan.
- Prevent unbounded browsing.

### 21.4 Evidence Synthesizer

Goal:

- Produce a claims ledger.
- Preserve source provenance.
- Identify conflicts and missing evidence.

### 21.5 Angle Architect

Goal:

- Generate distinctive editorial angles.
- Avoid generic summaries.
- Identify the intended reader reaction.

### 21.6 Social Writer

Goal:

- Write the platform-native post.
- Use only the supplied evidence.
- Apply brand voice and style.
- Avoid source imitation.

### 21.7 Post Critic

Goal:

- Identify precise weaknesses.
- Return corrective instructions, not a rewritten post.

### 21.8 Claim Verifier

Goal:

- Map factual sentences to evidence.
- Reject unsupported certainty.

### 21.9 Image Director

Goal:

- Translate the post's core insight into visual concepts.
- Avoid generic illustrations and irrelevant decoration.

### 21.10 Prompts in code

Prompt templates should be version-controlled in the repository with tests and release metadata. OpenAI's current documentation recommends code-managed prompts and states that its reusable API prompt object surface is being phased out during 2026.

Suggested path:

```
packages/ai/prompts/
  source-analyst.ts
  opportunity-analyst.ts
  research-planner.ts
  evidence-synthesizer.ts
  angle-architect.ts
  social-writer.ts
  post-critic.ts
  claim-verifier.ts
  image-director.ts
```

---

## 22. Similarity and Originality Controls

Before a post becomes ready:

1. Compare it with the source text.
2. Compare it with recent posts for the same brand.
3. Compare it with posts generated for other internal brands.
4. Compare its hook with the hook library.
5. Check repeated clichés and structural patterns.

Possible warnings:

- Too close to source wording.
- Similar to a post from the last 30 days.
- Hook pattern overused.
- Same statistic recently used.
- Same angle already approved for another brand.

Different brands may publish conflicting interpretations.

Cross-brand similarity should be visible to reviewers but should not automatically block content unless configured.

---

## 23. Feedback and Learning Loop

Phase 1 should capture feedback even before social analytics are connected.

Feedback actions:

- Approved without edits.
- Approved after minor edits.
- Heavily edited.
- Rejected.
- Wrong angle.
- Weak hook.
- Too generic.
- Too long.
- Too sensational.
- Weak evidence.
- Wrong brand voice.
- Poor image.
- Repetitive.

Store both:

- Original generated version.
- Final human-edited version.

This creates a training and evaluation dataset for later prompt optimization.

Future social-performance data can be joined to the same records without redesigning the product.

---

## 24. Security and Permissions

**Roles**

**Administrator**

- Manage users.
- Manage all brands.
- Manage credentials.
- Manage feeds.
- View logs and costs.
- Configure system defaults.

**Editor**

- Create inputs.
- Generate posts.
- Edit and approve posts.
- Manage assigned brand settings.

**Reviewer**

- View sources.
- Review, approve and reject.
- Cannot modify infrastructure settings.

**Viewer**

- Read-only access.
- Copy and download only where permitted.

**Required controls**

- Supabase Row Level Security.
- Service-role credentials only on the server.
- n8n credentials stored in n8n credential storage.
- No secrets in workflow JSON exports.
- Signed n8n webhooks.
- File-size and MIME validation.
- SSRF protection for URL ingestion.
- URL allow and block rules.
- Prompt-injection isolation for source text.
- Audit log for approvals and edits.
- Redacted error logs.
- Per-brand data access policies.

Source documents must always be treated as untrusted data, never as system instructions.

---

## 25. Observability

Every pipeline run records:

- Trigger.
- Brand.
- Input.
- Workflow.
- Current stage.
- Duration.
- Model.
- Reasoning setting.
- Tool calls.
- Token usage.
- Image-generation count.
- Retry count.
- Error category.
- Final status.
- Human outcome.

Dashboard operational views:

- Runs in progress.
- Failed runs.
- Stalled runs.
- Cost by brand.
- Cost by source type.
- Cost by completed post.
- Average opportunity score.
- Approval rate.
- Rejection reasons.
- Generation volume.
- Feed health.

---

## 26. Cost-Control Strategy

**Two-stage RSS processing**

Do not perform full research and image generation for every RSS item.

**Low-cost stage**

For every feed item:

- Normalize.
- Classify.
- Deduplicate.
- Calculate preliminary relevance.
- Calculate opportunity score.

**Expensive stage**

Only perform full research and generation when:

- Score exceeds the brand threshold.
- The item is not a duplicate.
- The daily generation limit has not been reached.
- The event has not already been covered.
- The feed's generation policy permits it.

**Other controls**

- Cache repeated research sources.
- Cache brand prompt prefixes.
- Use lower-cost models for extraction.
- Use the strongest model only for priority content.
- Limit research queries.
- Limit revision passes.
- Generate one image first.
- Generate additional image versions only on request.
- Reuse extracted source documents across brands.
- Use asynchronous processing for non-urgent one-off inputs.

---

## 27. Repository Structure

```
ai-social-engine/
├── AGENTS.md
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .env.example
├── apps/
│   └── web/
│       ├── app/
│       ├── components/
│       ├── actions/
│       ├── api/
│       └── tests/
├── packages/
│   ├── ai/
│   │   ├── prompts/
│   │   ├── schemas/
│   │   ├── agents/
│   │   ├── providers/
│   │   ├── model-router/
│   │   └── evals/
│   ├── contracts/
│   ├── database/
│   ├── brand-engine/
│   ├── content-scoring/
│   ├── source-processing/
│   ├── image-compositor/
│   ├── security/
│   └── observability/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   ├── functions/
│   └── tests/
├── n8n/
│   ├── workflows/
│   │   ├── wf-01-rss-intake.json
│   │   ├── wf-02-manual-intake.json
│   │   ├── wf-03-normalize.json
│   │   ├── wf-04-cluster-score.json
│   │   ├── wf-05-research.json
│   │   ├── wf-06-generate.json
│   │   ├── wf-07-evaluate.json
│   │   ├── wf-08-image.json
│   │   ├── wf-09-regenerate.json
│   │   └── wf-10-error.json
│   └── README.md
├── fixtures/
│   ├── rss/
│   ├── articles/
│   ├── pdfs/
│   ├── transcripts/
│   └── expected/
├── scripts/
│   ├── import-n8n-workflows.ts
│   ├── seed-demo-data.ts
│   └── run-evals.ts
└── docs/
    ├── architecture.md
    ├── data-model.md
    ├── workflow-map.md
    ├── prompt-contracts.md
    ├── security.md
    └── deployment.md
```

---

## 28. AGENTS.md Requirements

The repository-level AGENTS.md should tell Codex:

- Use TypeScript strict mode.
- Never expose service-role credentials.
- Use Supabase migrations for schema changes.
- Use Zod for API boundaries.
- Use Structured Outputs for model responses.
- Keep prompts version-controlled.
- Keep n8n workflows importable.
- Never store credentials inside workflow JSON.
- Add tests for every pipeline state transition.
- Add fixtures for every supported source type.
- Preserve source provenance.
- Never allow source text to override system instructions.
- Prefer deterministic code over AI for mechanical operations.
- Record material assumptions in `/docs/decisions.md`.
- Run lint, type checks, unit tests and integration tests before completing tasks.
- Update documentation with every architectural change.

---

## 29. Implementation Order

### Milestone 1: Repository and infrastructure

Deliver:

- Monorepo.
- Next.js application.
- Supabase local setup.
- Authentication.
- Brand switcher.
- Database migrations.
- Storage buckets.
- Row Level Security.
- CI.
- Environment documentation.

### Milestone 2: Brand system

Deliver:

- Brand CRUD.
- Voice profile.
- Content pillars.
- Restricted topics.
- Brand examples.
- Brand assets.
- Seed brands.

### Milestone 3: Inputs

Deliver:

- RSS feed management.
- Manual URL input.
- PDF upload.
- Transcript input.
- Plain-text input.
- Source normalization.
- Source viewer.
- Deduplication.

### Milestone 4: Opportunity engine

Deliver:

- Source extraction.
- Classification.
- Clustering.
- Value-nucleus selection.
- Opportunity scoring.
- Content Inbox.
- Threshold configuration.

### Milestone 5: Research and evidence

Deliver:

- Research planning.
- Web research.
- Research-source storage.
- Claims ledger.
- Conflict handling.
- Evidence display.

### Milestone 6: Post generation

Deliver:

- Three content styles.
- Five tone overlays.
- Angle generation.
- Facebook writer.
- Hook alternatives.
- Evaluation.
- Revision.
- Verification.
- Post editor.

### Milestone 7: Images

Deliver:

- Four image styles.
- Visual-concept generation.
- GPT Image integration.
- Storage.
- Image validation.
- Deterministic composition.
- Download formats.

### Milestone 8: Operational hardening

Deliver:

- Run dashboard.
- Retry controls.
- Error workflow.
- Cost tracking.
- Audit logs.
- Security tests.
- Prompt-injection tests.
- End-to-end test suite.

---

## 30. Phase 1 Acceptance Criteria

**Functional**

- An administrator can create multiple brands.
- Each brand can have independent voice and image settings.
- An RSS feed can be assigned to one or more brands.
- New RSS items are automatically ingested.
- Users can submit URLs, PDFs, transcripts and text.
- Sources are normalized and deduplicated.
- Opportunities receive explainable scores.
- The system can perform bounded research.
- Claims retain source provenance.
- Users can generate all three content styles.
- Posts receive quality and risk scores.
- Users can edit and selectively regenerate content.
- The system generates and composes an image.
- Text can be copied.
- Images can be downloaded.
- No content is automatically published.

**Quality**

- Finished posts do not contain unsupported numerical claims.
- Source wording is not copied excessively.
- Posts materially differ across the three content styles.
- Brand voice changes are observable across brands.
- The same feed item is not repeatedly generated.
- Recent-post similarity is detected.
- Image typography is accurate.
- Every factual sentence can be traced internally.

**Reliability**

- Failed jobs are visible.
- Transient failures retry safely.
- Permanent failures do not loop indefinitely.
- Workflow callbacks are idempotent.
- Duplicate webhook delivery does not create duplicate posts.
- Long-running research does not block the application interface.

**Security**

- Users cannot access unauthorized brands.
- Browser clients cannot access model or service-role secrets.
- Source URLs cannot access private network resources.
- Uploaded files are validated.
- Source prompt injection does not alter system behavior.
- Audit logs record approvals, edits and rejection actions.

---

## 31. Master Codex Build Prompt

```text
You are the principal engineer responsible for building the Phase 1 AI Social
Content Engine defined in /docs/product-blueprint.md.

Build a production-quality internal application for one organization operating
multiple internal brands.

The product ingests RSS items, article URLs, PDFs, transcript files, pasted
transcripts, pasted social content and plain text. It transforms these sources
into evidence-backed Facebook posts and branded images. It does not publish or
schedule content.

Use:
- Next.js with TypeScript and App Router
- Tailwind CSS
- Supabase PostgreSQL, Auth, Storage and Row Level Security
- n8n for workflow orchestration
- OpenAI Responses API for text intelligence and web research
- Strict Structured Outputs for all model-to-application contracts
- GPT Image 2 through a provider abstraction
- Sharp plus an SVG/HTML composition system for deterministic typography
- Zod for runtime validation
- Vitest and Playwright for testing
- pnpm workspaces and Turborepo

Read AGENTS.md and every file in /docs before changing code.

Implementation rules:
1. Supabase is the system of record. n8n must not be the durable data store.
2. n8n workflows must be committed as valid, importable JSON.
3. Never commit credentials or credential IDs.
4. Keep production prompts in version-controlled TypeScript files.
5. Treat all source content as untrusted data.
6. Never allow source text to function as system instructions.
7. Preserve claim-to-source provenance.
8. Prefer deterministic code for status transitions, validation, scoring
   arithmetic, retries and persistence.
9. Use agents only for analysis, research, angle creation, writing, critique
   and visual direction.
10. Make all webhook operations idempotent.
11. Add database constraints for important invariants.
12. Add Row Level Security tests.
13. Add representative fixtures for every supported input.
14. Add mocked AI providers so the complete test suite runs without paid API
    calls.
15. Record model, prompt version, response ID, usage and errors for each run.
16. Do not implement automated social publishing, scheduling, billing, client
    workspaces or video generation.

Work through the milestones in /docs/implementation-plan.md in order.

For each milestone:
- Inspect the existing implementation.
- Write or update a task checklist.
- Implement the smallest complete vertical slice.
- Add tests.
- Run formatting, linting, type checking and tests.
- Fix failures.
- Update documentation.
- Commit a concise implementation summary to /docs/progress.md.

Do not leave core paths as pseudocode or TODO placeholders.

Where an external credential is required, complete the integration code,
environment schema, mocks, tests and setup documentation, then clearly identify
only the credential wiring that must be completed manually.

Begin by producing:
1. The repository scaffold.
2. AGENTS.md.
3. Architecture documentation.
4. Supabase schema and Row Level Security.
5. Seed data for two example brands.
6. A working authenticated brand-switching dashboard.
7. The first importable n8n RSS ingestion workflow.
```

---

## 32. Features Explicitly Excluded from Phase 1

- Automatic Facebook publishing.
- Social-media scheduling.
- Instagram or LinkedIn API integrations.
- Engagement analytics ingestion.
- Automated A/B posting.
- Video generation.
- AI voice.
- Carousel generation.
- Full video downloading and transcription.
- External client accounts.
- Client billing.
- Approval by external clients.
- Mobile application.
- Custom model fine-tuning.
- Autonomous trend prediction from social firehose data.
- Automated comment generation.
- Automated community management.

---

## 33. Final Product Definition

Phase 1 is complete when an internal user can:

1. Select a brand.
2. Add RSS feeds or submit source material.
3. Let the system identify the strongest content opportunity.
4. Review supporting research and claims.
5. Receive one or more original Facebook posts.
6. Choose between Newsworthy, Educational and Perspective styles.
7. Apply a brand-specific tone.
8. Review transparent quality scores.
9. Edit or selectively regenerate the content.
10. Receive a matching branded image.
11. Copy the text and download the image.
12. Retain a complete internal record of sources, claims, versions and decisions.

The product should feel less like an AI text generator and more like an always-on editorial research, creative strategy and social-content production desk for multiple brands.
