import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs/team-input-register");
const outputPath = path.join(outputDir, "AI_Social_Content_Engine_Team_Input_Register.xlsx");

const workbook = Workbook.create();

const colors = {
  ink: "#202124",
  muted: "#5F6368",
  header: "#F1F3F4",
  border: "#DADCE0",
  white: "#FFFFFF",
  accent: "#1A73E8",
  paleBlue: "#E8F0FE",
  paleGreen: "#E6F4EA",
  paleAmber: "#FEF7E0",
};

const brands = ["Klaank", "Spaarker", "Nations of Tomorrow", "Business of AI", "Wyngs"];

const statuses = ["Requested", "In progress", "Provided", "Accepted", "Not applicable"];
const priorities = ["Critical", "High", "Medium", "Low"];
const owners = ["Arun", "Me", "Team", "Codex", "Unassigned"];
const milestones = [
  "M0 Repository",
  "M1 Identity",
  "M2 Brand",
  "M3 Manual input",
  "M4 Sources & scoring",
  "M5 Research",
  "M6 Posts",
  "M7 Images",
  "M8 Operations",
  "M9 UAT & release",
];

function styleHeader(range) {
  range.format = {
    fill: colors.header,
    font: { bold: true, color: colors.ink },
    borders: { preset: "bottom", style: "thin", color: colors.border },
    verticalAlignment: "center",
    wrapText: true,
  };
}

function styleTitle(sheet, range, title, subtitle) {
  range.merge();
  range.values = [[title]];
  range.format = {
    font: { bold: true, color: colors.ink, size: 18 },
    fill: colors.white,
    verticalAlignment: "center",
  };
  const subtitleRange = sheet.getRange("A2:H2");
  subtitleRange.merge();
  subtitleRange.values = [[subtitle]];
  subtitleRange.format = {
    font: { color: colors.muted, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
  sheet.getRange("A1:H1").format.rowHeight = 30;
  subtitleRange.format.rowHeight = 34;
}

function configureSheet(sheet, headerRange, usedRange, widths = []) {
  sheet.showGridLines = false;
  styleHeader(sheet.getRange(headerRange));
  sheet.freezePanes.freezeRows(4);
  sheet.getRange(usedRange).format.verticalAlignment = "top";
  widths.forEach(([column, width]) => {
    sheet.getRange(`${column}:${column}`).format.columnWidth = width;
  });
}

function addListValidation(sheet, range, values) {
  sheet.getRange(range).dataValidation = {
    rule: { type: "list", values },
  };
}

const overview = workbook.worksheets.add("Overview");
styleTitle(
  overview,
  overview.getRange("A1:H1"),
  "AI Social Content Engine — Team Input Register",
  "Living register for brand inputs, assets, policies, infrastructure and UAT. Update the relevant tab and paste Drive links rather than emailing files.",
);
overview.getRange("A4:B10").values = [
  ["Metric", "Current"],
  ["Open team inputs", null],
  ["Provided or accepted", null],
  ["Brands in scope", null],
  ["Critical inputs open", null],
  ["Last refreshed", new Date("2026-07-23T00:00:00Z")],
  ["Project phase", "Phase 1 build"],
];
overview.getRange("B5").formulas = [
  [
    "=COUNTIF('Input Register'!$I$5:$I$104,\"Requested\")+COUNTIF('Input Register'!$I$5:$I$104,\"In progress\")",
  ],
];
overview.getRange("B6").formulas = [
  [
    "=COUNTIF('Input Register'!$I$5:$I$104,\"Provided\")+COUNTIF('Input Register'!$I$5:$I$104,\"Accepted\")",
  ],
];
overview.getRange("B7").formulas = [["=COUNTA('Brands'!$A$5:$A$24)"]];
overview.getRange("B8").formulas = [
  [
    "=COUNTIFS('Input Register'!$G$5:$G$104,\"Critical\",'Input Register'!$I$5:$I$104,\"<>Accepted\",'Input Register'!$I$5:$I$104,\"<>Provided\")",
  ],
];
overview.getRange("B9").format.numberFormat = "yyyy-mm-dd";
styleHeader(overview.getRange("A4:B4"));
overview.getRange("A12:H12").merge();
overview.getRange("A12").values = [["How to use this register"]];
overview.getRange("A12").format = {
  fill: colors.paleBlue,
  font: { bold: true, color: colors.ink },
};
overview.getRange("A13:H17").values = [
  [
    "1",
    "Start in Input Register",
    "Filter by owner, priority, brand or milestone.",
    null,
    null,
    null,
    null,
    null,
  ],
  [
    "2",
    "Complete the specialist tab",
    "Add structured details in Brands, Brand Voice, Examples, Assets, RSS, Risk or Infrastructure.",
    null,
    null,
    null,
    null,
    null,
  ],
  [
    "3",
    "Link source material",
    "Store files in this project Drive folder and paste the link into the applicable Delivery Link field.",
    null,
    null,
    null,
    null,
    null,
  ],
  [
    "4",
    "Set status",
    "Use Provided when submitted; Codex will change it to Accepted after validation.",
    null,
    null,
    null,
    null,
    null,
  ],
  [
    "5",
    "Avoid secrets",
    "Never place passwords, private keys or API secrets in this workbook. Record only the responsible owner and provisioning status.",
    null,
    null,
    null,
    null,
    null,
  ],
];
overview.getRange("B13:B17").format.font = { bold: true, color: colors.ink };
overview.getRange("A13:H17").format.wrapText = true;
overview.getRange("A:A").format.columnWidth = 24;
overview.getRange("B:B").format.columnWidth = 28;
overview.getRange("C:C").format.columnWidth = 62;
overview.getRange("D:H").format.columnWidth = 12;
overview.getRange("A13:C17").format.rowHeight = 48;
overview.showGridLines = false;
overview.freezePanes.freezeRows(4);

const inputRegister = workbook.worksheets.add("Input Register");
styleTitle(
  inputRegister,
  inputRegister.getRange("A1:M1"),
  "Team Input Register",
  "One row per requested team contribution. Rows are seeded from the PRD and implementation plan; add new rows when a decision or artifact is required.",
);
const inputHeaders = [
  "Input ID",
  "Category",
  "Brand",
  "Requested item",
  "Why it is needed",
  "Blocking milestone",
  "Priority",
  "Owner",
  "Status",
  "Requested on",
  "Needed by",
  "Delivery link",
  "Notes",
];
inputRegister.getRange("A4:M4").values = [inputHeaders];
const requests = [
  [
    "IN-001",
    "Brand",
    "All brands",
    "Confirm official brand names, websites and one-sentence descriptions",
    "Seeds isolated workspaces and brand switcher",
    "M1 Identity",
    "Critical",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-002",
    "Access",
    "All brands",
    "Provide email addresses for initial administrators/editors/reviewers",
    "Creates authorized development and UAT users",
    "M1 Identity",
    "Critical",
    "Arun",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "Do not include passwords",
  ],
  [
    "IN-003",
    "Brand voice",
    "Klaank",
    "Complete audience, positioning and voice profile",
    "Grounds brand-specific generation",
    "M2 Brand",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-004",
    "Brand voice",
    "Spaarker",
    "Complete audience, positioning and voice profile",
    "Grounds brand-specific generation",
    "M2 Brand",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-005",
    "Brand voice",
    "Nations of Tomorrow",
    "Complete audience, positioning and voice profile",
    "Grounds brand-specific generation",
    "M2 Brand",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-006",
    "Brand voice",
    "Business of AI",
    "Complete audience, positioning and voice profile",
    "Grounds brand-specific generation",
    "M2 Brand",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-007",
    "Brand voice",
    "Wyngs",
    "Complete audience, positioning and voice profile",
    "Grounds brand-specific generation",
    "M2 Brand",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-008",
    "Examples",
    "All brands",
    "Provide 5–20 approved posts and at least 2 negative examples per brand",
    "Supports retrieval, brand fit and evals",
    "M2 Brand",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "URLs or pasted text are both acceptable",
  ],
  [
    "IN-009",
    "Visual assets",
    "All brands",
    "Upload approved logos, color values and licensed fonts",
    "Required for deterministic image composition",
    "M7 Images",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-010",
    "Sources",
    "All brands",
    "Provide initial RSS feeds and brand-routing rules",
    "Enables realistic source fixtures and RSS UAT",
    "M4 Sources & scoring",
    "High",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-011",
    "Policy",
    "All brands",
    "Define restricted topics and sensitive-topic escalation rules",
    "Controls risk scoring and readiness blocks",
    "M5 Research",
    "Critical",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-012",
    "Policy",
    "All brands",
    "Confirm data retention and deletion expectations",
    "Required for operations and release runbooks",
    "M8 Operations",
    "Medium",
    "Arun",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-013",
    "Infrastructure",
    "All brands",
    "Choose staging/production hosting and region",
    "Required before production resource creation",
    "M9 UAT & release",
    "High",
    "Arun",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "Development proceeds locally first",
  ],
  [
    "IN-014",
    "Infrastructure",
    "All brands",
    "Confirm OpenAI daily/monthly spend ceiling",
    "Sets provider and per-run budgets",
    "M5 Research",
    "High",
    "Arun",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-015",
    "Infrastructure",
    "All brands",
    "Provision development/staging Supabase, n8n and OpenAI resources",
    "Activates credentialed integration tests",
    "M9 UAT & release",
    "Medium",
    "Arun",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "No credentials in this sheet",
  ],
  [
    "IN-016",
    "Files",
    "All brands",
    "Confirm maximum upload size and PDF page limit",
    "Configures upload and extraction controls",
    "M4 Sources & scoring",
    "Medium",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
  [
    "IN-017",
    "Files",
    "All brands",
    "Decide whether OCR is required at Phase 1 launch",
    "Determines manual-handling policy versus OCR provider",
    "M4 Sources & scoring",
    "Medium",
    "Team",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "Current default: manual handling",
  ],
  [
    "IN-018",
    "UAT",
    "All brands",
    "Name UAT reviewers and final sign-off owner",
    "Required for controlled Phase 1 acceptance",
    "M9 UAT & release",
    "High",
    "Arun",
    "Requested",
    new Date("2026-07-23"),
    null,
    "",
    "",
  ],
];
inputRegister.getRange(`A5:M${4 + requests.length}`).values = requests;
inputRegister.getRange("J5:K104").format.numberFormat = "yyyy-mm-dd";
addListValidation(inputRegister, "F5:F104", milestones);
addListValidation(inputRegister, "G5:G104", priorities);
addListValidation(inputRegister, "H5:H104", owners);
addListValidation(inputRegister, "I5:I104", statuses);
configureSheet(inputRegister, "A4:M4", "A4:M104", [
  ["A", 11],
  ["B", 16],
  ["C", 21],
  ["D", 42],
  ["E", 38],
  ["F", 21],
  ["G", 12],
  ["H", 14],
  ["I", 14],
  ["J", 14],
  ["K", 14],
  ["L", 28],
  ["M", 34],
]);
inputRegister.getRange("D5:E104").format.wrapText = true;
inputRegister.getRange("L5:M104").format.wrapText = true;

const brandsSheet = workbook.worksheets.add("Brands");
styleTitle(
  brandsSheet,
  brandsSheet.getRange("A1:N1"),
  "Brand Profiles",
  "Complete one row per brand. Keep positioning specific enough that two brands would produce observably different interpretations of the same source.",
);
brandsSheet.getRange("A4:N4").values = [
  [
    "Brand",
    "Website",
    "Description",
    "Primary audience",
    "Audience knowledge",
    "Audience problems",
    "Positioning",
    "Content pillars",
    "Default language",
    "Default platform",
    "CTA style",
    "Geography",
    "Risk tolerance",
    "Status",
  ],
];
brandsSheet.getRange("A5:N9").values = brands.map((brand) => [
  brand,
  "",
  "",
  "",
  "Intermediate",
  "",
  "",
  "",
  "English",
  "Facebook",
  "",
  "Global",
  "Medium",
  "Requested",
]);
addListValidation(brandsSheet, "E5:E24", ["Beginner", "Intermediate", "Advanced", "Mixed"]);
addListValidation(brandsSheet, "I5:I24", ["English", "German", "French", "Spanish", "Other"]);
addListValidation(brandsSheet, "J5:J24", ["Facebook"]);
addListValidation(brandsSheet, "M5:M24", ["Low", "Medium", "High"]);
addListValidation(brandsSheet, "N5:N24", statuses);
configureSheet(brandsSheet, "A4:N4", "A4:N24", [
  ["A", 22],
  ["B", 28],
  ["C", 38],
  ["D", 34],
  ["E", 18],
  ["F", 38],
  ["G", 38],
  ["H", 38],
  ["I", 16],
  ["J", 16],
  ["K", 28],
  ["L", 16],
  ["M", 16],
  ["N", 14],
]);
brandsSheet.getRange("B5:N24").format.wrapText = true;

const voice = workbook.worksheets.add("Brand Voice");
styleTitle(
  voice,
  voice.getRange("A1:R1"),
  "Brand Voice Profiles",
  "Scores use a 1–5 scale. Add vocabulary and structural preferences that are distinctive, testable and safe to reuse in generation prompts.",
);
voice.getRange("A4:R4").values = [
  [
    "Brand",
    "Formality",
    "Energy",
    "Directness",
    "Humor",
    "Emotionality",
    "Technical depth",
    "Contrarian intensity",
    "Sentence length",
    "Paragraph length",
    "Questions",
    "First person",
    "Preferred vocabulary",
    "Disallowed expressions",
    "Opening patterns to avoid",
    "Emoji preference",
    "Hashtag preference",
    "Status",
  ],
];
voice.getRange("A5:R9").values = brands.map((brand) => [
  brand,
  3,
  3,
  3,
  2,
  3,
  3,
  2,
  "Medium",
  "Short",
  "Sometimes",
  "Sometimes",
  "",
  "",
  "",
  "Minimal",
  "Minimal",
  "Requested",
]);
for (const column of ["B", "C", "D", "E", "F", "G", "H"]) {
  addListValidation(voice, `${column}5:${column}24`, [1, 2, 3, 4, 5]);
}
addListValidation(voice, "I5:I24", ["Short", "Medium", "Long", "Varied"]);
addListValidation(voice, "J5:J24", ["Short", "Medium", "Long", "Varied"]);
addListValidation(voice, "K5:L24", ["Never", "Rarely", "Sometimes", "Often"]);
addListValidation(voice, "P5:Q24", ["None", "Minimal", "Moderate", "Frequent"]);
addListValidation(voice, "R5:R24", statuses);
configureSheet(voice, "A4:R4", "A4:R24", [
  ["A", 22],
  ["B", 11],
  ["C", 10],
  ["D", 12],
  ["E", 10],
  ["F", 14],
  ["G", 16],
  ["H", 19],
  ["I", 16],
  ["J", 17],
  ["K", 13],
  ["L", 14],
  ["M", 36],
  ["N", 36],
  ["O", 36],
  ["P", 17],
  ["Q", 18],
  ["R", 14],
]);
voice.getRange("M5:O24").format.wrapText = true;

const examples = workbook.worksheets.add("Content Examples");
styleTitle(
  examples,
  examples.getRange("A1:H1"),
  "Content Examples",
  "Provide approved, high-performing and negative examples. Paste text directly or link to a document; note why each example succeeds or fails.",
);
examples.getRange("A4:H4").values = [
  [
    "Brand",
    "Example type",
    "Content or Drive URL",
    "Performance notes",
    "Why it fits or fails",
    "Approved",
    "Owner",
    "Status",
  ],
];
examples.getRange("A5:H9").values = brands.map((brand) => [
  brand,
  "Approved post",
  "",
  "",
  "",
  "No",
  "Team",
  "Requested",
]);
addListValidation(examples, "A5:A104", brands);
addListValidation(examples, "B5:B104", [
  "Approved post",
  "High performer",
  "Negative example",
  "Image reference",
]);
addListValidation(examples, "F5:F104", ["Yes", "No"]);
addListValidation(examples, "G5:G104", owners);
addListValidation(examples, "H5:H104", statuses);
configureSheet(examples, "A4:H4", "A4:H104", [
  ["A", 22],
  ["B", 20],
  ["C", 48],
  ["D", 34],
  ["E", 38],
  ["F", 12],
  ["G", 14],
  ["H", 14],
]);
examples.getRange("C5:E104").format.wrapText = true;

const assets = workbook.worksheets.add("Visual Assets");
styleTitle(
  assets,
  assets.getRange("A1:J1"),
  "Visual Assets",
  "Upload source files to the project Drive folder and link them here. Only licensed and approved assets should be marked Accepted.",
);
assets.getRange("A4:J4").values = [
  [
    "Brand",
    "Asset type",
    "Asset name",
    "Drive URL",
    "Color value",
    "Usage or license notes",
    "Preferred use",
    "Owner",
    "Status",
    "Validation notes",
  ],
];
assets.getRange("A5:J9").values = brands.map((brand) => [
  brand,
  "Primary logo",
  "",
  "",
  "",
  "",
  "",
  "Team",
  "Requested",
  "",
]);
addListValidation(assets, "A5:A104", brands);
addListValidation(assets, "B5:B104", [
  "Primary logo",
  "Secondary logo",
  "Icon",
  "Font",
  "Color",
  "Image reference",
  "Layout reference",
]);
addListValidation(assets, "H5:H104", owners);
addListValidation(assets, "I5:I104", statuses);
configureSheet(assets, "A4:J4", "A4:J104", [
  ["A", 22],
  ["B", 20],
  ["C", 26],
  ["D", 38],
  ["E", 16],
  ["F", 36],
  ["G", 30],
  ["H", 14],
  ["I", 14],
  ["J", 34],
]);
assets.getRange("D5:J104").format.wrapText = true;

const rss = workbook.worksheets.add("RSS Feeds");
styleTitle(
  rss,
  rss.getRange("A1:N1"),
  "RSS Feed Intake",
  "Add feeds and routing rules. Phase 1 uses a low-cost scoring pass for every item and performs research only for eligible selected opportunities.",
);
rss.getRange("A4:N4").values = [
  [
    "Feed name",
    "RSS URL",
    "Assigned brands",
    "Topic tags",
    "Authority (1–5)",
    "Poll frequency",
    "Include keywords",
    "Exclude keywords",
    "Minimum score",
    "Generation policy",
    "Daily generation limit",
    "Active",
    "Owner",
    "Status",
  ],
];
rss.getRange("A5:N5").values = [
  [
    "Example — replace",
    "",
    "Business of AI",
    "AI, technology",
    3,
    "Every 60 minutes",
    "",
    "",
    72,
    "Opportunity only",
    3,
    "No",
    "Team",
    "Requested",
  ],
];
addListValidation(rss, "E5:E104", [1, 2, 3, 4, 5]);
addListValidation(rss, "F5:F104", [
  "Every 15 minutes",
  "Every 30 minutes",
  "Every 60 minutes",
  "Every 6 hours",
  "Daily",
]);
addListValidation(rss, "J5:J104", ["Opportunity only", "Best style", "All styles"]);
addListValidation(rss, "L5:L104", ["Yes", "No"]);
addListValidation(rss, "M5:M104", owners);
addListValidation(rss, "N5:N104", statuses);
configureSheet(rss, "A4:N4", "A4:N104", [
  ["A", 26],
  ["B", 42],
  ["C", 28],
  ["D", 28],
  ["E", 16],
  ["F", 20],
  ["G", 30],
  ["H", 30],
  ["I", 16],
  ["J", 20],
  ["K", 19],
  ["L", 12],
  ["M", 14],
  ["N", 14],
]);
rss.getRange("B5:H104").format.wrapText = true;

const risk = workbook.worksheets.add("Editorial & Risk");
styleTitle(
  risk,
  risk.getRange("A1:K1"),
  "Editorial and Risk Policies",
  "Define explicit rules that deterministic validation and human review can enforce. Interpretations should be phrased as interpretations; high-risk unsupported claims block readiness.",
);
risk.getRange("A4:K4").values = [
  [
    "Policy ID",
    "Brand scope",
    "Topic or risk",
    "Policy type",
    "Rule",
    "Escalation required",
    "Escalation owner",
    "Severity",
    "Source or rationale",
    "Status",
    "Notes",
  ],
];
risk.getRange("A5:K9").values = [
  [
    "POL-001",
    "All brands",
    "Unsupported numerical claims",
    "Prohibited",
    "Do not publish numerical claims without recorded authoritative support.",
    "Yes",
    "Reviewer",
    "Critical",
    "Phase 1 PRD",
    "Accepted",
    "",
  ],
  [
    "POL-002",
    "All brands",
    "Automatic publishing",
    "Prohibited",
    "The system must never publish or schedule social content.",
    "Yes",
    "Administrator",
    "Critical",
    "Phase 1 PRD",
    "Accepted",
    "",
  ],
  [
    "POL-003",
    "All brands",
    "Virality guarantee",
    "Prohibited",
    "Do not claim or imply guaranteed virality.",
    "No",
    "Reviewer",
    "High",
    "Phase 1 PRD",
    "Accepted",
    "",
  ],
  [
    "POL-004",
    "All brands",
    "Political or regulatory sensitivity",
    "Escalation",
    "Team must define brand-specific handling and escalation.",
    "Yes",
    "Reviewer",
    "High",
    "",
    "Requested",
    "",
  ],
  [
    "POL-005",
    "All brands",
    "Direct quotations",
    "Verification",
    "Use only exact quotations retained with source location.",
    "Yes",
    "Reviewer",
    "High",
    "Phase 1 PRD",
    "Accepted",
    "",
  ],
];
addListValidation(risk, "B5:B104", ["All brands", ...brands]);
addListValidation(risk, "D5:D104", [
  "Prohibited",
  "Escalation",
  "Verification",
  "Allowed with caveat",
  "Required",
]);
addListValidation(risk, "F5:F104", ["Yes", "No"]);
addListValidation(risk, "G5:G104", ["Administrator", "Editor", "Reviewer"]);
addListValidation(risk, "H5:H104", ["Critical", "High", "Medium", "Low"]);
addListValidation(risk, "J5:J104", statuses);
configureSheet(risk, "A4:K4", "A4:K104", [
  ["A", 13],
  ["B", 20],
  ["C", 32],
  ["D", 20],
  ["E", 52],
  ["F", 19],
  ["G", 18],
  ["H", 12],
  ["I", 26],
  ["J", 14],
  ["K", 34],
]);
risk.getRange("C5:K104").format.wrapText = true;

const infrastructure = workbook.worksheets.add("Infrastructure");
styleTitle(
  infrastructure,
  infrastructure.getRange("A1:J1"),
  "Infrastructure and Access",
  "Track provisioning without recording secrets. Credentials must remain in approved secret stores and n8n credential storage.",
);
infrastructure.getRange("A4:J4").values = [
  [
    "Resource",
    "Environment",
    "Purpose",
    "Owner",
    "Provisioning status",
    "Region",
    "Spend limit",
    "Secret location",
    "Blocking milestone",
    "Notes",
  ],
];
infrastructure.getRange("A5:J12").values = [
  [
    "Supabase",
    "Local",
    "Database, Auth, Storage and RLS development",
    "Codex",
    "In progress",
    "Local",
    "",
    "Local environment only",
    "M1 Identity",
    "",
  ],
  [
    "Supabase",
    "Staging",
    "Credentialed integration and UAT",
    "Arun",
    "Not started",
    "",
    "",
    "Approved secret store",
    "M9 UAT & release",
    "",
  ],
  [
    "n8n",
    "Local",
    "Workflow import and contract testing",
    "Codex",
    "In progress",
    "Local",
    "",
    "Local environment only",
    "M4 Sources & scoring",
    "",
  ],
  [
    "n8n",
    "Staging",
    "Credentialed workflow UAT",
    "Arun",
    "Not started",
    "",
    "",
    "n8n credential storage",
    "M9 UAT & release",
    "",
  ],
  [
    "OpenAI",
    "Development",
    "Small credentialed smoke tests",
    "Arun",
    "Not started",
    "",
    "",
    "Approved secret store",
    "M5 Research",
    "",
  ],
  [
    "OpenAI",
    "Production",
    "Bounded research, generation and images",
    "Arun",
    "Not started",
    "",
    "",
    "Approved secret store",
    "M9 UAT & release",
    "",
  ],
  [
    "Email",
    "Staging",
    "Authentication email delivery",
    "Arun",
    "Not started",
    "",
    "",
    "Approved secret store",
    "M9 UAT & release",
    "",
  ],
  [
    "Hosting",
    "Staging",
    "Production-like deployment",
    "Arun",
    "Not started",
    "",
    "",
    "Provider secret store",
    "M9 UAT & release",
    "",
  ],
];
addListValidation(infrastructure, "B5:B104", ["Local", "Development", "Staging", "Production"]);
addListValidation(infrastructure, "D5:D104", owners);
addListValidation(infrastructure, "E5:E104", [
  "Not started",
  "In progress",
  "Ready",
  "Verified",
  "Not applicable",
]);
addListValidation(infrastructure, "I5:I104", milestones);
configureSheet(infrastructure, "A4:J4", "A4:J104", [
  ["A", 20],
  ["B", 16],
  ["C", 38],
  ["D", 14],
  ["E", 20],
  ["F", 16],
  ["G", 18],
  ["H", 28],
  ["I", 21],
  ["J", 34],
]);
infrastructure.getRange("C5:J104").format.wrapText = true;

const uat = workbook.worksheets.add("UAT");
styleTitle(
  uat,
  uat.getRange("A1:K1"),
  "Phase 1 UAT",
  "Acceptance scenarios are traced to the PRD. Evidence links should point to test runs, screenshots, downloaded packages or audit records.",
);
uat.getRange("A4:K4").values = [
  [
    "UAT ID",
    "Capability",
    "Scenario",
    "Role",
    "Brand",
    "Expected result",
    "Owner",
    "Status",
    "Evidence link",
    "Test date",
    "Notes",
  ],
];
const uatRows = [
  [
    "UAT-001",
    "Identity",
    "Sign in and switch assigned brands",
    "Editor",
    "All brands",
    "Only assigned brands are visible and selectable.",
  ],
  [
    "UAT-002",
    "Brand",
    "Configure voice, examples and visual assets",
    "Administrator",
    "Klaank",
    "Saved settings appear in normalized brand context.",
  ],
  [
    "UAT-003",
    "Input",
    "Submit plain text and an RSS feed",
    "Editor",
    "Business of AI",
    "Sources are normalized, deduplicated, clustered and scored.",
  ],
  [
    "UAT-004",
    "Evidence",
    "Inspect value nucleus, research and claims",
    "Reviewer",
    "Business of AI",
    "Every factual sentence is traceable to evidence.",
  ],
  [
    "UAT-005",
    "Generation",
    "Generate 1–3 materially different styles",
    "Editor",
    "Spaarker",
    "Newsworthy, Educational and Perspective outputs differ materially.",
  ],
  [
    "UAT-006",
    "Review",
    "Edit and selectively regenerate hook",
    "Reviewer",
    "Wyngs",
    "A new immutable version is created and audit history is retained.",
  ],
  [
    "UAT-007",
    "Image",
    "Generate and compose a branded image",
    "Editor",
    "Nations of Tomorrow",
    "Typography is accurate and image can be downloaded.",
  ],
  [
    "UAT-008",
    "Approval",
    "Approve, reject, copy and download package",
    "Administrator",
    "Klaank",
    "Actions are available; nothing is published or scheduled.",
  ],
  [
    "UAT-009",
    "Operations",
    "Inspect and retry a failed run",
    "Administrator",
    "All brands",
    "Failure, retry, cost and audit data are visible.",
  ],
];
uat.getRange(`A5:K${4 + uatRows.length}`).values = uatRows.map((row) => [
  ...row,
  "Arun",
  "Not started",
  "",
  null,
  "",
]);
addListValidation(uat, "D5:D104", ["Administrator", "Editor", "Reviewer", "Viewer"]);
addListValidation(uat, "E5:E104", ["All brands", ...brands]);
addListValidation(uat, "G5:G104", owners);
addListValidation(uat, "H5:H104", ["Not started", "In progress", "Passed", "Failed", "Blocked"]);
uat.getRange("J5:J104").format.numberFormat = "yyyy-mm-dd";
configureSheet(uat, "A4:K4", "A4:K104", [
  ["A", 13],
  ["B", 18],
  ["C", 38],
  ["D", 16],
  ["E", 22],
  ["F", 46],
  ["G", 14],
  ["H", 14],
  ["I", 32],
  ["J", 14],
  ["K", 34],
]);
uat.getRange("C5:K104").format.wrapText = true;

for (const sheetName of [
  "Input Register",
  "Brands",
  "Brand Voice",
  "Content Examples",
  "Visual Assets",
  "RSS Feeds",
  "Editorial & Risk",
  "Infrastructure",
  "UAT",
]) {
  const sheet = workbook.worksheets.getItem(sheetName);
  sheet.getRange("A4:Z104").format.font = { name: "Arial", size: 10, color: colors.ink };
  styleHeader(
    sheet.getRange(
      `A4:${sheet
        .getUsedRange()
        .getColumn(sheet.getUsedRange().columnCount - 1)
        .address.split(":")[0]
        .replace(/\d/g, "")}4`,
    ),
  );
}

await fs.mkdir(outputDir, { recursive: true });

const checks = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 6000,
  tableMaxRows: 8,
  tableMaxCols: 14,
  tableMaxCellChars: 100,
});
await fs.writeFile(path.join(outputDir, "inspection.ndjson"), checks.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "formula-errors.ndjson"), errors.ndjson, "utf8");

for (const sheetName of workbook.worksheets.items.map((sheet) => sheet.name)) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  const safeName = sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await fs.writeFile(
    path.join(outputDir, `${safeName}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
