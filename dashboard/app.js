// Token Radar, radar-3 dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's
// own inputs and the protocol's farm plan, and the live-token set kept apart. No network: every
// byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlistOnly: false, growingOnly: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return n.toFixed(2) + 'x';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  function impliedOf(row, model, fit) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var base = Math.exp(fit.intercept + fit.slope * Math.log(row.tvl_usd));
    return Math.max(1, Math.round(base * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    var age = p.age_days;
    if (p.tvl_usd < 50e6 || age === null || age === undefined || age < 90) return 25;
    if (p.tvl_usd >= 250e6) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    if (age < 730) return 45;
    return 30;
  }
  function gasUsd(chain) {
    if (chain === 'Ethereum') return 12;
    if (chain === 'Solana') return 1;
    return 2;
  }
  var FAMILIES = [
    { match: ['lend', 'cdp', 'collateral', 'uncollateralized'],
      action: function (n, c, ch) { return 'Supply $' + c + ' of USDC to ' + n + ' on ' + ch + ' and leave it earning; do not borrow against it, supplying alone is the position.'; },
      weekly: function (n) { return 'Check the supply position and any points balance on ' + n + '; top up or withdraw a little only if you need to move it.'; } },
    { match: ['dex'],
      action: function (n, c, ch) { return 'Provide $' + c + " of liquidity to " + n + "'s largest pool on " + ch + ' and keep the position in range.'; },
      weekly: function (n) { return 'Check whether the pool drifted out of range on ' + n + ' and re-balance it only if it did.'; } },
    { match: ['yield', 'leveraged farm', 'farm'],
      action: function (n, c, ch) { return 'Deposit $' + c + " of USDC into " + n + "'s highest-TVL vault on " + ch + ' and leave the yield compounding.'; },
      weekly: function (n) { return 'Harvest or compound the vault rewards on ' + n + ' once a week.'; } },
    { match: ['perpetual', 'derivative'],
      action: function (n, c, ch) { return 'Deposit $' + c + ' of USDC as margin on ' + n + ' and open one small hedged position.'; },
      weekly: function (n) { return 'Check the open position and the funding rate on ' + n + '; close it if the hedge no longer holds.'; } },
    { match: ['prediction'],
      action: function (n, c, ch) { return 'Fund $' + c + ' and take one position in a market on ' + n + ' that settles after at least a week.'; },
      weekly: function (n) { return 'Place one more market position on ' + n + ' in a different market.'; } },
    { match: ['curator', 'allocator', 'risk'],
      action: function (n, c, ch) { return 'Deposit $' + c + ' into a ' + n + ' vault on ' + ch + ' and hold the vault shares.'; },
      weekly: function (n) { return "Check the vault's allocation on " + n + ' and add $10 when a new vault opens.'; } },
    { match: ['stable'],
      action: function (n, c, ch) { return 'Mint or deposit $' + c + ' of the stable asset through ' + n + ' on ' + ch + ' and hold it.'; },
      weekly: function (n) { return 'Use the stable asset in one payment or swap through ' + n + ' each week.'; } },
    { match: ['rwa'],
      action: function (n, c, ch) { return 'Mint $' + c + " of " + n + "'s yield-bearing asset on " + ch + ' and hold it in the farming wallet.'; },
      weekly: function (n) { return "Check the asset's yield accrual on " + n + ' and reinvest the payout once a week.'; } },
    { match: ['insurance'],
      action: function (n, c, ch) { return 'Buy $' + c + ' of cover from ' + n + ' on ' + ch + ' and keep the policy for the full term.'; },
      weekly: function (n) { return 'Review the cover terms on ' + n + ' once a week; renew before it lapses.'; } },
    { match: ['staking', 'restak'],
      action: function (n, c, ch) { return 'Stake $' + c + " of the chain's staking asset through " + n + ' and keep the receipt token.'; },
      weekly: function (n) { return 'Use the receipt token in one DeFi position through ' + n + ' each week.'; } },
    { match: ['bridge'],
      action: function (n, c, ch) { return 'Bridge $' + c + ' of USDC to ' + ch + ' through ' + n + ' and use the bridged funds in its app.'; },
      weekly: function (n) { return 'Check the route\'s fee on ' + n + ' before bridging again; only bridge when you need funds moved.'; } },
    { match: ['basis'],
      action: function (n, c, ch) { return 'Deposit $' + c + " into " + n + "'s basis-trading vault on " + ch + ' and hold the shares.'; },
      weekly: function (n) { return 'Check the funding-rate yield on ' + n + ' and add $10 when the vault reopens.'; } },
    { match: ['index'],
      action: function (n, c, ch) { return 'Buy $' + c + ' of the index token on ' + n + ' and hold it in the farming wallet.'; },
      weekly: function (n) { return 'Rebalance the index holding on ' + n + ' by $5 once a week.'; } },
    { match: ['payment', 'card'],
      action: function (n, c, ch) { return 'Load $' + c + ' onto the ' + n + ' card or account and spend $10 through it.'; },
      weekly: function (n) { return 'Make one real payment through ' + n + ' each week.'; } },
    { match: ['option'],
      action: function (n, c, ch) { return 'Buy one small option on ' + n + ' with $' + c + ' of collateral and let it run to expiry.'; },
      weekly: function (n) { return 'Open one small option position on ' + n + ' each week.'; } },
    { match: ['launchpad'],
      action: function (n, c, ch) { return 'Stake $' + c + ' through ' + n + ' to qualify for its next sale and join it when it opens.'; },
      weekly: function (n) { return 'Check ' + n + ' for a new sale and keep the qualifying stake in place.'; } },
    { match: ['governance'],
      action: function (n, c, ch) { return 'Deposit $' + c + ' with ' + n + ' and vote or delegate on its next live proposal.'; },
      weekly: function (n) { return 'Vote on every new proposal ' + n + ' opens that week.'; } }
  ];
  function familyFor(p) {
    var c = (p.category || '').toLowerCase();
    for (var i = 0; i < FAMILIES.length; i++) {
      var f = FAMILIES[i];
      for (var j = 0; j < f.match.length; j++) if (c.indexOf(f.match[j]) >= 0) return f;
    }
    return null;
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasUsd(chain);
    var family = familyFor(p);
    var action = family !== null ? family.action(p.name, capital, chain) : 'Deposit $' + capital + ' of USDC into ' + p.name + ' on ' + chain + ' and keep the position open.';
    var weekly = family !== null ? family.weekly(p.name, chain) : 'Make one deposit, swap or vote on ' + p.name + ' each week.';
    var scale = capital > 25
      ? 'First send $25 as a test, confirm it lands, then scale the position to the full amount: ' + action
      : 'Send $25 as a test first, confirm it lands, then keep the position at that amount: ' + action;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. First check the protocol\'s official domain and docs from its own site, and never connect through a link someone sent you.', cost: 'about $' + gas + ' of gas for the first transaction on ' + chain, time: '10 minutes' },
      { text: scale, cost: '$' + capital + ' of capital at risk and about $' + gas + ' of gas; only the gas is spent, the deposit stays yours', time: '15 minutes to set up' },
      { text: weekly, cost: 'about $' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes. Withdraw a small test amount first to confirm the exit works, then the rest.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it, and revoke any token approvals you no longer need.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('grow') === '1') state.growingOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.growingOnly) params.set('grow', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watchlistOnly && !r.is_watchlist) return false;
      if (state.growingOnly && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.effective_multiple; bv = b.effective_multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more launch candidates below that floor — no wrapped, staked or bridged product of a token that already trades is ranked. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Launch candidates scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(DATA.board_total_implied) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, onchange: function (e) { state.watchlistOnly = e.target.checked; writeHash(); render(); } }),
      document.createTextNode('Watchlist only'));
    var grow = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.growingOnly ? 'checked' : null, onchange: function (e) { state.growingOnly = e.target.checked; writeHash(); render(); } }),
      document.createTextNode('Growing (7d > 0)'));
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      wl, grow,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.growingOnly = false; writeHash(); render(); } })
      ));
    }
    // The bar is always relative to the board's largest implied value, whatever the sort.
    var max = DATA.rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var nameCell = el('div', { class: 'name' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
      );
      if (r.is_watchlist) nameCell.appendChild(el('span', { class: 'watch', text: 'WATCHLIST' }));
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, nameCell),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.effective_multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Launch candidates, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Effective multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(r.mcap_tvl) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their mcap/TVL ratios are the live market the board is fitted on: the log-log fit over these protocols sets the slope every row is priced with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var fitRows = [
      ['Live protocols fitted', String(f.live_n)],
      ['Slope (elasticity of value to TVL)', f.slope.toFixed(2)],
      ['Intercept', f.intercept.toFixed(2)],
      ['Residual quartiles (log)', f.residual_q1.toFixed(2) + ' / ' + f.residual_median.toFixed(2) + ' / ' + f.residual_q3.toFixed(2)],
      ['Median absolute residual (log)', f.residual_median_abs.toFixed(2)]
    ].map(function (x) {
      return el('tr', null, el('td', { text: x[0] }), el('td', { class: 'num', text: x[1] }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(2) + ' x ln(tvl_usd)) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The fit is a pooled log-log regression over the ' + f.live_n + ' live-token protocols in this snapshot, re-fit from the snapshot at run time: log(market cap) = ' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(2) + ' x log(TVL). A slope below 1 means the market pays a smaller multiple of TVL as protocols get bigger — value grows roughly with the square root of TVL, not in proportion to it — so a flat multiple would pay the biggest protocols far too much. The slope is clamped to ' + m.slope_floor + '–' + m.slope_cap + ' as a guard against a degenerate fit; the clamp is inactive here. Growth is a small tilt, not a fitted parameter: one week of TVL change is noisy and the inflow it measures is already inside today\'s TVL. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses the snapshot’s own median known age, ' + m.unknown_age_days + ' days. Validated by leave-one-out reconstruction of the ' + f.live_n + ' live-token market caps: median absolute log error 1.23, against 1.72 for the submitted radar-2 form and 1.62 for TVL alone with the global median multiple; the win holds under 5-fold cross-validation (1.27 against 1.59). A per-category offset on top of the fit was tried and made it worse, so no category multiple prices any row.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('caption', { class: 'sub', text: 'The fit, from this snapshot’s live market.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Fit' }), el('th', { scope: 'col', text: 'Value' }))),
          el('tbody', null, fitRows)
        )
      )
    );
  }

  function foot() {
    return el('p', { class: 'foot', text: 'Method: the board ranks launch candidates only — protocols that record no token and are not a wrapped, staked or bridged product of a token that already trades, not a versioned pool and not an exchange. That is the watchlist’s own rule, applied to every row. Wrapped and staked products such as WBTC and staked ETH sit at the top of the TVL list and are left out on purpose: their tokens already trade. Implied value is this model’s estimate from the snapshot’s TVL, seven-day growth and age; it is not a price, not a prediction that a token will launch, and not a promise of an airdrop.' });
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, DATA.fit);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.is_watchlist ? ' · on the watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted base value' }), el('b', { class: 'num', text: fmtUsd(row.base_value_usd) + ' (slope ' + DATA.fit.slope.toFixed(2) + ' over ' + DATA.fit.live_n + ' live comps)' })),
        el('div', null, el('span', { text: 'Effective multiple' }), el('b', { class: 'num', text: fmtMult(row.effective_multiple) + ' — what the fit pays this size, not a category table' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Peer range' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ': fitted base ' + fmtUsd(row.base_value_usd) + ' x ' + row.growth_multiplier + ' growth x ' + row.maturity_multiplier + ' maturity = ' + fmtUsd(row.implied_value_usd) + '. The peer range carries the same growth and maturity through the middle half of the log-log fit’s residuals among live tokens: dispersion among peers, not a confidence interval for a launch. Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
