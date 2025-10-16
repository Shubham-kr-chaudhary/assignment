import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import { Paginator } from "primereact/paginator";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import { OverlayPanel } from "primereact/overlaypanel";
import { InputNumber } from "primereact/inputnumber";
import { Dropdown } from "primereact/dropdown";
import { Checkbox, type CheckboxChangeEvent } from "primereact/checkbox";

type Artwork = {
  id: number;
  title?: string;
  artist_display?: string;
  place_of_origin?: string;
  date_start?: number;
  image_id?: string | null;
};

type ApiResponse = {
  data: Artwork[];
  pagination?: {
    total?: number;
    limit?: number;
    offset?: number;
    current_page?: number;
  };
};

type SelectedMeta = {
  id: number;
  title?: string;
  artist_display?: string;
};

const STORAGE_KEY = "artic_selected_map_v1";

type Strategy = "first" | "random" | "every";

function iiifImageUrl(imageId: string | null | undefined, width = 160) {
  if (!imageId) return null;
 
  return `https://www.artic.edu/iiif/2/${imageId}/full/${width},/0/default.jpg`;
}

export default function ArtworksTable() {
  const [rows, setRows] = useState<Artwork[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage] = useState(12);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(false);

  const [selectedMap, setSelectedMap] = useState<Record<number, SelectedMeta>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const [tableKey, setTableKey] = useState(0);
  const [showClearDialog, setShowClearDialog] = useState(false);

  const overlayRef = useRef<OverlayPanel | null>(null);
  const [selectNumber, setSelectNumber] = useState<number | undefined>(3);
  const [strategy, setStrategy] = useState<Strategy>("first");
  const [addToExisting, setAddToExisting] = useState(true);
  const [selectingLoading, setSelectingLoading] = useState(false);

  const strategyOptions = [
    { label: "First N rows", value: "first" as Strategy },
    { label: "Random N rows", value: "random" as Strategy },
    { label: "Every Nth row", value: "every" as Strategy },
  ];

  useEffect(() => {
    let cancelled = false;

    async function fetchPage(p: number) {
      setLoading(true);
      try {
        const params = { page: p, limit: rowsPerPage };
        const resp = await axios.get<ApiResponse>("https://api.artic.edu/api/v1/artworks", { params });
        if (cancelled) return;
        const data = resp.data;
        setRows(data.data || []);
        setTotalRecords(data.pagination?.total || 0);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed fetching page:", err);
        setRows([]);
        setTotalRecords(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPage(page);
    return () => {
      cancelled = true;
    };
  }, [page, rowsPerPage]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedMap));
    } catch (err) {
      console.warn("Could not persist selections:", err);
    }
    setTableKey((k) => k + 1);
  }, [selectedMap]);

  const isSelected = (row: Artwork) => !!selectedMap[row.id];

  function onCheckboxChange(row: Artwork, event: CheckboxChangeEvent) {
    const checked = event.checked ?? false;
    setSelectedMap((prev) => {
      const copy = { ...prev };
      if (checked) {
        copy[row.id] = { id: row.id, title: row.title, artist_display: row.artist_display };
      } else {
        delete copy[row.id];
      }
      return copy;
    });
  }

  function deselectId(id: number) {
    setSelectedMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function onPageChange(event: { first?: number; rows?: number; page: number }) {
    setPage(event.page + 1);
  }

  function confirmClearSelections() {
    setShowClearDialog(true);
  }

  function doClearSelections() {
    setSelectedMap({});
    setShowClearDialog(false);
  }

  async function fetchPageData(p: number): Promise<Artwork[]> {
    try {
      const params = { page: p, limit: rowsPerPage };
      const resp = await axios.get<ApiResponse>("https://api.artic.edu/api/v1/artworks", { params });
      return resp.data.data || [];
    } catch (err) {
      console.warn("fetchPageData failed for", p, err);
      return [];
    }
  }

  async function applyAutoSelect() {
    const n = selectNumber ?? 0;
    if (n <= 0) {
      overlayRef.current?.hide?.();
      return;
    }

    setSelectingLoading(true);

    try {
      const combined: Artwork[] = [...rows];
      const totalPages = Math.max(1, Math.ceil((totalRecords || 0) / rowsPerPage));
      let nextPage = page + 1;

      while (combined.length < n && nextPage <= totalPages) {
        const more = await fetchPageData(nextPage);
        combined.push(...more);
        nextPage += 1;
      }

      const availableCount = combined.length;
      const pickCount = Math.min(n, availableCount);
      let indices: number[] = [];

      if (strategy === "first") {
        indices = Array.from({ length: pickCount }, (_, i) => i);
      } else if (strategy === "random") {
        const pool = Array.from({ length: availableCount }, (_, i) => i);
        for (let i = 0; i < pickCount; i++) {
          const pick = Math.floor(Math.random() * pool.length);
          indices.push(pool.splice(pick, 1)[0]);
        }
      } else if (strategy === "every") {
        const step = selectNumber && selectNumber >= 1 ? selectNumber : 1;
        if (step === 1) {
          indices = Array.from({ length: pickCount }, (_, i) => i);
        } else {
          let idx = 0;
          while (indices.length < pickCount && idx < availableCount) {
            indices.push(idx);
            idx += step;
          }
        }
      }

      const base: Record<number, SelectedMeta> = addToExisting ? { ...selectedMap } : {};
      indices.forEach((i) => {
        const item = combined[i];
        if (item) {
          base[item.id] = { id: item.id, title: item.title, artist_display: item.artist_display };
        }
      });

      setSelectedMap(base);
      overlayRef.current?.hide?.();
    } finally {
      setSelectingLoading(false);
    }
  }

  const titleBody = (row: Artwork) => <span>{row.title}</span>;
  const artistBody = (row: Artwork) => <span>{row.artist_display}</span>;
  const originBody = (row: Artwork) => <span>{row.place_of_origin}</span>;
  const dateBody = (row: Artwork) => <span>{row.date_start ?? "-"}</span>;

  const thumbnailBody = (row: Artwork) => {
    const url = iiifImageUrl(row.image_id, 160);
    return url ? (
      <img
        src={url}
        alt={row.title ?? `artwork-${row.id}`}
        style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 6 }}
        loading="lazy"
      />
    ) : (
      <div
        style={{
          width: 80,
          height: 60,
          borderRadius: 6,
          background: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7280",
          fontSize: 12,
        }}
      >
        no image
      </div>
    );
  };

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong>Page</strong> {page} &middot;{" "}
            <span className="small-muted">{totalRecords} total</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <OverlayPanel ref={overlayRef} showCloseIcon dismissable>
              <div style={{ minWidth: 260 }}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", marginBottom: 6 }}>Number</label>
                  <InputNumber
                    value={selectNumber}
                    onValueChange={(e) => setSelectNumber(e.value ?? undefined)}
                    min={1}
                    max={Math.max(rows.length, totalRecords) || 999}
                    disabled={selectingLoading}
                  />
                  <div className="small-muted" style={{ marginTop: 6 }}>
                    Available on this page: {rows.length}. Total available: {totalRecords || "?"}
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <label style={{ display: "block", marginBottom: 6 }}>Strategy</label>
                  <Dropdown
                    value={strategy}
                    options={strategyOptions}
                    onChange={(e) => setStrategy(e.value)}
                    disabled={selectingLoading}
                    placeholder="Select strategy"
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <input
                    id="addExisting"
                    type="checkbox"
                    checked={addToExisting}
                    onChange={(e) => setAddToExisting(e.target.checked)}
                    disabled={selectingLoading}
                  />
                  <label htmlFor="addExisting" style={{ margin: 0 }}>
                    Add to existing selections
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Button
                    label="Cancel"
                    className="p-button-text"
                    onClick={() => overlayRef.current?.hide?.()}
                    disabled={selectingLoading}
                  />
                  <Button
                    label={selectingLoading ? "Selecting..." : "Apply"}
                    onClick={applyAutoSelect}
                    disabled={selectingLoading}
                  />
                </div>
              </div>
            </OverlayPanel>

            <Button
              label="Select"
              icon="pi pi-chevron-down"
              onClick={(e) => overlayRef.current?.toggle?.(e)}
            />

            <Button
              label="Clear selections"
              className="p-button-text"
              onClick={confirmClearSelections}
            />
          </div>
        </div>

        <div key={tableKey}>
          <DataTable value={rows} loading={loading} stripedRows responsiveLayout="scroll">
            <Column
              header="Select"
              body={(row: Artwork) => (
                <Checkbox
                  checked={isSelected(row)}
                  onChange={(e) => onCheckboxChange(row, e)}
                />
              )}
              style={{ width: "90px" }}
            />
            <Column header="Thumb" body={thumbnailBody} style={{ width: 100 }} />
            <Column field="title" header="Title" body={titleBody} />
            <Column field="artist_display" header="Artist" body={artistBody} />
            <Column field="place_of_origin" header="Origin" body={originBody} />
            <Column field="date_start" header="Date" body={dateBody} style={{ width: "110px" }} />
          </DataTable>
        </div>

        <div style={{ marginTop: 12 }}>
          <Paginator
            first={(page - 1) * rowsPerPage}
            rows={rowsPerPage}
            totalRecords={totalRecords}
            onPageChange={onPageChange}
          />
        </div>
      </div>
      <aside className="card selection-panel" style={{ width: 320 }}>
        <h3 style={{ marginTop: 0 }}>Selected ({Object.keys(selectedMap).length})</h3>

        {Object.keys(selectedMap).length === 0 ? (
          <div className="small-muted">No selections</div>
        ) : (
          <div>
            {Object.values(selectedMap).map((m) => (
              <div key={m.id} className="selection-item">
                <div>
                  <div className="selection-title">{m.title ?? `#${m.id}`}</div>
                  <div className="meta small-muted">{m.artist_display}</div>
                </div>
                <button className="btn" onClick={() => deselectId(m.id)}>
                  ✖
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>

      <Dialog
        header="Clear selections?"
        visible={showClearDialog}
        onHide={() => setShowClearDialog(false)}
        modal
      >
        <p>Are you sure you want to clear all saved selections? This action cannot be undone.</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <Button
            label="Cancel"
            className="p-button-text"
            onClick={() => setShowClearDialog(false)}
          />
          <Button label="Clear all" className="p-button-danger" onClick={doClearSelections} />
        </div>
      </Dialog>
    </div>
  );
}
