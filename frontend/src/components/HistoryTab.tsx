import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Spin } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { API } from "../config";

type ProviderLike =
  | string
  | {
      _id?: string;
      nombre?: string;
      cif?: string;
      registroSanitario?: string;
    }
  | null
  | undefined;

type ProductRow = {
  _id?: string;
  codigo?: string;
  nombre?: string;
  lote?: string;
  cantidad?: number;
  precioUnitario?: number;
  porcentajeIva?: number;
  porcentajeDescuento?: number;
  importeTotal?: number;
  fechaCaducidad?: string | null;
};

type InvoiceHistoryItem = {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
  proveedor?: ProviderLike;
  cifProveedor?: string;
  registroSanitario?: string;
  clienteNombre?: string;
  clienteCif?: string;
  direccionEntrega?: string;
  numeroFactura?: string;
  numeroAlbaran?: string;
  fechaEmision?: string;
  fechaVencimiento?: string | null;
  productos?: ProductRow[];
  subtotal?: number;
  descuentoTotal?: number;
  totalIva?: number;
  totalFactura?: number;
  formaPago?: string;
  ibanPago?: string;
};

type HistoryTabProps = {
  token: string;
  initialSelectedId?: string | null;
};

const formatCurrency = (value: number | string | undefined) => {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)} €`;
};

const providerName = (provider: ProviderLike) => {
  if (!provider) return "Proveedor desconocido";
  if (typeof provider === "string") return provider;
  return provider.nombre || provider._id || "Proveedor desconocido";
};

function HistoryTab({ token, initialSelectedId = null }: HistoryTabProps) {
  const [invoices, setInvoices] = useState<InvoiceHistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API}/api/facturas/history?limit=25`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.message || "No se pudo cargar el historial");
        }

        const items = Array.isArray(data.items) ? data.items : [];
        setInvoices(items);
        setSelectedId(initialSelectedId);
      } catch (error) {
        console.error("Error cargando historial:", error);
        setMessage(
          error instanceof Error
            ? error.message
            : "Error cargando el historial de facturas.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [initialSelectedId, token]);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice._id === selectedId) ?? null,
    [invoices, selectedId],
  );

  const updateSelectedInvoice = (
    field: keyof InvoiceHistoryItem,
    value: string | number | null,
  ) => {
    if (!selectedInvoice) return;

    setInvoices((current) =>
      current.map((invoice) =>
        invoice._id === selectedInvoice._id
          ? {
              ...invoice,
              [field]: value,
            }
          : invoice,
      ),
    );
  };

  const updateProductRow = (
    productIndex: number,
    field: keyof ProductRow,
    value: string | number | null,
  ) => {
    if (!selectedInvoice) return;

    const productos = [...(selectedInvoice.productos || [])];
    productos[productIndex] = {
      ...productos[productIndex],
      [field]: value,
    };

    setInvoices((current) =>
      current.map((invoice) =>
        invoice._id === selectedInvoice._id
          ? {
              ...invoice,
              productos,
            }
          : invoice,
      ),
    );
  };

  const handleSave = async () => {
    if (!selectedInvoice || !selectedInvoice._id) return;

    try {
      setSaving(true);
      setMessage(null);

      const payload = {
        ...selectedInvoice,
        proveedor:
          typeof selectedInvoice.proveedor === "object" &&
          selectedInvoice.proveedor !== null
            ? selectedInvoice.proveedor._id || selectedInvoice.proveedor.nombre
            : selectedInvoice.proveedor || "Proveedor desconocido",
      };

      const response = await fetch(
        `${API}/api/facturas/${selectedInvoice._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "No se pudo guardar la factura");
      }

      setInvoices((current) =>
        current.map((invoice) =>
          invoice._id === selectedInvoice._id
            ? { ...invoice, ...data.item }
            : invoice,
        ),
      );
      setMessage("Factura actualizada correctamente.");
    } catch (error) {
      console.error("Error guardando factura:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la factura.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel history-panel">
      <div className="history-header">
        <div>
          <span className="eyebrow">Histórico</span>
          <h2>Últimas facturas guardadas</h2>
        </div>
      </div>

      {message && (
        <Alert
          message={message}
          type={
            message.toLowerCase().includes("correctamente")
              ? "success"
              : "error"
          }
          showIcon
        />
      )}

      {loading ? (
        <Spin tip="Cargando historial..." />
      ) : (
        <div className="history-layout">
          <div className="history-list-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Total</th>
                  <th>Fecha guardado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice._id}
                    className={
                      selectedId === invoice._id
                        ? "history-row is-selected"
                        : "history-row"
                    }
                    onClick={() => setSelectedId(invoice._id)}
                  >
                    <td>{providerName(invoice.proveedor)}</td>
                    <td>{formatCurrency(invoice.totalFactura)}</td>
                    <td>
                      {invoice.createdAt
                        ? new Date(invoice.createdAt).toLocaleString("es-ES", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedInvoice && (
            <div className="history-detail">
              <div className="history-detail-header">
                <div>
                  <span className="eyebrow">Detalle</span>
                  <h3>{selectedInvoice.numeroFactura || "Factura"}</h3>
                </div>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  disabled={saving}
                  loading={saving}
                >
                  Guardar cambios
                </Button>
              </div>

              <div className="history-form-grid">
                <label>
                  Proveedor
                  <input
                    value={providerName(selectedInvoice.proveedor)}
                    onChange={(e) =>
                      updateSelectedInvoice("proveedor", e.target.value)
                    }
                  />
                </label>
                <label>
                  CIF proveedor
                  <input
                    value={selectedInvoice.cifProveedor || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("cifProveedor", e.target.value)
                    }
                  />
                </label>
                <label>
                  Cliente
                  <input
                    value={selectedInvoice.clienteNombre || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("clienteNombre", e.target.value)
                    }
                  />
                </label>
                <label>
                  CIF cliente
                  <input
                    value={selectedInvoice.clienteCif || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("clienteCif", e.target.value)
                    }
                  />
                </label>
                <label>
                  Nº factura
                  <input
                    value={selectedInvoice.numeroFactura || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("numeroFactura", e.target.value)
                    }
                  />
                </label>
                <label>
                  Nº albarán
                  <input
                    value={selectedInvoice.numeroAlbaran || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("numeroAlbaran", e.target.value)
                    }
                  />
                </label>
                <label>
                  Fecha emisión
                  <input
                    type="date"
                    value={
                      selectedInvoice.fechaEmision
                        ? selectedInvoice.fechaEmision.slice(0, 10)
                        : ""
                    }
                    onChange={(e) =>
                      updateSelectedInvoice("fechaEmision", e.target.value)
                    }
                  />
                </label>
                <label>
                  Fecha vencimiento
                  <input
                    type="date"
                    value={
                      selectedInvoice.fechaVencimiento
                        ? selectedInvoice.fechaVencimiento.slice(0, 10)
                        : ""
                    }
                    onChange={(e) =>
                      updateSelectedInvoice("fechaVencimiento", e.target.value)
                    }
                  />
                </label>
                <label>
                  Forma de pago
                  <input
                    value={selectedInvoice.formaPago || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("formaPago", e.target.value)
                    }
                  />
                </label>
                <label>
                  IBAN
                  <input
                    value={selectedInvoice.ibanPago || ""}
                    onChange={(e) =>
                      updateSelectedInvoice("ibanPago", e.target.value)
                    }
                  />
                </label>
                <label>
                  Subtotal
                  <input
                    type="number"
                    step="0.01"
                    value={selectedInvoice.subtotal ?? 0}
                    onChange={(e) =>
                      updateSelectedInvoice("subtotal", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  IVA
                  <input
                    type="number"
                    step="0.01"
                    value={selectedInvoice.totalIva ?? 0}
                    onChange={(e) =>
                      updateSelectedInvoice("totalIva", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  Descuento
                  <input
                    type="number"
                    step="0.01"
                    value={selectedInvoice.descuentoTotal ?? 0}
                    onChange={(e) =>
                      updateSelectedInvoice(
                        "descuentoTotal",
                        Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Total factura
                  <input
                    type="number"
                    step="0.01"
                    value={selectedInvoice.totalFactura ?? 0}
                    onChange={(e) =>
                      updateSelectedInvoice(
                        "totalFactura",
                        Number(e.target.value),
                      )
                    }
                  />
                </label>
              </div>

              <div className="history-products">
                <h4>Productos</h4>
                {(selectedInvoice.productos || []).length > 0 ? (
                  <table className="history-product-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        <th>IVA</th>
                        <th>Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedInvoice.productos || []).map(
                        (product, productIndex) => (
                          <tr
                            key={`${product.nombre || "producto"}-${productIndex}`}
                          >
                            <td>
                              <input
                                value={product.nombre || ""}
                                onChange={(e) =>
                                  updateProductRow(
                                    productIndex,
                                    "nombre",
                                    e.target.value,
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={product.cantidad ?? 0}
                                onChange={(e) =>
                                  updateProductRow(
                                    productIndex,
                                    "cantidad",
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={product.precioUnitario ?? 0}
                                onChange={(e) =>
                                  updateProductRow(
                                    productIndex,
                                    "precioUnitario",
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={product.porcentajeIva ?? 0}
                                onChange={(e) =>
                                  updateProductRow(
                                    productIndex,
                                    "porcentajeIva",
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={product.importeTotal ?? 0}
                                onChange={(e) =>
                                  updateProductRow(
                                    productIndex,
                                    "importeTotal",
                                    Number(e.target.value),
                                  )
                                }
                              />
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                ) : (
                  <p>No hay productos asociados.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default HistoryTab;
