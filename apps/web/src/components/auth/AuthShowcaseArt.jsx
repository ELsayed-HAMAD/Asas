import { FloorScene } from './AuthShowcaseScenes'

// A hand-drawn workspace tower: one foundation, five lit floors. Finance sits
// in the lobby, then People, Relationships, Inventory, and Projects above it.
// A small figure walks in at the base. Every line is drawn with a slight
// wobble so the panel reads as an illustration rather than a rendering.

const FLOORS = [
  { id: 'projects', top: 170, glow: { cx: 344, cy: 208, rx: 74, ry: 24 } },
  { id: 'inventory', top: 246, glow: { cx: 250, cy: 290, rx: 88, ry: 28 } },
  { id: 'crm', top: 322, glow: { cx: 272, cy: 368, rx: 86, ry: 30 } },
  { id: 'people', top: 398, glow: { cx: 300, cy: 452, rx: 96, ry: 30 } },
]

const LOBBY = { top: 474, bottom: 606 }

const STEPS = [
  { y: 612, x1: 172, x2: 428, lit: 0.42 },
  { y: 622, x1: 160, x2: 440, lit: 0.32 },
  { y: 632, x1: 148, x2: 452, lit: 0.22 },
  { y: 642, x1: 136, x2: 464, lit: 0.14 },
  { y: 652, x1: 124, x2: 476, lit: 0.08 },
]

function DrawPath(props) {
  return <path pathLength="1" {...props} />
}

function WalkingFigure({ x, feet }) {
  return (
    <g transform={`translate(${x} ${feet})`} fill="#01050e">
      <circle cx="0" cy="-49" r="4.8" />
      <path d="M-2.2 -44.4 H2.2 V-40.4 H-2.2 Z" />
      <path d="M-6.8 -40.2 C-5.2 -42 -2.6 -42.8 0 -42.8 C2.6 -42.8 5.2 -42 6.8 -40.2 C7.6 -33 7.9 -26 7.9 -19 L-7.9 -19 C-7.9 -26 -7.6 -33 -6.8 -40.2 Z" />
      <path d="M-7.4 -19.6 C-8.4 -13 -9.4 -6.6 -8.8 0 L-3.2 0 C-3.4 -7 -2.6 -13 -1.4 -19.2 Z" />
      <path d="M1.8 -19.2 C3.2 -13 4.6 -7 6.4 -1.2 L12 -1.2 C9.4 -8 7.6 -14 6.8 -19.6 Z" />
      <path d="M-6.8 -39.4 C-9 -33 -10.4 -26.6 -10.2 -21.2 L-7.4 -20.8 C-7.4 -26 -6.4 -32 -5.6 -37.4 Z" />
      <path d="M6.8 -39.4 C9 -33 10.2 -27 10 -22.4 L7.2 -22 C7.4 -27 6.4 -32 5.6 -37.4 Z" />
      <path
        d="M7.4 -39.8 C9.2 -33 10 -27.4 9.8 -23.4"
        stroke="#dbeafe"
        strokeOpacity="0.42"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M6.4 -19.4 C7.6 -13 8.8 -7 9.6 -2.4"
        stroke="#dbeafe"
        strokeOpacity="0.34"
        strokeWidth="0.7"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M1.4 -52.6 C4 -52.8 6.2 -50.6 6.2 -48.4"
        stroke="#f4fbff"
        strokeOpacity="0.38"
        strokeWidth="0.8"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  )
}

export default function AuthShowcaseArt() {
  return (
    <svg
      className="auth-showcase-art"
      viewBox="0 60 600 660"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="asasTowerHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3577d8" stopOpacity="0.3" />
          <stop offset="46%" stopColor="#1e3a8a" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#172554" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="asasTowerBody" x1="300" y1="140" x2="300" y2="612" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#081c38" />
          <stop offset="52%" stopColor="#051227" />
          <stop offset="100%" stopColor="#020a16" />
        </linearGradient>

        <linearGradient id="asasRoomBase" x1="300" y1="0" x2="300" y2="1">
          <stop offset="0%" stopColor="#0a2242" />
          <stop offset="100%" stopColor="#041022" />
        </linearGradient>

        <linearGradient id="asasCeilingShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#01050e" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#01050e" stopOpacity="0" />
        </linearGradient>

        <radialGradient id="asasRoomGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#eaf6ff" stopOpacity="0.52" />
          <stop offset="42%" stopColor="#93c5fd" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>

        <radialGradient id="asasWarmGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3d6" stopOpacity="0.85" />
          <stop offset="42%" stopColor="#f3cf96" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#d99a4e" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="asasDoorLight" x1="300" y1="512" x2="300" y2="606" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f8fcff" stopOpacity="0.98" />
          <stop offset="46%" stopColor="#eaf6ff" stopOpacity="0.94" />
          <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.82" />
        </linearGradient>

        <radialGradient id="asasDoorBloom" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.5" />
          <stop offset="48%" stopColor="#60a5fa" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="asasDoorSpill" x1="300" y1="606" x2="300" y2="664" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#eaf6ff" stopOpacity="0.4" />
          <stop offset="54%" stopColor="#93c5fd" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="asasStepEdge" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0" />
          <stop offset="38%" stopColor="#dbeafe" stopOpacity="0.5" />
          <stop offset="62%" stopColor="#f4fbff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="asasOutline" x1="300" y1="664" x2="300" y2="140" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="38%" stopColor="#93c5fd" stopOpacity="0.72" />
          <stop offset="72%" stopColor="#dbeafe" stopOpacity="0.94" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.98" />
        </linearGradient>

        <linearGradient id="asasSketch" x1="300" y1="664" x2="300" y2="130" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.4" />
        </linearGradient>

        <linearGradient id="asasSill" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#dbeafe" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.1" />
        </linearGradient>

        <linearGradient id="asasSweep" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        <radialGradient id="asasBeaconGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fcff" stopOpacity="0.95" />
          <stop offset="38%" stopColor="#93c5fd" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="asasReflectionFade" x1="0" y1="662" x2="0" y2="720" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="46%" stopColor="#ffffff" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="asasFloorLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0" />
          <stop offset="30%" stopColor="#bfdbfe" stopOpacity="0.24" />
          <stop offset="50%" stopColor="#eaf6ff" stopOpacity="0.4" />
          <stop offset="70%" stopColor="#bfdbfe" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0" />
        </linearGradient>

        <filter id="asasSoft" x="-40%" y="-30%" width="180%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="asasBloom" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        <filter id="asasContact" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id="asasRough" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.036" numOctaves="2" seed="7" result="asasNoise" />
          <feDisplacementMap in="SourceGraphic" in2="asasNoise" scale="1.15" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        <pattern id="asasHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="#93c5fd" strokeOpacity="0.22" strokeWidth="0.55" />
        </pattern>

        <clipPath id="asasWindowClip">
          {FLOORS.map((floor) => (
            <rect key={`clip-${floor.id}`} x="196" y={floor.top} width="208" height="60" />
          ))}
          <rect x="196" y={LOBBY.top} width="208" height={LOBBY.bottom - LOBBY.top} />
        </clipPath>

        <mask id="asasReflectionMask">
          <rect x="0" y="662" width="600" height="58" fill="url(#asasReflectionFade)" />
        </mask>
      </defs>

      <ellipse className="auth-showcase-halo" cx="300" cy="374" rx="268" ry="300" fill="url(#asasTowerHalo)" />

      <g className="auth-showcase-fade" opacity="0.55" style={{ animationDelay: '0.2s' }} stroke="#93c5fd" fill="none">
        <path d="M28 612 L28 584 L54 584 L54 596 L74 596 L74 612" strokeOpacity="0.18" strokeWidth="0.8" />
        <path d="M82 612 L82 600 L102 600 L102 590 L120 590 L120 612" strokeOpacity="0.14" strokeWidth="0.8" />
        <path d="M112 590 L112 578" strokeOpacity="0.16" strokeWidth="0.7" />
        <path d="M470 612 L470 592 L494 592 L494 602 L512 602 L512 612" strokeOpacity="0.16" strokeWidth="0.8" />
        <path d="M520 612 L520 598 L542 598 L542 586 L564 586 L564 612" strokeOpacity="0.13" strokeWidth="0.8" />
        <path d="M550 586 L550 574" strokeOpacity="0.14" strokeWidth="0.7" />
        <path d="M28 612 L140 612 M460 612 L572 612" strokeOpacity="0.14" strokeWidth="0.7" />
        <g fill="#dbeafe" stroke="none">
          <circle cx="40" cy="596" r="1" opacity="0.28" />
          <circle cx="60" cy="604" r="0.9" opacity="0.2" />
          <circle cx="92" cy="604" r="0.9" opacity="0.18" />
          <circle cx="110" cy="596" r="1" opacity="0.24" />
          <circle cx="482" cy="600" r="0.9" opacity="0.2" />
          <circle cx="502" cy="606" r="0.8" opacity="0.16" />
          <circle cx="534" cy="602" r="1" opacity="0.22" />
          <circle cx="552" cy="592" r="0.9" opacity="0.18" />
        </g>
      </g>

      <g className="auth-showcase-draw auth-showcase-sketch" stroke="url(#asasSketch)" fill="none">
        <DrawPath d="M176 154 C175 300 177 470 176 620" strokeWidth="0.8" />
        <DrawPath d="M426 154 C427 300 425 470 426 620" strokeWidth="0.8" />
        <DrawPath d="M176 138 C250 136 352 140 426 138" strokeWidth="0.8" />
        <DrawPath d="M444 148 C443 300 445 470 444 612" strokeWidth="0.7" />
        <DrawPath d="M436 148 L452 148" strokeWidth="0.7" />
        <DrawPath d="M436 246 L452 246" strokeWidth="0.7" />
        <DrawPath d="M436 322 L452 322" strokeWidth="0.7" />
        <DrawPath d="M436 398 L452 398" strokeWidth="0.7" />
        <DrawPath d="M436 474 L452 474" strokeWidth="0.7" />
        <DrawPath d="M436 606 L452 606" strokeWidth="0.7" />
      </g>

      <ellipse cx="300" cy="584" rx="112" ry="96" fill="url(#asasDoorBloom)" filter="url(#asasBloom)" />

      <g className="auth-showcase-fade" style={{ animationDelay: '0.45s' }}>
        <path
          d="M184 612 C416 612 416 612 416 612 L416 148 C330 150 250 150 184 148 Z"
          fill="url(#asasTowerBody)"
        />
        <rect x="176" y="140" width="248" height="9" fill="#071629" />
        <rect x="184" y="606" width="232" height="6" fill="#020a16" />
        <path d="M396 148 L416 148 L416 612 L396 612 Z" fill="#01050e" opacity="0.28" />
        <g opacity="0.7">
          <rect x="184" y="149" width="12" height="463" fill="url(#asasHatch)" />
          <rect x="404" y="149" width="12" height="463" fill="url(#asasHatch)" />
          <rect x="176" y="149" width="248" height="20" fill="url(#asasHatch)" opacity="0.85" />
          <rect x="184" y="606" width="232" height="6" fill="url(#asasHatch)" opacity="0.9" />
          <rect x="396" y="149" width="8" height="463" fill="url(#asasHatch)" opacity="0.6" />
        </g>
      </g>

      <g className="auth-showcase-fade" style={{ animationDelay: '0.7s' }}>
        {FLOORS.map((floor) => (
          <g key={floor.id} className="auth-showcase-panel">
            <rect x="196" y={floor.top} width="208" height="60" fill="url(#asasRoomBase)" />
            <ellipse
              cx={floor.glow.cx}
              cy={floor.glow.cy}
              rx={floor.glow.rx}
              ry={floor.glow.ry}
              fill="url(#asasRoomGlow)"
            />
            <rect x="196" y={floor.top} width="208" height="7" fill="url(#asasCeilingShade)" />
            <FloorScene id={floor.id} />
            <DrawPath d={`M196 ${floor.top + 60} L404 ${floor.top + 60}`} stroke="url(#asasSill)" strokeWidth="1" />
          </g>
        ))}

        <g className="auth-showcase-panel">
          <rect x="196" y={LOBBY.top} width="208" height={LOBBY.bottom - LOBBY.top} fill="url(#asasRoomBase)" />
          <ellipse cx="300" cy="566" rx="136" ry="62" fill="url(#asasRoomGlow)" />
          <ellipse cx="300" cy="562" rx="112" ry="88" fill="url(#asasDoorBloom)" opacity="0.5" filter="url(#asasBloom)" />
          <rect x="196" y={LOBBY.top} width="208" height="7" fill="url(#asasCeilingShade)" />
          <FloorScene id="lobby" />
          <DrawPath d={`M196 ${LOBBY.bottom} L404 ${LOBBY.bottom}`} stroke="url(#asasSill)" strokeWidth="1" />
        </g>
      </g>

      <g clipPath="url(#asasWindowClip)">
        <rect className="auth-showcase-sweep" x="60" y="160" width="170" height="460" fill="url(#asasSweep)" opacity="0" />
      </g>

      <g className="auth-showcase-light">
        <ellipse cx="300" cy="586" rx="66" ry="60" fill="url(#asasDoorBloom)" filter="url(#asasBloom)" />
        <path d="M264 606 L264 548 A36 36 0 0 1 336 548 L336 606 Z" fill="url(#asasDoorLight)" />
        <path d="M271 606 L271 549 A29 29 0 0 1 329 549 L329 606 Z" fill="url(#asasDoorLight)" />
        <path d="M300 606 L300 522" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="6" filter="url(#asasSoft)" />
      </g>

      <g className="auth-showcase-fade" style={{ animationDelay: '1.05s' }}>
        {STEPS.map((step) => (
          <g key={step.y}>
            <path
              d={`M${step.x1} ${step.y} C${step.x1 + 60} ${step.y - 1} ${step.x2 - 60} ${step.y + 1} ${step.x2} ${step.y} L${step.x2} ${step.y + 10} C${step.x2 - 60} ${step.y + 11} ${step.x1 + 60} ${step.y + 9} ${step.x1} ${step.y + 10} Z`}
              fill="#030d1c"
            />
            <rect
              x={step.x1}
              y={step.y}
              width={step.x2 - step.x1}
              height="10"
              fill="url(#asasHatch)"
              opacity="0.22"
            />
            <path
              d={`M${step.x1} ${step.y} C${step.x1 + 60} ${step.y - 1} ${step.x2 - 60} ${step.y + 1} ${step.x2} ${step.y}`}
              stroke="url(#asasStepEdge)"
              strokeWidth="1"
              opacity={step.lit}
            />
          </g>
        ))}
      </g>

      <g className="auth-showcase-light" style={{ animationDelay: '1.1s' }}>
        <path d="M266 606 L334 606 L384 664 L216 664 Z" fill="url(#asasDoorSpill)" filter="url(#asasSoft)" />
        <ellipse cx="300" cy="662" rx="148" ry="14" fill="url(#asasDoorBloom)" opacity="0.5" filter="url(#asasBloom)" />
      </g>

      <ellipse cx="302" cy="636" rx="26" ry="3.4" fill="#01050e" opacity="0.72" filter="url(#asasContact)" />
      <path d="M288 634 L316 634 L352 662 L250 662 Z" fill="#01050e" opacity="0.24" filter="url(#asasSoft)" />

      <g className="auth-showcase-fade" style={{ animationDelay: '1.2s' }}>
        <ellipse cx="112" cy="534" rx="64" ry="58" fill="url(#asasRoomGlow)" opacity="0.45" />
        <g stroke="#93c5fd" strokeOpacity="0.42" strokeWidth="1.1" fill="none" strokeLinecap="round">
          <path d="M101 664 C104 636 106 610 110 586 C113 568 118 554 123 544" />
          <path d="M111 600 C102 590 94 582 84 577" />
          <path d="M113 586 C122 576 132 569 143 564" />
          <path d="M118 566 C112 554 108 542 109 530" />
          <path d="M121 556 C128 546 136 539 145 535" />
          <path d="M108 620 C99 614 92 610 84 608" />
          <path d="M116 610 C124 604 132 600 140 598" />
        </g>
        <g fill="#06182f" stroke="#93c5fd" strokeOpacity="0.28" strokeWidth="0.55">
          <ellipse cx="84" cy="575" rx="4.6" ry="3" transform="rotate(-32 84 575)" />
          <ellipse cx="91" cy="568" rx="4.2" ry="2.8" transform="rotate(18 91 568)" />
          <ellipse cx="79" cy="563" rx="4.4" ry="2.9" transform="rotate(-12 79 563)" />
          <ellipse cx="87" cy="555" rx="4" ry="2.7" transform="rotate(28 87 555)" />
          <ellipse cx="96" cy="549" rx="4.4" ry="2.8" transform="rotate(-24 96 549)" />
          <ellipse cx="74" cy="549" rx="4" ry="2.7" transform="rotate(14 74 549)" />
          <ellipse cx="70" cy="540" rx="4.2" ry="2.8" transform="rotate(-28 70 540)" />
          <ellipse cx="81" cy="536" rx="4.4" ry="2.9" transform="rotate(8 81 536)" />
          <ellipse cx="93" cy="533" rx="4" ry="2.7" transform="rotate(-18 93 533)" />
          <ellipse cx="120" cy="539" rx="4.4" ry="2.9" transform="rotate(26 120 539)" />
          <ellipse cx="129" cy="533" rx="4.2" ry="2.8" transform="rotate(-14 129 533)" />
          <ellipse cx="139" cy="530" rx="4.5" ry="3" transform="rotate(22 139 530)" />
          <ellipse cx="147" cy="525" rx="4" ry="2.7" transform="rotate(-26 147 525)" />
          <ellipse cx="132" cy="522" rx="4.2" ry="2.8" transform="rotate(10 132 522)" />
          <ellipse cx="122" cy="515" rx="4.4" ry="2.9" transform="rotate(-20 122 515)" />
          <ellipse cx="112" cy="507" rx="4" ry="2.7" transform="rotate(24 112 507)" />
          <ellipse cx="104" cy="513" rx="4.4" ry="2.9" transform="rotate(-8 104 513)" />
          <ellipse cx="99" cy="523" rx="4" ry="2.7" transform="rotate(30 99 523)" />
          <ellipse cx="90" cy="519" rx="4.2" ry="2.8" transform="rotate(-22 90 519)" />
          <ellipse cx="83" cy="511" rx="4.4" ry="2.9" transform="rotate(12 83 511)" />
          <ellipse cx="88" cy="501" rx="4" ry="2.7" transform="rotate(-30 88 501)" />
          <ellipse cx="100" cy="495" rx="4.4" ry="2.9" transform="rotate(18 100 495)" />
          <ellipse cx="111" cy="500" rx="4.2" ry="2.8" transform="rotate(-12 111 500)" />
          <ellipse cx="121" cy="505" rx="4.4" ry="2.9" transform="rotate(26 121 505)" />
          <ellipse cx="131" cy="512" rx="4" ry="2.7" transform="rotate(-18 131 512)" />
          <ellipse cx="141" cy="535" rx="4.2" ry="2.8" transform="rotate(12 141 535)" />
          <ellipse cx="149" cy="542" rx="4" ry="2.7" transform="rotate(-24 149 542)" />
          <ellipse cx="140" cy="548" rx="4.4" ry="2.9" transform="rotate(18 140 548)" />
          <ellipse cx="129" cy="545" rx="4.2" ry="2.8" transform="rotate(-10 129 545)" />
          <ellipse cx="122" cy="553" rx="4.4" ry="2.9" transform="rotate(28 122 553)" />
          <ellipse cx="132" cy="560" rx="4" ry="2.7" transform="rotate(-16 132 560)" />
          <ellipse cx="142" cy="556" rx="4.2" ry="2.8" transform="rotate(20 142 556)" />
          <ellipse cx="84" cy="607" rx="4.2" ry="2.8" transform="rotate(-18 84 607)" />
          <ellipse cx="92" cy="612" rx="4" ry="2.7" transform="rotate(24 92 612)" />
          <ellipse cx="140" cy="597" rx="4.2" ry="2.8" transform="rotate(-12 140 597)" />
          <ellipse cx="146" cy="603" rx="4" ry="2.7" transform="rotate(18 146 603)" />
        </g>
        <g fill="#0b2a50" stroke="#dbeafe" strokeOpacity="0.34" strokeWidth="0.6">
          <ellipse cx="141" cy="535" rx="4.2" ry="2.8" transform="rotate(12 141 535)" />
          <ellipse cx="149" cy="542" rx="4" ry="2.7" transform="rotate(-24 149 542)" />
          <ellipse cx="140" cy="548" rx="4.4" ry="2.9" transform="rotate(18 140 548)" />
          <ellipse cx="132" cy="560" rx="4" ry="2.7" transform="rotate(-16 132 560)" />
          <ellipse cx="122" cy="553" rx="4.4" ry="2.9" transform="rotate(28 122 553)" />
          <ellipse cx="146" cy="603" rx="4" ry="2.7" transform="rotate(18 146 603)" />
        </g>
      </g>

      <g className="auth-showcase-fade" style={{ animationDelay: '1.25s' }}>
        <ellipse cx="490" cy="663" rx="26" ry="5" fill="url(#asasWarmGlow)" opacity="0.28" />
        <g stroke="#93c5fd" strokeOpacity="0.38" strokeWidth="1.05" fill="none" strokeLinecap="round">
          <path d="M496 664 L496 596 C496 590 494 587 490 586" />
          <path d="M490 586 L482 586" />
          <path d="M496 640 C492 638 489 636 487 634" />
        </g>
        <path d="M480 584 L492 584 L490 594 L482 594 Z" fill="#071b36" stroke="#93c5fd" strokeOpacity="0.35" strokeWidth="0.7" />
        <circle cx="486" cy="590" r="9" fill="url(#asasWarmGlow)" />
        <circle cx="486" cy="590" r="1.7" fill="#ffeccd" opacity="0.9" />
      </g>

      <g className="auth-showcase-fade" style={{ animationDelay: '1.35s' }}>
        <WalkingFigure x={300} feet={632} />
      </g>

      <g className="auth-showcase-draw" style={{ animationDelay: '0.35s' }} filter="url(#asasRough)">
        <DrawPath d="M184 612 C183 460 185 300 184 143" stroke="url(#asasOutline)" strokeWidth="1.15" strokeLinecap="round" />
        <DrawPath d="M416 143 C415 300 417 460 416 612" stroke="url(#asasOutline)" strokeWidth="1.15" strokeLinecap="round" />
        <DrawPath d="M170 140 C250 138 352 142 430 140" stroke="url(#asasOutline)" strokeWidth="1.2" strokeLinecap="round" />
        <DrawPath d="M172 149 C250 147 352 151 428 149" stroke="url(#asasOutline)" strokeWidth="0.8" strokeLinecap="round" />
        <DrawPath d="M176 140 L176 149" stroke="url(#asasOutline)" strokeWidth="1" strokeLinecap="round" />
        <DrawPath d="M424 140 L424 149" stroke="url(#asasOutline)" strokeWidth="1" strokeLinecap="round" />
        <DrawPath d="M192 140 L192 126 C250 124 350 128 408 126 L408 140" stroke="#dbeafe" strokeOpacity="0.34" strokeWidth="0.75" strokeLinecap="round" />
        <DrawPath d="M233 127 L233 140 M274 128 L274 140 M315 127 L315 140 M356 128 L356 140 M397 127 L397 140" stroke="#dbeafe" strokeOpacity="0.24" strokeWidth="0.6" />

        {FLOORS.map((floor) => (
          <g key={`lines-${floor.id}`}>
            <DrawPath
              d={`M184 ${floor.top + 60} C260 ${floor.top + 59} 340 ${floor.top + 61} 416 ${floor.top + 60}`}
              stroke="#dbeafe"
              strokeOpacity="0.28"
              strokeWidth="0.8"
            />
            <DrawPath
              d={`M196 ${floor.top} C196 ${floor.top + 20} 197 ${floor.top + 40} 196 ${floor.top + 60}`}
              stroke="#93c5fd"
              strokeOpacity="0.18"
              strokeWidth="0.7"
            />
            <DrawPath
              d={`M404 ${floor.top} C404 ${floor.top + 20} 403 ${floor.top + 40} 404 ${floor.top + 60}`}
              stroke="#93c5fd"
              strokeOpacity="0.18"
              strokeWidth="0.7"
            />
          </g>
        ))}

        <DrawPath d="M196 474 C196 500 197 570 196 606" stroke="#93c5fd" strokeOpacity="0.18" strokeWidth="0.7" />
        <DrawPath d="M404 474 C404 500 403 570 404 606" stroke="#93c5fd" strokeOpacity="0.18" strokeWidth="0.7" />

        <DrawPath d="M264 606 L264 548 A36 36 0 0 1 336 548 L336 606" stroke="url(#asasOutline)" strokeWidth="1.15" strokeLinecap="round" />
        <DrawPath d="M271 606 L271 549 A29 29 0 0 1 329 549 L329 606" stroke="#eaf6ff" strokeOpacity="0.5" strokeWidth="0.8" strokeLinecap="round" />

        {STEPS.map((step) => (
          <DrawPath
            key={`step-line-${step.y}`}
            d={`M${step.x1} ${step.y} C${step.x1 + 60} ${step.y - 1} ${step.x2 - 60} ${step.y + 1} ${step.x2} ${step.y}`}
            stroke="url(#asasOutline)"
            strokeWidth="0.85"
            strokeLinecap="round"
          />
        ))}

        <DrawPath d="M56 662 C200 661 400 663 544 662" stroke="url(#asasFloorLine)" strokeWidth="1" strokeLinecap="round" />
        <DrawPath d="M184 612 C250 611 350 613 416 612" stroke="#dbeafe" strokeOpacity="0.34" strokeWidth="0.8" />
        <DrawPath d="M181 146 L175 152" stroke="#dbeafe" strokeOpacity="0.24" strokeWidth="0.7" strokeLinecap="round" />
        <DrawPath d="M419 146 L425 152" stroke="#dbeafe" strokeOpacity="0.24" strokeWidth="0.7" strokeLinecap="round" />
      </g>

      <g className="auth-showcase-draw" style={{ animationDelay: '0.7s' }} stroke="#bfdbfe" strokeOpacity="0.3" fill="none">
        <DrawPath d="M181 614 C180 460 182 300 181 146" strokeWidth="0.7" />
        <DrawPath d="M419 146 C418 300 420 460 419 614" strokeWidth="0.7" />
        <DrawPath d="M174 144 C250 142 352 146 426 144" strokeWidth="0.7" />
        <DrawPath d="M186 158 C250 157 350 159 414 158" strokeWidth="0.5" strokeOpacity="0.4" />
      </g>

      <g className="auth-showcase-draw" style={{ animationDelay: '0.9s' }}>
        <DrawPath d="M338 140 C337 126 339 110 338 96" stroke="#dbeafe" strokeOpacity="0.62" strokeWidth="0.9" strokeLinecap="round" />
        <DrawPath d="M332 120 L344 120" stroke="#dbeafe" strokeOpacity="0.4" strokeWidth="0.8" strokeLinecap="round" />
      </g>

      <g className="auth-showcase-light">
        <circle cx="338" cy="95" r="17" fill="url(#asasBeaconGlow)" />
        <circle cx="338" cy="95" r="2.1" fill="#f8fcff" />
      </g>

      <g className="auth-showcase-reflection" mask="url(#asasReflectionMask)">
        <ellipse cx="300" cy="676" rx="122" ry="17" fill="url(#asasDoorBloom)" opacity="0.55" />
        <path d="M224 674 C260 672 342 676 376 673" stroke="#dbeafe" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M248 684 C280 682 322 686 352 683" stroke="#93c5fd" strokeOpacity="0.15" strokeWidth="1" strokeLinecap="round" />
        <path d="M270 694 C292 693 312 695 332 694" stroke="#93c5fd" strokeOpacity="0.09" strokeWidth="0.8" strokeLinecap="round" />
      </g>

      <circle className="auth-showcase-dust" cx="336" cy="196" r="1.2" fill="#dbeafe" opacity="0.35" style={{ animationDelay: '-2s' }} />
      <circle className="auth-showcase-dust" cx="360" cy="262" r="1" fill="#dbeafe" opacity="0.28" style={{ animationDelay: '-7s' }} />
      <circle className="auth-showcase-dust" cx="322" cy="312" r="1.4" fill="#dbeafe" opacity="0.4" style={{ animationDelay: '-4s' }} />
      <circle className="auth-showcase-dust" cx="286" cy="352" r="1" fill="#dbeafe" opacity="0.3" style={{ animationDelay: '-11s' }} />
      <circle className="auth-showcase-dust" cx="356" cy="430" r="1.3" fill="#dbeafe" opacity="0.32" style={{ animationDelay: '-9s' }} />
      <circle className="auth-showcase-dust" cx="268" cy="498" r="1.1" fill="#dbeafe" opacity="0.3" style={{ animationDelay: '-5s' }} />
      <circle className="auth-showcase-dust" cx="330" cy="548" r="1.4" fill="#dbeafe" opacity="0.42" style={{ animationDelay: '-13s' }} />
      <circle className="auth-showcase-dust" cx="364" cy="596" r="1" fill="#dbeafe" opacity="0.3" style={{ animationDelay: '-6s' }} />
    </svg>
  )
}
