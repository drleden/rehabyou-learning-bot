/**
 * Generic stub page for admin sections not yet implemented.
 * Usage: <Stub title="Настройки" icon="⚙️" />
 */
import { Link } from "react-router-dom";

export default function Stub({ title, icon = "🔧" }) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--bg)",
      color: "var(--text-primary)",
      fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        borderBottom: "1px solid var(--border)",
      }}>
        <Link to="/admin" style={{
          fontSize: 24,
          color: "var(--text-secondary)",
          textDecoration: "none",
          lineHeight: 1,
          padding: "4px 6px",
          marginLeft: -6,
        }}>‹</Link>
        <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
      </header>

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "40px 24px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 52 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
        <div style={{
          fontSize: 14,
          color: "var(--text-secondary)",
          maxWidth: 280,
          lineHeight: 1.5,
        }}>
          Раздел в разработке. Он появится в одном из следующих обновлений.
        </div>
        <Link to="/admin" style={{
          marginTop: 8,
          padding: "10px 24px",
          background: "var(--grad-brand)",
          borderRadius: "var(--r-md)",
          color: "#fff",
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
        }}>
          ← Назад
        </Link>
      </div>
    </div>
  );
}
