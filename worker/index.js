// Urbun Bakery website Worker.
//
// Cloudflare serves the static site (index.html, images, ...) straight from the
// assets folder. This script only runs for requests that don't match a file,
// which is how POST /api/enquiry reaches it. Everything else is handed back to
// the assets handler, which serves 404.html for missing pages.
//
// Enquiries are emailed through Resend (https://resend.com). Settings:
//   RESEND_API_KEY  secret, set in Cloudflare: Worker > Settings > Variables and Secrets
//   ENQUIRY_TO      where enquiries go          (wrangler.jsonc "vars")
//   ENQUIRY_FROM    sender, on a Resend-verified domain (wrangler.jsonc "vars")

const BUNS = {
  milk: 'Milk', brioche: 'Brioche', potato: 'Potato', sesame: 'Sesame milk',
  pretzel: 'Hybrid pretzel', gfv: 'Gluten free & vegan', slider: 'Sliders', texas: 'Texas Loaf',
};
const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Anything submitted faster than this was not typed by a person.
const MIN_FILL_MS = 3000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/enquiry') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'Method not allowed' }, 405, { Allow: 'POST' });
      }
      return handleEnquiry(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleEnquiry(request, env, url) {
  // Only accept posts from our own pages.
  const origin = request.headers.get('Origin');
  if (origin && hostOf(origin) !== url.host) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
  if (!data || typeof data !== 'object') return json({ ok: false, error: 'Invalid request' }, 400);

  // Spam traps: a hidden field people never see, and impossibly fast submissions.
  // Reply as if it worked so bots don't learn anything.
  if (clean(data.website) || !(Number(data.elapsed) >= MIN_FILL_MS)) {
    return json({ ok: true });
  }

  const venue = data.audience === 'venue';
  const f = {
    audience: venue ? 'Venue or restaurant' : 'Distributor or wholesaler',
    business: clean(data.business, 200),
    name: clean(data.name, 200),
    email: clean(data.email, 254),
    phone: clean(data.phone, 50),
    venueType: venue ? clean(data.venue, 100) : '',
    volume: clean(venue ? data.volume : data.volume_distributor, 100),
    storage: venue ? '' : clean(data.cold_chain, 100),
    states: venue ? '' : pick(data.states, STATES).join(', '),
    buns: pick(data.buns, Object.keys(BUNS)).map((b) => BUNS[b]).join(', '),
    message: clean(data.message, 3000, true),
  };

  if (!f.business || !f.name || !f.email) {
    return json({ ok: false, error: 'Please fill in your business name, name and email.' }, 400);
  }
  if (!EMAIL_RE.test(f.email)) {
    return json({ ok: false, error: 'That email address doesn’t look right.' }, 400);
  }
  // Names only, never values, so a broken setup can be diagnosed from the response.
  const missing = ['RESEND_API_KEY', 'ENQUIRY_TO', 'ENQUIRY_FROM'].filter((k) => !env[k]);
  if (missing.length) {
    console.error('Enquiry form is not configured, missing:', missing.join(', '));
    return json({ ok: false, error: 'not_configured', missing }, 503);
  }

  const rows = [
    ['Enquiring as', f.audience],
    ['Business', f.business],
    ['Name', f.name],
    ['Email', f.email],
    ['Phone', f.phone],
    [venue ? 'Venue type' : 'Expected volume', venue ? f.venueType : f.volume],
    [venue ? 'Buns per week' : 'Frozen storage', venue ? f.volume : f.storage],
    ['States supplied', f.states],
    ['Buns interested in', f.buns],
    ['Message', f.message],
  ].filter(([, v]) => v);

  const subject = `New ${venue ? 'venue' : 'distributor'} enquiry: ${f.business}`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    '\n\nReply to this email to answer them directly.';
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#2A1A0B">` +
    `<h2 style="margin:0 0 12px">${esc(subject)}</h2>` +
    `<table cellpadding="8" style="border-collapse:collapse">` +
    rows.map(([k, v]) =>
      `<tr><td style="vertical-align:top;font-weight:bold;border-bottom:1px solid #E7D7AE;white-space:nowrap">${esc(k)}</td>` +
      `<td style="border-bottom:1px solid #E7D7AE">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('') +
    `</table><p style="color:#6B5A43">Reply to this email to answer them directly.</p></div>`;

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.ENQUIRY_FROM,
        to: env.ENQUIRY_TO.split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: f.email,
        subject,
        text,
        html,
      }),
    });
  } catch (e) {
    console.error('Resend request failed', e);
    return json({ ok: false, error: 'send_failed' }, 502);
  }
  if (!res.ok) {
    console.error('Resend error', res.status, await res.text());
    return json({ ok: false, error: 'send_failed' }, 502);
  }
  return json({ ok: true });
}

// Trim, cap length and (unless multiline) collapse whitespace so values are safe for a subject line.
function clean(v, max = 200, multiline = false) {
  if (typeof v !== 'string') return '';
  let s = v.trim().slice(0, max);
  if (!multiline) s = s.replace(/\s+/g, ' ');
  return s;
}

function hostOf(u) {
  try {
    return new URL(u).host;
  } catch {
    return null; // e.g. "Origin: null"
  }
}

function pick(v, allowed) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  return [...new Set(list.filter((x) => allowed.includes(x)))];
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
