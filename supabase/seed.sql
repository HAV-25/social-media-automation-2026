insert into public.organizations (id, name)
values ('10000000-0000-4000-8000-000000000001', 'AI Social Content Engine')
on conflict (id) do update set name = excluded.name;

insert into public.brands (
  id,
  organization_id,
  name,
  slug,
  description
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Klaank',
    'klaank',
    'Initial brand workspace; final positioning awaits the team input register.'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Spaarker',
    'spaarker',
    'Initial brand workspace; final positioning awaits the team input register.'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Nations of Tomorrow',
    'nations-of-tomorrow',
    'Initial brand workspace; final positioning awaits the team input register.'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'Business of AI',
    'business-of-ai',
    'Initial brand workspace; final positioning awaits the team input register.'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'Wyngs',
    'wyngs',
    'Initial brand workspace; final positioning awaits the team input register.'
  )
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description;

insert into public.brand_profiles (
  brand_id,
  audience_definition,
  positioning,
  content_pillars,
  restricted_topics,
  cta_preferences,
  geographic_focus,
  risk_tolerance,
  voice_settings,
  generation_defaults
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'Working assumption — leaders building modern organizations and teams; team confirmation required.',
    'Working assumption — clear signals about how work and leadership are changing; team confirmation required.',
    array['Future of work', 'Leadership', 'Organizational design'],
    array['Unverified claims', 'Guaranteed outcomes'],
    array['Invite a considered response'],
    array['Global'],
    'low',
    '{"formality":65,"warmth":55,"boldness":55,"humor":15,"evidenceDensity":80,"sentenceStyle":"balanced","preferredVocabulary":["operating model","human judgment"],"avoidVocabulary":["disruption for disruption''s sake"],"bannedPhrases":["guaranteed viral"]}'::jsonb,
    '{"targetLength":"medium","emojiPolicy":"never","hashtagPolicy":"none","ctaStyle":"question","defaultVariantCount":3}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Working assumption — curious professionals seeking fresh ideas and practical momentum; team confirmation required.',
    'Working assumption — optimistic ideas translated into useful conversation; team confirmation required.',
    array['Ideas worth sharing', 'Creative work', 'Professional growth'],
    array['Unverified claims', 'Guaranteed outcomes'],
    array['Invite a considered response'],
    array['Global'],
    'medium',
    '{"formality":35,"warmth":85,"boldness":65,"humor":35,"evidenceDensity":65,"sentenceStyle":"balanced","preferredVocabulary":["spark","possibility","momentum"],"avoidVocabulary":["hustle harder"],"bannedPhrases":["guaranteed viral"]}'::jsonb,
    '{"targetLength":"medium","emojiPolicy":"natural","hashtagPolicy":"none","ctaStyle":"question","defaultVariantCount":3}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Working assumption — policy, civic and business leaders shaping resilient societies; team confirmation required.',
    'Working assumption — long-horizon analysis connecting choices to tomorrow''s institutions; team confirmation required.',
    array['Public innovation', 'Resilient institutions', 'Emerging economies'],
    array['Unverified claims', 'Guaranteed outcomes'],
    array['Invite a considered response'],
    array['Global'],
    'low',
    '{"formality":80,"warmth":35,"boldness":50,"humor":10,"evidenceDensity":95,"sentenceStyle":"expansive","preferredVocabulary":["institutional capacity","public value","resilience"],"avoidVocabulary":["inevitable outcome"],"bannedPhrases":["guaranteed viral"]}'::jsonb,
    '{"targetLength":"long","emojiPolicy":"never","hashtagPolicy":"none","ctaStyle":"question","defaultVariantCount":3}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'Working assumption — executives and operators responsible for practical AI adoption; team confirmation required.',
    'Working assumption — evidence-led guidance for turning AI capability into operating results; team confirmation required.',
    array['AI operating models', 'Adoption', 'Governance'],
    array['Unverified claims', 'Guaranteed outcomes'],
    array['Invite a considered response'],
    array['Global'],
    'low',
    '{"formality":70,"warmth":45,"boldness":60,"humor":10,"evidenceDensity":95,"sentenceStyle":"crisp","preferredVocabulary":["operating model","accountability","adoption"],"avoidVocabulary":["AI will replace everyone"],"bannedPhrases":["guaranteed viral"]}'::jsonb,
    '{"targetLength":"medium","emojiPolicy":"never","hashtagPolicy":"none","ctaStyle":"question","defaultVariantCount":3}'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    'Working assumption — founders and creative builders seeking clarity and momentum; team confirmation required.',
    'Working assumption — energetic founder stories and practical prompts that help ideas take flight; team confirmation required.',
    array['Founder stories', 'Creative confidence', 'Building in public'],
    array['Unverified claims', 'Guaranteed outcomes'],
    array['Invite a considered response'],
    array['Global'],
    'medium',
    '{"formality":25,"warmth":90,"boldness":85,"humor":45,"evidenceDensity":55,"sentenceStyle":"crisp","preferredVocabulary":["take flight","build","learn"],"avoidVocabulary":["overnight success"],"bannedPhrases":["guaranteed viral"]}'::jsonb,
    '{"targetLength":"medium","emojiPolicy":"natural","hashtagPolicy":"none","ctaStyle":"question","defaultVariantCount":3}'::jsonb
  )
on conflict (brand_id) do update set
  audience_definition = excluded.audience_definition,
  positioning = excluded.positioning,
  content_pillars = excluded.content_pillars,
  restricted_topics = excluded.restricted_topics,
  cta_preferences = excluded.cta_preferences,
  geographic_focus = excluded.geographic_focus,
  risk_tolerance = excluded.risk_tolerance,
  voice_settings = excluded.voice_settings,
  generation_defaults = excluded.generation_defaults;
