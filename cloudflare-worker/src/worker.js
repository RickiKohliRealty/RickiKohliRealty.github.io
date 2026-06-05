const json = (body, status = 200, origin = "*") =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });

const getOrigin = (request, env) => {
  const configured = (env.ALLOWED_ORIGIN || "").trim();
  if (!configured) return "*";
  const requestOrigin = request.headers.get("Origin") || "";
  return requestOrigin === configured ? configured : configured;
};

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

export default {
  async fetch(request, env) {
    const origin = getOrigin(request, env);

    if (request.method === "OPTIONS") {
      return json({ ok: true }, 200, origin);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, origin);
    }

    if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
      return json({ ok: false, error: "Missing worker environment configuration." }, 500, origin);
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
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "ricky-website-lead-worker"
      },
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
