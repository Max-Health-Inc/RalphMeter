/**
 * Simple test server for SurfaceExplorer tests
 */

import { createServer } from 'http';

// Simple in-memory session store
const sessions = new Set();

const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Page</title>
</head>
<body>
  <h1>Test Page</h1>
  <button id="btn1">Click Me</button>
  <button id="btn2">Another Button</button>
  
  <form id="form1" action="/submit" method="post">
    <input type="text" name="username" placeholder="Username" />
    <input type="email" name="email" placeholder="Email" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Submit</button>
  </form>

  <a href="/page2">Go to Page 2</a>
  <a href="/page3">Go to Page 3</a>
  <a href="https://example.com">External Link</a>
</body>
</html>
`;

const loginHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Login</title>
</head>
<body>
  <h1>Login</h1>
  <form id="login-form" action="/login" method="post">
    <input type="text" name="username" placeholder="Username" required />
    <input type="password" name="password" placeholder="Password" required />
    <button type="submit">Login</button>
  </form>
</body>
</html>
`;

const page2Html = `
<!DOCTYPE html>
<html>
<head>
  <title>Page 2</title>
</head>
<body>
  <h1>Page 2</h1>
  <p>This is page 2</p>
  <a href="/">Back to Home</a>
  <button id="page2btn">Page 2 Button</button>
</body>
</html>
`;

const page3Html = `
<!DOCTYPE html>
<html>
<head>
  <title>Page 3</title>
</head>
<body>
  <h1>Page 3</h1>
  <p>This is page 3</p>
  <a href="/">Back to Home</a>
</body>
</html>
`;

const protectedHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Protected Page</title>
</head>
<body>
  <h1>Protected Page</h1>
  <p>You are authenticated!</p>
  <a href="/">Back to Home</a>
</body>
</html>
`;

const adminHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Admin Page</title>
</head>
<body>
  <h1>Admin Page</h1>
  <p>You have admin privileges!</p>
  <a href="/">Back to Home</a>
</body>
</html>
`;

// Parse cookies from request
function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      cookies[name] = value;
    });
  }
  return cookies;
}

// Check if session is valid
function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return sessions.has(cookies.sessionId);
}

// Check if session has admin role
function isAdmin(req) {
  const cookies = parseCookies(req);
  return cookies.role === 'admin' && sessions.has(cookies.sessionId);
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else if (url === '/login' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(loginHtml);
  } else if (url === '/login' && req.method === 'POST') {
    // Parse POST body
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      // Simple credential check
      const params = new URLSearchParams(body);
      const username = params.get('username');
      const password = params.get('password');

      let role = 'user';
      if (username === 'admin' && password === 'admin123') {
        role = 'admin';
      } else if (username !== 'user' || password !== 'password123') {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Invalid credentials');
        return;
      }

      // Create session
      const sessionId = Math.random().toString(36).substring(7);
      sessions.add(sessionId);

      // Set cookie and redirect
      res.writeHead(302, {
        'Set-Cookie': [`sessionId=${sessionId}; Path=/`, `role=${role}; Path=/`],
        'Location': '/'
      });
      res.end();
    });
  } else if (url === '/page2') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page2Html);
  } else if (url === '/page3') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page3Html);
  } else if (url === '/protected') {
    if (isAuthenticated(req)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(protectedHtml);
    } else {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
    }
  } else if (url === '/admin') {
    if (isAdmin(req)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(adminHtml);
    } else if (isAuthenticated(req)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    } else {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized');
    }
  } else if (url === '/submit' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } else if (url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: 'test' }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Get port from command line or use default
const port = process.argv[2] ? parseInt(process.argv[2]) : 0;

server.listen(port, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`Server listening on port ${actualPort}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
