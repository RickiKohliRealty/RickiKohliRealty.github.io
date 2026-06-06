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

const getOrigin = (request, env) => {
  const configured = (env.ALLOWED_ORIGIN || "").trim();
  if (!configured) return "*";
  const requestOrigin = request.headers.get("Origin") || "";
  return requestOrigin === configured ? configured : configured;
};

const parseManagerEmails = (rawValue) =>
  String(rawValue || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

const validateLead = (lead) => {
  if (!lead || typeof lead !== "object") return "Missing lead payload.";
  if (!lead.name || !String(lead.name).trim()) return "Name is required.";
  if (!lead.email || !String(lead.email).trim()) return "Email is required.";
  if (!lead.type || !String(lead.type).trim()) return "Lead type is required.";
  return null;
};

const createIssueBody = (lead) => {
  const lines = [
    "## New website lead",
    "",
    `- **Name:** ${lead.name}`,
    `- **Email:** ${lead.email}`,
    `- **Phone:** ${lead.phone || "(not provided)"}`,
    `- **Type:** ${lead.type}`,
    `- **Submitted at:** ${lead.submittedAt || new Date().toISOString()}`,
    "",
    "### Message",
    lead.message || "(none)",
    "",
    `Source: ${lead.source || "website"}`
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
    submittedAt: extractLineField(body, "Submitted at"),
    message: extractMessage(body),
    source: (body.match(/Source:\s*(.*)/) || [])[1] || ""
  };
};

const githubHeaders = (env) => ({
  "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
  "Accept": "application/vnd.github+json",
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

export default {
  async fetch(request, env) {
    const origin = getOrigin(request, env);

    if (request.method === "OPTIONS") {
      return json({ ok: true }, 200, origin);
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

    const validationError = validateLead(payload);
    if (validationError) {
      return json({ ok: false, error: validationError }, 400, origin);
    }

    const issueTitle = `Lead: ${payload.type} — ${payload.name}`;
    const issueBody = createIssueBody(payload);
    const apiUrl = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues`;

    const ghResponse = await fetch(apiUrl, {
      method: "POST",
      headers: githubHeaders(env),
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ["lead", "website"]
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
