// Vercel serverless function — Decap CMS GitHub OAuth: step 2 (callback)
// GET /api/callback?code=...&state=...
// Exchanges the code for an access token, then postMessages it back to the
// Decap CMS popup parent following the netlify-cms / decap handshake:
//   popup -> opener: "authorizing:github"
//   opener -> popup: "authorizing:github"
//   popup -> opener: "authorization:github:success:<json>"

export default async function handler(req, res) {
  const { code, state } = req.query;
  const clientId = process.env.OAUTH_GITHUB_CLIENT_ID;
  const clientSecret = process.env.OAUTH_GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).send('Missing OAuth env vars');
    return;
  }

  const cookies = Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim().split('='))
      .filter((p) => p.length === 2),
  );
  if (!state || cookies.oauth_state !== state) {
    res.status(400).send('Invalid OAuth state');
    return;
  }

  let token;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const data = await tokenRes.json();
    if (!data.access_token) {
      res.status(400).send(`OAuth error: ${data.error_description || JSON.stringify(data)}`);
      return;
    }
    token = data.access_token;
  } catch (err) {
    res.status(500).send(`OAuth exchange failed: ${err.message}`);
    return;
  }

  const content = JSON.stringify({ token, provider: 'github' });
  const contentJs = JSON.stringify(content); // safely embeds the JSON string into JS source

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorized</title></head>
<body>
<p>Login successful. You can close this window.</p>
<script>
(function() {
  var content = ${contentJs};
  function receiveMessage(e) {
    if (e.data !== 'authorizing:github') return;
    e.source.postMessage(
      'authorization:github:success:' + content,
      e.origin
    );
  }
  window.addEventListener('message', receiveMessage, false);
  if (window.opener) {
    window.opener.postMessage('authorizing:github', '*');
  }
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Set-Cookie', 'oauth_state=; Path=/; Max-Age=0');
  res.status(200).send(html);
}
