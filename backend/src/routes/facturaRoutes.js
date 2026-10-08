const express = require("express");
const multer = require("multer");
const {
    guardarFactura,
    subirYAnalizarFactura,
    comprobarDuplicado,
    findProveedor,
    obtenerFacturaPorId,
    actualizarFactura,
    listarUltimasFacturas,
    listarFacturas,
    listarProveedores,
    listarProductosPorProveedor,
} = require("../controllers/facturasController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Definición de endpoints con sus controladores asignados
router.post("/", guardarFactura);
router.post("/upload", upload.single("factura"), subirYAnalizarFactura);
router.post("/check-duplicate", comprobarDuplicado);
router.post("/find-provider", findProveedor);
router.get("/history", listarUltimasFacturas);

// Proveedores
router.get("/providers", listarProveedores);
router.get("/providers/:id/products", listarProductosPorProveedor);
router.get("/products", require("../controllers/facturasController").listarProductos);

router.get("/:id", obtenerFacturaPorId);
router.put("/:id", actualizarFactura);
if (typeof listarFacturas === "function") {
    router.get("/", listarFacturas);
} else {
    console.warn("listarFacturas no disponible en facturasController; registrando handler temporal");
    router.get("/", (req, res) => res.status(500).json({ ok: false, message: "listarFacturas no disponible" }));
}

module.exports = router;