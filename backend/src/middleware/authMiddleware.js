const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "facturas-app-secret-change-me";

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

        if (!token) {
            return res.status(401).json({ ok: false, message: "Token requerido." });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ ok: false, message: "Token inválido o expirado." });
    }
};

module.exports = authMiddleware;
