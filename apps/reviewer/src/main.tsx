import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Check,
  FileText,
  LogOut,
  Play,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  loadBrands,
  loadFeeds,
  loadJobs,
  loadOpportunities,
  loadPosts,
  manageFeed,
  requestAction,
  reviewPost,
  savePost,
  type Brand,
  type Feed,
  type Job,
  type Opportunity,
  type Post,
} from "./data";
import { reviewerEnvironment } from "./env";
import "./styles.css";

type View = "inbox" | "posts" | "runs" | "sources";

const configuredClient = reviewerEnvironment.success
  ? createClient(reviewerEnvironment.data.url, reviewerEnvironment.data.key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

function Login({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
  }
  return (
    <main className="login">
      <section className="brand-panel">
        <p className="eyebrow">Editorial operations</p>
        <h1>Ideas become credible before they become content.</h1>
        <p>
          Lightweight reviewer console. Automation continues even when this interface is offline.
        </p>
      </section>
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow orange">Internal access</p>
        <h2>Welcome back.</h2>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button>Enter Editorial Desk</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function Stat({ value, label, note }: { value: string | number; label: string; note: string }) {
  return (
    <article className="stat">
      <strong>{value}</strong>
      <b>{label}</b>
      <span>{note}</span>
    </article>
  );
}
function Score({ value }: { value: number }) {
  return (
    <span className={`score ${value >= 75 ? "high" : value >= 60 ? "medium" : "low"}`}>
      {Math.round(value)}
    </span>
  );
}

function Inbox({
  client,
  brand,
  opportunities,
  refresh,
}: {
  client: SupabaseClient;
  brand: Brand;
  opportunities: Opportunity[];
  refresh: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");
  const visible = opportunities.filter((item) =>
    `${item.sourceTitle} ${item.value_nucleus}`.toLowerCase().includes(filter.toLowerCase()),
  );
  async function act(item: Opportunity, action: "research" | "draft" | "resurface") {
    setBusy(item.id);
    setMessage("");
    try {
      await requestAction(client, { action, brandId: brand.id, opportunityId: item.id });
      setMessage(`${action} queued safely.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <>
      <header>
        <p className="eyebrow">Content inbox</p>
        <h1>Today&apos;s strongest opportunities</h1>
        <p>
          Automation selects scores of 75 or higher. Scores from 60–74 remain available for your
          judgment.
        </p>
      </header>
      <div className="stats">
        <Stat
          value={opportunities.length}
          label="Active opportunities"
          note="current brand pipeline"
        />
        <Stat
          value={opportunities.filter((o) => o.opportunity_score >= 75).length}
          label="Automatic priority"
          note="score ≥ 75"
        />
        <Stat
          value={
            opportunities.filter((o) => o.opportunity_score >= 60 && o.opportunity_score < 75)
              .length
          }
          label="Manual review"
          note="score 60–74"
        />
      </div>
      <div className="search">
        <Search size={18} />
        <input
          placeholder="Search sources and topics"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      {message && <p className="notice">{message}</p>}
      <section className="list">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Daily opportunity feed</p>
            <h2>Every scored item and its decision</h2>
          </div>
          <button className="secondary" onClick={refresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {visible.map((item) => (
          <article className="row" key={item.id}>
            <Score value={item.opportunity_score} />
            <div className="grow">
              <p className="meta">
                {item.sourceTitle ?? "Normalized source"} ·{" "}
                {new Date(item.created_at).toLocaleString()}
              </p>
              <h3>{item.value_nucleus}</h3>
              <p>
                {item.recommended_style?.replaceAll("_", " ") ?? "Style pending"} · {item.status}
              </p>
            </div>
            <div className="actions">
              {item.opportunity_score >= 75 ? (
                <button disabled={busy === item.id} onClick={() => act(item, "research")}>
                  <Play size={15} />
                  Prepare
                </button>
              ) : item.opportunity_score >= 60 ? (
                <button
                  disabled={busy === item.id}
                  onClick={() => act(item, "resurface")}
                  className="secondary"
                >
                  Select manually
                </button>
              ) : (
                <span className="muted">Stored</span>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function Posts({
  client,
  brand,
  posts,
  refresh,
}: {
  client: SupabaseClient;
  brand: Brand;
  posts: Post[];
  refresh: () => void;
}) {
  const [selected, setSelected] = useState<Post>();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  async function mutate(action: () => Promise<void>, success: string) {
    setMessage("");
    try {
      await action();
      setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    }
  }
  if (selected)
    return (
      <>
        <button className="back" onClick={() => setSelected(undefined)}>
          ← Ready posts
        </button>
        <header>
          <p className="eyebrow">Human review desk</p>
          <h1>{selected.hook || "Post draft"}</h1>
          <p>
            {selected.content_style.replaceAll("_", " ")} · {selected.status}
          </p>
        </header>
        {message && <p className="notice">{message}</p>}
        <div className="review-grid">
          <section className="editor">
            {selected.imageUrl && (
              <div className="review-image">
                <img src={selected.imageUrl} alt="Generated branded editorial visual" />
                <details>
                  <summary>Exact image-generation prompt</summary>
                  <pre>{selected.imagePrompt ?? "Prompt provenance unavailable."}</pre>
                </details>
              </div>
            )}
            <label>
              Hook
              <textarea
                value={selected.hook}
                onChange={(event) => setSelected({ ...selected, hook: event.target.value })}
              />
            </label>
            <label>
              Body
              <textarea
                className="body"
                value={selected.body}
                onChange={(event) => setSelected({ ...selected, body: event.target.value })}
              />
            </label>
            <label>
              Closing
              <textarea
                value={selected.closing ?? ""}
                onChange={(event) => setSelected({ ...selected, closing: event.target.value })}
              />
            </label>
            <button
              onClick={() =>
                mutate(() => savePost(client, selected), "Immutable edited version saved.")
              }
            >
              Save as a new version
            </button>
          </section>
          <aside className="decision">
            <h2>Human decision</h2>
            <p>Warnings inform your decision; they do not block review.</p>
            <label>
              Decision reason
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button
              onClick={() =>
                mutate(() => reviewPost(client, selected.id, "approve", reason), "Post approved.")
              }
            >
              <Check size={16} />
              Approve
            </button>
            <button
              className="danger"
              onClick={() =>
                mutate(() => reviewPost(client, selected.id, "reject", reason), "Post rejected.")
              }
            >
              Reject
            </button>
            <button
              className="secondary"
              onClick={() =>
                mutate(
                  () =>
                    requestAction(client, {
                      action: "image",
                      brandId: brand.id,
                      opportunityId: selected.opportunity_id,
                      postDraftId: selected.id,
                    }),
                  "Image generation queued.",
                )
              }
            >
              Regenerate image
            </button>
            <button
              className="secondary"
              onClick={() =>
                mutate(
                  () =>
                    requestAction(client, {
                      action: "draft",
                      brandId: brand.id,
                      opportunityId: selected.opportunity_id,
                      postDraftId: selected.id,
                      instruction: reason,
                    }),
                  "Selective regeneration queued.",
                )
              }
            >
              Regenerate with direction
            </button>
            <button
              className="secondary"
              onClick={() => {
                const blob = new Blob([JSON.stringify(selected, null, 2)], {
                  type: "application/json",
                });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `post-${selected.id}.json`;
                link.click();
                URL.revokeObjectURL(link.href);
              }}
            >
              Download package
            </button>
          </aside>
        </div>
      </>
    );
  return (
    <>
      <header>
        <p className="eyebrow">Ready posts</p>
        <h1>Drafts awaiting editorial action</h1>
        <p>
          Inspect, edit, regenerate, approve, reject, or download without entering the automation
          loop.
        </p>
      </header>
      <section className="card-grid">
        {posts.map((post) => (
          <article className="post-card" key={post.id}>
            <div className="post-top">
              <span>{post.content_style.replaceAll("_", " ")}</span>
              <span>{post.status}</span>
            </div>
            <h2>{post.hook || "Draft in progress"}</h2>
            <p>{post.body?.slice(0, 220)}</p>
            <div className="post-bottom">
              <b>Quality {post.quality_score ?? "—"}</b>
              <button onClick={() => setSelected(post)}>Review post</button>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function Runs({ jobs, refresh }: { jobs: Job[]; refresh: () => void }) {
  const failed = jobs.filter((job) => job.state === "failed").length;
  const active = jobs.filter((job) =>
    ["queued", "leased", "retry_wait"].includes(job.state),
  ).length;
  const cost = jobs.reduce((sum, job) => sum + Number(job.cost_usd), 0);
  return (
    <>
      <header>
        <p className="eyebrow">Operations</p>
        <h1>Runs &amp; errors</h1>
        <p>Each durable stage can resume independently without repeating completed paid work.</p>
      </header>
      <div className="stats">
        <Stat value={jobs.length} label="Stage runs" note="latest 200" />
        <Stat value={active} label="In progress" note="queued, leased or retrying" />
        <Stat value={failed} label="Failed" note="needs inspection" />
        <Stat value={`$${cost.toFixed(4)}`} label="Recorded cost" note="stage-level usage" />
      </div>
      <section className="list">
        <div className="section-heading">
          <h2>Durable job history</h2>
          <button className="secondary" onClick={refresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        {jobs.map((job) => (
          <article className="run-row" key={job.id}>
            <span className={`state ${job.state}`}>{job.state}</span>
            <div className="grow">
              <h3>{job.stage}</h3>
              <p>
                Attempt {job.attempt}/{job.max_attempts} ·{" "}
                {new Date(job.created_at).toLocaleString()}
              </p>
              {job.error_summary && <p className="error">{job.error_summary}</p>}
            </div>
            <b>${Number(job.cost_usd).toFixed(4)}</b>
          </article>
        ))}
      </section>
    </>
  );
}

function Sources({
  client,
  brand,
  feeds,
  refresh,
}: {
  client: SupabaseClient;
  brand: Brand;
  feeds: Feed[];
  refresh: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    feedUrl: "",
    authorityScore: 60,
    minimumScore: 75,
    dailyLimit: 3,
    includeKeywords: "",
    excludeKeywords: "",
  });
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await manageFeed(client, {
        action: "upsert",
        brandId: brand.id,
        ...form,
        includeKeywords: form.includeKeywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        excludeKeywords: form.excludeKeywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        active: true,
      });
      setForm({
        name: "",
        feedUrl: "",
        authorityScore: 60,
        minimumScore: 75,
        dailyLimit: 3,
        includeKeywords: "",
        excludeKeywords: "",
      });
      setMessage("Feed policy saved.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feed could not be saved");
    }
  }
  async function toggle(feed: Feed) {
    try {
      await manageFeed(client, {
        action: "toggle",
        brandId: brand.id,
        feedId: feed.id,
        active: !feed.active,
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feed could not be updated");
    }
  }
  return (
    <>
      <header>
        <p className="eyebrow">Source operations</p>
        <h1>RSS feeds and routing</h1>
        <p>
          Each feed runs independently. Configure the automatic threshold and daily limit per brand.
        </p>
      </header>
      {message && <p className="notice">{message}</p>}
      <div className="source-grid">
        <section className="list">
          {feeds.map((feed) => (
            <article className="feed-card" key={feed.id}>
              <div className="section-heading">
                <div>
                  <p className="meta">{feed.active ? "ACTIVE" : "PAUSED"}</p>
                  <h2>{feed.name}</h2>
                  <p>{feed.feed_url}</p>
                </div>
                <button className="secondary" onClick={() => void toggle(feed)}>
                  {feed.active ? "Pause" : "Resume"}
                </button>
              </div>
              <div className="feed-metrics">
                <span>
                  Authority <b>{feed.authority_score}</b>
                </span>
                <span>
                  Automatic ≥ <b>{feed.minimumScore}</b>
                </span>
                <span>
                  Daily max <b>{feed.dailyLimit}</b>
                </span>
                <span>
                  Failures <b>{feed.consecutive_failures}</b>
                </span>
              </div>
              <p className="muted">
                Last success:{" "}
                {feed.last_success_at ? new Date(feed.last_success_at).toLocaleString() : "Not yet"}
                {feed.last_error ? ` · ${feed.last_error}` : ""}
              </p>
            </article>
          ))}
        </section>
        <form className="source-form" onSubmit={save}>
          <p className="eyebrow orange">Add feed</p>
          <h2>Routing policy</h2>
          <label>
            Name
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>
          <label>
            RSS or Atom URL
            <input
              type="url"
              required
              value={form.feedUrl}
              onChange={(event) => setForm({ ...form, feedUrl: event.target.value })}
            />
          </label>
          <div className="form-pair">
            <label>
              Authority
              <input
                type="number"
                min="0"
                max="100"
                value={form.authorityScore}
                onChange={(event) =>
                  setForm({ ...form, authorityScore: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Automatic score
              <input
                type="number"
                min="60"
                max="100"
                value={form.minimumScore}
                onChange={(event) => setForm({ ...form, minimumScore: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            Daily maximum
            <input
              type="number"
              min="0"
              max="100"
              value={form.dailyLimit}
              onChange={(event) => setForm({ ...form, dailyLimit: Number(event.target.value) })}
            />
          </label>
          <label>
            Include keywords (comma separated)
            <input
              value={form.includeKeywords}
              onChange={(event) => setForm({ ...form, includeKeywords: event.target.value })}
            />
          </label>
          <label>
            Exclude keywords (comma separated)
            <input
              value={form.excludeKeywords}
              onChange={(event) => setForm({ ...form, excludeKeywords: event.target.value })}
            />
          </label>
          <button>Save feed</button>
        </form>
      </div>
    </>
  );
}

function Shell({ client, session }: { client: SupabaseClient; session: Session }) {
  const [view, setView] = useState<View>("inbox");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    loadBrands(client)
      .then((items) => {
        setBrands(items);
        setBrandId((current) => current || items[0]?.id || "");
      })
      .catch((reason) => setError(String(reason)));
  }, [client]);
  const brand = useMemo(() => brands.find((item) => item.id === brandId), [brands, brandId]);
  const refresh = useCallback(async () => {
    if (!brandId) return;
    setError("");
    try {
      const [nextOpportunities, nextPosts, nextJobs, nextFeeds] = await Promise.all([
        loadOpportunities(client, brandId),
        loadPosts(client, brandId),
        loadJobs(client, brandId),
        loadFeeds(client, brandId),
      ]);
      setOpportunities(nextOpportunities);
      setPosts(nextPosts);
      setJobs(nextJobs);
      setFeeds(nextFeeds);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Data could not load");
    }
  }, [brandId, client]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  if (!brand)
    return (
      <main className="center">
        <RefreshCw className="spin" />
        Loading assigned brands…{error && <p className="error">{error}</p>}
      </main>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <span>E</span>
          <div>
            <b>EDITORIAL DESK</b>
            <small>Lightweight reviewer</small>
          </div>
        </div>
        <label className="brand-select">
          Working brand
          <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
            {brands.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav>
          {(
            [
              ["inbox", FileText, "Content inbox"],
              ["sources", Radio, "Sources"],
              ["runs", AlertTriangle, "Runs & errors"],
              ["posts", ShieldCheck, "Ready posts"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button className={view === key ? "active" : ""} onClick={() => setView(key)} key={key}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>{session.user.email}</span>
          <button onClick={() => client.auth.signOut()}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {error && (
          <p className="error-banner">
            <AlertTriangle size={18} />
            {error}
          </p>
        )}
        {view === "inbox" && (
          <Inbox
            client={client}
            brand={brand}
            opportunities={opportunities}
            refresh={() => void refresh()}
          />
        )}{" "}
        {view === "posts" && (
          <Posts client={client} brand={brand} posts={posts} refresh={refresh} />
        )}{" "}
        {view === "runs" && <Runs jobs={jobs} refresh={() => void refresh()} />}{" "}
        {view === "sources" && (
          <Sources client={client} brand={brand} feeds={feeds} refresh={refresh} />
        )}
      </main>
    </div>
  );
}

function App() {
  if (!configuredClient)
    return (
      <main className="center">
        <AlertTriangle size={40} />
        <h1>Reviewer setup required</h1>
        <p>Build with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p>
      </main>
    );
  const client = configuredClient;
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  if (!ready)
    return (
      <main className="center">
        <RefreshCw className="spin" />
        Restoring session…
      </main>
    );
  return session ? <Shell client={client} session={session} /> : <Login client={client} />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
