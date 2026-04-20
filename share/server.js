const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

const routes = [
  ['/api/health', require('./api/health')],
  ['/api/config', require('./api/config')],
  ['/api/session/cancel', require('./api/session/cancel')],
  ['/api/session/complete', require('./api/session/complete')],
  ['/api/session/connect', require('./api/session/connect')],
  ['/api/session/create', require('./api/session/create')],
  ['/api/session/join', require('./api/session/join')],
  ['/api/session/leave', require('./api/session/leave')],
  ['/api/session/nearby/announce', require('./api/session/nearby/announce')],
  ['/api/session/nearby/list', require('./api/session/nearby/list')],
  ['/api/session/poll', require('./api/session/poll')],
  ['/api/session/state', require('./api/session/state')],
  ['/api/session/status', require('./api/session/status')],
  ['/api/signal/send', require('./api/signal/send')]
];

for (const [route, handler] of routes) {
  app.all(route, async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  });
}

app.use(express.static(__dirname, {
  extensions: ['html']
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

app.listen(PORT, HOST, () => {
  console.log(`KestFord Share listening on http://${HOST}:${PORT}`);
});
