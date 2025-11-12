// ---------------------------------------------------------------
//  Full-core, CORS-fixed proxy for https://tol.life
//  → http://localhost:8000
// ---------------------------------------------------------------
const http = require('http');
const httpProxy = require('http-proxy');
const os = require('os');
const cluster = require('cluster');

const PORT   = 8000;
const TARGET = 'https://tol.life';

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

proxy.on('error', (err, req, res) => {
  console.error(`[${process.pid}] Proxy error:`, err.message);
  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
  }
});

// ------------------- CORS helper --------------------------------
function handleCORSOptions(req, res) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin':      req.headers.origin || '*',
    'Access-Control-Allow-Methods':     'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers':     'Content-Type,Authorization,Accept,X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Length': '0'
  });
  res.end();
}

// ------------------- Worker ------------------------------------
function startWorker() {
  const server = http.createServer((req, res) => {
    // ---- 1. Intercept preflight OPTIONS ----
    if (req.method === 'OPTIONS') {
      console.log(`[${process.pid}] OPTIONS (CORS preflight)`);
      return handleCORSOptions(req, res);
    }

    // ---- 2. Forward everything else ----
    // Add the origin header that the real server expects
    req.headers['origin'] = TARGET;

    console.log(`[${process.pid}] ${req.method} ${req.url}`);
    proxy.web(req, res, { target: TARGET });
  });

  // WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    proxy.ws(req, socket, head, { target: TARGET });
  });

  server.listen(PORT, () => {
    console.log(`Worker ${process.pid} → http://localhost:${PORT}`);
  });
}

// ------------------- Master (cluster) -------------------------
if (cluster.isMaster) {
  const cpuCount = os.cpus().length;
  console.log(`Master ${process.pid} – forking ${cpuCount} workers`);
  for (let i = 0; i < cpuCount; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} died – restarting`);
    cluster.fork();
  });
} else {
  startWorker();
}