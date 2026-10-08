import { useState, useEffect } from "react";
import { Alert, Button, Select } from "antd";
import { CheckOutlined } from "@ant-design/icons";
import { API } from "../config";

type Producto = {
  codigo: string;
  nombre: string;
  lote: string;
  fechaCaducidad: string | null;
  peso?: string;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
  porcentajeDescuento: number;
  importeTotal: number;
};

type DesgloseIva = {
  baseImponible: number;
  porcentajeIva: number;
  cuotaIva: number;
  porcentajeRE: number;
  cuotaRE: number;
};

type Factura = {
  _id?: string;
  proveedor: string;
  cifProveedor: string;
  registroSanitario: string;

  clienteNombre: string;
  clienteCif: string;
  direccionEntrega: string;

  numeroFactura: string;
  numeroAlbaran: string;
  fechaEmision: string;
  fechaVencimiento: string | null;

  productos: Producto[];
  desgloseIva: DesgloseIva[];

  subtotal: number;
  descuentoTotal: number;
  totalIva: number;
  totalFactura: number;

  formaPago: string;
  ibanPago: string;
};

type InvoiceReviewProps = {
  invoices: Factura[];
  onSaveSuccess?: (invoiceIndex: number) => void;
  token: string;
};

const hasProductFieldValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
};

function InvoiceReview({ invoices, onSaveSuccess, token }: InvoiceReviewProps) {
  const [editableInvoices, setEditableInvoices] = useState<Factura[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Factura[]>([]);
  const [providers, setProviders] = useState<
    Array<{ _id: string; nombre: string; cif?: string }>
  >([]);
  const [providerProducts, setProviderProducts] = useState<string[]>([]);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const calcularTotalesFactura = (productos: Producto[]) => {
    const subtotal = productos.reduce(
      (acc, p) => acc + Number(p.importeTotal || 0),
      0,
    );

    const desgloseMap = new Map<number, DesgloseIva>();

    productos.forEach((p) => {
      const porcentaje = Number(p.porcentajeIva || 0);
      const base = Number(p.importeTotal || 0);
      const cuota = (base * porcentaje) / 100;

      const actual = desgloseMap.get(porcentaje) || {
        baseImponible: 0,
        porcentajeIva: porcentaje,
        cuotaIva: 0,
        porcentajeRE: 0,
        cuotaRE: 0,
      };

      actual.baseImponible += base;
      actual.cuotaIva += cuota;
      desgloseMap.set(porcentaje, actual);
    });

    const desgloseIva = Array.from(desgloseMap.values())
      .map((item) => ({
        ...item,
        baseImponible: Number(item.baseImponible.toFixed(2)),
        cuotaIva: Number(item.cuotaIva.toFixed(2)),
        porcentajeIva: Number(item.porcentajeIva || 0),
        porcentajeRE: Number(item.porcentajeRE || 0),
        cuotaRE: Number(item.cuotaRE || 0),
      }))
      .sort((a, b) => b.porcentajeIva - a.porcentajeIva);

    const totalIva = desgloseIva.reduce((acc, item) => acc + item.cuotaIva, 0);
    const totalFactura = subtotal + totalIva;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      totalIva: Number(totalIva.toFixed(2)),
      totalFactura: Number(totalFactura.toFixed(2)),
      desgloseIva,
    };
  };

  // Sincronizar el estado editable cuando lleguen nuevas facturas desde Azure
  useEffect(() => {
    // Limpiar proveedor (quitar CIF insertado en el nombre) y extraer metadatos de cada producto
    const cleanProveedor = (prov: any) => {
      if (!prov) return prov;
      // Si ya es un ObjectId en formato hex, dejamos como está
      if (/^[0-9a-fA-F]{24}$/.test(String(prov))) return prov;

      let s = String(prov).trim();
      // Quitar patrones CIF/NIF/DNI/VAT como "CIF: X" o "NIF X"
      s = s.replace(/(?:CIF|NIF|DNI|VAT|ID)[:\s]*[A-Z0-9\-\/\.]+/gi, "");
      // Quitar contenido entre paréntesis si parece contener dígitos/letters (ej. (B12345678))
      s = s.replace(/\([^)]*\d[^)]*\)/g, "");
      // Quitar barras/guiones sobrantes y espacios múltiples
      s = s
        .replace(/[\-\/]{2,}/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return s;
    };

    const parseProducto = (p: Producto) => {
      const nombreOrig = p && p.nombre ? String(p.nombre) : "";
      let nombre = nombreOrig;
      let lote = p.lote || "";
      let fechaCaducidad = p.fechaCaducidad || null;
      let peso = p.peso || undefined;

      // Extraer lote (Lot/Lote ...)
      const matchLote = nombre.match(/(?:Lot|Lote)[:\s]*([A-Z0-9\-]+)/i);
      if (matchLote) {
        lote = matchLote[1];
        nombre = nombre.replace(matchLote[0], "").trim();
      }

      // Extraer caducidad (C:06/10/26, 2026-10-06, 06/10/2026)
      const matchCad = nombre.match(
        /(?:C|Cad|Caducidad)[:\s]*([0-9]{2,4}[\/\.-][0-9]{1,2}[\/\.-][0-9]{2,4})/i,
      );
      if (matchCad) {
        const raw = matchCad[1];
        // Normalizar fechas sencillas a ISO cuando sea posible
        const parts = raw.split(/[\/\.-]/);
        if (parts.length === 3) {
          let [a, b, c] = parts;
          // Determinar formato: si año es primero
          if (a.length === 4) {
            fechaCaducidad = `${a.padStart(4, "0")}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`;
          } else {
            // dd/mm/yy -> yyyy-mm-dd
            let day = a.padStart(2, "0");
            let month = b.padStart(2, "0");
            let year = c.length === 2 ? `20${c}` : c.padStart(4, "0");
            fechaCaducidad = `${year}-${month}-${day}`;
          }
        }
        nombre = nombre.replace(matchCad[0], "").trim();
      }

      // Extraer peso (ej: 500g, 1 kg, 250 ml)
      const matchPeso = nombre.match(
        /(\d+[\.,]?\d*\s?(?:kg|g|gr|mg|l|ml|L|KG|G|GR|ML))/i,
      );
      if (matchPeso) {
        peso = matchPeso[1].replace(/\s+/g, "");
        nombre = nombre.replace(matchPeso[0], "").trim();
      }

      // Limpiar tokens residuales como '/', ',' o duplicados de espacios
      nombre = nombre
        .replace(/[\,\|\/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        ...p,
        nombre: nombre || nombreOrig,
        lote: lote || "",
        fechaCaducidad: fechaCaducidad || null,
        peso,
      } as Producto;
    };

    const cleaned = (invoices || []).map((inv) => {
      const copy = { ...inv } as any;
      copy.proveedor = cleanProveedor(copy.proveedor);
      copy.productos = (copy.productos || []).map((prod: Producto) =>
        parseProducto(prod),
      );

      const totals = calcularTotalesFactura(copy.productos || []);
      copy.subtotal = totals.subtotal;
      copy.totalIva = totals.totalIva;
      copy.totalFactura = totals.totalFactura;
      copy.desgloseIva = totals.desgloseIva;
      copy.descuentoTotal = copy.descuentoTotal || 0;

      return copy;
    });

    console.log(
      "=== Datos recibidos desde Azure / backend ===",
      JSON.stringify(invoices, null, 2),
    );
    console.log(
      "=== Datos preparados para revisión ===",
      JSON.stringify(cleaned, null, 2),
    );

    setEditableInvoices(cleaned);
  }, [invoices]);

  // Cargar lista de proveedores disponibles
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/facturas/providers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) setProviders(data.items);
      } catch (err) {
        console.error("Error cargando proveedores:", err);
      }
    })();
  }, []);

  // Cargar las 5 facturas más recientes para comparar precios de productos
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({
          page: "1",
          limit: "5",
          sortBy: "fechaEmision",
          sortDir: "desc",
        });

        const res = await fetch(`${API}/api/facturas?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.items)) {
          setRecentInvoices(data.items);
        }
      } catch (err) {
        console.error(
          "Error cargando facturas recientes para comparar precios:",
          err,
        );
      }
    })();
  }, []);

  if ((!editableInvoices || editableInvoices.length === 0) && !message) {
    return null;
  }

  // --- MANEJADORES DE CAMBIOS GENERALES ---
  const handleHeaderChange = (
    invoiceIndex: number,
    field: keyof Factura,
    value: string,
  ) => {
    setEditableInvoices((prev) => {
      const updated = [...prev];
      updated[invoiceIndex] = {
        ...updated[invoiceIndex],
        [field]: value,
      };
      return updated;
    });
  };

  // --- MANEJADORES DE CAMBIOS EN PRODUCTOS ---
  const handleProductChange = (
    invoiceIndex: number,
    productIndex: number,
    field: keyof Producto,
    value: string | number,
  ) => {
    setEditableInvoices((prev) => {
      const updated = [...prev];
      const invoice = { ...updated[invoiceIndex] };
      const productos = [...invoice.productos];
      const producto = { ...productos[productIndex], [field]: value };

      // Recalcular el importe total de la línea si cambia cantidad o precio
      if (field === "cantidad" || field === "precioUnitario") {
        const cant = field === "cantidad" ? Number(value) : producto.cantidad;
        const precio =
          field === "precioUnitario" ? Number(value) : producto.precioUnitario;
        producto.importeTotal = Number((cant * precio).toFixed(2));
      }

      // Si el usuario corrige el % de IVA, el desglose debe recalcularse al instante
      if (field === "porcentajeIva") {
        producto.porcentajeIva = Number(value) || 0;
      }

      productos[productIndex] = producto;
      invoice.productos = productos;

      const recalculo = calcularTotalesFactura(productos);
      invoice.subtotal = recalculo.subtotal;
      invoice.totalIva = recalculo.totalIva;
      invoice.totalFactura = recalculo.totalFactura;
      invoice.desgloseIva = recalculo.desgloseIva;
      invoice.descuentoTotal = invoice.descuentoTotal || 0;

      updated[invoiceIndex] = invoice;
      return updated;
    });
  };

  const normalizeText = (value: string) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const getHistoricalPrices = (productName: string) => {
    const target = normalizeText(productName);
    if (!target) return [] as number[];

    const prices: number[] = [];

    recentInvoices.forEach((invoice: any) => {
      (invoice.productos || []).forEach((product: any) => {
        const historicalName = normalizeText(product.nombre || "");
        if (historicalName !== target) return;

        const unitPrice = Number(product.precioUnitario ?? 0);
        if (Number.isFinite(unitPrice) && unitPrice > 0) {
          prices.push(unitPrice);
        }
      });
    });

    return prices;
  };

  const getPriceTrend = (productName: string, currentPrice: number) => {
    const historicalPrices = getHistoricalPrices(productName);
    if (historicalPrices.length === 0 || !Number.isFinite(currentPrice)) {
      return {
        tone: "neutral" as const,
        referencePrice: null as number | null,
      };
    }

    const referencePrice =
      historicalPrices.reduce((acc, price) => acc + price, 0) /
      historicalPrices.length;
    const roundedReference = Number(referencePrice.toFixed(4));
    const roundedCurrent = Number(currentPrice.toFixed(4));

    if (roundedCurrent === roundedReference) {
      return { tone: "neutral" as const, referencePrice: roundedReference };
    }

    return {
      tone:
        roundedCurrent > roundedReference ? ("up" as const) : ("down" as const),
      referencePrice: roundedReference,
    };
  };

  // --- ELIMINAR O AÑADIR PRODUCTOS ---
  const removeProduct = (invoiceIndex: number, productIndex: number) => {
    setEditableInvoices((prev) => {
      const updated = [...prev];
      const invoice = { ...updated[invoiceIndex] };
      invoice.productos = invoice.productos.filter(
        (_, idx) => idx !== productIndex,
      );

      const recalculo = calcularTotalesFactura(invoice.productos);
      invoice.subtotal = recalculo.subtotal;
      invoice.totalIva = recalculo.totalIva;
      invoice.totalFactura = recalculo.totalFactura;
      invoice.desgloseIva = recalculo.desgloseIva;
      invoice.descuentoTotal = invoice.descuentoTotal || 0;

      updated[invoiceIndex] = invoice;
      return updated;
    });
  };

  // --- GUARDAR EN BBDD ---
  //   const handleSaveToDatabase = async (invoiceIndex: number) => {
  //     const facturaAEnviar = editableInvoices[invoiceIndex];
  //     setSavingIndex(invoiceIndex);
  //     setMessage(null);

  //     try {
  //       const response = await fetch("http://localhost:3000/api/facturas", {
  //         method: "POST",
  //         headers: {
  //           "Content-Type": "application/json",
  //         },
  //         body: JSON.stringify(facturaAEnviar),
  //       });

  //       const data = await response.json();

  //       if (!response.ok || !data.ok) {
  //         throw new Error(data.message || "Error al guardar la factura en BBDD");
  //       }

  //       setMessage({
  //         type: "success",
  //         text: `Factura ${facturaAEnviar.numeroFactura} guardada correctamente en MongoDB.`,
  //       });

  //       if (onSaveSuccess) {
  //         onSaveSuccess();
  //       }
  //     } catch (err) {
  //       console.error(err);
  //       setMessage({
  //         type: "error",
  //         text:
  //           err instanceof Error
  //             ? err.message
  //             : "Error de conexión con el servidor",
  //       });
  //     } finally {
  //       setSavingIndex(null);
  //     }
  //   };

  // --- GUARDAR EN BBDD CON VERIFICACIÓN DE DUPLICADOS ---
  const handleSaveToDatabase = async (invoiceIndex: number) => {
    const facturaBase = editableInvoices[invoiceIndex];
    const facturaAEnviar = {
      ...facturaBase,
      ...calcularTotalesFactura(facturaBase.productos),
    };

    setSavingIndex(invoiceIndex);
    setMessage(null);

    console.log("Factura final que se va a guardar:", facturaAEnviar);

    try {
      // 0. Verificar si el proveedor existe; si no existe, pedir confirmación para crearlo
      const provResponse = await fetch(`${API}/api/facturas/find-provider`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proveedor: facturaAEnviar.proveedor,
          cifProveedor: facturaAEnviar.cifProveedor,
        }),
      });

      const provData = await provResponse.json();

      if (provData.ok && !provData.exists) {
        const crear = window.confirm(
          `El proveedor "${facturaAEnviar.proveedor}" no se ha encontrado en la base de datos. ¿Deseas crearlo y continuar con el guardado?`,
        );

        if (!crear) {
          setMessage({
            type: "error",
            text: "Guardado cancelado: proveedor no existe.",
          });
          setSavingIndex(null);
          return;
        }
      }

      if (
        provData.ok &&
        provData.exists &&
        provData.proveedor &&
        provData.proveedor._id
      ) {
        // Si existe, usar su _id para evitar ambigüedades al guardar
        facturaAEnviar.proveedor = provData.proveedor._id;
      }

      // 1. Verificar si la factura ya existe en el backend
      const checkResponse = await fetch(`${API}/api/facturas/check-duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proveedor: facturaAEnviar.proveedor,
          numeroFactura: facturaAEnviar.numeroFactura,
        }),
      });

      const checkData = await checkResponse.json();

      // 2. Si el backend indica que ya existe, pedir confirmación al usuario
      if (checkData.ok && checkData.existe) {
        const confirmarGuardado = window.confirm(
          `⚠️ ATENCIÓN: La factura número "${facturaAEnviar.numeroFactura}" del proveedor "${facturaAEnviar.proveedor}" ya existe en la base de datos.\n\n¿Deseas guardarla de todas formas o prefieres descartarla?`,
        );

        // Si el usuario presiona "Cancelar", se interrumpe el proceso
        if (!confirmarGuardado) {
          setMessage({
            type: "error",
            text: `Guardado cancelado. La factura ${facturaAEnviar.numeroFactura} ya existe en el sistema.`,
          });
          setSavingIndex(null);
          return;
        }
      }

      // 3. Proceder al guardado en BBDD si no existía o si el usuario aceptó forzarlo
      const response = await fetch(`${API}/api/facturas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(facturaAEnviar),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Error al guardar la factura en BBDD");
      }

      setMessage({
        type: "success",
        text: `Factura ${facturaAEnviar.numeroFactura} guardada correctamente en MongoDB.`,
      });
      setEditableInvoices((currentInvoices) =>
        currentInvoices.filter((_, index) => index !== invoiceIndex),
      );

      if (onSaveSuccess) {
        onSaveSuccess(invoiceIndex);
      }
    } catch (err) {
      console.error(err);
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Error de conexión con el servidor",
      });
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <section className="review-page">
      <div className="review-topbar">
        <div>
          <span className="eyebrow">Revisión</span>
          <h2>Revisión y edición de facturas</h2>
        </div>
      </div>

      {message && <Alert message={message.text} type={message.type} showIcon />}

      {editableInvoices.map((factura, invoiceIndex) => {
        const selectedProvider = providers.find(
          (p) => p.nombre === factura.proveedor || p._id === factura.proveedor,
        );
        const providerSelectValue = selectedProvider
          ? selectedProvider._id
          : factura.proveedor
            ? "__manual__"
            : "";
        const displayedProducts = factura.productos.filter((producto) => {
          if (!providerProducts || providerProducts.length === 0) {
            return true;
          }

          return providerProducts.includes(String(producto.nombre).trim());
        });

        const showCodigo = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.codigo),
        );
        const showProducto = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.nombre),
        );
        const showLote = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.lote),
        );
        const showCaducidad = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.fechaCaducidad),
        );
        const showCantidad = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.cantidad),
        );
        const showPrecio = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.precioUnitario),
        );
        const showIva = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.porcentajeIva),
        );
        const showImporte = displayedProducts.some((producto) =>
          hasProductFieldValue(producto.importeTotal),
        );

        return (
          <article key={invoiceIndex} className="invoice-card">
            <div className="invoice-card-header">
              <h3>
                Factura {invoiceIndex + 1} —{" "}
                {factura.numeroFactura || "Sin número"}
              </h3>
            </div>

            <table className="review-table">
              <tbody>
                <tr>
                  <th>Proveedor</th>
                  <td>
                    <Select
                      className="review-select"
                      value={providerSelectValue || undefined}
                      onChange={async (val) => {
                        const prov = providers.find((p) => p._id === val);
                        const proveedorNombre = prov
                          ? prov.nombre
                          : factura.proveedor || "";

                        handleHeaderChange(
                          invoiceIndex,
                          "proveedor",
                          proveedorNombre,
                        );

                        if (prov) {
                          handleHeaderChange(
                            invoiceIndex,
                            "cifProveedor",
                            prov.cif || "",
                          );
                        }

                        if (prov) {
                          try {
                            const resp = await fetch(
                              `${API}/api/facturas/providers/${prov._id}/products`,
                            );
                            const pd = await resp.json();
                            if (pd.ok && Array.isArray(pd.items)) {
                              setProviderProducts(pd.items);
                            }
                          } catch (err) {
                            console.error(
                              "Error cargando productos por proveedor:",
                              err,
                            );
                            setProviderProducts([]);
                          }
                        } else {
                          setProviderProducts([]);
                        }
                      }}
                      options={[
                        ...(factura.proveedor && !selectedProvider
                          ? [{ value: "__manual__", label: factura.proveedor }]
                          : []),
                        ...providers.map((p) => ({
                          value: p._id,
                          label: p.nombre,
                        })),
                      ]}
                      placeholder="Seleccionar proveedor"
                    />
                  </td>
                  <th>CIF proveedor</th>
                  <td>
                    <input
                      type="text"
                      className="review-input"
                      value={factura.cifProveedor || ""}
                      onChange={(e) =>
                        handleHeaderChange(
                          invoiceIndex,
                          "cifProveedor",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                </tr>

                <tr>
                  <th>Nº factura</th>
                  <td>
                    <input
                      type="text"
                      className="review-input"
                      value={factura.numeroFactura || ""}
                      onChange={(e) =>
                        handleHeaderChange(
                          invoiceIndex,
                          "numeroFactura",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <th>Nº albarán</th>
                  <td>
                    <input
                      type="text"
                      className="review-input"
                      value={factura.numeroAlbaran || ""}
                      onChange={(e) =>
                        handleHeaderChange(
                          invoiceIndex,
                          "numeroAlbaran",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                </tr>

                <tr>
                  <th>Fecha emisión</th>
                  <td>
                    <input
                      type="date"
                      className="review-input"
                      value={
                        factura.fechaEmision
                          ? factura.fechaEmision.split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        handleHeaderChange(
                          invoiceIndex,
                          "fechaEmision",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                  <th>Fecha vencimiento</th>
                  <td>
                    <input
                      type="date"
                      className="review-input"
                      value={
                        factura.fechaVencimiento
                          ? factura.fechaVencimiento.split("T")[0]
                          : ""
                      }
                      onChange={(e) =>
                        handleHeaderChange(
                          invoiceIndex,
                          "fechaVencimiento",
                          e.target.value,
                        )
                      }
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="product-section-header">
              <h4>Productos</h4>
            </div>

            <div className="product-table-wrap">
              <table className="product-table">
                <thead>
                  <tr>
                    {showCodigo && <th>Código</th>}
                    {showProducto && <th>Producto</th>}
                    {showLote && <th>Lote</th>}
                    {showCaducidad && <th>Caducidad</th>}
                    {showCantidad && <th className="col-small">Cantidad</th>}
                    {showPrecio && <th className="col-med">Precio (€)</th>}
                    {showIva && <th className="col-small">IVA (%)</th>}
                    {showImporte && <th className="col-med">Importe (€)</th>}
                    <th className="col-action">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {displayedProducts.map((producto, productIndex) => {
                    const priceTrend = getPriceTrend(
                      producto.nombre,
                      Number(producto.precioUnitario),
                    );

                    return (
                      <tr key={productIndex}>
                        {showCodigo && (
                          <td>
                            <input
                              type="text"
                              className="review-input product-input"
                              value={producto.codigo || ""}
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "codigo",
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        )}
                        {showProducto && (
                          <td>
                            <input
                              type="text"
                              className="review-input product-input"
                              value={producto.nombre || ""}
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "nombre",
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        )}
                        {showLote && (
                          <td>
                            <input
                              type="text"
                              className="review-input product-input"
                              value={producto.lote || ""}
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "lote",
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        )}
                        {showCaducidad && (
                          <td>
                            <input
                              type="date"
                              className="review-input product-input"
                              value={
                                producto.fechaCaducidad
                                  ? producto.fechaCaducidad.split("T")[0]
                                  : ""
                              }
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "fechaCaducidad",
                                  e.target.value,
                                )
                              }
                            />
                          </td>
                        )}
                        {showCantidad && (
                          <td>
                            <input
                              type="number"
                              step="any"
                              className="review-input product-input"
                              value={producto.cantidad}
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "cantidad",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </td>
                        )}
                        {showPrecio && (
                          <td>
                            <input
                              type="number"
                              step="any"
                              className="review-input product-input"
                              value={producto.precioUnitario}
                              style={{
                                backgroundColor:
                                  priceTrend.tone === "up"
                                    ? "#fee2e2"
                                    : priceTrend.tone === "down"
                                      ? "#dcfce7"
                                      : undefined,
                                color:
                                  priceTrend.tone === "up"
                                    ? "#991b1b"
                                    : priceTrend.tone === "down"
                                      ? "#166534"
                                      : undefined,
                                border:
                                  priceTrend.tone === "up"
                                    ? "1px solid #f87171"
                                    : priceTrend.tone === "down"
                                      ? "1px solid #4ade80"
                                      : undefined,
                              }}
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "precioUnitario",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                            {priceTrend.tone !== "neutral" && (
                              <div className="trend-badge">
                                {priceTrend.tone === "up"
                                  ? "Precio superior al promedio"
                                  : "Precio inferior al promedio"}
                                {priceTrend.referencePrice !== null
                                  ? ` · Ref. ${priceTrend.referencePrice.toFixed(2)} €`
                                  : ""}
                              </div>
                            )}
                          </td>
                        )}
                        {showIva && (
                          <td>
                            <input
                              type="number"
                              className="review-input product-input"
                              value={producto.porcentajeIva}
                              onChange={(e) =>
                                handleProductChange(
                                  invoiceIndex,
                                  productIndex,
                                  "porcentajeIva",
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                            />
                          </td>
                        )}
                        {showImporte && (
                          <td className="amount-cell">
                            {producto.importeTotal.toFixed(2)} €
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() =>
                              removeProduct(invoiceIndex, productIndex)
                            }
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="totals-box">
              <table className="totals-table">
                <tbody>
                  <tr>
                    <th>Subtotal</th>
                    <td>{factura.subtotal.toFixed(2)} €</td>
                  </tr>
                  <tr>
                    <th>IVA</th>
                    <td>{factura.totalIva.toFixed(2)} €</td>
                  </tr>
                  <tr className="totals-row-total">
                    <th>Total Factura</th>
                    <td>{factura.totalFactura.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>

              {factura.desgloseIva && factura.desgloseIva.length > 0 && (
                <div className="iva-breakdown">
                  <h4>Desglose de IVA</h4>
                  <table className="iva-breakdown-table">
                    <thead>
                      <tr>
                        <th>% IVA</th>
                        <th>Base</th>
                        <th>Cuota</th>
                      </tr>
                    </thead>
                    <tbody>
                      {factura.desgloseIva.map((item) => (
                        <tr key={`${item.porcentajeIva}-${item.baseImponible}`}>
                          <td>{item.porcentajeIva}%</td>
                          <td>{item.baseImponible.toFixed(2)} €</td>
                          <td>{item.cuotaIva.toFixed(2)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="save-actions">
              <Button
                type="primary"
                icon={<CheckOutlined />}
                className="save-btn"
                onClick={() => handleSaveToDatabase(invoiceIndex)}
                disabled={savingIndex === invoiceIndex}
                loading={savingIndex === invoiceIndex}
              >
                Confirmar y guardar en BBDD
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default InvoiceReview;
