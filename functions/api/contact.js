// Cloudflare Pages Function: POST /api/contact.
// Sends the contact form to our mailbox through Brevo; nothing is stored on our side, Brevo keeps a sending log.
// Environment: BREVO_API_KEY (secret), CONTACT_TO (kontakt@mediturne.com), CONTACT_FROM (sender verified in Brevo),
// optionally CONTACT_EXTRA_ORIGINS (comma separated, e.g. a preview deployment).

const LIMITS = { jmeno: 120, email: 200, nemocnice_oddeleni: 200, pocet_lekaru: 6, zprava: 5000 };
// A full 5000-character Czech message fits even urlencoded (about 8 KB); far more is not a person typing.
const MAX_BODY_BYTES = 16 * 1024;
const PRODUCTION_ORIGINS = ["https://mediturne.com", "https://www.mediturne.com"];
// Local testing (wrangler pages dev). Anchored, so http://localhost.attacker.tld does not pass.
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
// CR/LF in the name would reach the Brevo subject and Reply-To; U+2028/9 break lines too.
const LINE_BREAKING_RE = /[\p{Cc}\u2028\u2029]+/gu;
// The message keeps its line breaks and tabs: it only goes into the text body.
const MESSAGE_CONTROL_RE = /[\p{Cc}\u2028\u2029]/gu;

export async function onRequestPost({ request, env }) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");

  // Browsers always send Origin on a POST, so a missing one is not our form.
  if (!isAllowedOrigin(request.headers.get("Origin"), env)) {
    return reply(wantsJson, 403, "Formulář lze odeslat jen z mediturne.com.");
  }

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (declaredLength > MAX_BODY_BYTES) {
    return reply(wantsJson, 413, "Zpráva je příliš dlouhá.");
  }
  // Content-Length can be missing or wrong, so the bytes actually read are capped as well.
  const body = await readCapped(request, MAX_BODY_BYTES);
  if (body === null) {
    return reply(wantsJson, 413, "Zpráva je příliš dlouhá.");
  }

  let form;
  try {
    form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
  } catch {
    return reply(wantsJson, 400, "Formulář se nepodařilo přečíst.");
  }

  // Honeypot: bots fill every field. Answer as if it worked so they don't retry.
  if ((form.get("_gotcha") || "").toString().trim() !== "") {
    return reply(wantsJson, 200, "ok");
  }

  const data = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    data[key] = clean(key, (form.get(key) || "").toString()).slice(0, max).trim();
  }
  if (!data.jmeno || !data.zprava || !EMAIL_RE.test(data.email)) {
    return reply(wantsJson, 422, "Vyplňte prosím jméno, platný e-mail a zprávu.");
  }

  if (!env.BREVO_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    return reply(wantsJson, 500, "Formulář zatím není nastavený.");
  }

  const text = [
    `Jméno: ${data.jmeno}`,
    `E-mail: ${data.email}`,
    `Nemocnice a oddělení: ${data.nemocnice_oddeleni || "neuvedeno"}`,
    `Lékařů na nočních: ${data.pocet_lekaru || "neuvedeno"}`,
    "",
    data.zprava,
  ].join("\n");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "mediturne.com", email: env.CONTACT_FROM },
      to: [{ email: env.CONTACT_TO }],
      replyTo: { email: data.email, name: data.jmeno },
      subject: `Nová zpráva z mediturne.com: ${data.jmeno}`,
      textContent: text,
    }),
  });

  if (!response.ok) {
    console.error("Brevo", response.status, await response.text());
    return reply(wantsJson, 502, "Zprávu se nepodařilo odeslat.");
  }
  return reply(wantsJson, 200, "ok");
}

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  if (PRODUCTION_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin)) return true;
  const extra = (env.CONTACT_EXTRA_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  return extra.includes(origin);
}

function clean(key, value) {
  if (key === "zprava") {
    return value.replace(/\r\n?/g, "\n").replace(MESSAGE_CONTROL_RE, (c) => (c === "\n" || c === "\t" ? c : "")).trim();
  }
  return value.replace(LINE_BREAKING_RE, " ").trim();
}

// Returns null as soon as the body grows past the limit, without reading the rest.
async function readCapped(request, limit) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

// Without JavaScript the browser posts the form directly, so answer with a page instead of JSON.
function reply(wantsJson, status, message) {
  if (wantsJson) {
    return new Response(JSON.stringify({ ok: status === 200, message }), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (status === 200) {
    return new Response(null, { status: 303, headers: { Location: "/dekujeme" } });
  }
  return new Response(`${message} Vraťte se prosím zpět, nebo napište na kontakt@mediturne.com.`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
