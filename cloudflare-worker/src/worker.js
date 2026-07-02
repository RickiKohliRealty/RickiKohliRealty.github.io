const json = (body, status = 200, origin = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });

const textResponse = (body, status = 200, origin = "*", contentType = "text/plain; charset=utf-8", contentDisposition = "") =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...(contentDisposition ? { "Content-Disposition": contentDisposition } : {})
    }
  });

const ALERT_SUBSCRIPTION_LABEL = "listing-alert-subscription";
const ALERT_EMAIL_LABEL = "listing-alert";
const LEAD_LABEL = "lead";
const WEBSITE_LABEL = "website";
const MAX_SENT_LISTING_IDS = 250;
const INQUIRY_STATUS_VALID_READY_NOW = "VALID + READY NOW";
const INQUIRY_STATUS_VALID_COMING_SOON = "VALID + COMING SOON";
const INQUIRY_STATUS_INVALID_NEEDS_FOLLOW_UP = "INVALID / NEEDS FOLLOW-UP";
const DEFAULT_LISTING_FEED = [
  {
    listing_id: "vic-downtown-condo-001",
    address: "838 Broughton St",
    city: "Victoria",
    area: "Downtown",
    property_type: "Condo",
    list_price: 529000,
    status: "active",
    url: "https://rickikohlirealty.github.io/deals.html?q=Victoria"
  },
  {
    listing_id: "vic-james-bay-townhome-002",
    address: "355 Simcoe St",
    city: "Victoria",
    area: "James Bay",
    property_type: "Townhome",
    list_price: 789000,
    status: "active",
    url: "https://rickikohlirealty.github.io/deals.html?q=Victoria"
  },
  {
    listing_id: "langford-detached-003",
    address: "1127 Goldstream Ave",
    city: "Langford",
    area: "City Centre",
    property_type: "Detached",
    list_price: 899000,
    status: "active",
    url: "https://rickikohlirealty.github.io/homes-for-sale-langford-bc.html"
  },
  {
    listing_id: "saanich-family-home-004",
    address: "4095 Quadra St",
    city: "Saanich",
    area: "Saanich East",
    property_type: "Detached",
    list_price: 1125000,
    status: "active",
    url: "https://rickikohlirealty.github.io/homes-for-sale-saanich-bc.html"
  },
  {
    listing_id: "oak-bay-character-005",
    address: "1966 Beach Dr",
    city: "Oak Bay",
    area: "South Oak Bay",
    property_type: "Detached",
    list_price: 1499000,
    status: "active",
    url: "https://rickikohlirealty.github.io/homes-for-sale-oak-bay-bc.html"
  },
  {
    listing_id: "colwood-townhome-006",
    address: "1928 Sooke Rd",
    city: "Colwood",
    area: "Royal Bay",
    property_type: "Townhome",
    list_price: 729000,
    status: "active",
    url: "https://rickikohlirealty.github.io/homes-for-sale-colwood-bc.html"
  },
  {
    listing_id: "esquimalt-condo-007",
    address: "845 Dunsmuir Rd",
    city: "Esquimalt",
    area: "Esquimalt Village",
    property_type: "Condo",
    list_price: 589000,
    status: "active",
    url: "https://rickikohlirealty.github.io/homes-for-sale-esquimalt-bc.html"
  },
  {
    listing_id: "victoria-investment-duplex-008",
    address: "2604 Quadra St",
    city: "Victoria",
    area: "Hillside",
    property_type: "Investment",
    list_price: 1299000,
    status: "active",
    url: "https://rickikohlirealty.github.io/deals.html?q=Victoria"
  },
  {
    listing_id: "vic-fernwood-rancher-009",
    address: "1215 Balmoral Rd",
    city: "Victoria",
    area: "Fernwood",
    property_type: "Detached",
    list_price: 869000,
    status: "active",
    url: "https://rickikohlirealty.github.io/deals.html?q=Victoria"
  },
  {
    listing_id: "saanich-broadmead-condo-010",
    address: "4357 Tyndall Ave",
    city: "Saanich",
    area: "Broadmead",
    property_type: "Condo",
    list_price: 639000,
    status: "active",
    url: "https://rickikohlirealty.github.io/homes-for-sale-saanich-bc.html"
  }
];

const parseAllowedOrigins = (env) =>
  String(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const isOriginAllowed = (request, env) => {
  const allowedOrigins = parseAllowedOrigins(env);
  if (!allowedOrigins.length) return true;
  const requestOrigin = request.headers.get("Origin");
  if (!requestOrigin) return true;
  return allowedOrigins.includes(requestOrigin);
};

const getOrigin = (request, env) => {
  const allowedOrigins = parseAllowedOrigins(env);
  if (!allowedOrigins.length) return "*";
  const requestOrigin = request.headers.get("Origin") || "";
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
};

const parseManagerEmails = (rawValue) =>
  String(rawValue || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const clampText = (value, max = 600) => normalizeWhitespace(value).slice(0, max);
const normalizeEmail = (value) => clampText(value, 254).toLowerCase();
const normalizePhone = (value) => clampText(value, 40).replace(/[^\d+()\-\s]/g, "");
const toBoolean = (value) => ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const parseBudgetNumber = (value) => {
  const numeric = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
};
const hasMinimumText = (value, min = 2) => clampText(value, 300).length >= min;
const isValidEmail = (value) => EMAIL_REGEX.test(normalizeEmail(value));
const getInquiryTypeLabel = (kind) => (kind === "alert" ? "NOTIFY ME / LISTING ALERT SUBSCRIPTION" : "WEBSITE LEAD INQUIRY");
const normalizeTimelineValue = (value) => clampText(value, 120).toLowerCase();
const isComingSoonTimeline = (timeline) => {
  const normalized = normalizeTimelineValue(timeline);
  if (!normalized) return false;
  return (
    normalized.includes("3-6") ||
    normalized.includes("6+") ||
    normalized.includes("research") ||
    normalized.includes("coming soon") ||
    normalized.includes("later") ||
    normalized.includes("future")
  );
};
const getInquiryStatusTag = (kind, payload) => {
  const nameValid = hasMinimumText(payload?.name, 2);
  const emailValid = isValidEmail(payload?.email);
  const consentValid = toBoolean(payload?.consentToContact);
  const baseValid = nameValid && emailValid && consentValid;

  if (kind === "alert") {
    const targetAreaValid = hasMinimumText(payload?.targetArea, 2);
    if (!baseValid || !targetAreaValid) return INQUIRY_STATUS_INVALID_NEEDS_FOLLOW_UP;
  } else {
    const leadTypeValid = hasMinimumText(payload?.type, 2);
    if (!baseValid || !leadTypeValid) return INQUIRY_STATUS_INVALID_NEEDS_FOLLOW_UP;
  }
  return isComingSoonTimeline(payload?.timeline) ? INQUIRY_STATUS_VALID_COMING_SOON : INQUIRY_STATUS_VALID_READY_NOW;
};
const escapeCsvValue = (value) => {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, "\"\"")}"`;
  return raw;
};

const sanitizeLead = (lead) => {
  const budgetValue = Number(lead?.budgetMax);
  return {
    name: clampText(lead?.name, 120),
    email: normalizeEmail(lead?.email),
    phone: normalizePhone(lead?.phone),
    type: clampText(lead?.type, 80),
    message: clampText(lead?.message, 2500),
    targetArea: clampText(lead?.targetArea, 140),
    timeline: clampText(lead?.timeline, 80),
    budgetMax: Number.isFinite(budgetValue) && budgetValue > 0 ? Math.round(budgetValue) : null,
    consentToContact: toBoolean(lead?.consentToContact),
    source: clampText(lead?.source || "website", 80),
    landingPage: clampText(lead?.landingPage, 300),
    utmSource: clampText(lead?.utmSource, 120),
    utmMedium: clampText(lead?.utmMedium, 120),
    utmCampaign: clampText(lead?.utmCampaign, 120),
    utmTerm: clampText(lead?.utmTerm, 120),
    utmContent: clampText(lead?.utmContent, 120),
    referrer: clampText(lead?.referrer, 300),
    firstTouchAt: clampText(lead?.firstTouchAt, 40),
    firstTouchPage: clampText(lead?.firstTouchPage, 300),
    firstUtmSource: clampText(lead?.firstUtmSource, 120),
    firstUtmMedium: clampText(lead?.firstUtmMedium, 120),
    firstUtmCampaign: clampText(lead?.firstUtmCampaign, 120),
    submittedAt: clampText(lead?.submittedAt, 40) || new Date().toISOString(),
    honeypot: clampText(lead?.honeypot || lead?.website || "", 120)
  };
};

const validateLead = (lead) => {
  if (!lead || typeof lead !== "object") return "Missing lead payload.";
  if (lead.honeypot) return "Submission rejected.";
  if (!lead.name || lead.name.length < 2) return "Name is required.";
  if (!lead.email || !EMAIL_REGEX.test(lead.email)) return "A valid email is required.";
  if (!lead.type || lead.type.length < 2) return "Lead type is required.";
  if (lead.phone && lead.phone.replace(/\D/g, "").length < 7) return "Phone number appears invalid.";
  if (!lead.consentToContact) return "Contact consent is required.";
  return "";
};

const sanitizeAlertSubscription = (subscription) => {
  const budgetValue = Number(subscription?.budgetMax);
  const rawFrequency = clampText(subscription?.alertFrequency || subscription?.frequency || "daily", 32).toLowerCase();
  const alertFrequency = ["instant", "daily", "weekly"].includes(rawFrequency) ? rawFrequency : "daily";
  return {
    name: clampText(subscription?.name, 120),
    email: normalizeEmail(subscription?.email),
    phone: normalizePhone(subscription?.phone),
    type: "Listing Alert Subscription",
    targetArea: clampText(subscription?.targetArea, 140),
    propertyType: clampText(subscription?.propertyType || "any", 80).toLowerCase(),
    budgetMax: Number.isFinite(budgetValue) && budgetValue > 0 ? Math.round(budgetValue) : null,
    timeline: clampText(subscription?.timeline, 80),
    alertFrequency,
    message: clampText(subscription?.message, 1200),
    consentToContact: toBoolean(subscription?.consentToContact),
    source: clampText(subscription?.source || "listing-alert-subscribe", 80),
    landingPage: clampText(subscription?.landingPage, 300),
    utmSource: clampText(subscription?.utmSource, 120),
    utmMedium: clampText(subscription?.utmMedium, 120),
    utmCampaign: clampText(subscription?.utmCampaign, 120),
    utmTerm: clampText(subscription?.utmTerm, 120),
    utmContent: clampText(subscription?.utmContent, 120),
    referrer: clampText(subscription?.referrer, 300),
    firstTouchAt: clampText(subscription?.firstTouchAt, 40),
    firstTouchPage: clampText(subscription?.firstTouchPage, 300),
    firstUtmSource: clampText(subscription?.firstUtmSource, 120),
    firstUtmMedium: clampText(subscription?.firstUtmMedium, 120),
    firstUtmCampaign: clampText(subscription?.firstUtmCampaign, 120),
    submittedAt: clampText(subscription?.submittedAt, 40) || new Date().toISOString(),
    honeypot: clampText(subscription?.honeypot || subscription?.website || "", 120)
  };
};

const validateAlertSubscription = (subscription) => {
  if (!subscription || typeof subscription !== "object") return "Missing alert subscription payload.";
  if (subscription.honeypot) return "Submission rejected.";
  if (!subscription.name || subscription.name.length < 2) return "Name is required.";
  if (!subscription.email || !EMAIL_REGEX.test(subscription.email)) return "A valid email is required.";
  if (!subscription.targetArea || subscription.targetArea.length < 2) return "Target area is required.";
  if (!subscription.consentToContact) return "Alert consent is required.";
  return "";
};

const formatBudget = (budgetMax) => (budgetMax ? `$${Number(budgetMax).toLocaleString()}` : "(not provided)");
const createLeadFingerprint = (lead) =>
  [lead.email, lead.phone || "no-phone", lead.type, lead.source].join("|").toLowerCase();
const createSubscriptionFingerprint = (subscription) =>
  [subscription.email, subscription.targetArea, subscription.propertyType || "any"].join("|").toLowerCase();

const createLeadIssueBody = (lead) => {
  const lines = [
    "## New website lead",
    "",
    `- **Name:** ${lead.name}`,
    `- **Email:** ${lead.email}`,
    `- **Phone:** ${lead.phone || "(not provided)"}`,
    `- **Type:** ${lead.type}`,
    `- **Inquiry kind:** ${getInquiryTypeLabel("lead")}`,
    `- **Status tag:** ${getInquiryStatusTag("lead", lead)}`,
    `- **Target area:** ${lead.targetArea || "(not provided)"}`,
    `- **Budget max:** ${formatBudget(lead.budgetMax)}`,
    `- **Timeline:** ${lead.timeline || "(not provided)"}`,
    `- **Consent to contact:** ${lead.consentToContact ? "Yes" : "No"}`,
    `- **Submitted at:** ${lead.submittedAt || new Date().toISOString()}`,
    `- **Landing page:** ${lead.landingPage || "(not provided)"}`,
    `- **UTM source:** ${lead.utmSource || "(none)"}`,
    `- **UTM medium:** ${lead.utmMedium || "(none)"}`,
    `- **UTM campaign:** ${lead.utmCampaign || "(none)"}`,
    `- **UTM term:** ${lead.utmTerm || "(none)"}`,
    `- **UTM content:** ${lead.utmContent || "(none)"}`,
    `- **Referrer:** ${lead.referrer || "(direct)"}`,
    `- **First touch at:** ${lead.firstTouchAt || "(not provided)"}`,
    `- **First touch page:** ${lead.firstTouchPage || "(not provided)"}`,
    `- **First UTM source:** ${lead.firstUtmSource || "(none)"}`,
    `- **First UTM medium:** ${lead.firstUtmMedium || "(none)"}`,
    `- **First UTM campaign:** ${lead.firstUtmCampaign || "(none)"}`,
    "",
    "### Message",
    lead.message || "(none)",
    "",
    `Source: ${lead.source || "website"}`,
    `Lead fingerprint: ${createLeadFingerprint(lead)}`
  ];
  return lines.join("\n");
};

const buildAlertIssueTitle = (subscription) => `Listing Alert: ${subscription.targetArea} — ${subscription.name}`;

const dedupeSentListingIds = (ids) => [...new Set(ids.filter(Boolean).map((id) => clampText(id, 120)))].slice(-MAX_SENT_LISTING_IDS);

const createAlertSubscriptionIssueBody = (subscription, state = {}) => {
  const sentListingIds = dedupeSentListingIds(Array.isArray(state.sentListingIds) ? state.sentListingIds : []);
  const lastNotifiedAt = clampText(state.lastNotifiedAt, 40);
  const lines = [
    "## Listing alert subscription",
    "",
    `- **Name:** ${subscription.name}`,
    `- **Email:** ${subscription.email}`,
    `- **Phone:** ${subscription.phone || "(not provided)"}`,
    `- **Type:** ${subscription.type}`,
    `- **Inquiry kind:** ${getInquiryTypeLabel("alert")}`,
    `- **Status tag:** ${getInquiryStatusTag("alert", subscription)}`,
    `- **Target area:** ${subscription.targetArea}`,
    `- **Property type:** ${subscription.propertyType || "any"}`,
    `- **Budget max:** ${formatBudget(subscription.budgetMax)}`,
    `- **Timeline:** ${subscription.timeline || "(not provided)"}`,
    `- **Alert frequency:** ${subscription.alertFrequency || "daily"}`,
    `- **Consent to contact:** ${subscription.consentToContact ? "Yes" : "No"}`,
    `- **Submitted at:** ${subscription.submittedAt || new Date().toISOString()}`,
    `- **Landing page:** ${subscription.landingPage || "(not provided)"}`,
    `- **UTM source:** ${subscription.utmSource || "(none)"}`,
    `- **UTM medium:** ${subscription.utmMedium || "(none)"}`,
    `- **UTM campaign:** ${subscription.utmCampaign || "(none)"}`,
    `- **UTM term:** ${subscription.utmTerm || "(none)"}`,
    `- **UTM content:** ${subscription.utmContent || "(none)"}`,
    `- **Referrer:** ${subscription.referrer || "(direct)"}`,
    `- **First touch at:** ${subscription.firstTouchAt || "(not provided)"}`,
    `- **First touch page:** ${subscription.firstTouchPage || "(not provided)"}`,
    `- **First UTM source:** ${subscription.firstUtmSource || "(none)"}`,
    `- **First UTM medium:** ${subscription.firstUtmMedium || "(none)"}`,
    `- **First UTM campaign:** ${subscription.firstUtmCampaign || "(none)"}`,
    `- **Subscription fingerprint:** ${createSubscriptionFingerprint(subscription)}`,
    `- **Sent listing IDs:** ${sentListingIds.length ? sentListingIds.join(",") : "(none)"}`,
    `- **Last notified at:** ${lastNotifiedAt || "(never)"}`,
    "",
    "### Notes",
    subscription.message || "(none)",
    "",
    `Source: ${subscription.source || "listing-alert-subscribe"}`
  ];
  return lines.join("\n");
};

const extractLineField = (body, label) => {
  const safeLabel = escapeRegex(label);
  const match = body.match(new RegExp(`- \\*\\*${safeLabel}:\\*\\* (.*)`));
  return match ? match[1].trim() : "";
};

const extractSection = (body, heading) => {
  const [, section = ""] = String(body || "").split(heading);
  if (!section) return "";
  const [content = ""] = section.split("\n\nSource:");
  return content.trim();
};

const parseLeadIssue = (issue) => {
  const body = issue.body || "";
  const lead = {
    name: extractLineField(body, "Name"),
    email: normalizeEmail(extractLineField(body, "Email")),
    phone: extractLineField(body, "Phone"),
    type: extractLineField(body, "Type"),
    targetArea: extractLineField(body, "Target area"),
    budgetMax: parseBudgetNumber(extractLineField(body, "Budget max")),
    timeline: extractLineField(body, "Timeline"),
    consentToContact: toBoolean(extractLineField(body, "Consent to contact")),
    submittedAt: extractLineField(body, "Submitted at"),
    landingPage: extractLineField(body, "Landing page"),
    utmSource: extractLineField(body, "UTM source"),
    utmMedium: extractLineField(body, "UTM medium"),
    utmCampaign: extractLineField(body, "UTM campaign"),
    utmTerm: extractLineField(body, "UTM term"),
    utmContent: extractLineField(body, "UTM content"),
    referrer: extractLineField(body, "Referrer"),
    firstTouchAt: extractLineField(body, "First touch at"),
    firstTouchPage: extractLineField(body, "First touch page"),
    firstUtmSource: extractLineField(body, "First UTM source"),
    firstUtmMedium: extractLineField(body, "First UTM medium"),
    firstUtmCampaign: extractLineField(body, "First UTM campaign"),
    message: extractSection(body, "### Message"),
    source: (body.match(/Source:\s*(.*)/) || [])[1] || ""
  };
  const statusTag = extractLineField(body, "Status tag") || getInquiryStatusTag("lead", lead);
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    title: issue.title,
    status: issue.state,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    ...lead,
    inquiryTypeLabel: getInquiryTypeLabel("lead"),
    statusTag
  };
};

const parseAlertSubscriptionIssue = (issue) => {
  const body = issue.body || "";
  const sentIdsValue = extractLineField(body, "Sent listing IDs");
  const sentListingIds =
    sentIdsValue && sentIdsValue !== "(none)"
      ? dedupeSentListingIds(sentIdsValue.split(",").map((entry) => entry.trim()))
      : [];
  const subscription = {
    name: extractLineField(body, "Name"),
    email: normalizeEmail(extractLineField(body, "Email")),
    phone: extractLineField(body, "Phone"),
    type: extractLineField(body, "Type") || "Listing Alert Subscription",
    targetArea: extractLineField(body, "Target area"),
    propertyType: clampText(extractLineField(body, "Property type") || "any", 80).toLowerCase(),
    budgetMax: parseBudgetNumber(extractLineField(body, "Budget max")),
    timeline: extractLineField(body, "Timeline"),
    alertFrequency: clampText(extractLineField(body, "Alert frequency") || "daily", 32).toLowerCase(),
    consentToContact: toBoolean(extractLineField(body, "Consent to contact")),
    submittedAt: extractLineField(body, "Submitted at"),
    landingPage: extractLineField(body, "Landing page"),
    utmSource: extractLineField(body, "UTM source"),
    utmMedium: extractLineField(body, "UTM medium"),
    utmCampaign: extractLineField(body, "UTM campaign"),
    utmTerm: extractLineField(body, "UTM term"),
    utmContent: extractLineField(body, "UTM content"),
    referrer: extractLineField(body, "Referrer"),
    firstTouchAt: extractLineField(body, "First touch at"),
    firstTouchPage: extractLineField(body, "First touch page"),
    firstUtmSource: extractLineField(body, "First UTM source"),
    firstUtmMedium: extractLineField(body, "First UTM medium"),
    firstUtmCampaign: extractLineField(body, "First UTM campaign"),
    message: extractSection(body, "### Notes"),
    source: (body.match(/Source:\s*(.*)/) || [])[1] || "listing-alert-subscribe"
  };
  const statusTag = extractLineField(body, "Status tag") || getInquiryStatusTag("alert", subscription);
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    issueTitle: issue.title,
    issueStatus: issue.state,
    issueBody: body,
    ...subscription,
    inquiryTypeLabel: getInquiryTypeLabel("alert"),
    statusTag,
    sentListingIds,
    lastNotifiedAt: extractLineField(body, "Last notified at"),
    fingerprint: extractLineField(body, "Subscription fingerprint")
  };
};

const githubHeaders = (env) => ({
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "Content-Type": "application/json",
  "User-Agent": "ricky-website-lead-worker"
});

const ensureWorkerConfig = (env) => {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return "Missing worker environment configuration.";
  }
  return "";
};

const hasGmailConfig = (env) =>
  Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && getAlertFromEmail(env));

const getAlertFromEmail = (env) => {
  const explicit = normalizeEmail(env.ALERT_FROM_EMAIL || "");
  if (explicit) return explicit;
  const managerFallback = parseManagerEmails(env.MANAGER_EMAILS)[0] || "";
  return normalizeEmail(managerFallback);
};

const verifyGoogleIdToken = async (idToken, env) => {
  if (!idToken) return { ok: false, error: "Missing Google bearer token." };
  if (!env.GOOGLE_CLIENT_ID) return { ok: false, error: "Missing GOOGLE_CLIENT_ID worker configuration." };

  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) return { ok: false, error: "Invalid Google token." };
    const tokenInfo = await response.json();
    const email = String(tokenInfo.email || "").toLowerCase();

    if (tokenInfo.aud !== env.GOOGLE_CLIENT_ID) {
      return { ok: false, error: "Google token audience mismatch." };
    }
    if (tokenInfo.email_verified !== "true") {
      return { ok: false, error: "Google email is not verified." };
    }

    const allowedManagers = parseManagerEmails(env.MANAGER_EMAILS);
    if (allowedManagers.length && !allowedManagers.includes(email)) {
      return { ok: false, error: "Google account is not authorized." };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, error: "Google token verification failed." };
  }
};

const listIssuesByLabels = async (env, labels, options = {}) => {
  const state = options.state || "open";
  const perPage = options.perPage || 50;
  const direction = options.direction || "desc";
  const encodedLabels = encodeURIComponent(labels.join(","));
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=${encodeURIComponent(
    state
  )}&labels=${encodedLabels}&per_page=${encodeURIComponent(perPage)}&sort=created&direction=${encodeURIComponent(direction)}`;
  const response = await fetch(apiUrl, { headers: githubHeaders(env) });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${detail}`);
  }
  const issues = await response.json();
  return issues.filter((issue) => !issue.pull_request);
};

const createGitHubIssue = async (env, payload) => {
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: githubHeaders(env),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${detail}`);
  }
  return response.json();
};

const updateGitHubIssue = async (env, issueNumber, payload) => {
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`;
  const response = await fetch(apiUrl, {
    method: "PATCH",
    headers: githubHeaders(env),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub issue update error (${response.status}): ${detail}`);
  }
  return response.json();
};

const listLeadIssues = async (env) => {
  const issues = await listIssuesByLabels(env, [LEAD_LABEL, WEBSITE_LABEL], { state: "open", perPage: 80 });
  return issues.map(parseLeadIssue);
};

const listAlertSubscriptions = async (env) => {
  const issues = await listIssuesByLabels(env, [ALERT_SUBSCRIPTION_LABEL, WEBSITE_LABEL], { state: "open", perPage: 100 });
  return issues.map(parseAlertSubscriptionIssue);
};

const buildUnifiedInquiryFeed = (leads, subscriptions) => {
  const leadEntries = (leads || []).map((lead) => ({
    kind: "lead",
    inquiryType: "lead",
    inquiryTypeLabel: lead.inquiryTypeLabel || getInquiryTypeLabel("lead"),
    statusTag: lead.statusTag || getInquiryStatusTag("lead", lead),
    channel: lead.source || "website",
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    type: lead.type,
    targetArea: lead.targetArea,
    budgetMax: lead.budgetMax,
    timeline: lead.timeline,
    consentToContact: lead.consentToContact,
    message: lead.message,
    receivedAt: lead.submittedAt || lead.createdAt || "",
    issueNumber: lead.issueNumber,
    issueUrl: lead.issueUrl
  }));
  const subEntries = (subscriptions || []).map((sub) => ({
    kind: "alert",
    inquiryType: "notify-me",
    inquiryTypeLabel: sub.inquiryTypeLabel || getInquiryTypeLabel("alert"),
    statusTag: sub.statusTag || getInquiryStatusTag("alert", sub),
    channel: sub.source || "listing-alert-subscribe",
    name: sub.name,
    email: sub.email,
    phone: sub.phone,
    type: sub.type,
    targetArea: sub.targetArea,
    budgetMax: sub.budgetMax,
    timeline: sub.timeline,
    consentToContact: sub.consentToContact,
    propertyType: sub.propertyType,
    alertFrequency: sub.alertFrequency,
    message: sub.message,
    receivedAt: sub.submittedAt || "",
    issueNumber: sub.issueNumber,
    issueUrl: sub.issueUrl
  }));
  return [...leadEntries, ...subEntries].sort((a, b) => {
    const at = new Date(a.receivedAt).getTime() || 0;
    const bt = new Date(b.receivedAt).getTime() || 0;
    return bt - at;
  });
};

const buildParticipantEmailList = (inquiries = []) => {
  const grouped = new Map();

  for (const entry of inquiries) {
    const email = normalizeEmail(entry?.email);
    if (!email) continue;

    const timestamp = clampText(entry?.receivedAt, 40);
    const existing = grouped.get(email) || {
      email,
      name: "",
      totalInquiries: 0,
      inquiryTypes: new Set(),
      statusTags: new Set(),
      targetAreas: new Set(),
      channels: new Set(),
      issueNumbers: new Set(),
      lastReceivedAt: "",
      lastIssueUrl: ""
    };

    existing.totalInquiries += 1;
    if (clampText(entry?.name, 120)) existing.name = clampText(entry.name, 120);
    if (clampText(entry?.inquiryTypeLabel, 120)) existing.inquiryTypes.add(clampText(entry.inquiryTypeLabel, 120));
    if (clampText(entry?.statusTag, 80)) existing.statusTags.add(clampText(entry.statusTag, 80));
    if (clampText(entry?.targetArea, 120)) existing.targetAreas.add(clampText(entry.targetArea, 120));
    if (clampText(entry?.channel, 120)) existing.channels.add(clampText(entry.channel, 120));
    if (entry?.issueNumber !== undefined && entry?.issueNumber !== null) existing.issueNumbers.add(String(entry.issueNumber));

    const currentTs = new Date(timestamp).getTime() || 0;
    const previousTs = new Date(existing.lastReceivedAt).getTime() || 0;
    if (currentTs >= previousTs) {
      existing.lastReceivedAt = timestamp;
      existing.lastIssueUrl = clampText(entry?.issueUrl, 500);
    }

    grouped.set(email, existing);
  }

  return [...grouped.values()]
    .map((entry) => ({
      email: entry.email,
      name: entry.name || "(not provided)",
      totalInquiries: entry.totalInquiries,
      inquiryTypes: [...entry.inquiryTypes],
      statusTags: [...entry.statusTags],
      targetAreas: [...entry.targetAreas],
      channels: [...entry.channels],
      issueNumbers: [...entry.issueNumbers],
      lastReceivedAt: entry.lastReceivedAt || "",
      lastIssueUrl: entry.lastIssueUrl || ""
    }))
    .sort((a, b) => {
      const at = new Date(a.lastReceivedAt).getTime() || 0;
      const bt = new Date(b.lastReceivedAt).getTime() || 0;
      return bt - at;
    });
};

const buildParticipantEmailCsv = (participants = []) => {
  const headers = [
    "email",
    "name",
    "total_inquiries",
    "inquiry_types",
    "status_tags",
    "target_areas",
    "channels",
    "last_received_at",
    "issue_numbers",
    "last_issue_url"
  ];
  const rows = participants.map((participant) => [
    participant.email,
    participant.name,
    participant.totalInquiries,
    (participant.inquiryTypes || []).join(" | "),
    (participant.statusTags || []).join(" | "),
    (participant.targetAreas || []).join(" | "),
    (participant.channels || []).join(" | "),
    participant.lastReceivedAt || "",
    (participant.issueNumbers || []).join(" | "),
    participant.lastIssueUrl || ""
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(",")).join("\n");
};

const findRecentDuplicateLead = async (env, fingerprint) => {
  const issues = await listIssuesByLabels(env, [LEAD_LABEL, WEBSITE_LABEL], { state: "all", perPage: 40, direction: "desc" });
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const marker = `Lead fingerprint: ${fingerprint}`;
  return (
    issues.find((issue) => {
      if (!String(issue.body || "").includes(marker)) return false;
      const createdAtMs = new Date(issue.created_at).getTime();
      return Number.isFinite(createdAtMs) && createdAtMs >= cutoff;
    }) || null
  );
};

const findExistingAlertSubscription = async (env, fingerprint) => {
  const subscriptions = await listAlertSubscriptions(env);
  return subscriptions.find((subscription) => subscription.fingerprint === fingerprint) || null;
};

const deriveLeadLabels = (lead) => {
  const labels = new Set([LEAD_LABEL, WEBSITE_LABEL]);
  const lowerType = lead.type.toLowerCase();
  if (lowerType.includes("investor")) labels.add("investor-lead");
  if (lowerType.includes("buyer")) labels.add("buyer-lead");
  if (lowerType.includes("seller")) labels.add("seller-lead");
  if (lead.source === "guest-overlay") labels.add("overlay-lead");
  return [...labels];
};

const deriveAlertLabels = () => [WEBSITE_LABEL, ALERT_SUBSCRIPTION_LABEL, ALERT_EMAIL_LABEL];

const pickFirstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

const normalizeListingRecord = (record) => {
  if (!record || typeof record !== "object") return null;
  const listingIdSource = pickFirstDefined(
    record.listing_id,
    record.listingId,
    record.id,
    record.mls_number,
    record.mlsNumber,
    record.mls,
    record.url,
    record.link
  );
  const address = clampText(
    pickFirstDefined(record.address, record.street_address, record.streetAddress, record.location, ""),
    180
  );
  const city = clampText(pickFirstDefined(record.city, record.locality, record.town, ""), 120);
  const area = clampText(pickFirstDefined(record.area, record.neighborhood, record.neighbourhood, record.district, ""), 120);
  const propertyType = clampText(
    pickFirstDefined(record.property_type, record.propertyType, record.type, record.category, ""),
    80
  ).toLowerCase();
  const priceValue = Number(
    pickFirstDefined(record.list_price, record.listPrice, record.price, record.asking_price, record.askingPrice, "")
  );
  const price = Number.isFinite(priceValue) && priceValue > 0 ? Math.round(priceValue) : null;
  const listingId = clampText(listingIdSource || `${address}-${city}-${price || "na"}`, 140);
  const status = clampText(pickFirstDefined(record.status, record.listing_status, record.state, ""), 40).toLowerCase();
  const listingUrl = clampText(
    pickFirstDefined(
      record.url,
      record.link,
      record.listing_url,
      record.listingUrl,
      listingId ? `https://rickikohlirealty.github.io/listing_detail.html?id=${encodeURIComponent(listingId)}` : ""
    ),
    500
  );
  if (!listingId) return null;
  return {
    listingId,
    address,
    city,
    area,
    propertyType,
    price,
    status,
    url: listingUrl
  };
};

const normalizeListingsPayload = (payload) => {
  let rows = [];
  if (Array.isArray(payload)) rows = payload;
  else if (Array.isArray(payload?.listings)) rows = payload.listings;
  else if (Array.isArray(payload?.items)) rows = payload.items;
  else if (Array.isArray(payload?.data)) rows = payload.data;
  return rows.map(normalizeListingRecord).filter(Boolean);
};

const getWorkerListingsFeed = (url) => {
  const cityNeedle = clampText(
    url.searchParams.get("city") ||
      url.searchParams.get("q") ||
      url.searchParams.get("location") ||
      url.searchParams.get("targetArea"),
    120
  ).toLowerCase();
  const limitValue = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.round(limitValue), 200) : DEFAULT_LISTING_FEED.length;

  let rows = normalizeListingsPayload(DEFAULT_LISTING_FEED).filter(isListingActive);
  if (cityNeedle) {
    rows = rows.filter((row) =>
      `${row.city || ""} ${row.area || ""} ${row.address || ""}`.toLowerCase().includes(cityNeedle)
    );
  }
  return rows.slice(0, limit);
};

const getDefaultListingsFeed = () => normalizeListingsPayload(DEFAULT_LISTING_FEED).filter(isListingActive);

const fetchListingsFromIngestion = async (env) => {
  const feedUrl = clampText(env.LISTING_FEED_URL, 500);
  if (!feedUrl) return getDefaultListingsFeed();
  let parsedUrl = null;
  try {
    parsedUrl = new URL(feedUrl);
  } catch {
    return getDefaultListingsFeed();
  }
  if (
    parsedUrl.hostname === "ricky-website-leads.ricky-website-leads.workers.dev" &&
    (parsedUrl.pathname === "/listings" || parsedUrl.pathname === "/listings/index")
  ) {
    return getWorkerListingsFeed(parsedUrl);
  }
  const headers = { Accept: "application/json" };
  if (env.LISTING_FEED_TOKEN) {
    headers.Authorization = `Bearer ${env.LISTING_FEED_TOKEN}`;
  }
  const response = await fetch(feedUrl, { method: "GET", headers });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Listing ingestion fetch failed (${response.status}): ${detail}`);
  }
  const payload = await response.json();
  return normalizeListingsPayload(payload);
};

const isListingActive = (listing) =>
  !/sold|off-market|off market|leased|closed|expired|terminated|withdrawn/.test(String(listing?.status || "").toLowerCase());

const hasAreaMatch = (subscription, listing) => {
  const tokens = String(subscription.targetArea || "")
    .toLowerCase()
    .split(/[;,/|]/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return true;
  const haystack = `${listing.address || ""} ${listing.city || ""} ${listing.area || ""}`.toLowerCase();
  return tokens.some((token) => haystack.includes(token));
};

const propertyTypeMatches = (subscriptionType, listingType) => {
  const requested = String(subscriptionType || "").toLowerCase().trim();
  const listing = String(listingType || "").toLowerCase().trim();
  if (!requested || requested === "any") return true;
  if (!listing) return false;
  if (requested === "detached") return listing.includes("detached") || listing.includes("house");
  if (requested === "condo") return listing.includes("condo") || listing.includes("apartment");
  if (requested === "townhome") return listing.includes("town");
  if (requested === "investment") return listing.includes("investment") || listing.includes("multi") || listing.includes("duplex");
  return listing.includes(requested);
};

const matchesSubscriptionCriteria = (subscription, listing) => {
  if (!hasAreaMatch(subscription, listing)) return false;
  if (!propertyTypeMatches(subscription.propertyType, listing.propertyType)) return false;
  if (subscription.budgetMax && listing.price && listing.price > subscription.budgetMax) return false;
  return true;
};

const buildAlertEmailText = (subscription, listings) => {
  const intro = [
    `Hi ${subscription.name || "there"},`,
    "",
    `New listings matched your alert for ${subscription.targetArea}.`,
    ""
  ];
  const listingLines = listings.flatMap((listing, index) => {
    const summary = `${index + 1}. ${listing.address || "Listing"}${listing.city ? `, ${listing.city}` : ""}`;
    const detailBits = [];
    if (listing.price) detailBits.push(`Price: $${Number(listing.price).toLocaleString()}`);
    if (listing.propertyType) detailBits.push(`Type: ${listing.propertyType}`);
    if (listing.url) detailBits.push(`Link: ${listing.url}`);
    return [summary, ...detailBits.map((line) => `   ${line}`), ""];
  });
  const outro = [
    "Reply to this email with STOP if you want to unsubscribe from listing alerts.",
    "",
    "RKR | Ricki Kohli Realty"
  ];
  return [...intro, ...listingLines, ...outro].join("\n");
};

const encodeBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const getGmailAccessToken = async (env) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID || "",
      client_secret: env.GMAIL_CLIENT_SECRET || "",
      refresh_token: env.GMAIL_REFRESH_TOKEN || "",
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google token refresh failed (${response.status}): ${detail}`);
  }
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Google token refresh returned no access_token.");
  return payload.access_token;
};

const sendGmailMessage = async (env, toEmail, subject, textBody) => {
  const fromEmail = getAlertFromEmail(env);
  if (!fromEmail) throw new Error("Missing ALERT_FROM_EMAIL or MANAGER_EMAILS for sender.");
  const accessToken = await getGmailAccessToken(env);
  const raw = [
    `From: ${fromEmail}`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody
  ].join("\r\n");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: encodeBase64Url(raw) })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gmail send failed (${response.status}): ${detail}`);
  }
};

const textOrFallback = (value, fallback = "(not provided)") => {
  const normalized = clampText(value, 1500);
  return normalized || fallback;
};

const buildManagerInquirySubject = (kind, payload) => {
  const channel = kind === "alert" ? "Listing Alert" : "Website Lead";
  return `RKR Inquiry Package • ${channel} • ${payload.name || "Unknown"} • ${payload.email || "No email"}`;
};

const buildManagerLeadDigestBody = (lead, meta = {}) =>
  [
    "RKR Inquiry Package",
    "===================",
    `Kind: Lead Inquiry`,
    `Outlet: ${textOrFallback(lead.source, "website")}`,
    `Event: ${meta.event || "created"}`,
    `Issue #: ${textOrFallback(meta.issueNumber, "(none)")}`,
    `Issue URL: ${textOrFallback(meta.issueUrl, "(none)")}`,
    "",
    "Contact",
    "-------",
    `Name: ${textOrFallback(lead.name)}`,
    `Email: ${textOrFallback(lead.email)}`,
    `Phone: ${textOrFallback(lead.phone)}`,
    `Consent to contact: ${lead.consentToContact ? "Yes" : "No"}`,
    "",
    "Inquiry Details",
    "---------------",
    `Inquiry type label: ${getInquiryTypeLabel("lead")}`,
    `Status tag: ${getInquiryStatusTag("lead", lead)}`,
    `Type: ${textOrFallback(lead.type)}`,
    `Target area: ${textOrFallback(lead.targetArea)}`,
    `Budget max: ${formatBudget(lead.budgetMax)}`,
    `Timeline: ${textOrFallback(lead.timeline)}`,
    `Submitted at: ${textOrFallback(lead.submittedAt)}`,
    "",
    "Message",
    "-------",
    textOrFallback(lead.message, "(none)"),
    "",
    "Attribution",
    "-----------",
    `Landing page: ${textOrFallback(lead.landingPage)}`,
    `Referrer: ${textOrFallback(lead.referrer, "(direct)")}`,
    `UTM source / medium / campaign: ${textOrFallback(lead.utmSource, "(none)")} / ${textOrFallback(
      lead.utmMedium,
      "(none)"
    )} / ${textOrFallback(lead.utmCampaign, "(none)")}`
  ].join("\n");

const buildManagerAlertDigestBody = (subscription, meta = {}) =>
  [
    "RKR Inquiry Package",
    "===================",
    `Kind: Listing Alert Subscription`,
    `Outlet: ${textOrFallback(subscription.source, "listing-alert-subscribe")}`,
    `Event: ${meta.event || "created"}`,
    `Issue #: ${textOrFallback(meta.issueNumber, "(none)")}`,
    `Issue URL: ${textOrFallback(meta.issueUrl, "(none)")}`,
    "",
    "Contact",
    "-------",
    `Name: ${textOrFallback(subscription.name)}`,
    `Email: ${textOrFallback(subscription.email)}`,
    `Phone: ${textOrFallback(subscription.phone)}`,
    `Consent to contact: ${subscription.consentToContact ? "Yes" : "No"}`,
    "",
    "Subscription Details",
    "--------------------",
    `Inquiry type label: ${getInquiryTypeLabel("alert")}`,
    `Status tag: ${getInquiryStatusTag("alert", subscription)}`,
    `Type: ${textOrFallback(subscription.type, "Listing Alert Subscription")}`,
    `Target area: ${textOrFallback(subscription.targetArea)}`,
    `Property type: ${textOrFallback(subscription.propertyType, "any")}`,
    `Budget max: ${formatBudget(subscription.budgetMax)}`,
    `Timeline: ${textOrFallback(subscription.timeline)}`,
    `Alert frequency: ${textOrFallback(subscription.alertFrequency, "daily")}`,
    `Submitted at: ${textOrFallback(subscription.submittedAt)}`,
    "",
    "Notes",
    "-----",
    textOrFallback(subscription.message, "(none)"),
    "",
    "Attribution",
    "-----------",
    `Landing page: ${textOrFallback(subscription.landingPage)}`,
    `Referrer: ${textOrFallback(subscription.referrer, "(direct)")}`,
    `UTM source / medium / campaign: ${textOrFallback(subscription.utmSource, "(none)")} / ${textOrFallback(
      subscription.utmMedium,
      "(none)"
    )} / ${textOrFallback(subscription.utmCampaign, "(none)")}`
  ].join("\n");

const notifyManagersForInquiry = async (env, kind, payload, meta = {}) => {
  const recipients = [...new Set(parseManagerEmails(env.MANAGER_EMAILS))];
  if (!recipients.length) return { ok: false, skipped: true, reason: "No manager recipients configured." };
  if (!hasGmailConfig(env)) return { ok: false, skipped: true, reason: "Gmail configuration incomplete." };

  const subject = buildManagerInquirySubject(kind, payload);
  const body = kind === "alert" ? buildManagerAlertDigestBody(payload, meta) : buildManagerLeadDigestBody(payload, meta);
  const errors = [];

  for (const recipient of recipients) {
    try {
      await sendGmailMessage(env, recipient, subject, body);
    } catch (error) {
      errors.push({ recipient, message: error?.message || "Unknown email send error." });
    }
  }

  return { ok: errors.length === 0, recipients, errors };
};

const mergeSentListingIds = (existingIds, newIds) =>
  dedupeSentListingIds([...(existingIds || []), ...(newIds || [])]);

const dispatchListingAlerts = async (env, injectedListings = null) => {
  const subscriptions = await listAlertSubscriptions(env);
  if (!subscriptions.length) {
    return { ok: true, sentEmails: 0, matchedListings: 0, reason: "No active subscriptions." };
  }

  const listings =
    Array.isArray(injectedListings) && injectedListings.length
      ? injectedListings
      : await fetchListingsFromIngestion(env);
  const activeListings = listings.filter(isListingActive);

  if (!activeListings.length) {
    return { ok: true, sentEmails: 0, matchedListings: 0, reason: "No active listings available from ingestion." };
  }
  if (!hasGmailConfig(env)) {
    return {
      ok: false,
      sentEmails: 0,
      matchedListings: 0,
      reason: "Missing Gmail OAuth configuration (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN / ALERT_FROM_EMAIL)."
    };
  }

  const maxPerEmail = Number(env.ALERT_MAX_PER_EMAIL) > 0 ? Math.min(Number(env.ALERT_MAX_PER_EMAIL), 20) : 8;
  let sentEmails = 0;
  let matchedListings = 0;
  const errors = [];

  for (const subscription of subscriptions) {
    if (!subscription.email || !EMAIL_REGEX.test(subscription.email)) continue;
    const sentSet = new Set(subscription.sentListingIds || []);
    const matches = activeListings
      .filter((listing) => matchesSubscriptionCriteria(subscription, listing) && !sentSet.has(listing.listingId))
      .slice(0, maxPerEmail);

    if (!matches.length) continue;

    const subject = `New ${subscription.targetArea} listings matching your criteria (${matches.length})`;
    const body = buildAlertEmailText(subscription, matches);
    try {
      await sendGmailMessage(env, subscription.email, subject, body);
      sentEmails += 1;
      matchedListings += matches.length;

      const updatedSentIds = mergeSentListingIds(
        subscription.sentListingIds,
        matches.map((listing) => listing.listingId)
      );
      const updatedBody = createAlertSubscriptionIssueBody(subscription, {
        sentListingIds: updatedSentIds,
        lastNotifiedAt: new Date().toISOString()
      });
      await updateGitHubIssue(env, subscription.issueNumber, {
        title: buildAlertIssueTitle(subscription),
        body: updatedBody,
        labels: deriveAlertLabels()
      });
    } catch (error) {
      errors.push({ email: subscription.email, message: error.message || "Unknown dispatch error." });
    }
  }

  return {
    ok: errors.length === 0,
    sentEmails,
    matchedListings,
    processedSubscriptions: subscriptions.length,
    errors
  };
};

const upsertAlertSubscription = async (env, payload) => {
  const subscription = sanitizeAlertSubscription(payload);
  const validationError = validateAlertSubscription(subscription);
  if (validationError) return { ok: false, status: 400, error: validationError };

  const fingerprint = createSubscriptionFingerprint(subscription);
  let existing = null;
  try {
    existing = await findExistingAlertSubscription(env, fingerprint);
  } catch (error) {
    return { ok: false, status: 502, error: error.message || "Could not check existing subscriptions." };
  }

  if (existing) {
    const updatedBody = createAlertSubscriptionIssueBody(subscription, {
      sentListingIds: existing.sentListingIds,
      lastNotifiedAt: existing.lastNotifiedAt && existing.lastNotifiedAt !== "(never)" ? existing.lastNotifiedAt : ""
    });
    try {
      const updated = await updateGitHubIssue(env, existing.issueNumber, {
        title: buildAlertIssueTitle(subscription),
        body: updatedBody,
        labels: deriveAlertLabels()
      });
      return {
        ok: true,
        duplicate: true,
        issueUrl: updated.html_url,
        issueNumber: updated.number
      };
    } catch (error) {
      return { ok: false, status: 502, error: error.message || "Failed to update subscription." };
    }
  }

  try {
    const created = await createGitHubIssue(env, {
      title: buildAlertIssueTitle(subscription),
      body: createAlertSubscriptionIssueBody(subscription),
      labels: deriveAlertLabels()
    });
    return { ok: true, duplicate: false, issueUrl: created.html_url, issueNumber: created.number };
  } catch (error) {
    return { ok: false, status: 502, error: error.message || "Failed to create subscription." };
  }
};

const readJsonPayload = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

const pathMatches = (pathname, suffix) => pathname === suffix || pathname.endsWith(`${suffix}/`) || pathname.endsWith(suffix);

export default {
  async fetch(request, env) {
    const origin = getOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!isOriginAllowed(request, env)) {
        return json({ ok: false, error: "Origin not allowed." }, 403, origin);
      }
      return json({ ok: true }, 200, origin);
    }

    if (!isOriginAllowed(request, env)) {
      return json({ ok: false, error: "Origin not allowed." }, 403, origin);
    }

    const configError = ensureWorkerConfig(env);
    if (configError) {
      return json({ ok: false, error: configError }, 500, origin);
    }

    const url = new URL(request.url);
    const isListingsRoute = pathMatches(url.pathname, "/listings") || pathMatches(url.pathname, "/listings/index");
    const isInquiryRoute = pathMatches(url.pathname, "/inquiries");
    const isInquiryParticipantsRoute = pathMatches(url.pathname, "/inquiries/participants");
    const isInquiryParticipantsCsvRoute = pathMatches(url.pathname, "/inquiries/participants.csv");
    const isAlertSubscribeRoute = pathMatches(url.pathname, "/alerts/subscribe");
    const isAlertDispatchRoute = pathMatches(url.pathname, "/alerts/dispatch");
    if (request.method === "GET" && isListingsRoute) {
      const listings = getWorkerListingsFeed(url);
      return json(
        {
          ok: true,
          count: listings.length,
          listings,
          source: "worker-default-feed",
          updatedAt: new Date().toISOString()
        },
        200,
        origin
      );
    }

    if (request.method === "GET" && isInquiryRoute) {
      const authHeader = request.headers.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const authResult = await verifyGoogleIdToken(idToken, env);
      if (!authResult.ok) {
        return json({ ok: false, error: authResult.error }, 401, origin);
      }

      try {
        const inquiries = await listLeadIssues(env);
        const alertInquiries = await listAlertSubscriptions(env);
        const allInquiries = buildUnifiedInquiryFeed(inquiries, alertInquiries);
        const participants = buildParticipantEmailList(allInquiries);
        return json(
          {
            ok: true,
            authenticatedEmail: authResult.email,
            inquiries,
            alertInquiries,
            allInquiries,
            participants
          },
          200,
          origin
        );
      } catch (error) {
        return json({ ok: false, error: error.message || "Failed to load inquiries." }, 502, origin);
      }
    }

    if (request.method === "GET" && (isInquiryParticipantsRoute || isInquiryParticipantsCsvRoute)) {
      const authHeader = request.headers.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const authResult = await verifyGoogleIdToken(idToken, env);
      if (!authResult.ok) {
        return json({ ok: false, error: authResult.error }, 401, origin);
      }

      try {
        const inquiries = await listLeadIssues(env);
        const alertInquiries = await listAlertSubscriptions(env);
        const allInquiries = buildUnifiedInquiryFeed(inquiries, alertInquiries);
        const participants = buildParticipantEmailList(allInquiries);
        if (isInquiryParticipantsCsvRoute) {
          const fileDate = new Date().toISOString().slice(0, 10);
          const filename = `rkr-participant-email-list-${fileDate}.csv`;
          return textResponse(
            buildParticipantEmailCsv(participants),
            200,
            origin,
            "text/csv; charset=utf-8",
            `attachment; filename="${filename}"`
          );
        }
        return json({ ok: true, authenticatedEmail: authResult.email, count: participants.length, participants }, 200, origin);
      } catch (error) {
        return json({ ok: false, error: error.message || "Failed to build participant email list." }, 502, origin);
      }
    }

    if (request.method === "POST" && isAlertSubscribeRoute) {
      const payload = await readJsonPayload(request);
      if (!payload) return json({ ok: false, error: "Invalid JSON payload." }, 400, origin);
      const subscriptionForDigest = sanitizeAlertSubscription(payload);
      const result = await upsertAlertSubscription(env, payload);
      if (result.ok) {
        const digestResult = await notifyManagersForInquiry(env, "alert", subscriptionForDigest, {
          event: result.duplicate ? "updated" : "created",
          issueNumber: result.issueNumber,
          issueUrl: result.issueUrl
        });
        if (!digestResult.ok) {
          console.warn("Manager alert digest not fully delivered:", JSON.stringify(digestResult));
        }
      }
      return json(result, result.status || 200, origin);
    }

    if (request.method === "POST" && isAlertDispatchRoute) {
      const authHeader = request.headers.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const authResult = await verifyGoogleIdToken(idToken, env);
      if (!authResult.ok) {
        return json({ ok: false, error: authResult.error }, 401, origin);
      }

      const payload = (await readJsonPayload(request)) || {};
      const injectedListings = normalizeListingsPayload(
        Array.isArray(payload) ? payload : payload.listings || payload.items || payload.data || []
      );

      try {
        const dispatchResult = await dispatchListingAlerts(env, injectedListings.length ? injectedListings : null);
        if (!dispatchResult.ok) return json(dispatchResult, 502, origin);
        return json(dispatchResult, 200, origin);
      } catch (error) {
        return json({ ok: false, error: error.message || "Alert dispatch failed." }, 502, origin);
      }
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, origin);
    }

    const payload = await readJsonPayload(request);
    if (!payload) {
      return json({ ok: false, error: "Invalid JSON payload." }, 400, origin);
    }

    const lead = sanitizeLead(payload);
    const validationError = validateLead(lead);
    if (validationError) {
      return json({ ok: false, error: validationError }, 400, origin);
    }

    const leadFingerprint = createLeadFingerprint(lead);
    try {
      const duplicate = await findRecentDuplicateLead(env, leadFingerprint);
      if (duplicate) {
        const digestResult = await notifyManagersForInquiry(env, "lead", lead, {
          event: "duplicate_submission",
          issueNumber: duplicate.number,
          issueUrl: duplicate.html_url
        });
        if (!digestResult.ok) {
          console.warn("Manager lead digest not fully delivered:", JSON.stringify(digestResult));
        }
        return json(
          {
            ok: true,
            duplicate: true,
            issueUrl: duplicate.html_url,
            issueNumber: duplicate.number
          },
          200,
          origin
        );
      }
    } catch {
      // Duplicate-check failures should not block lead capture.
    }

    try {
      const created = await createGitHubIssue(env, {
        title: `Lead: ${lead.type} — ${lead.name}`,
        body: createLeadIssueBody(lead),
        labels: deriveLeadLabels(lead)
      });
      const digestResult = await notifyManagersForInquiry(env, "lead", lead, {
        event: "created",
        issueNumber: created.number,
        issueUrl: created.html_url
      });
      if (!digestResult.ok) {
        console.warn("Manager lead digest not fully delivered:", JSON.stringify(digestResult));
      }
      return json({ ok: true, issueUrl: created.html_url, issueNumber: created.number }, 200, origin);
    } catch (error) {
      return json({ ok: false, error: error.message || "Lead capture failed." }, 502, origin);
    }
  },

  async scheduled(_controller, env, ctx) {
    if (!toBoolean(env.ALERT_AUTOMATION_ENABLED || "true")) return;
    ctx.waitUntil(
      (async () => {
        try {
          const result = await dispatchListingAlerts(env);
          console.log("Scheduled alert dispatch result:", JSON.stringify(result));
        } catch (error) {
          console.error("Scheduled alert dispatch failed:", error?.message || error);
        }
      })()
    );
  }
};
