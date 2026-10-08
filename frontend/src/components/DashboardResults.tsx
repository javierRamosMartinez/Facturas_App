import { Spin } from "antd";
import type {
  FacturaItem,
  ProductAggregate,
  ProductPurchaseRow,
} from "./dashboardTypes";

type SelectedProductAggregate = ProductAggregate | null;

type DashboardResultsProps = {
  loading: boolean;
  total: number;
  results: FacturaItem[];
  selectedProductName: string;
  productPurchases: ProductPurchaseRow[];
  selectedProductAggregate: SelectedProductAggregate;
  productAggregates: ProductAggregate[];
  onInvoiceSelect: (invoiceId: string) => void;
};

const openInvoiceOnKeyboard = (
  event: React.KeyboardEvent,
  invoiceId: string | undefined,
  onInvoiceSelect: (invoiceId: string) => void,
) => {
  if (
    invoiceId &&
    (event.key === "Enter" || event.key === " ")
  ) {
    event.preventDefault();
    onInvoiceSelect(invoiceId);
  }
};

function DashboardResults({
  loading,
  total,
  results,
  selectedProductName,
  productPurchases,
  selectedProductAggregate,
  productAggregates,
  onInvoiceSelect,
}: DashboardResultsProps) {
  return (
    <div className="dashboard-results">
      {loading ? (
        <Spin tip="Cargando resultados..." />
      ) : (
        <>
          <p>
            {selectedProductName
              ? `${productPurchases.length} compras encontradas`
              : `${total} resultados`}
          </p>

          {selectedProductAggregate && (
            <div
              style={{
                marginBottom: 16,
                padding: "12px 16px",
                border: "1px solid #dbe4ff",
                borderRadius: 8,
                background: "#f8fbff",
              }}
            >
              <strong>Resumen del producto seleccionado</strong>
              <div style={{ marginTop: 8 }}>
                <span style={{ marginRight: 16 }}>
                  Producto: <strong>{selectedProductAggregate.nombre}</strong>
                </span>
                <span style={{ marginRight: 16 }}>
                  Cantidad total:{" "}
                  <strong>{selectedProductAggregate.cantidad}</strong>
                </span>
                <span>
                  Importe total:{" "}
                  <strong>
                    {selectedProductAggregate.importe.toFixed(2)} €
                  </strong>
                </span>
              </div>
            </div>
          )}

          {selectedProductName ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Nº factura</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th style={{ textAlign: "right" }}>Cantidad</th>
                  <th style={{ textAlign: "right" }}>Precio</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {productPurchases.map((row) => (
                  <tr
                    key={row.key}
                    style={{ borderTop: "1px solid #ddd", cursor: "pointer" }}
                    onClick={() => onInvoiceSelect(row.invoiceId)}
                    onKeyDown={(event) =>
                      openInvoiceOnKeyboard(event, row.invoiceId, onInvoiceSelect)
                    }
                    tabIndex={0}
                    role="button"
                    aria-label={`Abrir factura ${row.numeroFactura || row.invoiceId}`}
                  >
                    <td>
                      {row.fechaEmision
                        ? new Date(row.fechaEmision).toLocaleDateString()
                        : ""}
                    </td>
                    <td>{row.proveedor}</td>
                    <td>{row.numeroFactura}</td>
                    <td>{row.clienteNombre}</td>
                    <td>{row.productoNombre}</td>
                    <td style={{ textAlign: "right" }}>{row.cantidad}</td>
                    <td style={{ textAlign: "right" }}>
                      {row.precioUnitario.toFixed(2)} €
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {row.importeTotal.toFixed(2)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Nº factura</th>
                  <th>Cliente</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {results.map((invoice, index) => (
                  <tr
                    key={invoice._id || index}
                    style={{ borderTop: "1px solid #ddd", cursor: "pointer" }}
                    onClick={() =>
                      invoice._id && onInvoiceSelect(invoice._id)
                    }
                    onKeyDown={(event) =>
                      openInvoiceOnKeyboard(
                        event,
                        invoice._id,
                        onInvoiceSelect,
                      )
                    }
                    tabIndex={invoice._id ? 0 : -1}
                    role={invoice._id ? "button" : undefined}
                    aria-label={
                      invoice._id
                        ? `Abrir factura ${invoice.numeroFactura || invoice._id}`
                        : undefined
                    }
                  >
                    <td>
                      {invoice.fechaEmision
                        ? new Date(invoice.fechaEmision).toLocaleDateString()
                        : ""}
                    </td>
                    <td>
                      {invoice.proveedor
                        ? typeof invoice.proveedor === "string"
                          ? invoice.proveedor
                          : invoice.proveedor.nombre || invoice.proveedor._id
                        : ""}
                    </td>
                    <td>{invoice.numeroFactura}</td>
                    <td>{invoice.clienteNombre}</td>
                    <td>{Number(invoice.totalFactura).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {productAggregates.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3>Sumatorio por producto</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th style={{ textAlign: "right" }}>Cantidad total</th>
                    <th style={{ textAlign: "right" }}>Gasto total</th>
                  </tr>
                </thead>
                <tbody>
                  {productAggregates.map((product) => (
                    <tr
                      key={product.nombre}
                      style={{ borderTop: "1px solid #eee" }}
                    >
                      <td>{product.nombre}</td>
                      <td style={{ textAlign: "right" }}>
                        {product.cantidad}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: "bold" }}>
                        {product.importe.toFixed(2)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default DashboardResults;
