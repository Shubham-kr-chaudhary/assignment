import ArtworksTable from "./components/ArtworksTable";

export default function App() {
  return (
    <div className="app-wrap">
      <header className="header">
        <div>
          <h1 style={{ margin: 0 }}>Art Institute — Artworks</h1>
          <div className="small-muted">Server-side pagination + persistent selection</div>
        </div>
        <div>
          <a className="btn btn-ghost" href="https://api.artic.edu" target="_blank" rel="noreferrer">
            API: Art Institute of Chicago
          </a>
        </div>
      </header>

      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ flex: 1 }} className="card">
          <ArtworksTable />
        </div>

        <aside className="card selection-panel">
          <div id="selection-panel-anchor" />
        </aside>
      </div>
    </div>
  );
}
