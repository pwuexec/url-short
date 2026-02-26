import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = __ENV.BASE_URL || 'https://733113.xyz'

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate == 1'], // all checks must pass
    http_req_duration: ['p(95)<3000'],
  },
}

export default function () {
  // Home page loads
  const home = http.get(BASE_URL)
  check(home, {
    'home: status 200': (r) => r.status === 200,
    'home: has form': (r) => r.body.includes('raw url shortener'),
  })

  // Invalid URL redirects with error
  const invalid = http.post(
    `${BASE_URL}/`,
    { url: 'not-a-valid-url!!!' },
    { redirects: 0 }
  )
  check(invalid, {
    'invalid url: is redirect': (r) => r.status === 302,
    'invalid url: has error param': (r) => (r.headers['Location'] ?? '').includes('error=invalid'),
  })

  // 404 for unknown slug
  const notFound = http.get(`${BASE_URL}/thisslugshouldnotexist`, { redirects: 0 })
  check(notFound, {
    '404 for unknown slug': (r) => r.status === 404,
  })
}
