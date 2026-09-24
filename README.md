# mediturne.com

Prezentační web mediturne. Čisté HTML a CSS, bez frameworku a bez build kroku.
Nasazuje se na Cloudflare Pages.

## Struktura

| Soubor | Co to je |
|---|---|
| `index.html` | úvodní stránka (návrh H) |
| `content/*.html` | obsah právních stránek a 404 |
| `tools/build_pages.py` | z `content/` a hlavičky/patičky `index.html` složí `ochrana-osobnich-udaju.html`, `cookies.html`, `obchodni-podminky.html`, `404.html` |
| `assets/` | CSS, JS formuláře, logo, favicony, náhled pro sdílení `og.png` |
| `fonts/` | písma Red Hat Display a Red Hat Text (variabilní WOFF2, podmnožiny latin a latin-ext), hostovaná u nás; licence SIL OFL 1.1 v `fonts/OFL.txt` (komerční použití povolené) |
| `_headers` | bezpečnostní hlavičky pro Cloudflare Pages (CSP, HSTS…) |

Po změně hlavičky nebo patičky v `index.html` nebo textu v `content/` spusť:

```
python tools/build_pages.py
```

## Než web spustíš

1. **Formspree.**
   - Založ formulář na formspree.io a jeho ID vlož do `index.html` místo `FORMSPREE_ID`.
   - V nastavení formuláře **vypni reCAPTCHA** (jinak odeslání přes JavaScript selže a data jdou Googlu)
     a **omez příjem na doménu** `mediturne.com`.
   - **Vyžádej si DPA** (smlouvu o zpracování se SCC) na team@formspree.io a archivuj ji.
     Formspree nemá veřejně stažitelné DPA a jeho certifikace EU-US DPF není ověřená.
   - Free plán: 50 zpráv měsíčně, odpovědi se uchovávají 30 dní.
2. **Doplň placeholdery** v `content/` (hledej `[`): datum spuštění a doručovací adresa.
   Pak `python tools/build_pages.py`.
3. **Aplikace.** Tlačítko „Přihlásit se“ vede na `https://app.mediturne.com`. Pokud bude jinde, přepiš ho v `index.html`.

## Nasazení na Cloudflare Pages

1. Cloudflare → Workers & Pages → Create → Pages → propoj s Git repozitářem.
   Root directory `NurseRosteringProject/Website`, build command prázdný, output directory `/`.
   Build watch paths omez na `NurseRosteringProject/Website/*`, ať se web nenasazuje při každé změně aplikace.
2. Projekt → Custom domains → přidej `mediturne.com` a `www.mediturne.com`.
   DNS záznamy vytvoří Cloudflare sám, **nepřidávej CNAME ručně předem**.
3. Přesměrování `www` → `mediturne.com` a `*.pages.dev` → vlastní doména nastav přes Redirect Rules
   (soubor `_redirects` celé domény neumí).
4. V Cloudflare nech vypnuté **Rocket Loader** a **Email Address Obfuscation**: vkládají inline skripty,
   které blokuje CSP. Bot Fight Mode je v pořádku, jeho cookie je uvedená v zásadách cookies.
5. Po nasazení zkontroluj v prohlížeči (DevTools):
   - záložka Network: žádný požadavek mimo mediturne.com (kromě odeslání formuláře na formspree.io),
   - záložka Application → Cookies: žádná cookie,
   - odeslání testovací zprávy formulářem.

## Obsah a tvrzení

Web popisuje jen to, co aplikace podle kódu umí: noční služby lékařů, nic jiného.
Nikdy netvrdit soulad se zákoníkem práce, mobilní aplikaci, export, notifikace ani plánování v prohlížeči
(to je „chystáme“). Právní rešerše a návrhy smluv jsou mimo repozitář v `nurse-rostering/mediturne-brand/pravni/`.
