const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("Falta la variable de entorno JWT_SECRET");
}

const register = async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ ok: false, message: "Usuario y contraseña requeridos." });
        }

        if (String(username).trim().length < 3) {
            return res.status(400).json({ ok: false, message: "El usuario debe tener al menos 3 caracteres." });
        }

        if (String(password).length < 6) {
            return res.status(400).json({ ok: false, message: "La contraseña debe tener al menos 6 caracteres." });
        }

        const existing = await Usuario.findOne({ username: String(username).trim().toLowerCase() });
        if (existing) {
            return res.status(409).json({ ok: false, message: "El usuario ya existe." });
        }

        const passwordHash = await bcrypt.hash(String(password), 10);
        const user = await Usuario.create({ username: String(username).trim().toLowerCase(), passwordHash });

        return res.status(201).json({
            ok: true,
            user: {
                _id: user._id,
                username: user.username,
            },
        });
    } catch (error) {
        console.error("Error en register:", error);
        return res.status(500).json({ ok: false, message: "Error creando usuario." });
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ ok: false, message: "Usuario y contraseña requeridos." });
        }

        const user = await Usuario.findOne({ username: String(username).trim().toLowerCase() });
        if (!user) {
            return res.status(401).json({ ok: false, message: "Credenciales inválidas." });
        }

        const valid = await bcrypt.compare(String(password), user.passwordHash);
        if (!valid) {
            return res.status(401).json({ ok: false, message: "Credenciales inválidas." });
        }

        const token = jwt.sign({ sub: user._id.toString(), username: user.username }, JWT_SECRET, {
            expiresIn: "7d",
        });

        return res.json({
            ok: true,
            token,
            user: {
                _id: user._id,
                username: user.username,
            },
        });
    } catch (error) {
        console.error("Error en login:", error);
        return res.status(500).json({ ok: false, message: "Error iniciando sesión." });
    }
};

module.exports = {
    register,
    login,
};
