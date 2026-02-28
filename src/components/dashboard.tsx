import type { FC } from 'hono/jsx'
import type { User } from '../types'
import { Layout, stripProtocol } from './layout'

type DashboardLink = { slug: string; target: string; favicon: string; createdAt: string }

function formatUtcAndLocal(timestamp: string): { utc: string; local: string } {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return { utc: '-', local: '-' }
  }

  const utc = date.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })
  const local = date.toLocaleString('en-US', { timeZoneName: 'short' })
  return { utc, local }
}

export const DashboardPage: FC<{ user: User; links: DashboardLink[]; origin: string }> = ({ user, links, origin }) => (
  <Layout title="My links" pathname="/dashboard" user={user}>
    <section class="card">
      <div class="stats-header">
        <div>
          <h1 style="margin-bottom: 0">my links</h1>
          <p class="subtitle" style="margin-top: 0.25rem; margin-bottom: 0">newly created links can take up to 2 minutes to appear</p>
        </div>
        <div class="stats-actions">
          <a class="nav-item" href="/">+ new link</a>
        </div>
      </div>
      {links.length === 0 ? (
        <p class="empty" style="margin-top: 10px">No links yet. <a href="/">Shorten one now.</a></p>
      ) : (
        <div class="table-wrap" style="margin-top: 10px">
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
              {links.map((link) => (
                <tr>
                  <td style="width: 28px; padding-right: 0">
                    <img class="favicon-lg" src={link.favicon} alt="" loading="lazy" />
                  </td>
                  <td style="white-space: nowrap; font-weight: 700">
                    <span class="stats-slug-origin">{stripProtocol(origin)}/</span><a href={`/${link.slug}`} target="_blank" rel="noopener noreferrer">{link.slug}</a>
                  </td>
                  <td style="max-width: 320px">
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px">
                      <a href={link.target} target="_blank" rel="noopener noreferrer" style="color: var(--muted)">{stripProtocol(link.target)}</a>
                    </div>
                  </td>
                  <td style="white-space: nowrap; color: var(--muted)">{formatUtcAndLocal(link.createdAt).utc}</td>
                  <td>
                    <div class="table-actions">
                      <button class="action-link copy-btn" type="button" data-copy={`${origin}/${link.slug}`}>copy</button>
                      <a class="action-link" href={`/${link.slug}/stats`}>stats</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </Layout>
)
