// Cloudflare Pages Function: POST /api/contact.
// Sends the contact form to our mailbox through Brevo; nothing is stored on our side, Brevo keeps a sending log.
// Environment: BREVO_API_KEY (secret), CONTACT_TO (kontakt@mediturne.com), CONTACT_FROM (sender verified in Brevo).

const LIMITS = { jmeno: 120, email: 200, nemocnice_oddeleni: 200, pocet_lekaru: 6, zprava: 5000 };
const ALLOWED_ORIGINS = ["https://mediturne.com", "https://www.mediturne.com"];
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export async function onRequestPost({ request, env }) {
  const wantsJson = (request.headers.get("Accept") || "").includes("application/json");

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin) && !origin.endsWith(".pages.dev") && !origin.startsWith("http://localhost")) {
    return reply(wantsJson, 403, "Formulář lze odeslat jen z mediturne.com.");
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(wantsJson, 400, "Formulář se nepodařilo přečíst.");
  }

  // Honeypot: bots fill every field. Answer as if it worked so they don't retry.
  if ((form.get("_gotcha") || "").toString().trim() !== "") {
    return reply(wantsJson, 200, "ok");
  }

  const data = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    data[key] = (form.get(key) || "").toString().trim().slice(0, max);
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
