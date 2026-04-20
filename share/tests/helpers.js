const { EventEmitter } = require('events');

function invoke(handler, { method = 'GET', url = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = headers;
    req.body = body;

    const res = {
      statusCode: 200,
      headers: {},
      setHeader(key, value) {
        this.headers[key.toLowerCase()] = value;
      },
      end(payload) {
        this.payload = payload;
        try {
          this.json = payload ? JSON.parse(payload) : null;
        } catch (error) {
          this.json = null;
        }
        resolve(this);
      }
    };

    try {
      const maybePromise = handler(req, res);
      Promise.resolve(maybePromise).catch(reject);
      process.nextTick(() => {
        if (body === undefined) {
          req.emit('end');
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { invoke };
