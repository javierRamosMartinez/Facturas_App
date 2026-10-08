const mongoose = require("mongoose");

const ProductoSchema = new mongoose.Schema({
    codigo: { type: String, trim: true },
    nombre: { type: String, required: true, trim: true },
    lote: { type: String, trim: true },
    fechaCaducidad: { type: Date },
    cantidad: { type: Number, required: true, default: 1 },
    pesoKg: { type: Number }, // Importante para pesaje (quesos, carnes)
    precioUnitario: { type: Number, required: true, default: 0 },
    porcentajeIva: { type: Number, required: true, default: 10 },
    porcentajeDescuento: { type: Number, default: 0 },
    importeTotal: { type: Number, required: true, default: 0 }
});

const DesgloseIvaSchema = new mongoose.Schema({
    baseImponible: { type: Number, required: true },
    porcentajeIva: { type: Number, required: true },
    cuotaIva: { type: Number, required: true },
    porcentajeRE: { type: Number, default: 0 },
    cuotaRE: { type: Number, default: 0 }
});

const FacturaSchema = new mongoose.Schema(
    {
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },

        // Emisor
        // ahora referenciamos al documento `Proveedor`
        proveedor: { type: mongoose.Schema.Types.ObjectId, ref: "Proveedor", required: true },
        cifProveedor: { type: String, trim: true },
        registroSanitario: { type: String, trim: true },

        // Receptor
        clienteNombre: { type: String, trim: true },
        clienteNombreComercial: { type: String, trim: true },
        clienteCif: { type: String, trim: true },
        direccionEntrega: { type: String, trim: true },

        // Datos del documento
        numeroFactura: { type: String, required: true, trim: true },
        numeroAlbaran: { type: String, trim: true },
        fechaEmision: { type: Date, required: true, default: Date.now },
        fechaVencimiento: { type: Date },

        // Contenido y Totales
        productos: [ProductoSchema],
        desgloseIva: [DesgloseIvaSchema],

        subtotal: { type: Number, required: true, default: 0 },
        descuentoTotal: { type: Number, default: 0 },
        totalIva: { type: Number, required: true, default: 0 },
        totalFactura: { type: Number, required: true, default: 0 },

        // Pago
        formaPago: { type: String, trim: true },
        ibanPago: { type: String, trim: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Factura", FacturaSchema);