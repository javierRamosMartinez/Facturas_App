const DocumentIntelligence = require("@azure-rest/ai-document-intelligence").default;
const {
    getLongRunningPoller,
    isUnexpected
} = require("@azure-rest/ai-document-intelligence");
const { AzureKeyCredential } = require("@azure/core-auth");

const client = DocumentIntelligence(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY)
);


// ============================================================
// PROVEEDOR
// ============================================================

const normalizarNombreProveedor = (nombre) => {
    if (!nombre) return "";

    return String(nombre)
        .replace(/\s*[-|/\\]\s*/g, " ")
        .replace(/\s*\([^)]*\)/g, "")
        .replace(
            /\b(?:CIF|NIF|DNI|VAT|NIE|ID)\s*[:\-]?\s*[A-Z0-9\-\/\.]+/gi,
            ""
        )
        .replace(
            /\b(?:ES|FR|DE|IT|PT)\s*[A-Z0-9]\d{7,8}\b/gi,
            ""
        )
        .replace(/\s+/g, " ")
        .trim();
};


const extraerProveedorDesdeTexto = (contentText) => {
    if (!contentText) return "";

    const patrones = [
        /(?:Proveedor|Vendedor|Emisor|Empresa|Raz[óo]n\s*Social|R\.\s*Social)[\s:]*([A-Z0-9À-ÿ&.,'\- /]+)/i,
        /(?:Seller|Vendor|Supplier|Provider)[\s:]*([A-Z0-9À-ÿ&.,'\- /]+)/i,
        /(?:NIF|CIF|VAT|Tax\s*Id)[\s:]*[A-Z0-9\-\/\.]+\s*\r?\n\s*([A-Z0-9À-ÿ&.,'\- /]+)/i,
    ];

    for (const patron of patrones) {
        const match = contentText.match(patron);

        if (match && match[1]) {
            const cleaned = normalizarNombreProveedor(match[1]);

            if (cleaned) return cleaned;
        }
    }

    const lineas = contentText
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean)
        .filter(
            (linea) =>
                !/^\s*(NIF|CIF|VAT|DNI|FECHA|FACTURA|TOTAL|SUBTOTAL|BASE|IVA|IBAN|BANCO|NUMERO|Nº|N\.?\s*FACTURA)\b/i.test(
                    linea
                )
        );

    for (const linea of lineas) {
        if (linea.length < 4) continue;

        const cleaned = normalizarNombreProveedor(linea);

        if (
            cleaned &&
            cleaned.length > 2 &&
            !/^\d+$/.test(cleaned) &&
            !/^(?:Factura|Cliente|Direcci[oó]n|Fecha|Vencimiento|P\.?\s*Ag\.?|Albaran|Pedido|Desglose|Importe|Base|Iva|Total)/i.test(
                cleaned
            )
        ) {
            return cleaned;
        }
    }

    return "";
};


const extraerProveedorDesdeCampos = (fields) => {
    const candidates = [];

    Object.entries(fields || {}).forEach(([key, value]) => {
        const lower = String(key).toLowerCase();

        if (
            !/vendor|seller|supplier|provider|emisor|nombre.*proveedor|empresa/i.test(
                lower
            )
        ) {
            return;
        }

        if (value && typeof value === "object") {
            const stringValue =
                value.valueString ||
                value.valueArray?.[0]?.valueObject?.valueString ||
                "";

            if (stringValue) {
                candidates.push(stringValue);
            }
        }
    });

    for (const candidate of candidates) {
        const cleaned = normalizarNombreProveedor(candidate);

        if (cleaned) return cleaned;
    }

    return "";
};


// ============================================================
// LOTE / CADUCIDAD
// ============================================================

const extraerLoteYCaducidad = (descripcion) => {
    if (!descripcion) {
        return {
            lote: "",
            fechaCaducidad: null,
        };
    }

    let lote = "";
    let fechaCaducidad = null;

    const matchLote = descripcion.match(
        /(?:Lot|Lote)[\s:]*([A-Z0-9]+)/i
    );

    if (matchLote) {
        lote = matchLote[1];
    }

    const matchCad = descripcion.match(
        /(?:C|Cad|Caducidad)[\s:]*(\d{2}[\/\.-]\d{2}[\/\.-]\d{2,4})/i
    );

    if (matchCad) {
        const partes = matchCad[1].split(/[\/\.-]/);

        if (partes.length === 3) {
            let [dia, mes, anio] = partes;

            if (anio.length === 2) {
                anio = "20" + anio;
            }

            const fecha = new Date(`${anio}-${mes}-${dia}`);

            if (!isNaN(fecha.getTime())) {
                fechaCaducidad = fecha;
            }
        }
    }

    return {
        lote,
        fechaCaducidad,
    };
};


// ============================================================
// IVA: EXTRAER PORCENTAJE
// ============================================================

const extraerPorcentajeIva = (value) => {
    const candidates = [];

    const pushCandidate = (candidate) => {
        if (candidate === undefined || candidate === null) {
            return;
        }

        candidates.push(candidate);
    };

    if (value && typeof value === "object") {
        pushCandidate(value.valueNumber);
        pushCandidate(value.valueString);
        pushCandidate(value.valueCurrency?.amount);

        pushCandidate(value.Rate);
        pushCandidate(value.rate);

        pushCandidate(value.TaxRate);
        pushCandidate(value.taxRate);

        pushCandidate(value.Percentage);
        pushCandidate(value.percentage);

        pushCandidate(value.IVA);
        pushCandidate(value.iva);

        pushCandidate(value.VATRate);
        pushCandidate(value.vatRate);

        if (value.valueObject) {
            pushCandidate(value.valueObject);
        }
    }

    if (Array.isArray(value)) {
        value.forEach(pushCandidate);
    }

    for (const candidate of candidates) {
        if (candidate && typeof candidate === "object") {
            const nested = extraerPorcentajeIva(candidate);

            if (nested !== null && nested !== undefined) {
                return nested;
            }

            continue;
        }

        if (typeof candidate === "string") {
            const cleaned = candidate
                .replace(/%/g, "")
                .replace(/[^0-9,\.\-+]/g, "")
                .replace(/\+/g, "")
                .replace(",", ".")
                .trim();

            if (!cleaned) continue;

            const parsed = Number(cleaned);

            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        if (
            typeof candidate === "number" &&
            Number.isFinite(candidate)
        ) {
            return candidate;
        }
    }

    return null;
};


// ============================================================
// UTILIDADES NUMÉRICAS
// ============================================================

const TIPOS_IVA_VALIDOS = [0, 4, 5, 10, 21];

const redondear = (numero, decimales = 2) => {
    const factor = Math.pow(10, decimales);

    return Math.round((numero + Number.EPSILON) * factor) / factor;
};


const aCentimos = (numero) => {
    return Math.round(Number(numero || 0) * 100);
};


// Ajusta un porcentaje deducido (ej. 20.98) al tipo legal más cercano
const ajustarATipoValido = (pct) => {
    if (!Number.isFinite(pct)) return null;

    let mejor = null;
    let mejorDif = Infinity;

    for (const tipo of TIPOS_IVA_VALIDOS) {
        const dif = Math.abs(tipo - pct);

        if (dif < mejorDif) {
            mejor = tipo;
            mejorDif = dif;
        }
    }

    return mejorDif <= 0.6 ? mejor : null;
};


// ============================================================
// DESGLOSE DE IVA: NORMALIZAR
// ============================================================

/**
 * Azure a veces NO devuelve la base imponible en TaxDetails,
 * solo la cuota (Amount) y el porcentaje (Rate).
 *
 * La cuota está redondeada a céntimos, así que la base real
 * no es un número exacto sino un RANGO:
 *
 *   cuota 11,13 al 4 %  ->  base entre 278,125 y 278,375
 *
 * Esta función devuelve, por cada tipo de IVA, el rango
 * [minCent, maxCent] (en céntimos) donde debe estar la base.
 */
const normalizarDesgloseIva = (desglose) => {
    const porTasa = new Map();

    for (const item of desglose) {
        const pct = item.porcentajeIva;
        const cuotaC = aCentimos(item.cuotaIva);
        const baseC = aCentimos(item.baseImponible);

        if (pct === null || pct === undefined) continue;

        let minCent;
        let maxCent;

        if (baseC > 0) {
            // Azure sí dio la base
            minCent = baseC - 2;
            maxCent = baseC + 2;
        } else if (pct > 0 && cuotaC > 0) {
            // Deducir el rango de base a partir de la cuota redondeada
            minCent = Math.ceil(((cuotaC - 0.5) * 100) / pct) - 1;
            maxCent = Math.floor(((cuotaC + 0.5) * 100) / pct) + 1;
        } else {
            continue;
        }

        const previo = porTasa.get(pct) || {
            porcentajeIva: pct,
            minCent: 0,
            maxCent: 0,
            cuotaIva: 0,
        };

        previo.minCent += minCent;
        previo.maxCent += maxCent;
        previo.cuotaIva += Number(item.cuotaIva) || 0;

        porTasa.set(pct, previo);
    }

    return [...porTasa.values()];
};


// ============================================================
// BUSCAR COMBINACIÓN DE PRODUCTOS (subset-sum por rango)
// ============================================================

/**
 * Busca un subconjunto de productos cuya suma (en céntimos)
 * caiga dentro de [minCent, maxCent].
 *
 * Usa programación dinámica: no hay explosión combinatoria.
 * Devuelve un array de índices o null.
 */
const buscarCombinacionProductos = (
    productos,
    indicesDisponibles,
    minCent,
    maxCent
) => {
    if (maxCent <= 0) return null;

    const items = indicesDisponibles
        .map((index) => ({
            index,
            importe: aCentimos(productos[index].importeTotal),
        }))
        .filter((item) => item.importe > 0);

    // suma alcanzable -> cómo se llegó a ella
    const alcanzables = new Map([[0, null]]);

    items.forEach((item, pos) => {
        const nuevos = [];

        for (const suma of alcanzables.keys()) {
            const s = suma + item.importe;

            if (s <= maxCent && !alcanzables.has(s)) {
                nuevos.push([s, { prevSuma: suma, pos }]);
            }
        }

        nuevos.forEach(([s, paso]) => alcanzables.set(s, paso));
    });

    // De las sumas dentro del rango, la más cercana al centro
    const centro = (minCent + maxCent) / 2;
    let mejor = null;

    for (const s of alcanzables.keys()) {
        if (s <= 0 || s < minCent || s > maxCent) continue;

        if (
            mejor === null ||
            Math.abs(s - centro) < Math.abs(mejor - centro)
        ) {
            mejor = s;
        }
    }

    if (mejor === null) return null;

    const seleccion = [];
    let s = mejor;

    while (s !== 0) {
        const { prevSuma, pos } = alcanzables.get(s);

        seleccion.push(items[pos].index);
        s = prevSuma;
    }

    return seleccion;
};


// ============================================================
// RESOLVER IVA DE PRODUCTOS
// ============================================================

const resolverIvaProductos = (productos, desgloseIvaRaw) => {
    if (!productos.length) return productos;

    const desglose = normalizarDesgloseIva(desgloseIvaRaw);

    // PASO 1: IVA explícito en la línea
    productos.forEach((p) => {
        if (p.porcentajeIva !== null && p.porcentajeIva !== undefined) {
            p.origenIva = "linea";
        }
    });

    let pendientes = productos
        .map((_, i) => i)
        .filter((i) => productos[i].porcentajeIva == null);

    if (!pendientes.length) return productos;

    // PASO 2: una sola tasa en toda la factura
    if (desglose.length === 1) {
        pendientes.forEach((i) => {
            productos[i].porcentajeIva = desglose[0].porcentajeIva;
            productos[i].origenIva = "factura";
        });

        return productos;
    }

    // PASO 3: varias tasas -> cuadrar por importes
    // Grupos pequeños primero: son los más fáciles de identificar
    const grupos = [...desglose].sort((a, b) => a.minCent - b.minCent);

    grupos.forEach((grupo, g) => {
        if (!pendientes.length) return;

        // Descontamos lo que ya está asignado a esta tasa por línea
        const yaAsignado = productos
            .filter((p) => p.porcentajeIva === grupo.porcentajeIva)
            .reduce((acc, p) => acc + aCentimos(p.importeTotal), 0);

        const min = grupo.minCent - yaAsignado;
        const max = grupo.maxCent - yaAsignado;

        if (max <= 0) return;

        let seleccion = null;

        if (g === grupos.length - 1) {
            // Último grupo: todo lo que sobra
            const suma = pendientes.reduce(
                (acc, i) => acc + aCentimos(productos[i].importeTotal),
                0
            );

            if (suma >= min - 2 && suma <= max + 2) {
                seleccion = [...pendientes];
            }
        } else {
            seleccion = buscarCombinacionProductos(
                productos,
                pendientes,
                Math.max(min, 1),
                max
            );
        }

        if (!seleccion || !seleccion.length) {
            return;
        }

        seleccion.forEach((i) => {
            productos[i].porcentajeIva = grupo.porcentajeIva;
            productos[i].origenIva = "inferido";
        });

        const usados = new Set(seleccion);
        pendientes = pendientes.filter((i) => !usados.has(i));
    });

    // PASO 4: lo que no se pudo determinar
    pendientes.forEach((i) => {
        productos[i].porcentajeIva = null;
        productos[i].origenIva = "no_determinado";
    });

    return productos;
};


// ============================================================
// MAPEAR RESPUESTA AZURE
// ============================================================

const mapearRespuestaFactura = (analyzeResult) => {
    const document = analyzeResult?.documents?.[0];

    if (!document) {
        return null;
    }

    const fields = document.fields || {};
    const contentText = analyzeResult.content || "";


    // --------------------------------------------------------
    // 1. PROVEEDOR
    // --------------------------------------------------------

    let proveedor =
        fields.VendorName?.valueString ||
        fields.SellerName?.valueString ||
        fields.SupplierName?.valueString ||
        fields.BillingAddressRecipient?.valueString ||
        fields.SellerAddressRecipient?.valueString ||
        extraerProveedorDesdeCampos(fields) ||
        "";

    proveedor = normalizarNombreProveedor(proveedor);

    if (!proveedor && contentText) {
        proveedor =
            extraerProveedorDesdeTexto(contentText) ||
            "Proveedor no detectado";
    }

    const cifProveedor =
        fields.VendorTaxId?.valueString ||
        fields.SellerTaxId?.valueString ||
        "";


    // --------------------------------------------------------
    // 2. REGISTRO SANITARIO
    // --------------------------------------------------------

    const matchSanitario = contentText.match(
        /(?:R\.?\s*Sanitario|Reg\.?\s*Sanit?|R\.S\.E\.A\.A)[\s:]*([A-Z0-9\/\.]+)/i
    );

    const registroSanitario = matchSanitario ? matchSanitario[1] : "";


    // --------------------------------------------------------
    // 3. CLIENTE
    // --------------------------------------------------------

    const clienteNombre = fields.CustomerName?.valueString || "";

    const clienteCif = fields.CustomerTaxId?.valueString || "";

    const direccionEntrega =
        fields.ShippingAddress?.valueAddress?.formattedAddress ||
        fields.ShippingAddressRecipient?.valueString ||
        "";


    // --------------------------------------------------------
    // 4. FACTURA
    // --------------------------------------------------------

    const numeroFactura = fields.InvoiceId?.valueString || "SIN-NUMERO";

    const fechaEmision = fields.InvoiceDate?.valueDate
        ? new Date(fields.InvoiceDate.valueDate)
        : new Date();

    const fechaVencimiento = fields.DueDate?.valueDate
        ? new Date(fields.DueDate.valueDate)
        : null;


    // --------------------------------------------------------
    // 5. ALBARÁN
    // --------------------------------------------------------

    const matchAlbaran = contentText.match(
        /(?:ALB|Albar[aá]n)[\s\w\/]*[Nº\:\s]+([D0-9\/\.]+)/i
    );

    const numeroAlbaran = matchAlbaran ? matchAlbaran[1] : "";


    // --------------------------------------------------------
    // 6. DATOS RAW
    // --------------------------------------------------------

    const itemsRaw = fields.Items?.valueArray || [];
    const taxDetailsRaw = fields.TaxDetails?.valueArray || [];


    // --------------------------------------------------------
    // 7. DESGLOSE IVA
    // --------------------------------------------------------
    // Ojo: en muchas facturas Azure NO devuelve la base imponible,
    // solo Amount (cuota) y Rate (porcentaje). En ese caso
    // baseImponible queda en 0 y se deduce en normalizarDesgloseIva.

    const desgloseIva = taxDetailsRaw
        .map((tax) => {
            const val = tax.valueObject || {};

            const porcentajeIva = extraerPorcentajeIva(
                val.Rate ?? val.rate ?? val
            );

            const baseImponible =
                val.NetAmount?.valueCurrency?.amount ??
                val.NetAmount?.valueNumber ??
                val.BaseAmount?.valueCurrency?.amount ??
                val.BaseAmount?.valueNumber ??
                0;

            const cuotaIva =
                val.Amount?.valueCurrency?.amount ??
                val.Amount?.valueNumber ??
                0;

            return {
                baseImponible: Number(baseImponible),
                porcentajeIva:
                    porcentajeIva !== null ? Number(porcentajeIva) : null,
                cuotaIva: Number(cuotaIva),
                porcentajeRE: 0,
                cuotaRE: 0,
            };
        })
        .filter((item) => item.baseImponible > 0 || item.cuotaIva > 0);


    // --------------------------------------------------------
    // 8. PRODUCTOS
    // --------------------------------------------------------

    const productos = itemsRaw.map((item) => {
        const val = item.valueObject || {};

        const rawDescription =
            val.Description?.valueString || "Sin descripción";

        const { lote, fechaCaducidad } =
            extraerLoteYCaducidad(rawDescription);

        const cantidad = val.Quantity?.valueNumber ?? 1;

        const precioUnitario =
            val.UnitPrice?.valueCurrency?.amount ??
            val.UnitPrice?.valueNumber ??
            0;

        const importeTotal =
            val.Amount?.valueCurrency?.amount ??
            val.Amount?.valueNumber ??
            cantidad * precioUnitario;

        // Solo buscamos IVA en campos que realmente
        // pueden representar el impuesto de la línea.
        let itemTaxRate = extraerPorcentajeIva(
            val.TaxDetails ??
            val.TaxRate ??
            val.IVA ??
            val.iva ??
            null
        );

        // Si la línea trae la cuota (Tax), deducimos el porcentaje
        const taxLinea =
            val.Tax?.valueCurrency?.amount ?? val.Tax?.valueNumber;

        if (
            itemTaxRate === null &&
            taxLinea != null &&
            Number(importeTotal) > 0
        ) {
            itemTaxRate = ajustarATipoValido(
                (taxLinea / Number(importeTotal)) * 100
            );
        }

        return {
            codigo: val.ProductCode?.valueString || "",
            nombre: rawDescription,
            lote,
            fechaCaducidad,
            cantidad,
            precioUnitario,
            porcentajeIva:
                itemTaxRate !== null ? Number(itemTaxRate) : null,
            porcentajeDescuento: 0,
            importeTotal: Number(importeTotal),
            origenIva: itemTaxRate !== null ? "linea" : null,
        };
    });


    // --------------------------------------------------------
    // 9. RESOLVER IVA
    // --------------------------------------------------------

    resolverIvaProductos(productos, desgloseIva);


    // --------------------------------------------------------
    // 10. TOTALES
    // --------------------------------------------------------

    let subtotal =
        fields.SubTotal?.valueCurrency?.amount ??
        fields.SubTotal?.valueNumber ??
        0;

    if (subtotal === 0 && productos.length > 0) {
        subtotal = productos.reduce(
            (acc, producto) => acc + Number(producto.importeTotal || 0),
            0
        );
    }

    const totalIva =
        fields.TotalTax?.valueCurrency?.amount ??
        fields.TotalTax?.valueNumber ??
        0;

    const totalFactura =
        fields.InvoiceTotal?.valueCurrency?.amount ??
        fields.InvoiceTotal?.valueNumber ??
        subtotal + totalIva;


    // --------------------------------------------------------
    // 10b. COMPROBACIÓN DE COHERENCIA
    // --------------------------------------------------------
    // La suma de líneas debería ser InvoiceTotal - TotalTax.
    // Si no cuadra, hay descuentos, portes o recargos y la
    // inferencia de IVA puede no ser fiable.

    const sumaLineas = productos.reduce(
        (acc, p) => acc + aCentimos(p.importeTotal),
        0
    );

    const baseEsperada = aCentimos(totalFactura) - aCentimos(totalIva);

    const hayNoDeterminados = productos.some(
        (p) => p.origenIva === "no_determinado"
    );

    const requiereRevision =
        hayNoDeterminados ||
        Math.abs(sumaLineas - baseEsperada) > 2;


    // --------------------------------------------------------
    // 11. PAGO
    // --------------------------------------------------------

    const formaPago = fields.PaymentTerm?.valueString || "";

    const ibanPago =
        fields.PaymentDetails?.valueArray?.[0]?.valueObject?.IBAN
            ?.valueString || "";


    // --------------------------------------------------------
    // 12. RESULTADO FINAL
    // --------------------------------------------------------

    return {
        proveedor,
        cifProveedor,
        registroSanitario,

        clienteNombre,
        clienteCif,
        direccionEntrega,

        numeroFactura,
        numeroAlbaran,
        fechaEmision,
        fechaVencimiento,

        productos,
        desgloseIva,

        subtotal,
        descuentoTotal: 0,
        totalIva,
        totalFactura,

        formaPago,
        ibanPago,

        requiereRevision,
    };
};


// ============================================================
// ANALIZAR FACTURA CON AZURE
// ============================================================

const analizarFactura = async (fileBuffer) => {
    if (!fileBuffer || fileBuffer.length === 0) {
        throw new Error("Empty file buffer");
    }

    const base64Source = fileBuffer.toString("base64");

    let initialResponse;


    // 1. ENVIAR A AZURE
    try {
        initialResponse = await client
            .path("/documentModels/{modelId}:analyze", "prebuilt-invoice")
            .post({
                contentType: "application/json",
                body: { base64Source },
            });
    } catch (err) {
        console.error(
            "Azure request failed (post):",
            err && err.stack ? err.stack : err
        );

        throw new Error("Error al conectar con Azure");
    }


    // 2. RESPUESTA INICIAL
    if (isUnexpected(initialResponse)) {
        console.error(
            "Azure initialResponse unexpected:",
            JSON.stringify(initialResponse.body || initialResponse)
        );

        throw new Error(
            initialResponse.body?.error?.message ||
            "Error al conectar con Azure"
        );
    }


    // 3. ESPERAR RESULTADO
    const poller = getLongRunningPoller(client, initialResponse);

    let result;

    try {
        result = await poller.pollUntilDone();
    } catch (err) {
        console.error(
            "Error polling Azure result:",
            err && err.stack ? err.stack : err
        );

        throw new Error("Error procesando la respuesta del análisis");
    }


    // 4. VALIDAR RESULTADO
    if (isUnexpected(result)) {
        console.error(
            "Azure result unexpected:",
            JSON.stringify(result.body || result)
        );

        throw new Error("Error procesando la respuesta del análisis");
    }


    // 5. RESPUESTA COMPLETA
    const analyzeResult = result.body.analyzeResult;


    // 6. MAPEAR
    return mapearRespuestaFactura(analyzeResult);
};


module.exports = {
    analizarFactura,
};