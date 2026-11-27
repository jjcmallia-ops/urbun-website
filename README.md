# Urbun Bakery website

Site for https://urbunbakery.com.au: `index.html` (home), `privacy.html` and `404.html`, with images in `images/`.

It's hosted on Cloudflare as a Worker named `urbun-website` (settings in `wrangler.jsonc`). Cloudflare serves the pages and images as static files. The small script in `worker/index.js` only handles the enquiry form.

## Enquiry form

The form posts to `/api/enquiry`. The Worker checks it, filters out spam (a hidden field and a minimum fill time), and emails it through [Resend](https://resend.com).

- Enquiries go to `ENQUIRY_TO` and come from `ENQUIRY_FROM`, both set under `vars` in `wrangler.jsonc`. To send to more than one address, separate them with commas.
- The sender's domain (`urbunbakery.com.au`) must be verified in Resend.
- The Resend API key is a secret. Add it in Cloudflare under Workers & Pages → urbun-website → Settings → Variables and Secrets, as a **Secret** named `RESEND_API_KEY`. Never put it in this repo.
- Each email's reply-to is the customer's address, so hitting Reply answers them.
- If the key is missing or Resend fails, the form tells people to email hello@urbunbakery.com.au or call instead. Errors show in Cloudflare under the Worker's Logs.

## Run locally

Quick look at the pages (the form won't send): `python3 -m http.server 4318`, then open http://localhost:4318

With the form working: put `RESEND_API_KEY=...` in a `.dev.vars` file (it's git-ignored), then run `npx wrangler dev`.

## Before launch

Confirm permission to use partner logos and customer testimonials.
