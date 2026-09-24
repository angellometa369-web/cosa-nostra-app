export default function StatusPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#E8DCC4",
        fontFamily: "system-ui, sans-serif",
        padding: "60px 24px",
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: 8 }}>Cosa Nostra — API</h1>
      <p style={{ color: "#A0A0A0", marginBottom: 32 }}>
        Backend activo. La app está en{" "}
        <a href="/index.html" style={{ color: "#E8DCC4" }}>
          /index.html
        </a>
        .
      </p>
      <ul style={{ lineHeight: 1.9, color: "#ccc" }}>
        <li>
          <code>POST /api/login</code>
        </li>
        <li>
          <code>GET /api/auth/me</code>
        </li>
        <li>
          <code>POST /api/logout</code>
        </li>
        <li>
          <code>GET /api/ranking</code>
        </li>
        <li>
          <code>POST /api/import/betadomino/preview</code> (admin)
        </li>
        <li>
          <code>POST /api/import/betadomino/confirm</code> (admin)
        </li>
      </ul>
    </main>
  );
}
