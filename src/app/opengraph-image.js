import { ImageResponse } from "next/og";

export const alt = "Laabidate Oussama Publications";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c0f17",
          color: "#f5efe4",
          padding: 68,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", color: "#476fff", fontSize: 28, fontWeight: 800 }}>
          <span>Laabidate Oussama</span>
          <span>Publications</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 116, lineHeight: 0.9, fontWeight: 900, letterSpacing: -3 }}>
            <span>Catalogs, CVs</span>
            <span>and Visual Work</span>
          </div>
          <div style={{ maxWidth: 760, color: "#b7ac9e", fontSize: 32, lineHeight: 1.35 }}>
            Interactive 3D PDF publications by Laabidate Oussama.
          </div>
        </div>
        <div style={{ height: 2, width: "100%", background: "rgba(71, 111, 255, 0.45)" }} />
      </div>
    ),
    size,
  );
}
