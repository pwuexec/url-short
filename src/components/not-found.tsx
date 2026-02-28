import type { FC } from 'hono/jsx'
import { Layout } from './layout'

export const NotFound: FC<{ code?: number; message?: string }> = ({ code = 404, message = 'short url not found' }) => (
  <Layout title={`${code} Not Found`} noindex>
    <section class="card">
      <div class="not-found">
        <h1>{code}</h1>
        <p>{message}</p>
        <a href="/">home</a>
      </div>
    </section>
  </Layout>
)
