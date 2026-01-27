// ---------------------------------------------------------------
//  Full-core, CORS-FIXED proxy for https://tol.life
//  → http://localhost:8000
// ---------------------------------------------------------------
const http = require('http');
const httpProxy = require('http-proxy');
const os = require('os');
const cluster = require('cluster');

const PORT   = 8000;
const TARGET = 'https://tol.uhddesign.com';

// ------------------- Proxy instance -----------------------------
const proxy = httpProxy.createProxyServer({
  target: TARGET,
  changeOrigin: true,
  secure: true,
  autoRewrite: true,
  protocolRewrite: 'https',
  hostRewrite: true,
  cookieDomainRewrite: { '*': 'localhost' }
});

// ------------------- Error handling ----------------------------
proxy.on('error', (err, req, res) => {
  console.error(`[${process.pid}] Proxy error:`, err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  }
});

// ------------------- Inject CORS into ALL proxied responses ----
proxy.on('proxyRes', (proxyRes, req, res) => {
  // Inject CORS headers
  proxyRes.headers['Access-Control-Allow-Origin'] = '*';
  proxyRes.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,PATCH,OPTIONS';
  proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,Accept,X-Requested-With';
  proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';

  // Remove any conflicting headers from target server
  delete proxyRes.headers['access-control-allow-origin'];
  delete proxyRes.headers['set-cookie']; // Optional: avoid cookie domain issues
});

// ------------------- CORS preflight handler --------------------
function handleCORSOptions(req, res) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept,X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Length': '0'
  });
  res.end();
}

// ------------------- Worker ------------------------------------
function startWorker() {
  const server = http.createServer((req, res) => {
    // ---- 1. Handle preflight OPTIONS requests ----
    if (req.method === 'OPTIONS') {
      console.log(`[${process.pid}] OPTIONS (CORS preflight)`);
      return handleCORSOptions(req, res);
    }

    // ---- 2. Forward all other requests ----
    // Set origin to match target (some backends validate it)
    req.headers['origin'] = TARGET;

    console.log(`[${process.pid}] ${req.method} ${req.url}`);
    proxy.web(req, res, { target: TARGET });
  });

  // ---- WebSocket support ----
  server.on('upgrade', (req, socket, head) => {
    console.log(`[${process.pid}] WebSocket upgrade: ${req.url}`);
    proxy.ws(req, socket, head, { target: TARGET });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Worker ${process.pid} listening at http://localhost:${PORT}`);
  });
}

// ------------------- Master (cluster) -------------------------
if (cluster.isMaster) {
  const cpuCount = os.cpus().length;
  console.log(`Master ${process.pid} – forking ${cpuCount} workers for http://localhost:${PORT}`);

  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} died (code: ${code}) – restarting...`);
    cluster.fork();
  });
} else {
  startWorker();
}