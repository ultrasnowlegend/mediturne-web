// Sends the contact form to Formspree without leaving the page; without JS the form posts normally.
(function () {
  const form = document.getElementById("contact-form");
  if (!form) return;
  const status = document.getElementById("form-status");
  const button = form.querySelector('button[type="submit"]');

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = "form-status" + (kind ? " " + kind : "");
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    let firstInvalid = null;
    for (const el of form.querySelectorAll("[required]")) {
      const bad = !el.value.trim() || (el.type === "email" && !el.checkValidity());
      el.setAttribute("aria-invalid", bad ? "true" : "false");
      if (bad && !firstInvalid) firstInvalid = el;
    }
    if (firstInvalid) {
      setStatus("Vyplňte prosím jméno, platný e-mail a zprávu.", "err");
      firstInvalid.focus();
      return;
    }

    button.disabled = true;
    setStatus("Odesílám…");
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(String(response.status));
      form.reset();
      setStatus("Děkuju, zpráva odešla. Ozvu se do dvou pracovních dnů.", "ok");
    } catch (err) {
      setStatus("Zprávu se nepodařilo odeslat. Napište mi prosím přímo na kontakt@mediturne.com.", "err");
    } finally {
      button.disabled = false;
    }
  });
})();
