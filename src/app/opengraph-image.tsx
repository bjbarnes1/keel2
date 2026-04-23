/**
 * Default Open Graph image for social previews (`app/opengraph-image.tsx`).
 *
 * @module app/opengraph-image
 */

import { ImageResponse } from "next/og";

export const alt = "Keel — see what you actually have";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background: "linear-gradient(145deg, #0c100e 0%, #1a2420 55%, #141a17 100%)",
          color: "#f0ebdc",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 28, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.75 }}>
          Keel
        </div>
        <div style={{ marginTop: 24, fontSize: 64, fontWeight: 600, lineHeight: 1.05, maxWidth: 900 }}>
          See what you actually have.
        </div>
        <div style={{ marginTop: 28, fontSize: 28, opacity: 0.82, maxWidth: 820 }}>
          Commitments, goals, and cashflow — grounded in your balance and pay cycle.
        </div>
      </div>
    ),
    { ...size },
  );
}
