# mediturne.com

Prezentační web mediturne. Čisté HTML a CSS, bez frameworku a bez build kroku.
Nasazuje se na Cloudflare Pages.

## Struktura

| Soubor | Co to je |
|---|---|
| `index.html` | úvodní stránka (návrh H) |
| `content/*.html` | obsah právních stránek, děkovací stránky a 404 |
| `functions/api/contact.js` | Cloudflare Pages Function: přijme formulář a pošle ho přes Brevo |
| `tools/build_pages.py` | z `content/` a hlavičky/patičky `index.html` složí `ochrana-osobnich-udaju.html`, `cookies.html`, `obchodni-podminky.html`, `404.html` |
| `assets/` | CSS, JS formuláře, logo, favicony, náhled pro sdílení `og.png` |
| `fonts/` | písma Red Hat Display a Red Hat Text (variabilní WOFF2, podmnožiny latin a latin-ext), hostovaná u nás; licence SIL OFL 1.1 v `fonts/OFL.txt` (komerční použití povolené) |
| `_headers` | bezpečnostní hlavičky pro Cloudflare Pages (CSP, HSTS…) |

Po změně hlavičky nebo patičky v `index.html` nebo textu v `content/` spusť:

```
python tools/build_pages.py
```

## Než web spustíš

1. **Kontaktní formulář (Brevo).** Formulář posílá na `/api/contact` (`functions/api/contact.js`,
   Cloudflare Pages Function). Ta zprávu nikam neukládá a přes Brevo ji doručí do schránky. Brevo si ale
   o každém odeslání vede záznam (příjemce, předmět se jménem, Reply-To) a bez nastavení ho drží napořád.
   - Založ účet na brevo.com (Free: 300 e-mailů denně).
   - Senders, Domains & Dedicated IPs → Domains → přidej `mediturne.com` a ověř ji.
     Brevo nabídne automatické nastavení DNS v Cloudflare; jinak přidej jeho TXT (brevo-code),
     dva DKIM záznamy a DMARC ručně v Cloudflare DNS. **MX záznamy Seznamu nech, jak jsou.**
   - Senders → přidej odesílatele `web@mediturne.com` (schránka nemusí existovat, odpovědi jdou
     na adresu z formuláře přes Reply-To).
   - SMTP & API → API keys → vytvoř klíč jen pro tenhle web.
   - Cloudflare → projekt → Settings → Variables and Secrets (Production i Preview):
     `BREVO_API_KEY` jako **Secret**, `CONTACT_TO` = `kontakt@mediturne.com`, `CONTACT_FROM` = `web@mediturne.com`.
   - Formulář přijme jen požadavek s hlavičkou `Origin` z přesného seznamu: `https://mediturne.com`,
     `https://www.mediturne.com` a pro místní zkoušení `http://localhost` a `http://127.0.0.1` (s libovolným
     portem, např. `wrangler pages dev`). Jiné adresy, třeba náhledové nasazení na `*.pages.dev`, se povolí
     volitelnou proměnnou `CONTACT_EXTRA_ORIGINS` (jen Preview): přesné originy oddělené čárkou, např.
     `https://nahled.mediturne.pages.dev`. Tělo delší než 16 KB funkce odmítne, aniž by ho celé načetla,
     a ze všech polí odstraní řídicí znaky (zpráva si nechá jen konce řádků a tabulátory).
   - Settings → Transactional emails → Retention rules: uchovávání záznamů 1 měsíc a náhledy neukládat.
     Obě hodnoty pak doplň do zásad ochrany osobních údajů.
   - Smlouva o zpracování (DPA) je součástí podmínek Brevo, archivuj si ji z jejich stránky Legal.
2. **Doplň placeholdery** v `content/` (hledej `[`): datum spuštění, právní forma, IČO, doručovací
   adresa, hosting aplikace a ceny.
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
   - záložka Network: žádný požadavek mimo mediturne.com,
   - záložka Application → Cookies: nanejvýš cookies Cloudflare (`__cf_bm`, `cf_clearance`), které
     Bot Fight Mode nastavuje i běžným návštěvníkům; jiná cookie tam být nesmí,
   - odeslání testovací zprávy formulářem.

## Obsah a tvrzení

Web popisuje jen to, co aplikace podle kódu umí: noční služby lékařů, nic jiného.
Nikdy netvrdit soulad se zákoníkem práce, mobilní aplikaci, export, notifikace ani plánování v prohlížeči
(to je „chystáme“). Právní rešerše a návrhy smluv jsou mimo repozitář v `nurse-rostering/mediturne-brand/pravni/`.
