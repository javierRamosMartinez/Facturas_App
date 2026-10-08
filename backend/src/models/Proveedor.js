const mongoose = require("mongoose");

const ProveedorSchema = new mongoose.Schema(
    {
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
        nombre: { type: String, required: true, trim: true },
        cif: { type: String, trim: true },
        registroSanitario: { type: String, trim: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Proveedor", ProveedorSchema);
