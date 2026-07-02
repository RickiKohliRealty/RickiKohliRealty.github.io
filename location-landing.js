(() => {
  const config = window.LOCATION_PAGE_CONFIG || {};
  const areaName = String(config.areaName || "Victoria").trim();
  const areaSlug = String(
    config.areaSlug ||
      areaName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  ).trim();
  const SITE_URL =
    window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "https://rickikohlirealty.github.io";
  const BACKEND_ENDPOINT =
    config.backendEndpoint ||
    "https://ricky-website-leads.ricky-website-leads.workers.dev";
  const CONTACT_EMAIL = config.contactEmail || "rkohli09@outlook.com";
  const BROKERAGE = config.brokerage || "RKR | Ricki Kohli Realty";
  const SERVICE_REGION = config.serviceRegion || "Victoria, BC";
  const ATTRIBUTION_KEY = "rkr_first_touch_v1";
  const LEAD_QUEUE_KEY = `rkr_area_pending_leads_${areaSlug || "default"}`;

  const $ = (selector) => document.querySelector(selector);
  const toast = (msg) => {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(window.__areaToastTimer);
    window.__areaToastTimer = setTimeout(() => {
      t.style.display = "none";
    }, 2800);
  };

  const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
  const sanitizeText = (value, max = 800) =>
    String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const emailLooksValid = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

  const getQueryParams = () => new URLSearchParams(window.location.search || "");

  const readFirstTouch = () => {
    try {
      return JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "null");
    } catch {
      return null;
    }
  };
  const writeFirstTouch = (value) => {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  };
  const buildAttribution = () => {
    const params = getQueryParams();
    const current = {
      utmSource: sanitizeText(params.get("utm_source"), 120),
      utmMedium: sanitizeText(params.get("utm_medium"), 120),
      utmCampaign: sanitizeText(params.get("utm_campaign"), 120),
      utmTerm: sanitizeText(params.get("utm_term"), 120),
      utmContent: sanitizeText(params.get("utm_content"), 120)
    };
    let firstTouch = readFirstTouch();
    if (!firstTouch) {
      firstTouch = {
        firstTouchAt: new Date().toISOString(),
        firstTouchPage: window.location.href,
        ...current
      };
      writeFirstTouch(firstTouch);
    }
    return {
      ...current,
      referrer: document.referrer || "",
      firstTouchAt: firstTouch.firstTouchAt || "",
      firstTouchPage: firstTouch.firstTouchPage || "",
      firstUtmSource: firstTouch.utmSource || "",
      firstUtmMedium: firstTouch.utmMedium || "",
      firstUtmCampaign: firstTouch.utmCampaign || ""
    };
  };

  const setCanonicalAndOgUrl = () => {
    const canonicalUrl = `${SITE_URL}${window.location.pathname}`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", canonicalUrl);
  };

  const setStructuredData = () => {
    const schemaEl = $("#schemaLocation");
    if (!schemaEl) return;
    const schema = [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `Homes for Sale in ${areaName}, BC`,
        url: `${SITE_URL}${window.location.pathname}`,
        description: `Explore homes for sale in ${areaName}, BC and request a matched shortlist with local support.`
      },
      {
        "@context": "https://schema.org",
        "@type": "RealEstateAgent",
        name: BROKERAGE,
        areaServed: {
          "@type": "City",
          name: areaName,
          address: {
            "@type": "PostalAddress",
            addressRegion: "BC",
            addressCountry: "CA"
          }
        },
        telephone: "236-869-9570",
        email: CONTACT_EMAIL,
        url: SITE_URL
      }
    ];
    schemaEl.textContent = JSON.stringify(schema);
  };

  const readLeadQueue = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LEAD_QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const writeLeadQueue = (items) => {
    localStorage.setItem(LEAD_QUEUE_KEY, JSON.stringify(items.slice(-50)));
  };
  const queueLead = (payload) => {
    const queue = readLeadQueue();
    queue.push(payload);
    writeLeadQueue(queue);
  };

  const submitLeadViaBackend = async (payload) => {
    if (!BACKEND_ENDPOINT || !/^https?:\/\//.test(BACKEND_ENDPOINT)) return false;
    const response = await fetch(BACKEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Lead backend failed (${response.status}) ${detail}`.trim());
    }
    return true;
  };

  const flushQueuedLeads = async () => {
    const queue = readLeadQueue();
    if (!queue.length) return;
    const unsent = [];
    for (const lead of queue) {
      try {
        const sent = await submitLeadViaBackend(lead);
        if (!sent) unsent.push(lead);
      } catch {
        unsent.push(lead);
      }
    }
    writeLeadQueue(unsent);
  };

  const buildMailtoBody = (lead) => {
    const budgetLine = lead.budgetMax
      ? `\nBudget Max: $${Number(lead.budgetMax).toLocaleString()}`
      : "";
    const timelineLine = lead.timeline ? `\nTimeline: ${lead.timeline}` : "";
    const propertyTypeLine = lead.propertyType
      ? `\nProperty Type: ${lead.propertyType}`
      : "";
    const attributionLine = `\nUTM Source: ${lead.utmSource || "(none)"}\nUTM Medium: ${
      lead.utmMedium || "(none)"
    }\nUTM Campaign: ${lead.utmCampaign || "(none)"}\nReferrer: ${
      lead.referrer || "(direct)"
    }`;
    return `Name: ${lead.name}\nEmail: ${lead.email}\nPhone: ${
      lead.phone || "(not provided)"
    }\nType: ${lead.type}\nTarget Area: ${lead.targetArea || areaName}${propertyTypeLine}${budgetLine}${timelineLine}\nService Region: ${SERVICE_REGION}${attributionLine}\n\nMessage:\n${
      lead.message || "(none)"
    }\n`;
  };

  const bindLeadForm = () => {
    const form = $("#areaLeadForm");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (sanitizeText(data.website, 120)) {
        toast("Submission blocked.");
        return;
      }

      const email = normalizeEmail(data.email);
      if (!data.name || !email) {
        toast("Please fill your name and email.");
        return;
      }
      if (!emailLooksValid(email)) {
        toast("Please enter a valid email.");
        return;
      }
      if (!data.consent) {
        toast("Please confirm consent to be contacted.");
        return;
      }

      const attribution = buildAttribution();
      const parsedBudget = Number(data.budgetMax);
      const payload = {
        name: sanitizeText(data.name, 120),
        email,
        phone: sanitizeText(data.phone, 40),
        type: sanitizeText(
          data.type || `Buyer — ${areaName} Home Search`,
          80
        ),
        message: sanitizeText(data.message, 2400),
        targetArea: sanitizeText(data.targetArea || areaName, 140),
        propertyType: sanitizeText(data.propertyType, 80),
        budgetMax:
          Number.isFinite(parsedBudget) && parsedBudget > 0
            ? Math.round(parsedBudget)
            : null,
        timeline: sanitizeText(data.timeline, 80),
        consentToContact: true,
        honeypot: sanitizeText(data.website, 120),
        landingPage: window.location.href,
        source: `location-landing-${areaSlug || "vic"}`,
        submittedAt: new Date().toISOString(),
        ...attribution
      };

      try {
        const sent = await submitLeadViaBackend(payload);
        if (sent) {
          toast("Thanks — your matching-home request was sent.");
          form.reset();
          return;
        }
      } catch (error) {
        console.error(error);
        queueLead(payload);
        toast("Live form is unavailable. Opening email fallback.");
      }

      const body = buildMailtoBody(payload);
      window.location.href = `mailto:${encodeURIComponent(
        CONTACT_EMAIL
      )}?subject=${encodeURIComponent(
        `New Lead — ${areaName} Home Search`
      )}&body=${encodeURIComponent(body)}`;
      form.reset();
    });
  };

  setCanonicalAndOgUrl();
  setStructuredData();
  buildAttribution();
  bindLeadForm();
  flushQueuedLeads();
  window.addEventListener("online", () => {
    flushQueuedLeads();
  });
})();
