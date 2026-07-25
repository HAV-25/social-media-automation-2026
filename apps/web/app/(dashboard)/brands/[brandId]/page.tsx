import {
  Archive,
  CheckCircle2,
  FileImage,
  FileText,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandConfiguration } from "@/lib/brand-configuration";
import { canManageBrand, canManageOrganization } from "@/lib/permissions";
import {
  addBrandExample,
  removeBrandAsset,
  removeBrandExample,
  saveBrandProfile,
  setBrandArchived,
  uploadBrandAsset,
} from "../actions";

export const dynamic = "force-dynamic";

function LinesField({
  defaultValue,
  help,
  label,
  name,
}: {
  defaultValue: string[];
  help: string;
  label: string;
  name: string;
}) {
  return (
    <label className="text-xs font-bold text-[var(--muted)]">
      {label}
      <textarea
        name={name}
        rows={3}
        defaultValue={defaultValue.join("\n")}
        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal leading-5 text-[var(--ink)] outline-none focus:border-[var(--sage)]"
      />
      <span className="mt-1 block text-[10px] font-normal leading-4">{help}</span>
    </label>
  );
}

function VoiceControl({
  defaultValue,
  label,
  name,
}: {
  defaultValue: number;
  label: string;
  name: string;
}) {
  return (
    <label className="block rounded-xl border border-[var(--line)] bg-white px-4 py-3">
      <span className="flex items-center justify-between text-xs font-bold text-[var(--muted)]">
        {label}
        <strong className="text-[var(--ink)]">{defaultValue}</strong>
      </span>
      <input
        name={name}
        type="range"
        min={0}
        max={100}
        step={5}
        defaultValue={defaultValue}
        className="mt-3 w-full accent-[var(--accent)]"
      />
    </label>
  );
}

export default async function BrandConfigurationPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ brandId }, query, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  const configuration = await getBrandConfiguration(brandId);
  if (!configuration) notFound();
  const { brand, profile, examples, assets, context } = configuration;
  const editable = user ? canManageBrand(user.role) : false;
  const boundSaveProfile = saveBrandProfile.bind(null, brandId);
  const boundAddExample = addBrandExample.bind(null, brandId);
  const boundRemoveExample = removeBrandExample.bind(null, brandId);
  const boundUploadAsset = uploadBrandAsset.bind(null, brandId);
  const boundRemoveAsset = removeBrandAsset.bind(null, brandId);
  const boundSetArchived = setBrandArchived.bind(null, brandId);

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-6 py-5 backdrop-blur lg:px-10">
        <div className="min-w-0 flex-1">
          <a href="/brands" className="text-xs font-bold text-[var(--accent)] hover:underline">
            Brands
          </a>
          <h1 className="serif mt-1 text-3xl tracking-[-0.03em]">{brand.name}</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold">
          <ShieldCheck size={15} className="text-[var(--sage)]" />
          {editable ? "Editable brand memory" : "Read-only brand memory"}
        </span>
      </header>

      <section className="px-6 py-8 lg:px-10 lg:py-10">
        {query.error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {query.error}
          </div>
        ) : null}
        {query.saved ? (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 size={17} /> Brand configuration action completed.
          </div>
        ) : null}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <form action={boundSaveProfile} className="space-y-6">
              <fieldset
                disabled={!editable}
                className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 disabled:opacity-70 lg:p-8"
              >
                <legend className="serif px-2 text-2xl">Identity and editorial position</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Brand name
                    <input
                      required
                      name="name"
                      maxLength={120}
                      defaultValue={profile.name}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    URL slug
                    <input
                      required
                      name="slug"
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      defaultValue={profile.slug}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
                    Description
                    <textarea
                      name="description"
                      rows={2}
                      maxLength={2000}
                      defaultValue={profile.description}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Website
                    <input
                      name="website"
                      type="url"
                      defaultValue={profile.website}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Default language
                    <input
                      required
                      name="defaultLanguage"
                      defaultValue={profile.defaultLanguage}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
                    Audience definition
                    <textarea
                      name="audienceDefinition"
                      rows={3}
                      maxLength={5000}
                      defaultValue={profile.audienceDefinition}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
                    Positioning
                    <textarea
                      name="positioning"
                      rows={3}
                      maxLength={5000}
                      defaultValue={profile.positioning}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)] outline-none focus:border-[var(--sage)]"
                    />
                  </label>
                  <LinesField
                    name="contentPillars"
                    label="Content pillars"
                    defaultValue={profile.contentPillars}
                    help="One pillar per line; later opportunity scoring uses these explicitly."
                  />
                  <LinesField
                    name="restrictedTopics"
                    label="Restricted topics"
                    defaultValue={profile.restrictedTopics}
                    help="Subjects that require rejection or elevated human review."
                  />
                  <LinesField
                    name="ctaPreferences"
                    label="CTA preferences"
                    defaultValue={profile.ctaPreferences}
                    help="Approved invitations, questions, or next steps."
                  />
                  <LinesField
                    name="geographicFocus"
                    label="Geographic focus"
                    defaultValue={profile.geographicFocus}
                    help="Countries, regions, or a global scope."
                  />
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Risk tolerance
                    <select
                      name="riskTolerance"
                      defaultValue={profile.riskTolerance}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              <fieldset
                disabled={!editable}
                className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 disabled:opacity-70 lg:p-8"
              >
                <legend className="serif px-2 text-2xl">Voice fingerprint</legend>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Numeric controls make the voice reproducible and testable instead of relying on
                  adjectives alone.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <VoiceControl
                    name="formality"
                    label="Formality"
                    defaultValue={profile.voiceSettings.formality}
                  />
                  <VoiceControl
                    name="warmth"
                    label="Warmth"
                    defaultValue={profile.voiceSettings.warmth}
                  />
                  <VoiceControl
                    name="boldness"
                    label="Boldness"
                    defaultValue={profile.voiceSettings.boldness}
                  />
                  <VoiceControl
                    name="humor"
                    label="Humor"
                    defaultValue={profile.voiceSettings.humor}
                  />
                  <VoiceControl
                    name="evidenceDensity"
                    label="Evidence density"
                    defaultValue={profile.voiceSettings.evidenceDensity}
                  />
                  <label className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-xs font-bold text-[var(--muted)]">
                    Sentence style
                    <select
                      name="sentenceStyle"
                      defaultValue={profile.voiceSettings.sentenceStyle}
                      className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-sm font-normal text-[var(--ink)]"
                    >
                      <option value="crisp">Crisp</option>
                      <option value="balanced">Balanced</option>
                      <option value="expansive">Expansive</option>
                    </select>
                  </label>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <LinesField
                    name="preferredVocabulary"
                    label="Preferred vocabulary"
                    defaultValue={profile.voiceSettings.preferredVocabulary}
                    help="Terms the brand naturally uses."
                  />
                  <LinesField
                    name="avoidVocabulary"
                    label="Vocabulary to avoid"
                    defaultValue={profile.voiceSettings.avoidVocabulary}
                    help="Overused or off-brand language."
                  />
                  <LinesField
                    name="bannedPhrases"
                    label="Banned phrases"
                    defaultValue={profile.voiceSettings.bannedPhrases}
                    help="Hard exclusions checked during evaluation."
                  />
                </div>
              </fieldset>

              <fieldset
                disabled={!editable}
                className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 disabled:opacity-70 lg:p-8"
              >
                <legend className="serif px-2 text-2xl">Generation defaults</legend>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    [
                      "targetLength",
                      "Length",
                      profile.generationDefaults.targetLength,
                      [
                        ["short", "Short"],
                        ["medium", "Medium"],
                        ["long", "Long"],
                      ],
                    ],
                    [
                      "emojiPolicy",
                      "Emoji",
                      profile.generationDefaults.emojiPolicy,
                      [
                        ["never", "Never"],
                        ["sparingly", "Sparingly"],
                        ["natural", "Natural"],
                      ],
                    ],
                    [
                      "hashtagPolicy",
                      "Hashtags",
                      profile.generationDefaults.hashtagPolicy,
                      [
                        ["none", "None"],
                        ["one_to_three", "1–3"],
                      ],
                    ],
                    [
                      "ctaStyle",
                      "CTA",
                      profile.generationDefaults.ctaStyle,
                      [
                        ["none", "None"],
                        ["question", "Question"],
                        ["invitation", "Invitation"],
                        ["direct", "Direct"],
                      ],
                    ],
                  ].map(([name, label, value, options]) => (
                    <label key={String(name)} className="text-xs font-bold text-[var(--muted)]">
                      {String(label)}
                      <select
                        name={String(name)}
                        defaultValue={String(value)}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                      >
                        {(options as string[][]).map(([optionValue, optionLabel]) => (
                          <option key={optionValue} value={optionValue}>
                            {optionLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Variants
                    <select
                      name="defaultVariantCount"
                      defaultValue={profile.generationDefaults.defaultVariantCount}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </select>
                  </label>
                </div>
              </fieldset>

              {editable ? (
                <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sage)] px-5 py-3 text-sm font-bold text-white">
                  <Save size={17} /> Save brand memory
                </button>
              ) : null}
            </form>

            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="serif text-2xl">Reference examples</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Approved examples are embedded for relevant retrieval. A generation receives at
                    most three, never the entire library.
                  </p>
                </div>
                <FileText className="text-[var(--sage)]" />
              </div>
              <div className="mt-5 space-y-3">
                {examples.map((example) => (
                  <article
                    key={example.id}
                    className="rounded-2xl border border-[var(--line)] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--sage-soft)] px-2.5 py-1 text-[10px] font-bold text-[var(--sage)] uppercase">
                        {example.exampleType.replaceAll("_", " ")}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--muted)] uppercase">
                        {example.approved ? "Approved" : "Not approved"}
                      </span>
                      {editable ? (
                        <form action={boundRemoveExample} className="ml-auto">
                          <input type="hidden" name="exampleId" value={example.id} />
                          <button
                            aria-label="Remove example"
                            className="rounded-lg p-2 text-[var(--muted)] hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 size={15} />
                          </button>
                        </form>
                      ) : null}
                    </div>
                    <p className="mt-3 line-clamp-4 text-sm leading-6">{example.content}</p>
                    {example.performanceNotes ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">{example.performanceNotes}</p>
                    ) : null}
                  </article>
                ))}
              </div>
              {editable ? (
                <form
                  action={boundAddExample}
                  className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-bold text-[var(--muted)]">
                      Example type
                      <select
                        name="exampleType"
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                      >
                        <option value="positive">Approved voice example</option>
                        <option value="high_performing">High-performing example</option>
                        <option value="negative">Negative example</option>
                      </select>
                    </label>
                    <label className="text-xs font-bold text-[var(--muted)]">
                      Performance notes
                      <input
                        name="performanceNotes"
                        maxLength={2000}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                      />
                    </label>
                  </div>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Example content
                    <textarea
                      required
                      minLength={20}
                      maxLength={20000}
                      name="content"
                      rows={5}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal leading-6 text-[var(--ink)]"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-[var(--muted)]">
                    <input name="approved" type="checkbox" defaultChecked />
                    Approved for AI retrieval
                  </label>
                  <button className="rounded-xl border border-[var(--sage)] px-4 py-2.5 text-sm font-bold text-[var(--sage)]">
                    Embed and add example
                  </button>
                </form>
              ) : null}
            </section>

            <section className="rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="serif text-2xl">Private visual assets</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Logos, fonts, images, and templates remain private. Preview links expire after
                    ten minutes.
                  </p>
                </div>
                <LockKeyhole className="text-[var(--sage)]" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {assets.map((asset) => (
                  <article
                    key={asset.id}
                    className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
                  >
                    {asset.mimeType.startsWith("image/") && asset.previewUrl ? (
                      <img
                        src={asset.previewUrl}
                        alt={asset.altText || asset.originalName}
                        className="h-36 w-full object-contain bg-stone-50 p-3"
                      />
                    ) : (
                      <div className="grid h-28 place-items-center bg-stone-50">
                        <FileImage className="text-[var(--muted)]" />
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{asset.originalName}</p>
                        <p className="mt-1 text-[10px] font-semibold text-[var(--muted)] uppercase">
                          {asset.assetType} · {(asset.byteSize / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      {editable ? (
                        <form action={boundRemoveAsset}>
                          <input type="hidden" name="assetId" value={asset.id} />
                          <button
                            aria-label="Remove asset"
                            className="rounded-lg p-2 text-[var(--muted)] hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 size={15} />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
              {editable ? (
                <form
                  action={boundUploadAsset}
                  className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2"
                >
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Asset type
                    <select
                      name="assetType"
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                    >
                      <option value="logo">Logo</option>
                      <option value="font">Font</option>
                      <option value="image">Visual reference</option>
                      <option value="template">Template</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    File
                    <input
                      required
                      name="file"
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.svg,.ttf,.otf,.woff,.woff2"
                      className="mt-1.5 block w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-normal text-[var(--ink)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Alt text
                    <input
                      name="altText"
                      maxLength={500}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[var(--muted)]">
                    Dominant colors
                    <input
                      name="dominantColors"
                      placeholder="#214D3B, #CF4B28"
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ink)]"
                    />
                  </label>
                  <button className="rounded-xl border border-[var(--sage)] px-4 py-2.5 text-sm font-bold text-[var(--sage)] sm:col-span-2">
                    Validate and upload privately
                  </button>
                </form>
              ) : null}
            </section>

            {user && canManageOrganization(user.role) ? (
              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
                <h2 className="serif text-xl">Brand lifecycle</h2>
                <p className="mt-2 text-sm text-amber-900/70">
                  Archiving preserves all provenance and removes the brand from active work.
                </p>
                <form action={boundSetArchived} className="mt-4">
                  <input
                    type="hidden"
                    name="archived"
                    value={brand.status === "active" ? "true" : "false"}
                  />
                  <button className="flex items-center gap-2 rounded-xl border border-amber-400 bg-white px-4 py-2.5 text-sm font-bold text-amber-900">
                    {brand.status === "active" ? <Archive size={16} /> : <RotateCcw size={16} />}
                    {brand.status === "active" ? "Archive brand" : "Restore brand"}
                  </button>
                </form>
              </section>
            ) : null}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6">
            <section className="rounded-3xl bg-[var(--ink)] p-6 text-white">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold tracking-[0.18em] text-[#f0b39f] uppercase">
                  AI context preview
                </p>
                <Sparkles size={17} className="text-[#f0b39f]" />
              </div>
              <div className="mt-5 flex items-end gap-3">
                <strong className="serif text-5xl">{context.completeness.score}%</strong>
                <span className="pb-1 text-xs text-white/50">configuration complete</span>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#f0b39f]"
                  style={{ width: `${context.completeness.score}%` }}
                />
              </div>
              {context.completeness.missing.length ? (
                <div className="mt-5">
                  <p className="text-[10px] font-bold tracking-wide text-white/45 uppercase">
                    Still needed
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {context.completeness.missing.map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-white/65"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-6 space-y-4 border-t border-white/10 pt-5 text-xs leading-5">
                <div>
                  <p className="font-bold text-white/45 uppercase">Audience</p>
                  <p className="mt-1 text-white/80">
                    {context.identity.audience || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-white/45 uppercase">Position</p>
                  <p className="mt-1 text-white/80">
                    {context.identity.positioning || "Not provided"}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-white/45 uppercase">Retrieved examples</p>
                  <p className="mt-1 text-white/80">
                    {context.selectedExamples.length} of {examples.length} available · hard cap 3
                  </p>
                </div>
              </div>
            </section>

            <details className="rounded-2xl border border-[var(--line)] bg-white p-5">
              <summary className="cursor-pointer text-sm font-bold">
                Inspect normalized contract
              </summary>
              <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-4 text-[10px] leading-4 text-stone-700">
                {JSON.stringify(context, null, 2)}
              </pre>
            </details>
          </aside>
        </div>
      </section>
    </>
  );
}
