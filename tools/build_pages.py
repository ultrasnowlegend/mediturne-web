"""Builds the legal subpages from content/*.html, reusing the header and footer of index.html."""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
idx = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

# Shared chrome comes from index.html so every page stays in sync with it.
header = idx[idx.index('<a class="skip"'):idx.index('<main id="obsah">')].replace('href="#', 'href="/#')
footer = idx[idx.index('<footer class="site-footer">'):idx.index('</body>')].replace('href="#', 'href="/#')

PAGES = {
    "ochrana-osobnich-udaju.html": ("Ochrana osobních údajů", "Jak mediturne.com zpracovává osobní údaje návštěvníků webu a z kontaktního formuláře."),
    "cookies.html": ("Cookies", "Jaké cookies používá web mediturne.com a aplikace mediturne."),
    "obchodni-podminky.html": ("Obchodní podmínky", "Obchodní podmínky služby mediturne."),
    "404.html": ("Stránka nenalezena", "Tahle stránka na mediturne.com neexistuje."),
}

for fname, (title, desc) in PAGES.items():
    body = open(os.path.join(ROOT, "content", fname), encoding="utf-8").read()
    canonical = "" if fname == "404.html" else f'<link rel="canonical" href="https://mediturne.com/{fname[:-5]}">\n'
    html = f"""<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · mediturne</title>
<meta name="description" content="{desc}">
{canonical}<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
{header}<main id="obsah" class="legal"><div class="wrap">
{body}
</div></main>
{footer}</body>
</html>
"""
    open(os.path.join(ROOT, fname), "w", encoding="utf-8").write(html)
    print("built", fname)
