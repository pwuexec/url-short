import type { FC } from 'hono/jsx'
import type { User } from '../types'
import { Layout } from './layout'

export const SearchPage: FC<{ error?: string; query?: string; user?: User | null }> = ({ error, query, user }) => (
  <Layout title="Find" pathname="/search" user={user}>
    <section class="card action-card">
      <h1>find stats</h1>
      <p class="subtitle">slug or short url</p>
      <form class="hero-form" method="get" action="/search">
        <input
          type="text"
          name="q"
          placeholder="abc123 or https://domain/abc123"
          required
          autofocus
          value={query}
          class={error ? 'invalid' : undefined}
        />
        <button type="submit">go</button>
      </form>
      {error === 'empty' && <p class="hero-error visible">Please enter a slug or URL.</p>}
      {error === 'notfound' && <p class="hero-error visible">No short URL found for that slug.</p>}
    </section>
  </Layout>
)
