const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = [
  'js/app.js',
  'api/_lib/utils.js',
  'api/_lib/store.js',
  'api/config.js',
  'api/health.js',
  'api/session/create.js',
  'api/session/join.js',
  'api/session/poll.js',
  'api/session/state.js',
  'api/session/leave.js',
  'api/session/nearby/announce.js',
  'api/session/nearby/list.js',
  'api/signal/send.js'
];

for (const file of files) {
  execSync(`node --check ${JSON.stringify(path.join(root, file))}`, { stdio: 'inherit' });
}

console.log('Syntax checks passed.');
