import type { FC } from 'hono/jsx'
import type { Visit, User } from '../types'
import { parseUserAgent } from '../lib/user-agent'
import { Layout, stripProtocol } from './layout'

function formatUtcAndLocal(timestamp: string): { utc: string; local: string } {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return { utc: '-', local: '-' }
  }

  const utc = date.toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })
  const local = date.toLocaleString('en-US', { timeZoneName: 'short' })
  return { utc, local }
}

function buildMapLink(latitude?: number, longitude?: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const lat = Number(latitude).toFixed(6)
  const lon = Number(longitude).toFixed(6)
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`
}

function buildMapEmbedLink(latitude?: number, longitude?: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const lat = Number(latitude)
  const lon = Number(longitude)
  const delta = 0.04
  const left = lon - delta
  const right = lon + delta
  const top = lat + delta
  const bottom = lat - delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lon}`
}

function buildGoogleMapsLink(latitude?: number, longitude?: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  const lat = Number(latitude)
  const lon = Number(longitude)
  return `https://www.google.com/maps?q=${lat},${lon}`
}

function getLocationName(visit: Visit): string {
  return [visit.city, visit.region, visit.country].filter(Boolean).join(', ') || 'Unknown'
}

export const MapDialog: FC<{ slug: string; visit: Visit }> = ({ slug, visit }) => {
  const mapEmbed = buildMapEmbedLink(visit.latitude, visit.longitude)
  const mapOpen = buildMapLink(visit.latitude, visit.longitude)
  const googleMap = buildGoogleMapsLink(visit.latitude, visit.longitude)

  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Visit map dialog">
        <div class="dialog-header">
          <div class="dialog-title">location</div>
          <a class="dialog-close" href={`/${slug}/stats`}>Close</a>
        </div>
        <div class="dialog-body">
          {mapEmbed ? (
            <>
              <iframe class="map-embed" src={mapEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              <p style="margin-top: 10px"><strong>Location:</strong> {getLocationName(visit)}</p>
              <p><strong>Latitude:</strong> {String(visit.latitude ?? '-')}</p>
              <p><strong>Longitude:</strong> {String(visit.longitude ?? '-')}</p>
              {mapOpen && (
                <p style="margin-top: 8px; font-size: 13px">
                  <a href={mapOpen} target="_blank" rel="noopener noreferrer">openstreetmap</a>
                </p>
              )}
              {googleMap && (
                <p style="margin-top: 4px; font-size: 13px">
                  <a href={googleMap} target="_blank" rel="noopener noreferrer">google maps</a>
                </p>
              )}
            </>
          ) : (
            <p class="subtitle" style="margin-bottom: 0">no coordinates</p>
          )}
        </div>
      </div>
    </div>
  )
}

export const UaDialog: FC<{ slug: string; visit: Visit }> = ({ slug, visit }) => {
  const parsed = parseUserAgent(visit.userAgent)

  return (
    <div class="dialog-backdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="User agent dialog">
        <div class="dialog-header">
          <div class="dialog-title">user-agent</div>
          <a class="dialog-close" href={`/${slug}/stats`}>Close</a>
        </div>
        <div class="dialog-body">
          {parsed.browser && <p><strong>Browser:</strong> {parsed.browser}</p>}
          {parsed.browserVersion && <p><strong>Browser version:</strong> {parsed.browserVersion}</p>}
          {parsed.os && <p><strong>OS:</strong> {parsed.os}</p>}
          {parsed.osVersion && <p><strong>OS version:</strong> {parsed.osVersion}</p>}
          {parsed.device && <p><strong>Device:</strong> {parsed.device}</p>}
          {parsed.engine && <p><strong>Engine:</strong> {parsed.engine}</p>}
          {parsed.engineVersion && <p><strong>Engine version:</strong> {parsed.engineVersion}</p>}
          {parsed.platformVendor && <p><strong>Platform vendor:</strong> {parsed.platformVendor}</p>}
          {parsed.platformModel && <p><strong>Platform model:</strong> {parsed.platformModel}</p>}
          {parsed.platformType && <p><strong>Platform type:</strong> {parsed.platformType}</p>}
          <p style="margin-top: 10px; font-size: 12px; color: var(--muted)">Raw UA</p>
          <pre class="mono" style="white-space: pre-wrap; word-break: break-word; margin-top: 4px">{visit.userAgent}</pre>
        </div>
      </div>
    </div>
  )
}

export const StatsPage: FC<{
  slug: string
  target: string
  favicon?: string
  visits: Visit[]
  selectedMapIndex?: number
  selectedUaIndex?: number
  origin: string
  user?: User | null
}> = ({
  slug,
  target,
  favicon,
  visits,
  selectedMapIndex,
  selectedUaIndex,
  origin,
  user,
}) => {
  const countries = new Set(visits.map((v) => v.country).filter(Boolean)).size
  const uniqueIps = new Set(visits.map((v) => v.ip)).size
  const displayVisits = [...visits].reverse()
  const selectedMapVisit = selectedMapIndex !== undefined ? displayVisits[selectedMapIndex] : undefined
  const selectedUaVisit = selectedUaIndex !== undefined ? displayVisits[selectedUaIndex] : undefined
  const selectedUaParsed = selectedUaVisit ? parseUserAgent(selectedUaVisit.userAgent) : null
  const showMapDialog = Boolean(selectedMapVisit)
  const showUaDialog = !showMapDialog && Boolean(selectedUaVisit && selectedUaParsed)

  return (
    <Layout title={slug} description={`${visits.length} visit${visits.length !== 1 ? 's' : ''} — redirects to ${stripProtocol(target)}`} noindex pathname={`/${slug}/stats`} user={user}>
      <section class="card">
        <div class="stats-header">
          <div>
            <div class="stats-slug-label">short url</div>
            <h1 class="stats-slug">
              <span class="stats-slug-origin">{stripProtocol(origin)}/</span><a href={`/${slug}`} target="_blank" rel="noopener noreferrer">{slug}</a>
            </h1>
          </div>
          <div class="stats-actions">
            <a href={`/${slug}/stats?view=json`} target="_blank" rel="noopener noreferrer">json</a>
            <a href="/">home</a>
          </div>
        </div>
        <div class="stats-target">
          <span class="target-inline">
            {favicon && <img class="favicon-lg" src={favicon} alt="" loading="lazy" />}
            <a href={target} target="_blank" rel="noopener noreferrer">{stripProtocol(target)}</a>
          </span>
        </div>

        <div class="stat-cards">
          <div class="stat-card">
            <div class="label">Total visits</div>
            <div class="value">{visits.length}</div>
          </div>
          <div class="stat-card">
            <div class="label">Unique IPs</div>
            <div class="value">{uniqueIps}</div>
          </div>
          <div class="stat-card">
            <div class="label">Countries</div>
            <div class="value">{countries}</div>
          </div>
          <div class="stat-card">
            <div class="label">Last visit</div>
            <div class="value" style="font-size: 14px">
              {displayVisits.length > 0 ? (
                <>
                  <div>{formatUtcAndLocal(displayVisits[0].timestamp).utc}</div>
                  <div style="font-size: 12px; color: var(--muted)">
                    {formatUtcAndLocal(displayVisits[0].timestamp).local}
                  </div>
                </>
              ) : (
                '-'
              )}
            </div>
          </div>
        </div>
      </section>

      {visits.length > 0 ? (
        <section class="card">
          <h2>visits</h2>
          <div class="table-wrap">
            <table class="visits-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>IP</th>
                  <th>Location</th>
                  <th>Browser</th>
                  <th>OS</th>
                  <th>Device</th>
                  <th>Map</th>
                </tr>
              </thead>
              <tbody>
                {displayVisits.map((v, idx) => {
                  const parsed = parseUserAgent(v.userAgent)
                  const mapLink = buildMapLink(v.latitude, v.longitude)
                  const time = formatUtcAndLocal(v.timestamp)

                  return (
                    <tr>
                      <td class="mono">
                        <div>{time.utc}</div>
                        <div style="font-size: 12px; color: var(--muted)">{time.local}</div>
                      </td>
                      <td class="mono">{v.ip}</td>
                      <td>
                        {v.country && <span class="country-badge">{v.country}</span>}
                      </td>
                      <td>{parsed.browser}</td>
                      <td>{parsed.os}</td>
                      <td>{parsed.device}</td>
                      <td>
                        <div class="table-actions">
                          {mapLink ? (
                            <a class="action-link" href={`/${slug}/stats?map=${idx}`}>map</a>
                          ) : (
                            <span class="action-link disabled">n/a</span>
                          )}
                          <a class="action-link" href={`/${slug}/stats?ua=${idx}`}>ua</a>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section class="card">
          <p class="empty">No visits yet</p>
        </section>
      )}
      {showMapDialog && selectedMapVisit && <MapDialog slug={slug} visit={selectedMapVisit} />}
      {showUaDialog && selectedUaVisit && <UaDialog slug={slug} visit={selectedUaVisit} />}
    </Layout>
  )
}
