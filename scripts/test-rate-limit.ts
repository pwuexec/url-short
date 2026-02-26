// Usage: bun run scripts/test-rate-limit.ts [base-url]
// Example: bun run scripts/test-rate-limit.ts https://733113.xyz

const BASE_URL = Bun.argv[2] ?? 'https://733113.xyz'
const TOTAL = 7 // 2 over the limit of 5

console.log(`Testing rate limiting against ${BASE_URL}`)
console.log(`Sending ${TOTAL} POST requests (limit is 5/min)\n`)

let passed = 0
let limited = 0

for (let i = 1; i <= TOTAL; i++) {
  const res = await fetch(`${BASE_URL}/`, {
    method: 'POST',
    body: new URLSearchParams({ url: `https://example.com/test-${i}` }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'manual', // don't follow redirect, inspect it directly
  })

  const location = res.headers.get('location') ?? ''
  const isRateLimited = location.includes('error=ratelimit')
  const isError = location.includes('error=') && !isRateLimited

  if (isRateLimited) {
    limited++
    console.log(`Request ${i}: RATE LIMITED (302 → ${location})`)
  } else if (res.status === 302 && !isError) {
    passed++
    console.log(`Request ${i}: OK (302 → ${location})`)
  } else {
    console.log(`Request ${i}: UNEXPECTED — status=${res.status} location=${location}`)
  }
}

console.log(`\nResults: ${passed} passed, ${limited} rate limited out of ${TOTAL} requests`)

if (limited > 0 && passed <= 5) {
  console.log('Rate limiting is working correctly.')
  process.exit(0)
} else {
  console.log('Rate limiting does NOT appear to be working.')
  process.exit(1)
}
