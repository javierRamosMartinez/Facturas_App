const mongoose = require("mongoose");

const UsuarioSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: true,
            trim: true,
            unique: true,
            lowercase: true,
            index: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
    },
    { timestamps: true },
);

module.exports = mongoose.model("Usuario", UsuarioSchema);
