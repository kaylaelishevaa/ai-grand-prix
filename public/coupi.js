/* The shared COUPI artwork. Change this function to swap the character everywhere. */
export function coupiSVG(mood = 'calm', size = 150, body = '#3F8A7B', cheek = '#E8A87C') {
  if (!['calm', 'excited', 'attentive', 'sleepy', 'listening', 'thinking', 'relaxed', 'idle'].includes(mood)) mood = 'calm';
  if (mood === 'idle') mood = 'calm';
  size = Math.min(400, Math.max(24, Number(size) || 150));
  // Restrict the colour parameters to CSS hex colours before placing them in SVG attributes.
  body = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(body) ? body : '#3F8A7B';
  cheek = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(cheek) ? cheek : '#E8A87C';
  const on = condition => condition ? 'inline' : 'none';
  return `<svg class="coupi-art" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 124 / 140)}" viewBox="0 0 140 124" role="img" aria-label="${'COUPI, ' + mood}">
  <g display="${on(mood === 'excited')}">
    <path d="M124 12L126.2 19.8L134 22L126.2 24.2L124 32L121.8 24.2L114 22L121.8 19.8Z" fill="#F2B84B"/>
    <path d="M13 40L14.6 45.4L20 47L14.6 48.6L13 54L11.4 48.6L6 47L11.4 45.4Z" fill="#F2B84B"/>
  </g>
  <g display="${on(mood === 'sleepy')}" fill="#6D8F86" font-family="Georgia, serif" font-weight="700">
    <text x="112" y="28" font-size="17">z</text>
    <text x="124" y="13" font-size="12">z</text>
  </g>
  <g display="${on(mood === 'listening')}" stroke="#8FC2B2" stroke-width="3" fill="none" stroke-linecap="round">
    <path d="M124 54Q130 64 124 74"/>
    <path d="M131 47Q139 64 131 81"/>
  </g>
  <g display="${on(mood === 'thinking')}" fill="#A9C3BA">
    <circle cx="109" cy="27" r="2.6"/>
    <circle cx="118" cy="19" r="3.4"/>
    <circle cx="128" cy="10" r="4.2"/>
  </g>
  <g display="${on(mood === 'attentive')}">
    <circle cx="123" cy="21" r="10" fill="#EE8773"/>
    <text x="123" y="26.5" font-size="15" font-weight="700" fill="#5E2416" text-anchor="middle" font-family="Arial, sans-serif">!</text>
  </g>
  <g transform="translate(10 6)">
    <circle cx="28" cy="24" r="15" fill="${body}"/>
    <circle cx="92" cy="24" r="15" fill="${body}"/>
    <path d="M60 16C94 16 112 36 112 62C112 92 90 106 60 106C30 106 8 92 8 62C8 36 26 16 60 16Z" fill="${body}"/>
    <ellipse cx="27" cy="78" rx="8" ry="4.5" fill="${cheek}"/>
    <ellipse cx="93" cy="78" rx="8" ry="4.5" fill="${cheek}"/>
    <g display="${on(['calm', 'attentive', 'listening'].includes(mood))}">
      <ellipse cx="43" cy="60" rx="12" ry="15" fill="#F7F1DD"/>
      <ellipse cx="77" cy="60" rx="12" ry="15" fill="#F7F1DD"/>
      <ellipse cx="46" cy="62" rx="7" ry="10" fill="#1E4A48"/>
      <ellipse cx="74" cy="62" rx="7" ry="10" fill="#1E4A48"/>
    </g>
    <g display="${on(mood === 'thinking')}">
      <ellipse cx="43" cy="60" rx="12" ry="15" fill="#F7F1DD"/>
      <ellipse cx="77" cy="60" rx="12" ry="15" fill="#F7F1DD"/>
      <ellipse cx="47" cy="54" rx="6.5" ry="9" fill="#1E4A48"/>
      <ellipse cx="80" cy="54" rx="6.5" ry="9" fill="#1E4A48"/>
    </g>
    <g display="${on(mood === 'excited')}" stroke="#1E4A48" stroke-width="4.5" fill="none" stroke-linecap="round">
      <path d="M32 63Q43 50 54 63"/>
      <path d="M66 63Q77 50 88 63"/>
    </g>
    <g display="${on(mood === 'sleepy')}" stroke="#1E4A48" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M32 60Q43 69 54 60"/>
      <path d="M66 60Q77 69 88 60"/>
    </g>
    <g display="${on(mood === 'relaxed')}" stroke="#1E4A48" stroke-width="4" fill="none" stroke-linecap="round">
      <path d="M33 62Q43 55 53 62"/>
      <path d="M67 62Q77 55 87 62"/>
    </g>
    <g display="${on(mood === 'attentive')}" stroke="#1E4A48" stroke-width="3.5" fill="none" stroke-linecap="round">
      <path d="M33 45L51 39"/>
      <path d="M69 39L87 45"/>
    </g>
    <path display="${on(['calm', 'relaxed'].includes(mood))}" d="M53 82Q60 89 67 82" stroke="#1E4A48" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <g display="${on(mood === 'excited')}">
      <path d="M50 80Q60 96 70 80Z" fill="#1E4A48"/>
      <ellipse cx="60" cy="88" rx="5" ry="3" fill="#E58C7A"/>
    </g>
    <ellipse display="${on(mood === 'sleepy')}" cx="60" cy="84" rx="4" ry="4.5" fill="#1E4A48"/>
    <path display="${on(mood === 'attentive')}" d="M52 85Q56 81 60 85Q64 89 68 85" stroke="#1E4A48" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <ellipse display="${on(mood === 'listening')}" cx="60" cy="84" rx="6" ry="4.5" fill="#1E4A48"/>
    <path display="${on(mood === 'thinking')}" d="M54 85Q61 81 67 84" stroke="#1E4A48" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}
