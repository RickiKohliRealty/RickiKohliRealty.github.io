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

const ALERT_SUBSCRIPTION_LABEL = "listing-alert-subscription";
const ALERT_EMAIL_LABEL = "listing-alert";
const LEAD_LABEL = "lead";
const WEBSITE_LABEL = "website";
const MAX_SENT_LISTING_IDS = 250;

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
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    title: issue.title,
    status: issue.state,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    name: extractLineField(body, "Name"),
    email: extractLineField(body, "Email"),
    phone: extractLineField(body, "Phone"),
    type: extractLineField(body, "Type"),
    targetArea: extractLineField(body, "Target area"),
    budgetMax: extractLineField(body, "Budget max"),
    timeline: extractLineField(body, "Timeline"),
    consentToContact: extractLineField(body, "Consent to contact"),
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
};

const parseAlertSubscriptionIssue = (issue) => {
  const body = issue.body || "";
  const sentIdsValue = extractLineField(body, "Sent listing IDs");
  const sentListingIds =
    sentIdsValue && sentIdsValue !== "(none)"
      ? dedupeSentListingIds(sentIdsValue.split(",").map((entry) => entry.trim()))
      : [];
  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    issueTitle: issue.title,
    issueStatus: issue.state,
    issueBody: body,
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
    source: (body.match(/Source:\s*(.*)/) || [])[1] || "listing-alert-subscribe",
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

const fetchListingsFromIngestion = async (env) => {
  const feedUrl = clampText(env.LISTING_FEED_URL, 500);
  if (!feedUrl) return [];
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
    const isInquiryRoute = pathMatches(url.pathname, "/inquiries");
    const isAlertSubscribeRoute = pathMatches(url.pathname, "/alerts/subscribe");
    const isAlertDispatchRoute = pathMatches(url.pathname, "/alerts/dispatch");

    if (request.method === "GET" && isInquiryRoute) {
      const authHeader = request.headers.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const authResult = await verifyGoogleIdToken(idToken, env);
      if (!authResult.ok) {
        return json({ ok: false, error: authResult.error }, 401, origin);
      }

      try {
        const inquiries = await listLeadIssues(env);
        return json({ ok: true, authenticatedEmail: authResult.email, inquiries }, 200, origin);
      } catch (error) {
        return json({ ok: false, error: error.message || "Failed to load inquiries." }, 502, origin);
      }
    }

    if (request.method === "POST" && isAlertSubscribeRoute) {
      const payload = await readJsonPayload(request);
      if (!payload) return json({ ok: false, error: "Invalid JSON payload." }, 400, origin);
      const result = await upsertAlertSubscription(env, payload);
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
