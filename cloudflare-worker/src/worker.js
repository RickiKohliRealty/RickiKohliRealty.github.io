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

const formatBudget = (budgetMax) => (budgetMax ? `$${Number(budgetMax).toLocaleString()}` : "(not provided)");
const createLeadFingerprint = (lead) =>
  [lead.email, lead.phone || "no-phone", lead.type, lead.source].join("|").toLowerCase();

const createIssueBody = (lead) => {
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

const extractLineField = (body, label) => {
  const match = body.match(new RegExp(`- \\*\\*${label}:\\*\\* (.*)`));
  return match ? match[1].trim() : "";
};

const extractMessage = (body) => {
  const [, messageSection = ""] = body.split("### Message");
  if (!messageSection) return "";
  const [content = ""] = messageSection.split("\n\nSource:");
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
    message: extractMessage(body),
    source: (body.match(/Source:\s*(.*)/) || [])[1] || ""
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

const listLeadIssues = async (env) => {
  const labels = encodeURIComponent("lead,website");
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=open&labels=${labels}&per_page=50&sort=created&direction=desc`;
  const response = await fetch(apiUrl, { headers: githubHeaders(env) });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${detail}`);
  }
  const issues = await response.json();
  return issues.filter((issue) => !issue.pull_request).map(parseLeadIssue);
};

const findRecentDuplicateLead = async (env, fingerprint) => {
  const labels = encodeURIComponent("lead,website");
  const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues?state=all&labels=${labels}&per_page=30&sort=created&direction=desc`;
  const response = await fetch(apiUrl, { headers: githubHeaders(env) });
  if (!response.ok) return null;

  const issues = await response.json();
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const marker = `Lead fingerprint: ${fingerprint}`;
  return (
    issues.find((issue) => {
      if (issue.pull_request) return false;
      if (!String(issue.body || "").includes(marker)) return false;
      const createdAtMs = new Date(issue.created_at).getTime();
      return Number.isFinite(createdAtMs) && createdAtMs >= cutoff;
    }) || null
  );
};

const deriveLeadLabels = (lead) => {
  const labels = new Set(["lead", "website"]);
  const lowerType = lead.type.toLowerCase();
  if (lowerType.includes("investor")) labels.add("investor-lead");
  if (lowerType.includes("buyer")) labels.add("buyer-lead");
  if (lowerType.includes("seller")) labels.add("seller-lead");
  if (lead.source === "guest-overlay") labels.add("overlay-lead");
  return [...labels];
};

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
    const isInquiryRoute = url.pathname === "/inquiries" || url.pathname.endsWith("/inquiries");

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

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
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
      // Ignore duplicate-check failures to avoid blocking lead capture.
    }

    const issueTitle = `Lead: ${lead.type} — ${lead.name}`;
    const issueBody = createIssueBody(lead);
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;

    const ghResponse = await fetch(apiUrl, {
      method: "POST",
      headers: githubHeaders(env),
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: deriveLeadLabels(lead)
      })
    });

    if (!ghResponse.ok) {
      const detail = await ghResponse.text();
      return json(
        { ok: false, error: `GitHub API error (${ghResponse.status}).`, detail },
        502,
        origin
      );
    }

    const result = await ghResponse.json();
    return json(
      { ok: true, issueUrl: result.html_url, issueNumber: result.number },
      200,
      origin
    );
  }
};
