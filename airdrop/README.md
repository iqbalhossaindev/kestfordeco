# KestFord Airdrop v3

This build includes:

1. Real Vercel serverless signaling routes
2. Direct WebRTC data channel file transfer
3. Nearby sender discovery for users on the same network hash
4. Upstash Redis support for reliable shared state on Vercel
5. TURN environment variable support for harder NAT cases
6. Clipboard copy and paste helpers
7. Reset flows for sender and receiver

## Required for production

Set Upstash Redis environment variables in Vercel:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Optional TURN variables:

- `TURN_URL`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

## Notes

- Nearby discovery works through the backend by grouping users on the same network hash. It is browser safe and works better than local memory mode, but it is not raw LAN multicast discovery.
- Without TURN, some strict mobile or enterprise networks may still fail to establish a peer connection.
- Without Upstash Redis, memory mode is only suitable for local testing.

## Deploy

1. Push the `airdrop` folder to GitHub
2. Import the project into Vercel
3. Add the environment variables
4. Redeploy
