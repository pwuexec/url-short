import type { FC } from 'hono/jsx'
import type { User } from '../types'
import { Layout, stripProtocol } from './layout'

type CreatedUrlData = { target: string; favicon: string; createdAt: string }

function formatUtcAndLocal(timestamp: string): { utc: string; local: string } {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return { utc: '-', local: '-' }
  }

  const utc = date.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })
  const local = date.toLocaleString('en-US', { timeZoneName: 'short' })
  return { utc, local }
}

export const HomePage: FC<{ created?: string; origin: string; createdUrlData?: CreatedUrlData; error?: string; inputValue?: string; user?: User | null }> = ({ created, origin, createdUrlData, error, inputValue, user }) => (
  <Layout description="Shorten any URL instantly. Free and open — no account required." pathname="/" user={user}>
    <section class="card action-card">
      <h1>raw url shortener</h1>
      <form class="hero-form" method="post" action="/">
        <input type="text" name="url" placeholder="url: example.com/a/very/long/path" required autofocus value={inputValue} class={error ? 'invalid' : undefined} />
        <button type="submit">go</button>
      </form>
      {error === 'empty' && <p class="hero-error visible">Please enter a URL.</p>}
      {error === 'invalid' && <p class="hero-error visible">Please enter a valid URL.</p>}
      {error === 'ratelimit' && <p class="hero-error visible">Too many requests. Please slow down.</p>}
      {!user && (
        <p class="subtitle" style="margin-top: 0.5rem; margin-bottom: 0">
          <a href="/auth/google">sign in</a> to keep track of your links
        </p>
      )}
    </section>
    {created && (
      <section class="card result-card">
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{navigator.clipboard.writeText(${JSON.stringify(`${origin}/${created}`)})}catch(_){}})()` }} />
        <div class="result-label">created &amp; copied to clipboard</div>
        <div class="table-wrap" style="margin-top: 8px">
          <table class="visits-table dashboard-table">
            <thead>
              <tr>
                <th></th>
                <th>Short URL</th>
                <th>Target</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="width: 28px; padding-right: 0">
                  {createdUrlData?.favicon && <img class="favicon-lg" src={createdUrlData.favicon} alt="" loading="lazy" />}
                </td>
                <td style="white-space: nowrap; font-weight: 700">
                  <span class="stats-slug-origin">{stripProtocol(origin)}/</span><a href={`/${created}`} target="_blank" rel="noopener noreferrer">{created}</a>
                </td>
                <td style="max-width: 320px">
                  <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px">
                    {createdUrlData?.target && <a href={createdUrlData.target} target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{stripProtocol(createdUrlData.target)}</a>}
                  </div>
                </td>
                <td style="white-space: nowrap; color: var(--muted)">{createdUrlData?.createdAt ? formatUtcAndLocal(createdUrlData.createdAt).utc : '-'}</td>
                <td>
                  <div class="table-actions">
                    <button class="action-link copy-btn" type="button" data-copy={`${origin}/${created}`}>copy</button>
                    <a class="action-link" href={`/${created}/stats`}>stats</a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    )}
  </Layout>
)
