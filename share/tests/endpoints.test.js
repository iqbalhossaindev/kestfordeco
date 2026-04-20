const assert = require('assert');
const { invoke } = require('./helpers');

const health = require('../api/health');
const config = require('../api/config');
const createSession = require('../api/session/create');
const joinSession = require('../api/session/join');
const poll = require('../api/session/poll');
const stateRoute = require('../api/session/state');
const leave = require('../api/session/leave');
const sendSignal = require('../api/signal/send');
const nearbyList = require('../api/session/nearby/list');
const nearbyAnnounce = require('../api/session/nearby/announce');

(async () => {
  const commonHeaders = { host: 'localhost', 'x-forwarded-for': '198.51.100.24' };

  const healthRes = await invoke(health, { method: 'GET', url: '/api/health', headers: commonHeaders });
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.json.ok, true);

  const configRes = await invoke(config, { method: 'GET', url: '/api/config', headers: commonHeaders });
  assert.equal(configRes.statusCode, 200);
  assert.equal(configRes.json.ok, true);
  assert.ok(Array.isArray(configRes.json.iceServers));

  const createRes = await invoke(createSession, {
    method: 'POST',
    url: '/api/session/create',
    headers: commonHeaders,
    body: {
      displayName: 'Sender Test',
      announceNearby: true,
      files: [
        { id: 'f1', name: 'hello.txt', size: 12, type: 'text/plain', lastModified: Date.now() },
        { id: 'f2', name: 'notes.md', size: 31, type: 'text/markdown', lastModified: Date.now() }
      ]
    }
  });
  assert.equal(createRes.statusCode, 200);
  assert.equal(createRes.json.ok, true);
  assert.equal(createRes.json.session.code.length, 6);

  const nearbyInitial = await invoke(nearbyList, {
    method: 'GET',
    url: '/api/session/nearby/list',
    headers: commonHeaders
  });
  assert.equal(nearbyInitial.statusCode, 200);
  assert.equal(nearbyInitial.json.ok, true);
  assert.ok(nearbyInitial.json.nearby.find((item) => item.code === createRes.json.session.code));

  const heartbeatRes = await invoke(nearbyAnnounce, {
    method: 'POST',
    url: '/api/session/nearby/announce',
    headers: commonHeaders,
    body: {
      code: createRes.json.session.code,
      token: createRes.json.session.senderToken,
      displayName: 'Sender Test'
    }
  });
  assert.equal(heartbeatRes.statusCode, 200);
  assert.equal(heartbeatRes.json.ok, true);

  const joinRes = await invoke(joinSession, {
    method: 'POST',
    url: '/api/session/join',
    headers: commonHeaders,
    body: {
      code: createRes.json.session.code,
      displayName: 'Receiver Test'
    }
  });
  assert.equal(joinRes.statusCode, 200);
  assert.equal(joinRes.json.ok, true);

  const senderPoll = await invoke(poll, {
    method: 'GET',
    url: `/api/session/poll?code=${createRes.json.session.code}&role=sender&token=${createRes.json.session.senderToken}`,
    headers: commonHeaders
  });
  assert.equal(senderPoll.statusCode, 200);
  assert.equal(senderPoll.json.ok, true);
  assert.equal(senderPoll.json.session.joined, true);
  assert.ok(senderPoll.json.messages.find((message) => message.kind === 'receiver-joined'));

  const offerRes = await invoke(sendSignal, {
    method: 'POST',
    url: '/api/signal/send',
    headers: commonHeaders,
    body: {
      code: createRes.json.session.code,
      role: 'sender',
      token: createRes.json.session.senderToken,
      kind: 'offer',
      payload: { sdp: { type: 'offer', sdp: 'fake-sdp' } }
    }
  });
  assert.equal(offerRes.statusCode, 200);
  assert.equal(offerRes.json.ok, true);

  const receiverPoll = await invoke(poll, {
    method: 'GET',
    url: `/api/session/poll?code=${createRes.json.session.code}&role=receiver&token=${joinRes.json.session.receiverToken}`,
    headers: commonHeaders
  });
  assert.equal(receiverPoll.statusCode, 200);
  assert.equal(receiverPoll.json.ok, true);
  assert.ok(receiverPoll.json.messages.find((message) => message.kind === 'offer'));

  const stateRes = await invoke(stateRoute, {
    method: 'GET',
    url: `/api/session/state?code=${createRes.json.session.code}&role=sender&token=${createRes.json.session.senderToken}`,
    headers: commonHeaders
  });
  assert.equal(stateRes.statusCode, 200);
  assert.equal(stateRes.json.ok, true);
  assert.equal(stateRes.json.session.joined, true);

  const receiverLeave = await invoke(leave, {
    method: 'POST',
    url: '/api/session/leave',
    headers: commonHeaders,
    body: {
      code: createRes.json.session.code,
      role: 'receiver',
      token: joinRes.json.session.receiverToken
    }
  });
  assert.equal(receiverLeave.statusCode, 200);
  assert.equal(receiverLeave.json.ok, true);

  const nearbyAgain = await invoke(nearbyList, {
    method: 'GET',
    url: '/api/session/nearby/list',
    headers: commonHeaders
  });
  assert.equal(nearbyAgain.statusCode, 200);
  assert.ok(nearbyAgain.json.nearby.find((item) => item.code === createRes.json.session.code));

  const senderLeave = await invoke(leave, {
    method: 'POST',
    url: '/api/session/leave',
    headers: commonHeaders,
    body: {
      code: createRes.json.session.code,
      role: 'sender',
      token: createRes.json.session.senderToken
    }
  });
  assert.equal(senderLeave.statusCode, 200);
  assert.equal(senderLeave.json.ok, true);

  console.log('All endpoint checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
