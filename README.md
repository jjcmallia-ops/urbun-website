# Urbun Bakery website

Static site for urbunbakery.com.au: `index.html` (home) and `privacy.html`, with images in `images/`.

Run locally: `python3 -m http.server 4318`, then open http://localhost:4318

Host on Vercel: import this repo, choose "Other" as the framework preset, and leave the build settings empty.

Still to do before launch: connect the enquiry form, and confirm permission to use partner logos and customer testimonials.

## Moving to urbunbakery.com.au

These files contain the full GitHub Pages address (`https://jjcmallia-ops.github.io/urbun-website/`). Replace it with `https://urbunbakery.com.au/` when the domain moves:

- `index.html`: canonical link, share-preview (`og:`) tags and the Google business details (`application/ld+json`)
- `privacy.html`: canonical link
- `robots.txt` and `sitemap.xml`
