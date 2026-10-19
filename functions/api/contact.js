// Cloudflare Pages Function: POST /api/contact.
// Sends the contact form to our Seznam mailbox over SMTP; nothing is stored on our side and no other mail service is involved.
// Environment: SMTP_USER (kontakt@mediturne.com), SMTP_PASSWORD (secret, Seznam application password),
// optionally CONTACT_TO (defaults to SMTP_USER) and CONTACT_EXTRA_ORIGINS (comma separated, e.g. a preview deployment).

import { connect } from "cloudflare:sockets";

const LIMITS = { jmeno: 120, email: 200, nemocnice_oddeleni: 200, pocet_lekaru: 6, zprava: 5000 };
// A full 5000-character Czech message fits even urlencoded (about 8 KB); far more is not a person typing.
const MAX_BODY_BYTES = 16 * 1024;
const PRODUCTION_ORIGINS = ["https://mediturne.com", "https://www.mediturne.com"];
// Local testing (wrangler pages dev). Anchored, so http://localhost.attacker.tld does not pass.
const LOCAL_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
// CR/LF in the name would reach the mail headers (Subject, Reply-To); U+2028/9 break lines too.
const LINE_BREAKING_RE = /[\p{Cc}\u2028\u2029]+/gu;
// The message keeps its line breaks and tabs: it only goes into the text body.
const MESSAGE_CONTROL_RE = /[\p{Cc}\u2028\u2029]/gu;
// Port 465 is implicit TLS. Workers block port 25, and STARTTLS on 587 would need a socket upgrade mid-session.
const SMTP_HOST = "smtp.seznam.cz";
const SMTP_PORT = 465;
const SMTP_TIMEOUT_MS = 15000;

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

  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
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

  try {
    await sendMail(env, {
      replyTo: data.email,
      replyName: data.jmeno,
      subject: `Nová zpráva z mediturne.com: ${data.jmeno}`,
      text,
    });
  } catch (error) {
    console.error("SMTP", error.message);
    return reply(wantsJson, 502, "Zprávu se nepodařilo odeslat.");
  }
  return reply(wantsJson, 200, "ok");
}

// Seznam accepts only its own account as the sender, so From is the mailbox itself and the visitor goes to Reply-To.
async function sendMail(env, { replyTo, replyName, subject, text }) {
  const user = env.SMTP_USER;
  const to = env.CONTACT_TO || user;
  const socket = connect({ hostname: SMTP_HOST, port: SMTP_PORT }, { secureTransport: "on" });
  const timer = setTimeout(() => socket.close(), SMTP_TIMEOUT_MS);
  const writer = socket.writable.getWriter();
  const lines = lineReader(socket.readable);
  const encoder = new TextEncoder();
  const send = (line) => writer.write(encoder.encode(line + "\r\n"));

  async function expect(code) {
    for (;;) {
      const line = await lines.next();
      if (line === null) throw new Error("connection closed");
      if (!line.startsWith(code)) throw new Error(line.slice(0, 200));
      if (line[3] !== "-") return;
    }
  }

  // A base64 body has no lines starting with a dot and no overlong lines, so nothing needs escaping.
  const message = [
    `From: mediturne.com <${user}>`,
    `To: <${to}>`,
    `Reply-To: =?UTF-8?B?${base64(replyName)}?= <${replyTo}>`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@mediturne.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    ...base64(text).match(/.{1,76}/g),
    ".",
  ].join("\r\n");

  try {
    await expect("220");
    await send("EHLO mediturne.com");
    await expect("250");
    await send(`AUTH PLAIN ${base64(`\0${user}\0${env.SMTP_PASSWORD}`)}`);
    await expect("235");
    await send(`MAIL FROM:<${user}>`);
    await expect("250");
    await send(`RCPT TO:<${to}>`);
    await expect("250");
    await send("DATA");
    await expect("354");
    await send(message);
    await expect("250");
    await send("QUIT");
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}

function lineReader(readable) {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next() {
      for (;;) {
        const end = buffer.indexOf("\r\n");
        if (end >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          return line;
        }
        const { done, value } = await reader.read();
        if (done) return null;
        buffer += decoder.decode(value, { stream: true });
      }
    },
  };
}

function base64(value) {
  let binary = "";
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
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
