import type { HTMLAttributes, SVGProps } from "react";

/** Small drawn icons in the tiles' chunky outlined style, so /net never leans on emoji for art. */

const INK = "#4b3a2f";
type ArtProps = Omit<SVGProps<SVGSVGElement>, "viewBox"> & { size?: number };

function Art({ size = 16, children, ...props }: ArtProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden {...props}>
      {children}
    </svg>
  );
}

export function NetLockArt(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="#c9cdd4" strokeWidth={1.4} strokeLinecap="round" />
      <rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="#ffd23a" stroke={INK} strokeWidth={1.8} />
      <circle cx="12" cy="15.4" r="1.6" fill={INK} />
      <path d="M12 16.2v2.2" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
    </Art>
  );
}

export function NetCameraArt(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M8.5 6.5 10 4.5h4l1.5 2" fill="#ff6f62" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <rect x="3" y="6.5" width="18" height="13" rx="3" fill="#ff6f62" stroke={INK} strokeWidth={1.8} />
      <circle cx="12" cy="13" r="4.2" fill="#fff" stroke={INK} strokeWidth={1.6} />
      <circle cx="12" cy="13" r="2" fill="#3fbcff" />
      <circle cx="17.5" cy="9.3" r="0.9" fill="#fff" />
    </Art>
  );
}

export function NetPinArt(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M12 22s-7-7.2-7-12.2a7 7 0 0 1 14 0C19 14.8 12 22 12 22z" fill="#ff4f6f" stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
      <circle cx="12" cy="9.8" r="2.6" fill="#fff" />
    </Art>
  );
}

export function NetCartArt(props: ArtProps) {
  return (
    <Art {...props}>
      <path d="M2.5 4h3l2.4 11h11" fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 7h14.3l-2 6.5H7.6z" fill="#d6dbe2" stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx="9.5" cy="19" r="1.8" fill="#fff" stroke={INK} strokeWidth={1.5} />
      <circle cx="17" cy="19" r="1.8" fill="#fff" stroke={INK} strokeWidth={1.5} />
    </Art>
  );
}

export function NetGearArt(props: ArtProps) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <Art {...props}>
      <g stroke={INK} strokeWidth={1.4} strokeLinejoin="round">
        {teeth.map(angle => (
          <rect key={angle} x="10" y="1.6" width="4" height="5" rx="1" fill="#b48bff" transform={`rotate(${angle} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="7.2" fill="#b48bff" />
      </g>
      <circle cx="12" cy="12" r="3" fill="#fff" stroke={INK} strokeWidth={1.4} />
      <path d="M8 8.6a5 5 0 0 1 3-1.5" fill="none" stroke="#e7dbff" strokeWidth={1.4} strokeLinecap="round" />
    </Art>
  );
}

export function NetStarArt({ filled = true, ...props }: ArtProps & { filled?: boolean }) {
  return (
    <Art {...props}>
      <path
        d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z"
        fill={filled ? "#ffe25a" : "#ffffff66"}
        stroke={filled ? "#c2861a" : "#ffffffaa"}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Art>
  );
}

/** A worried tomomai blob for the "Are you sure?" step. */
export function NetSadMascot({ size = 72 }: { size?: number }) {
  return (
    <svg viewBox="0 0 72 64" width={size} height={size * (64 / 72)} aria-hidden>
      <ellipse cx="36" cy="60" rx="20" ry="3" fill="#00000018" />
      <path d="M10 36c0-16 11-28 26-28s26 12 26 28-11 22-26 22S10 52 10 36z" fill="#ffd6e6" stroke={INK} strokeWidth={2.5} />
      <path d="M18 14l-3-9 9 5M54 14l3-9-9 5" fill="#ffd6e6" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M21 31l8-4M51 31l-8-4" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <ellipse cx="27" cy="38" rx="4" ry="5" fill={INK} />
      <ellipse cx="45" cy="38" rx="4" ry="5" fill={INK} />
      <circle cx="28.4" cy="36" r="1.5" fill="#fff" />
      <circle cx="46.4" cy="36" r="1.5" fill="#fff" />
      <path d="M30 50q6-4 12 0" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M50 42q3 5 0 8q-3-3 0-8z" fill="#7ac8ff" stroke={INK} strokeWidth={1.4} />
      <ellipse cx="19" cy="45" rx="4" ry="2.4" fill="#ff8fb0" opacity={0.7} />
      <ellipse cx="53" cy="45" rx="4" ry="2.4" fill="#ff8fb0" opacity={0.7} />
    </svg>
  );
}

const WHEEL = { cx: 150, cy: 30, r: 23 };
const CABIN_COLORS = ["#ffd23a", "#3fbcff", "#ff4fa8", "#9be03a"];

function TownTree({ x, r, color }: { x: number; r: number; color: string }) {
  return (
    <>
      <rect x={x - 2} y={62 - r} width="4" height={r} fill="#b07a3a" />
      <circle cx={x} cy={62 - r - r * 0.6} r={r} fill={color} />
    </>
  );
}

type WheelProps = Pick<HTMLAttributes<SVGGElement>, "className" | "onClick" | "onKeyDown" | "role" | "tabIndex" | "aria-label" | "onAnimationEnd">;

/** The amusement-park skyline that sits on DX NET's green footer. Pass `wheel` or `door` to make the ferris wheel or the first house's door a control. */
export function NetTownArt({ wheel, door, lotus }: { wheel?: WheelProps; door?: WheelProps; lotus?: WheelProps & { bloomed?: boolean } } = {}) {
  const { bloomed, ...lotusProps } = lotus ?? {};
  const cabins = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <svg viewBox="0 0 480 64" width="100%" height="64" preserveAspectRatio="xMidYMax meet" aria-hidden={wheel ? undefined : true}>
      <g stroke={INK} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" aria-hidden={wheel ? true : undefined}>
        <path d="M14 62V40h44v22z" fill="#fff" />
        <path d="M22 62V40M32 62V40M42 62V40M50 62V40" stroke="#ff6f62" strokeWidth={3} />
        <path d="M14 62V40h44v22z" fill="none" />
        <path d="M10 42 36 16l26 26z" fill="#ff6f62" />
        <path d="M36 16 23 42M36 16l13 26" fill="none" stroke="#fff" strokeWidth={3} />
        <path d="M10 42 36 16l26 26z" fill="none" />
        <path d="M36 16V8" />
        <path d="M36 8l8 2.5-8 2.5z" fill="#ffd23a" />
        <path d="M30 62v-9a6 6 0 0 1 12 0v9" fill="#9b5a2e" />

        <rect x="95" y="32" width="5" height="10" fill="#ff6f62" />
        <path d="M76 62V44l14-12 14 12v18z" fill="#fff" />
        <path d="M72 46l18-16 18 16" fill="#3fbcff" />
        <rect x="85" y="50" width="10" height="12" rx="2" fill="#9b5a2e" />

        <path d={`M${WHEEL.cx - 14} 62 ${WHEEL.cx} ${WHEEL.cy} ${WHEEL.cx + 14} 62`} fill="none" strokeWidth={2.4} />
        <TownTree x={196} r={9} color="#5fd35f" />
        <TownTree x={214} r={6.5} color="#3fbf4f" />

        <path d="M236 62V32h10v4h6v-4h10v4h6v-4h10v30z" fill="#fff" />
        <path d="M232 32h18l-9-12zM264 32h18l-9-12z" fill="#b56cf7" />
        <path d="M248 36V24h12v12" fill="#ffe25a" />
        <path d="M246 24l8-12 8 12z" fill="#ff4fa8" />
        <path d="M254 12V6" />
        <path d="M254 6l7 2.2-7 2.2z" fill="#3fbcff" />
        <path d="M250 62v-10a4 4 0 0 1 8 0v10" fill="#9b5a2e" />
        <rect x="239" y="40" width="5" height="6" rx="2.5" fill="#3fbcff" strokeWidth={1.2} />
        <rect x="270" y="40" width="5" height="6" rx="2.5" fill="#3fbcff" strokeWidth={1.2} />

        <TownTree x={300} r={8} color="#5fd35f" />

        <rect x="320" y="46" width="42" height="13" rx="4" fill="#ffd23a" />
        <rect x="325" y="49" width="7" height="5" rx="1" fill="#fff" strokeWidth={1.2} />
        <rect x="337" y="49" width="7" height="5" rx="1" fill="#fff" strokeWidth={1.2} />
        <rect x="349" y="49" width="7" height="5" rx="1" fill="#fff" strokeWidth={1.2} />
        <circle cx="329" cy="60" r="2.4" fill="#fff" strokeWidth={1.3} />
        <circle cx="353" cy="60" r="2.4" fill="#fff" strokeWidth={1.3} />

        <path d="M384 62V39M400 62V23M416 62V19.5M432 62V26.5M448 62V42" strokeWidth={1.4} />
        <path d="M374 50C386 40 392 22 404 22S420 14 428 22 444 44 466 50" fill="none" stroke="#ff6f62" strokeWidth={5} />
        <path d="M374 50C386 40 392 22 404 22S420 14 428 22 444 44 466 50" fill="none" strokeWidth={1.2} strokeDasharray="1.5 3.5" />
        <rect x="408" y="12" width="12" height="7" rx="2.5" fill="#3fbcff" strokeWidth={1.3} transform="rotate(-8 414 15)" />
      </g>
      {door && (
        <g stroke={INK} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" {...door}>
          <rect x="26" y="42" width="34" height="20" fill="transparent" stroke="none" />
          <path d="M30 62v-9a6 6 0 0 1 12 0v9" fill="#9b5a2e" />
          <rect x="45" y="48" width="11" height="6" rx="1" fill="#ffd23a" strokeWidth={1.2} />
          <path d="M47 50.2h7M47 52h5" strokeWidth={0.9} />
        </g>
      )}
      <g stroke={INK} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" {...wheel}>
        {wheel && <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.r + 5} fill="transparent" stroke="none" />}
        <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.r} fill="none" stroke="#fff" strokeWidth={4} />
        <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.r} fill="none" />
        <circle cx={WHEEL.cx} cy={WHEEL.cy} r={WHEEL.r - 6} fill="none" strokeWidth={1} />
        {cabins.map(angle => (
          <path
            key={`s${angle}`}
            d={`M${WHEEL.cx} ${WHEEL.cy}L${(WHEEL.cx + Math.cos(angle) * WHEEL.r).toFixed(2)} ${(WHEEL.cy + Math.sin(angle) * WHEEL.r).toFixed(2)}`}
            strokeWidth={1}
          />
        ))}
        {cabins.map((angle, i) => {
          const x = WHEEL.cx + Math.cos(angle) * WHEEL.r;
          const y = WHEEL.cy + Math.sin(angle) * WHEEL.r;
          return <rect key={`c${angle}`} x={(x - 3.5).toFixed(2)} y={(y - 1).toFixed(2)} width="7" height="6.5" rx="2" fill={CABIN_COLORS[i % 4]} strokeWidth={1.3} />;
        })}
        <circle cx={WHEEL.cx} cy={WHEEL.cy} r="3" fill="#ffd23a" />
      </g>
      {lotus && (
        <g stroke={INK} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" transform="translate(-8 0)" {...lotusProps}>
          <rect x="98" y="26" width="44" height="37" fill="transparent" stroke="none" />
          <ellipse cx="120" cy="60.5" rx="19" ry="3.4" fill="#7ac8ff" />
          <ellipse cx="109" cy="59.4" rx="8" ry="2.4" fill="#3fbf4f" />
          <ellipse cx="132" cy="60" rx="5.5" ry="1.8" fill="#3fbf4f" />
          <g transform="translate(122 59) scale(3.6) translate(-122 -59)" strokeWidth={0.4}>
            {bloomed ? (
              <>
                <path d="M122 59c-4-2-6-7-2-11 4 4 3 9 2 11z" fill="#ff8fb0" />
                <path d="M122 59c-1-5 2-9 7-9-1 5-3 8-7 9z" fill="#ffc0d6" />
                <path d="M122 59c-5-1-8-4-8-8 5 0 8 3 8 8z" fill="#ffc0d6" />
              </>
            ) : (
              <path d="M123 59c-2-3-1-6 1-8 2 2 2 5-1 8z" fill="#ff8fb0" />
            )}
          </g>
        </g>
      )}
    </svg>
  );
}
