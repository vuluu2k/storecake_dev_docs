// Vercel serverless function — Decap CMS GitHub OAuth: step 2 (callback)
// GET /api/callback?code=...&state=...
// Exchanges the code for an access token, then postMessages it back to the
// Decap CMS popup window.

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

  const payload = JSON.stringify({ token, provider: 'github' });
  const html = `<!DOCTYPE html><html><body><script>
    (function() {
      function send(status, content) {
        window.opener && window.opener.postMessage(
          'authorization:github:' + status + ':' + content,
          '*'
        );
      }
      window.addEventListener('message', function(e) {
        if (e.data === 'authorizing:github') {
          send('success', ${JSON.stringify(payload)});
        }
      }, false);
      send('success', ${JSON.stringify(payload)});
    })();
  </script><p>Login successful. You can close this window.</p></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Set-Cookie', 'oauth_state=; Path=/; Max-Age=0');
  res.status(200).send(html);
}
