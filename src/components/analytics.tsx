import type { FC } from 'hono/jsx'
import type { User } from '../types'
import type { AnalyticsFilters } from '../lib/sql'
import { Layout, stripProtocol } from './layout'

type AERow = Record<string, string>

export const CountrySelect: FC<{ value?: string; countries: AERow[] }> = ({ value, countries }) => (
  <div class="filter-group" id="csel-country">
    <label class="filter-label">Country</label>
    <input type="hidden" name="country" value={value ?? ''} />
    <details class="csel filter-input">
      <summary class="csel-summary">
        <span class="csel-value">{value || 'all'}</span>
        <span class="csel-chevron">▾</span>
      </summary>
      <div class="csel-dropdown">
        <button type="button" class="csel-item" data-value="" {...(!value ? { 'data-sel': '' } : {})}>all</button>
        {countries.map(r => (
          <button type="button" class="csel-item" data-value={r.country || ''} {...(value === r.country ? { 'data-sel': '' } : {})}>
            {r.country || '—'}
          </button>
        ))}
      </div>
    </details>
  </div>
)

export const AnalyticsPage: FC<{
  user: User
  created: number
  visits: number
  topSlugs: AERow[]
  topCountries: AERow[]
  dailyVisits: AERow[]
  allCountries: AERow[]
  filters: AnalyticsFilters
  origin: string
}> = ({ user, created, visits, topSlugs, topCountries, dailyVisits, allCountries, filters, origin }) => {
  const maxVisits = Math.max(...dailyVisits.map(r => Number(r.visits)), 1)
  const empty = topSlugs.length === 0 && topCountries.length === 0 && dailyVisits.length === 0
  const hasActiveFilters = !!(filters.ip || filters.slug || filters.country || filters.days !== 30)

  return (
    <Layout title="Analytics" pathname="/analytics" user={user}>
      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0.5rem">
          <h1 style="margin-bottom: 0.25rem">site analytics</h1>
          <button type="button" class="nav-item danger" onclick="document.getElementById('reset-dialog').style.display='flex'">Reset all data</button>
        </div>
        <form method="get" action="/analytics" class="filter-form">
          <div class="filter-group">
            <label class="filter-label" for="f-days">Period</label>
            <select id="f-days" name="days" class="filter-input">
              {([7, 14, 30, 90] as const).map(d => (
                <option value={String(d)} selected={filters.days === d}>{d} days</option>
              ))}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label" for="f-slug">Slug</label>
            <input id="f-slug" name="slug" class="filter-input" placeholder="abc123" value={filters.slug ?? ''} />
          </div>
          <CountrySelect value={filters.country} countries={allCountries} />
          <div class="filter-group">
            <label class="filter-label" for="f-ip">IP</label>
            <input id="f-ip" name="ip" class="filter-input" placeholder="1.2.3.4" value={filters.ip ?? ''} />
          </div>
          <div class="filter-actions">
            <button type="submit" class="nav-item">Apply</button>
            {hasActiveFilters && <a href="/analytics" class="nav-item">Clear</a>}
          </div>
        </form>
        <div class="stat-cards" style="margin-top:0.75rem">
          <div class="stat-card">
            <div class="label">URLs created</div>
            <div class="value">{created}</div>
          </div>
          <div class="stat-card">
            <div class="label">Total visits</div>
            <div class="value">{visits}</div>
          </div>
        </div>
      </section>

      {dailyVisits.length > 0 && (
        <section class="card">
          <h2>visits — last {filters.days} days</h2>
          <div class="bar-chart">
            {dailyVisits.map(r => {
              const pct = Math.max((Number(r.visits) / maxVisits) * 100, 1)
              return (
                <div class="bar-row">
                  <span class="bar-label">{r.day}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style={`width: ${pct}%`} />
                  </div>
                  <span class="bar-count">{r.visits}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {topSlugs.length > 0 && (
        <section class="card">
          <h2>top links — last {filters.days} days</h2>
          <div class="table-wrap" style="margin-top: 0.5rem">
            <table class="visits-table">
              <thead><tr><th>Slug</th><th>Visits</th></tr></thead>
              <tbody>
                {topSlugs.map(r => (
                  <tr>
                    <td><a href={`/${r.slug}/stats`}>{stripProtocol(origin)}/{r.slug}</a></td>
                    <td class="mono">{r.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {topCountries.length > 0 && (
        <section class="card">
          <h2>visitors by country — last {filters.days} days</h2>
          <div class="table-wrap" style="margin-top: 0.5rem">
            <table class="visits-table">
              <thead><tr><th>Country</th><th>Visits</th></tr></thead>
              <tbody>
                {topCountries.map(r => (
                  <tr>
                    <td><span class="country-badge">{r.country || '—'}</span></td>
                    <td class="mono">{r.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {empty && (
        <section class="card">
          <p class="empty">No analytics data yet — data appears once traffic is recorded.</p>
        </section>
      )}

      <div id="reset-dialog" class="dialog-backdrop" style="display:none" onclick="if(event.target===this)this.style.display='none'">
        <div class="dialog" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <div class="dialog-title">reset all data</div>
            <button type="button" class="dialog-close" onclick="document.getElementById('reset-dialog').style.display='none'">Close</button>
          </div>
          <div class="dialog-body">
            <p style="font-size:0.8125rem;margin-bottom:0.75rem">This will permanently delete all shortened URLs, visit stats, and user link associations from KV. This action cannot be undone.</p>
            <div style="display:flex;gap:0.5rem">
              <form method="post" action="/admin/reset">
                <button type="submit" class="nav-item danger">Confirm reset</button>
              </form>
              <button type="button" class="nav-item" onclick="document.getElementById('reset-dialog').style.display='none'">Cancel</button>
            </div>
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `(function(){
        var wrap = document.getElementById('csel-country');
        if (!wrap) return;
        var hidden = wrap.querySelector('input[type=hidden]');
        var details = wrap.querySelector('details');
        var valueSpan = wrap.querySelector('.csel-value');
        wrap.querySelectorAll('.csel-item').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var val = btn.dataset.value;
            hidden.value = val;
            valueSpan.textContent = val || 'all';
            details.removeAttribute('open');
            wrap.querySelectorAll('.csel-item').forEach(function(b) {
              b.toggleAttribute('data-sel', b.dataset.value === val);
            });
            wrap.closest('form').submit();
          });
        });
        document.addEventListener('click', function(e) {
          if (!wrap.contains(e.target)) details.removeAttribute('open');
        });
      })();` }} />
    </Layout>
  )
}
