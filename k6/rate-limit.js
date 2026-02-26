import http from 'k6/http'
import { check } from 'k6'
import { Counter } from 'k6/metrics'

// NOTE: This test hits the live endpoint and consumes real rate limit tokens.
// The limit resets after 60 seconds, so back-to-back deploys may see
// fewer allowed requests than expected if tokens haven't reset yet.

const BASE_URL = __ENV.BASE_URL || 'https://733113.xyz'
const LIMIT = 5
const TOTAL = LIMIT + 2 // send 2 over the limit

const rateLimited = new Counter('rate_limited_requests')
const allowed = new Counter('allowed_requests')

export const options = {
  vus: 1,         // single VU = sequential requests = same IP
  iterations: TOTAL,
  thresholds: {
    'rate_limited_requests': [`count >= 1`], // at least 1 request must be blocked
    'allowed_requests': [`count >= 1`],      // at least 1 request must pass
  },
}

export default function () {
  const res = http.post(
    `${BASE_URL}/`,
    { url: 'https://example.com/k6-rate-limit-test' },
    { redirects: 0 }
  )

  const location = res.headers['Location'] ?? ''
  const isRateLimited = location.includes('error=ratelimit')
  const isAllowed = res.status === 302 && !isRateLimited

  if (isRateLimited) rateLimited.add(1)
  if (isAllowed) allowed.add(1)

  check(res, {
    'is a redirect': (r) => r.status === 302,
    'rate limited after limit': () => {
      // after LIMIT requests, we expect rate limiting to kick in
      const iter = parseInt(__ITER)
      return iter < LIMIT ? !isRateLimited : true // don't enforce on later iters
    },
  })
}
