# KestFord Share for Railway

This package is adjusted to run on Railway.

## What changed

1. Added an Express server in `server.js`
2. Added a `start` script in `package.json`
3. Serves the static site and mounts the Node API routes that already exist in this project

## Railway deploy

1. Push this `share` folder to GitHub
2. Create a new Railway service from that repo
3. Set the service root directory to `/share` if this folder is inside a monorepo
4. Railway should detect `npm start`
5. After deploy, generate a public domain
6. Add your custom domain `share.kestford.com`

## Important note

The frontend file `js/app.js` in the provided project is empty, so the page can load but the interactive browser transfer flow will not work until that client logic is restored.

## Optional variables

You may still use TURN variables if your client code expects them:

- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`
