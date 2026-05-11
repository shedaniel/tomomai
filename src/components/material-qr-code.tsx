"use client";

import QRCodeLib from "qrcode";
import { useMemo } from "react";

interface MaterialQRCodeProps {
  value: string;
  size?: number;
  iconSrc?: string;
  className?: string;
}

export function MaterialQRCode({ value, size = 120, iconSrc, className }: MaterialQRCodeProps) {
  const svg = useMemo(() => {
    try {
      // Use H (30%) error correction when icon covers the center
      const qr = QRCodeLib.create(value, { errorCorrectionLevel: iconSrc ? "H" : "M" });
      const { size: n, data } = qr.modules;
      const cell = size / n;
      const r = cell * 0.35;

      const get = (row: number, col: number) =>
        row >= 0 && row < n && col >= 0 && col < n ? !!data[row * n + col] : false;

      const inFinder = (row: number, col: number) =>
        (row <= 7 && col <= 7) ||
        (row <= 7 && col >= n - 8) ||
        (row >= n - 8 && col <= 7);

      const rrect = (x: number, y: number, w: number, h: number, cr: number) => {
        const cr2 = Math.min(cr, w / 2, h / 2);
        return `M${x + cr2},${y} h${w - 2 * cr2} a${cr2},${cr2} 0 0 1 ${cr2},${cr2} v${h - 2 * cr2} a${cr2},${cr2} 0 0 1 -${cr2},${cr2} h-${w - 2 * cr2} a${cr2},${cr2} 0 0 1 -${cr2},-${cr2} v-${h - 2 * cr2} a${cr2},${cr2} 0 0 1 ${cr2},-${cr2}z`;
      };

      // Icon occupies 24% of QR size in the center; skip modules under it
      const iconRatio = 0.24;
      const iconSize = size * iconRatio;
      const iconPad = size * 0.03; // white padding around icon
      const cx = size / 2;
      const cy = size / 2;
      const halfCover = (iconSize + iconPad * 2) / 2;

      const underIcon = (row: number, col: number) => {
        if (!iconSrc) return false;
        const mx = (col + 0.5) * cell;
        const my = (row + 0.5) * cell;
        return Math.abs(mx - cx) < halfCover && Math.abs(my - cy) < halfCover;
      };

      let dotsPath = "";
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          if (!get(row, col) || inFinder(row, col) || underIcon(row, col)) continue;
          dotsPath += rrect(col * cell + cell * 0.1, row * cell + cell * 0.1, cell * 0.8, cell * 0.8, r) + " ";
        }
      }

      const finderCorners = [
        [0, 0],
        [0, n - 7],
        [n - 7, 0],
      ] as const;

      let finderPath = "";
      for (const [fr, fc] of finderCorners) {
        const x = fc * cell;
        const y = fr * cell;
        const outer = 7 * cell;
        const gap = cell;
        const inner = 3 * cell;
        const outerR = cell * 1.2;
        const innerR = cell * 0.6;
        finderPath += rrect(x, y, outer, outer, outerR) + " ";
        finderPath += rrect(x + gap, y + gap, outer - 2 * gap, outer - 2 * gap, outerR * 0.5) + " ";
        const ix = x + 2 * cell;
        const iy = y + 2 * cell;
        finderPath += rrect(ix, iy, inner, inner, innerR) + " ";
      }

      return { dotsPath, finderPath, iconSize, iconPad, cx, cy };
    } catch {
      return null;
    }
  }, [value, size, iconSrc]);

  if (!svg) return null;

  const { iconSize, iconPad, cx, cy } = svg;
  const bgSize = iconSize + iconPad * 2;
  const bgR = bgSize * 0.22;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width={size} height={size} fill="transparent" />
      <path d={svg.finderPath} fill="currentColor" fillRule="evenodd" />
      <path d={svg.dotsPath} fill="currentColor" />
      {iconSrc && (
        <>
          <rect
            x={cx - bgSize / 2}
            y={cy - bgSize / 2}
            width={bgSize}
            height={bgSize}
            rx={bgR}
            ry={bgR}
            fill="white"
          />
          <image
            href={iconSrc}
            x={cx - iconSize / 2}
            y={cy - iconSize / 2}
            width={iconSize}
            height={iconSize}
          />
        </>
      )}
    </svg>
  );
}
