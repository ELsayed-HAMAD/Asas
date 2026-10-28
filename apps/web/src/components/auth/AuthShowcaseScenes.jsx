// The five interiors of the workspace tower, drawn as small dark tableaux
// against soft blue light. Each floor is a different part of the platform.

function StandingFigure({ x = 0, feet = 0, scale = 1, rim = true }) {
  return (
    <g transform={`translate(${x} ${feet}) scale(${scale})`} fill="#020a16">
      <circle cx="0" cy="-48" r="4.7" />
      <path d="M-2.1 -43.4 H2.1 V-39.8 H-2.1 Z" />
      <path d="M-6.8 -39.6 C-5.2 -41.6 -2.6 -42.3 0 -42.3 C2.6 -42.3 5.2 -41.6 6.8 -39.6 C7.6 -32.6 7.9 -25.4 7.9 -18.6 L-7.9 -18.6 C-7.9 -25.4 -7.6 -32.6 -6.8 -39.6 Z" />
      <path d="M-7 -18.8 L-1.6 -18.8 L-2 -0.4 L-7.3 -0.4 Z" />
      <path d="M1.6 -18.8 L7 -18.8 L7.3 -0.4 L2 -0.4 Z" />
      <path d="M-6.8 -39 C-8.8 -33 -9.9 -27 -9.7 -21.2 L-7.2 -20.8 C-7.2 -26 -6.4 -32 -5.6 -37 Z" />
      <path d="M6.8 -39 C8.8 -33 9.9 -27 9.7 -21.2 L7.2 -20.8 C7.2 -26 6.4 -32 5.6 -37 Z" />
      {rim && (
        <>
          <path
            d="M7 -39.2 C8.7 -33 9.5 -27.4 9.3 -22.6"
            stroke="#dbeafe"
            strokeOpacity="0.42"
            strokeWidth="0.7"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M6.8 -18.8 L7 -1.6"
            stroke="#dbeafe"
            strokeOpacity="0.34"
            strokeWidth="0.6"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}
    </g>
  )
}

function ProjectsScene() {
  return (
    <g>
      <ellipse cx="338" cy="227" rx="56" ry="5" fill="#dbeafe" opacity="0.1" />
      <g fill="#020a16">
        <rect x="205" y="188" width="7" height="40" rx="3.5" />
        <rect x="214" y="194" width="6" height="34" rx="3" />
        <circle cx="296" cy="191" r="4.2" />
        <path d="M290 197 C288.4 203 288.8 210 291 213 L303 213 C305 209 305 203 302 197 Z" />
        <path d="M293 213 L292 228" stroke="#020a16" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M300 213 L302 228" stroke="#020a16" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M301 200 L312 205" stroke="#020a16" strokeWidth="3" strokeLinecap="round" />
        <path d="M306 205 L376 205 L372 210 L304 210 Z" />
        <path d="M311 210 L311 228" stroke="#020a16" strokeWidth="2.2" />
        <path d="M369 210 L369 228" stroke="#020a16" strokeWidth="2.2" />
        <path d="M357 205 L357 196 L347 193" stroke="#020a16" strokeWidth="1.6" />
        <path d="M339 198 L350 190 L354 196 L343 203 Z" />
      </g>
      <path d="M318 204 L336 204 L334 208 L316 208 Z" fill="#dbeafe" fillOpacity="0.2" />
      <path d="M306 205 L372 205" stroke="#dbeafe" strokeOpacity="0.24" strokeWidth="0.7" />
      <path d="M304 210 L372 210" stroke="#dbeafe" strokeOpacity="0.2" strokeWidth="0.7" />
      <path d="M343 202 L352 197" stroke="#eaf6ff" strokeOpacity="0.26" strokeWidth="0.7" />
      <path d="M302 197 C304.4 201 305 207 305 212" stroke="#dbeafe" strokeOpacity="0.18" strokeWidth="0.6" />
      <circle cx="355" cy="197" r="6" fill="url(#asasWarmGlow)" />
    </g>
  )
}

function InventoryScene() {
  return (
    <g>
      <ellipse cx="252" cy="303" rx="64" ry="5" fill="#dbeafe" opacity="0.09" />
      <g fill="#020a16">
        <path d="M204 258 L204 304 M244 258 L244 304 M284 258 L284 304" stroke="#020a16" strokeWidth="1.8" />
        <path d="M202 274 L286 274 M202 289 L286 289 M202 304 L286 304" stroke="#020a16" strokeWidth="2.2" />
        <rect x="208" y="262" width="20" height="12" />
        <rect x="232" y="264" width="18" height="10" />
        <rect x="254" y="259" width="22" height="15" />
        <rect x="210" y="278" width="18" height="11" />
        <rect x="232" y="280" width="22" height="9" />
        <rect x="258" y="277" width="16" height="12" />
        <rect x="208" y="292" width="22" height="12" />
        <rect x="236" y="294" width="16" height="10" />
        <rect x="256" y="291" width="18" height="13" />
        <rect x="340" y="288" width="34" height="16" />
        <rect x="346" y="272" width="26" height="16" />
        <rect x="352" y="258" width="18" height="14" />
        <path d="M330 304 L342 258 M342 304 L354 258" stroke="#020a16" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M334 288 L346 288 M338 274 L350 274 M333 298 L345 298" stroke="#020a16" strokeWidth="1.2" />
        <path d="M300 246 L300 258" stroke="#020a16" strokeWidth="1.1" />
        <path d="M293 258 L307 258 L304 264 L296 264 Z" />
      </g>
      <path d="M340 288 L374 288 M346 272 L372 272" stroke="#dbeafe" strokeOpacity="0.16" strokeWidth="0.7" />
      <path d="M202 274 L286 274" stroke="#dbeafe" strokeOpacity="0.2" strokeWidth="0.6" />
      <path d="M202 289 L286 289" stroke="#dbeafe" strokeOpacity="0.14" strokeWidth="0.6" />
      <path d="M202 304 L286 304" stroke="#dbeafe" strokeOpacity="0.14" strokeWidth="0.6" />
      <path d="M208 262 L228 262" stroke="#dbeafe" strokeOpacity="0.16" strokeWidth="0.6" />
      <circle cx="300" cy="264" r="7" fill="url(#asasWarmGlow)" />
    </g>
  )
}

function ConnectionsScene() {
  return (
    <g>
      <ellipse cx="272" cy="379" rx="58" ry="4.5" fill="#dbeafe" opacity="0.09" />
      <rect x="206" y="340" width="84" height="36" fill="#041226" stroke="#93c5fd" strokeOpacity="0.2" strokeWidth="0.8" />
      <g stroke="#93c5fd" strokeOpacity="0.38" strokeWidth="0.7">
        <path d="M222 352 L246 346 L268 360" />
        <path d="M246 346 L258 372 L282 360" />
        <path d="M268 360 L282 360 L274 342" />
      </g>
      <g fill="#dbeafe" fillOpacity="0.7">
        <circle cx="222" cy="352" r="1.4" />
        <circle cx="246" cy="346" r="1.4" />
        <circle cx="268" cy="360" r="1.4" />
        <circle cx="282" cy="360" r="1.4" />
        <circle cx="258" cy="372" r="1.4" />
        <circle cx="274" cy="342" r="1.4" />
      </g>
      <g fill="#020a16">
        <circle cx="330" cy="352" r="4" />
        <path d="M324 358 C323 364 323 372 325 380 L335 380 C337 372 337 364 336 358 Z" />
        <path d="M326 358 L318 350" stroke="#020a16" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M325 380 L322 380 M334 380 L337 380" stroke="#020a16" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M300 322 L300 334" stroke="#020a16" strokeWidth="1.1" />
        <path d="M294 334 L306 334 L303 340 L297 340 Z" />
      </g>
      <path d="M324 358 L330 350" stroke="#dbeafe" strokeOpacity="0.2" strokeWidth="0.7" />
      <path d="M335 356 C337.5 363 337.5 372 335.5 379" stroke="#dbeafe" strokeOpacity="0.26" strokeWidth="0.65" />
      <circle cx="300" cy="340" r="7" fill="url(#asasWarmGlow)" />
    </g>
  )
}

function PeopleScene() {
  return (
    <g>
      <ellipse cx="300" cy="455" rx="76" ry="5" fill="#dbeafe" opacity="0.1" />
      <StandingFigure x={260} feet={456} scale={0.9} />
      <StandingFigure x={300} feet={456} scale={0.97} />
      <StandingFigure x={340} feet={456} scale={0.86} />
      <g fill="#020a16">
        <path d="M300 398 L300 410" stroke="#020a16" strokeWidth="1.1" />
        <path d="M293 410 L307 410 L304 417 L296 417 Z" />
        <path d="M374 442 C373 448 373 454 374 456" stroke="#020a16" strokeWidth="1.2" />
      </g>
      <g stroke="#020a16" strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M376 456 C374 444 378 436 384 430" />
        <path d="M376 456 C380 446 384 442 390 440" />
        <path d="M376 456 C372 446 368 442 362 440" />
        <path d="M376 456 C376 444 380 434 386 426" />
      </g>
      <g fill="#020a16" opacity="0.9">
        <ellipse cx="385" cy="428" rx="4.4" ry="3" transform="rotate(-28 385 428)" />
        <ellipse cx="391" cy="438" rx="4" ry="2.6" transform="rotate(14 391 438)" />
        <ellipse cx="361" cy="438" rx="4" ry="2.6" transform="rotate(-16 361 438)" />
        <ellipse cx="387" cy="424" rx="3.6" ry="2.4" transform="rotate(52 387 424)" />
        <path d="M370 456 L382 456 L380 466 L372 466 Z" />
      </g>
      <path d="M293 410 L307 410" stroke="#dbeafe" strokeOpacity="0.2" strokeWidth="0.7" />
      <circle cx="300" cy="419" r="9" fill="url(#asasWarmGlow)" />
    </g>
  )
}

function LobbyScene() {
  return (
    <g>
      <ellipse cx="282" cy="604" rx="96" ry="7" fill="#dbeafe" opacity="0.08" />
      <ellipse cx="300" cy="492" rx="28" ry="26" fill="url(#asasDoorBloom)" filter="url(#asasBloom)" />
      <circle cx="300" cy="492" r="13" fill="url(#asasDoorLight)" fillOpacity="0.72" />
      <circle cx="300" cy="492" r="13" stroke="#eaf6ff" strokeOpacity="0.45" strokeWidth="0.9" />
      <path d="M300 479 L300 505 M287 492 L313 492" stroke="#dbeafe" strokeOpacity="0.45" strokeWidth="0.8" />

      <g fill="#020a16">
        <path d="M196 574 L258 574 L256 580 L198 580 Z" />
        <path d="M198 580 L256 580 L258 606 L196 606 Z" />
        <circle cx="228" cy="564" r="3.9" />
        <path d="M221 570 C220 576 221 582 223 584 L235 584 C237 578 237 572 235 570 Z" />
        <path d="M248 573 L248 564 L242 562" stroke="#020a16" strokeWidth="1.3" />
        <path d="M237 566 L247 559 L250 564 L240 570 Z" />
        <path d="M204 584 L252 584" stroke="#dbeafe" strokeOpacity="0.16" strokeWidth="0.6" />
      </g>
      <path d="M196 574 L258 574" stroke="#dbeafe" strokeOpacity="0.3" strokeWidth="0.8" />
      <path d="M372 588 L390 588" stroke="#dbeafe" strokeOpacity="0.16" strokeWidth="0.6" />
      <circle cx="245" cy="564" r="5" fill="url(#asasWarmGlow)" />

      <g fill="#020a16">
        <path d="M372 588 L390 588 L386 604 L376 604 Z" />
      </g>
      <g stroke="#020a16" strokeWidth="1.4" fill="none" strokeLinecap="round">
        <path d="M381 588 C380 576 378 566 374 558" />
        <path d="M381 588 C384 578 388 570 392 564" />
        <path d="M381 588 C381 576 384 566 388 556" />
        <path d="M381 588 C378 578 372 572 366 568" />
      </g>
      <g fill="#020a16">
        <ellipse cx="373" cy="556" rx="4" ry="2.7" transform="rotate(-34 373 556)" />
        <ellipse cx="392" cy="562" rx="4" ry="2.6" transform="rotate(18 392 562)" />
        <ellipse cx="388" cy="554" rx="3.6" ry="2.4" transform="rotate(58 388 554)" />
        <ellipse cx="365" cy="566" rx="3.8" ry="2.4" transform="rotate(-22 365 566)" />
      </g>

      <g fill="#dbeafe">
        <circle cx="254" cy="530" r="1.6" fillOpacity="0.55" />
        <circle cx="346" cy="530" r="1.6" fillOpacity="0.55" />
      </g>
      <path d="M254 532 L254 534 M346 532 L346 534" stroke="#dbeafe" strokeOpacity="0.32" strokeWidth="0.7" />
    </g>
  )
}

export function FloorScene({ id }) {
  if (id === 'projects') return <ProjectsScene />
  if (id === 'inventory') return <InventoryScene />
  if (id === 'crm') return <ConnectionsScene />
  if (id === 'people') return <PeopleScene />
  if (id === 'lobby') return <LobbyScene />
  return null
}
