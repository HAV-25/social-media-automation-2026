export const demoUser = {
  id: "00000000-0000-4000-8000-000000000010",
  organizationId: "10000000-0000-4000-8000-000000000001",
  organizationRole: "administrator" as const,
  email: "arun@example.internal",
  displayName: "Arun",
  role: "administrator" as const,
};

export const demoBrands = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Klaank", slug: "klaank", color: "#CF4B28" },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Spaarker",
    slug: "spaarker",
    color: "#8A4F7D",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Nations of Tomorrow",
    slug: "nations-of-tomorrow",
    color: "#326B8C",
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Business of AI",
    slug: "business-of-ai",
    color: "#214D3B",
  },
  { id: "10000000-0000-4000-8000-000000000005", name: "Wyngs", slug: "wyngs", color: "#A67C28" },
] as const;

export const demoOpportunities = [
  {
    id: "op-1",
    score: 88,
    source: "MIT Technology Review",
    age: "18 min",
    title: "AI agents are moving from demos into operational teams",
    nucleus: "The constraint is shifting from model capability to organizational design.",
    style: "Perspective",
    corroboration: 4,
    risk: "Low",
  },
  {
    id: "op-2",
    score: 81,
    source: "European Commission",
    age: "1 hr",
    title: "New guidance clarifies AI accountability expectations",
    nucleus: "Clear ownership is becoming a product requirement, not merely a compliance task.",
    style: "Newsworthy",
    corroboration: 3,
    risk: "Review",
  },
  {
    id: "op-3",
    score: 74,
    source: "Harvard Business Review",
    age: "3 hr",
    title: "What teams misunderstand about AI productivity",
    nucleus:
      "The largest gains appear when teams redesign decisions instead of automating isolated tasks.",
    style: "Educational",
    corroboration: 2,
    risk: "Low",
  },
] as const;
