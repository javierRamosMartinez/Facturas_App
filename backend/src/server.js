const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/database");
const facturaRoutes = require("./routes/facturaRoutes");
const authRoutes = require("./routes/authRoutes");
const authMiddleware = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/facturas", authMiddleware, facturaRoutes);

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        message: "Backend funcionando correctamente"
    });
});

connectDB();

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});