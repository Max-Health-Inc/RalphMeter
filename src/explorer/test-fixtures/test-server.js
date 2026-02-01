/**
 * Simple test server for SurfaceExplorer tests
 */

import { createServer } from 'http';

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

const server = createServer((req, res) => {
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
  } else if (url === '/page2') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page2Html);
  } else if (url === '/page3') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page3Html);
  } else if (url === '/submit' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } else if (url === '/api/data') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: 'test' }));
  } else if (url === '/protected') {
    // Simulates an auth-protected endpoint
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
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
