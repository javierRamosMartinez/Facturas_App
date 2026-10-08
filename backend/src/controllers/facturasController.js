const mongoose = require("mongoose");
const Factura = require("../models/Factura");
const Proveedor = require("../models/Proveedor");
const { analizarFactura } = require("../services/azureDocumentIntelligence");
// Escapar texto para usar en RegExp construidas a partir de entrada de usuario
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizarNombreProveedor = (nombre) => {
    if (!nombre) return "";

    return String(nombre)
        .replace(/\s*[-|/\\]\s*/g, " ")
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\b(?:CIF|NIF|DNI|VAT|NIE|ID)\s*[:\-]?\s*[A-Z0-9\-\/\.]+/gi, "")
        .replace(/\b(?:ES|FR|DE|IT|PT)\s*[A-Z0-9]\d{7,8}\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();
};

// Guardar factura en MongoDB
const guardarFactura = async (req, res) => {
    try {
        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ ok: false, message: "No se han recibido datos en el cuerpo de la petición." });
        }

        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        // Verificar/crear proveedor antes de guardar la factura
        const proveedorValor = req.body.proveedor ? String(req.body.proveedor).trim() : null;
        let proveedorDoc = null;

        if (req.body.cifProveedor) {
            proveedorDoc = await Proveedor.findOne({ cif: new RegExp(`^${escapeRegex(req.body.cifProveedor.trim())}$`, "i") });
        }

        if (!proveedorDoc && proveedorValor) {
            const nombreNormalizado = normalizarNombreProveedor(proveedorValor);
            const proveedorDB = await Proveedor.findOne({
                usuario: usuarioId,
                nombre: new RegExp(`^${escapeRegex(nombreNormalizado)}$`, "i")
            });
            if (proveedorDB) proveedorDoc = proveedorDB;
        }

        if (!proveedorDoc && proveedorValor) {
            if (mongoose.isValidObjectId(proveedorValor)) {
                proveedorDoc = await Proveedor.findById(proveedorValor);
            }
        }

        if (!proveedorDoc && proveedorValor) {
            const nombreNormalizado = normalizarNombreProveedor(proveedorValor);
            proveedorDoc = await Proveedor.findOne({
                $or: [
                    { nombre: new RegExp(`^${escapeRegex(nombreNormalizado)}$`, "i") },
                    { nombre: new RegExp(`^${escapeRegex(proveedorValor)}$`, "i") },
                ],
            });
        }

        if (!proveedorDoc) {
            const nuevoProveedor = new Proveedor({
                usuario: usuarioId,
                nombre: proveedorValor || "Proveedor desconocido",
                cif: req.body.cifProveedor,
                registroSanitario: req.body.registroSanitario,
            });

            proveedorDoc = await nuevoProveedor.save();
        }

        if (proveedorDoc.usuario && String(proveedorDoc.usuario) !== String(usuarioId)) {
            return res.status(403).json({ ok: false, message: "No tienes permisos sobre ese proveedor." });
        }

        // Reemplazar el campo proveedor por el ObjectId del documento
        req.body.proveedor = proveedorDoc._id;
        req.body.usuario = usuarioId;

        const nuevaFactura = new Factura(req.body);
        const facturaGuardada = await nuevaFactura.save();

        return res.status(201).json({ ok: true, message: "Factura guardada con éxito en MongoDB", datos: facturaGuardada });
    } catch (error) {
        console.error("Error al guardar la factura:", error);
        return res.status(400).json({ ok: false, message: "Error de validación o fallo al guardar en la base de datos", error: error.message });
    }
};

// Procesar con Azure Document Intelligence
const subirYAnalizarFactura = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                message: "No se ha recibido ningún archivo",
            });
        }

        //console.debug("subirYAnalizarFactura - file:", { originalname: req.file.originalname, size: req.file.size });
        let resultadoEstructurado;
        try {
            resultadoEstructurado = await analizarFactura(req.file.buffer);
        } catch (innerErr) {
            console.error("Error interno en analizarFactura:", innerErr && innerErr.stack ? innerErr.stack : innerErr);
            throw innerErr;
        }

        // Intentar resolver proveedor devuelto por Azure a un _id de Proveedor
        try {
            const provFromAzure = resultadoEstructurado && resultadoEstructurado.proveedor ? String(resultadoEstructurado.proveedor).trim() : "";
            const cifFromAzure = resultadoEstructurado && resultadoEstructurado.cifProveedor ? String(resultadoEstructurado.cifProveedor).trim() : "";
            const usuarioId = req.user?.sub || req.user?._id;

            let provDoc = null;
            if (provFromAzure) {
                const proveedorNormalizado = normalizarNombreProveedor(provFromAzure);
                const nombreCandidates = [
                    proveedorNormalizado,
                    provFromAzure,
                    provFromAzure.replace(/\s+/g, " "),
                ].filter(Boolean);

                if (mongoose.isValidObjectId(provFromAzure)) {
                    provDoc = await Proveedor.findOne({ _id: provFromAzure, usuario: usuarioId }).select("nombre cif registroSanitario").lean();
                }

                if (!provDoc) {
                    for (const candidate of nombreCandidates) {
                        provDoc = await Proveedor.findOne({
                            usuario: usuarioId,
                            nombre: new RegExp(`^${escapeRegex(candidate)}$`, "i"),
                        }).select("nombre cif registroSanitario").lean();
                        if (provDoc) break;
                    }
                }
            }

            if (!provDoc && cifFromAzure) {
                provDoc = await Proveedor.findOne({
                    usuario: usuarioId,
                    cif: new RegExp(`^${escapeRegex(cifFromAzure)}$`, "i"),
                }).select("nombre cif registroSanitario").lean();
            }

            if (provDoc) {
                resultadoEstructurado.proveedor = provDoc._id;
                resultadoEstructurado.cifProveedor = provDoc.cif || resultadoEstructurado.cifProveedor;
                resultadoEstructurado.registroSanitario = provDoc.registroSanitario || resultadoEstructurado.registroSanitario;
            } else if (provFromAzure) {
                resultadoEstructurado.proveedor = provFromAzure;
            }
        } catch (resolveErr) {
            console.error("Error resolviendo proveedor tras análisis Azure:", resolveErr);
        }

        return res.status(200).json({
            ok: true,
            filename: req.file.originalname,
            datosFactura: resultadoEstructurado,
        });
    } catch (error) {
        console.error("Error analizando la factura:", error);
        return res.status(500).json({
            ok: false,
            message: "Error analizando la factura",
            error: error.message,
        });
    }
};

// Comprobar si la factura existe
const comprobarDuplicado = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        const { proveedor, numeroFactura } = req.body;

        if (!proveedor || !numeroFactura) {
            return res.status(400).json({
                ok: false,
                message: "Proveedor y número de factura requeridos.",
            });
        }

        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        // Resolver proveedor (puede venir nombre, cif o _id)
        let proveedorId = proveedor;
        if (!mongoose.isValidObjectId(proveedor)) {
            const proveedorDoc = await Proveedor.findOne({
                $or: [
                    { nombre: new RegExp(`^${escapeRegex(String(proveedor).trim())}$`, "i") },
                    { cif: new RegExp(`^${escapeRegex(String(proveedor).trim())}$`, "i") },
                ],
            });
            if (proveedorDoc) proveedorId = proveedorDoc._id;
        }

        const facturaExistente = await Factura.findOne({
            usuario: usuarioId,
            proveedor: mongoose.isValidObjectId(proveedorId) ? proveedorId : null,
            numeroFactura: new RegExp(`^${escapeRegex(String(numeroFactura).trim())}$`, "i"),
        });

        if (facturaExistente) {
            return res.json({
                ok: true,
                existe: true,
                facturaId: facturaExistente._id,
                fechaEmision: facturaExistente.fechaEmision,
            });
        }

        return res.json({ ok: true, existe: false });
    } catch (error) {
        console.error("Error al comprobar duplicado:", error);
        return res.status(500).json({ ok: false, message: "Error interno del servidor" });
    }
};

// Buscar proveedor por nombre o CIF
const findProveedor = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        const { proveedor, cifProveedor } = req.body;

        if (!proveedor && !cifProveedor) {
            return res.status(400).json({ ok: false, message: "Nombre o CIF de proveedor requerido" });
        }

        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        const query = [];
        if (proveedor) {
            query.push({ nombre: new RegExp(`^${escapeRegex(String(proveedor).trim())}$`, "i") });
        }
        if (cifProveedor) {
            query.push({ cif: new RegExp(`^${escapeRegex(String(cifProveedor).trim())}$`, "i") });
        }

        const proveedorDoc = await Proveedor.findOne({ usuario: usuarioId, $or: query });

        if (!proveedorDoc) return res.json({ ok: true, exists: false });

        return res.json({ ok: true, exists: true, proveedor: proveedorDoc });
    } catch (error) {
        console.error("Error buscando proveedor:", error);
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
};

const obtenerFacturaPorId = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        const factura = await Factura.findOne({ _id: req.params.id, usuario: usuarioId })
            .populate("proveedor", "nombre cif registroSanitario")
            .lean();

        if (!factura) {
            return res.status(404).json({ ok: false, message: "Factura no encontrada." });
        }

        return res.json({ ok: true, item: factura });
    } catch (error) {
        console.error("Error obteniendo factura por id:", error);
        return res.status(500).json({ ok: false, message: "Error interno al recuperar la factura." });
    }
};

const actualizarFactura = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        const facturaExistente = await Factura.findOne({ _id: req.params.id, usuario: usuarioId });
        if (!facturaExistente) {
            return res.status(404).json({ ok: false, message: "Factura no encontrada." });
        }

        const datos = { ...req.body };
        delete datos._id;
        delete datos.__v;
        delete datos.createdAt;
        delete datos.updatedAt;

        const proveedorValor = datos.proveedor ? String(datos.proveedor).trim() : null;
        let proveedorDoc = null;

        if (datos.cifProveedor) {
            proveedorDoc = await Proveedor.findOne({ cif: new RegExp(`^${escapeRegex(datos.cifProveedor.trim())}$`, "i") });
        }

        if (!proveedorDoc && proveedorValor) {
            const nombreNormalizado = normalizarNombreProveedor(proveedorValor);
            proveedorDoc = await Proveedor.findOne({
                usuario: usuarioId,
                nombre: new RegExp(`^${escapeRegex(nombreNormalizado)}$`, "i")
            });
        }

        if (!proveedorDoc && proveedorValor) {
            if (mongoose.isValidObjectId(proveedorValor)) {
                proveedorDoc = await Proveedor.findById(proveedorValor);
            }
        }

        if (!proveedorDoc && proveedorValor) {
            const nombreNormalizado = normalizarNombreProveedor(proveedorValor);
            proveedorDoc = await Proveedor.findOne({
                usuario: usuarioId,
                $or: [
                    { nombre: new RegExp(`^${escapeRegex(nombreNormalizado)}$`, "i") },
                    { nombre: new RegExp(`^${escapeRegex(proveedorValor)}$`, "i") },
                ],
            });
        }

        if (!proveedorDoc && proveedorValor) {
            proveedorDoc = await new Proveedor({
                usuario: usuarioId,
                nombre: proveedorValor || "Proveedor desconocido",
                cif: datos.cifProveedor,
                registroSanitario: datos.registroSanitario,
            }).save();
        }

        if (proveedorDoc && proveedorDoc.usuario && String(proveedorDoc.usuario) !== String(usuarioId)) {
            return res.status(403).json({ ok: false, message: "No tienes permisos sobre ese proveedor." });
        }

        datos.proveedor = proveedorDoc ? proveedorDoc._id : facturaExistente.proveedor;
        datos.usuario = usuarioId;

        const facturaActualizada = await Factura.findByIdAndUpdate(
            req.params.id,
            { $set: datos },
            { new: true, runValidators: true }
        ).populate("proveedor", "nombre cif registroSanitario");

        return res.json({ ok: true, item: facturaActualizada.toObject ? facturaActualizada.toObject() : facturaActualizada });
    } catch (error) {
        console.error("Error actualizando factura:", error);
        return res.status(500).json({ ok: false, message: "Error interno al actualizar la factura.", error: error.message });
    }
};

const listarUltimasFacturas = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        const limit = Math.min(Number(req.query.limit || 25), 100);
        const items = await Factura.find({ usuario: usuarioId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("proveedor", "nombre cif registroSanitario")
            .lean();

        return res.json({ ok: true, items });
    } catch (error) {
        console.error("Error listando últimas facturas:", error);
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
};



// Listar y filtrar facturas
const listarFacturas = async (req, res) => {
    try {
        const {
            proveedor,
            numeroFactura,
            clienteNombre,
            fechaDesde,
            fechaHasta,
            totalMin,
            totalMax,
            productoNombre,
            page = 1,
            limit = 50,
            sortBy = "fechaEmision",
            sortDir = "desc",
        } = req.query;

        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) {
            return res.status(401).json({ ok: false, message: "Usuario no autenticado." });
        }

        const query = { usuario: usuarioId };

        //console.debug("listarFacturas - req.query:", req.query);

        // Proveedor puede venir como id, nombre o CIF
        if (proveedor) {
            const prov = String(proveedor);
            if (mongoose.isValidObjectId(prov)) {
                // si es un ObjectId válido, permitimos facturas donde proveedor sea el id
                // o donde el proveedor esté guardado como nombre en texto (compatibilidad)
                const provDoc = await Proveedor.findOne({ _id: prov, usuario: usuarioId }).select("nombre").lean();
                if (provDoc) {
                    const provNombre = String(provDoc.nombre || "").trim();
                    if (provNombre) {
                        query.$or = [
                            { proveedor: prov },
                            { $expr: { $regexMatch: { input: { $toString: "$proveedor" }, regex: `^${escapeRegex(provNombre)}$`, options: "i" } } },
                        ];
                    } else {
                        query.proveedor = prov;
                    }
                } else {
                    query.proveedor = prov;
                }
            } else {
                // puede venir como nombre o CIF; intentar resolver a id
                const provDoc = await Proveedor.findOne({
                    usuario: usuarioId,
                    $or: [
                        { nombre: new RegExp(`^${escapeRegex(String(prov).trim())}$`, "i") },
                        { cif: new RegExp(`^${escapeRegex(String(prov).trim())}$`, "i") },
                    ],
                });
                if (provDoc) {
                    query.proveedor = provDoc._id;
                } else {
                    // si no existe proveedor en colección, comparar contra el valor textual guardado en el campo
                    const provTrim = String(prov).trim();
                    if (provTrim) {
                        query.$expr = { $regexMatch: { input: { $toString: "$proveedor" }, regex: `^${escapeRegex(provTrim)}$`, options: "i" } };
                    }
                }
            }
        }

        if (numeroFactura) {
            query.numeroFactura = new RegExp(`^${escapeRegex(String(numeroFactura).trim())}$`, "i");
        }

        if (clienteNombre) {
            query.clienteNombre = new RegExp(escapeRegex(String(clienteNombre).trim()), "i");
        }

        if (fechaDesde || fechaHasta) {
            query.fechaEmision = {};
            if (fechaDesde) query.fechaEmision.$gte = new Date(String(fechaDesde));
            if (fechaHasta) query.fechaEmision.$lte = new Date(String(fechaHasta));
        }

        if (totalMin || totalMax) {
            query.totalFactura = {};
            if (totalMin) query.totalFactura.$gte = Number(totalMin);
            if (totalMax) query.totalFactura.$lte = Number(totalMax);
        }

        if (productoNombre) {
            query["productos.nombre"] = new RegExp(escapeRegex(String(productoNombre).trim()), "i");
        }

        const skip = (Number(page) - 1) * Number(limit);
        const sortObj = { [String(sortBy)]: sortDir === "asc" ? 1 : -1 };

        //console.debug("listarFacturas - mongo query:", JSON.stringify(query));
        try {
            const [items, total] = await Promise.all([
                Factura.find(query).sort(sortObj).skip(skip).limit(Number(limit)).lean(),
                Factura.countDocuments(query),
            ]);

            // Resolver proveedores manualmente para evitar errores de cast cuando
            // en algunas facturas el campo `proveedor` está guardado como texto
            const proveedorIds = Array.from(new Set(items
                .map((f) => f.proveedor)
                .filter((p) => mongoose.isValidObjectId(p))
            ));

            let proveedoresMap = {};
            if (proveedorIds.length > 0) {
                const proveedoresDocs = await Proveedor.find({ _id: { $in: proveedorIds }, usuario: usuarioId }).select("nombre cif").lean();
                proveedoresMap = proveedoresDocs.reduce((acc, pd) => { acc[String(pd._id)] = pd; return acc; }, {});
            }

            const itemsPopulated = items.map((f) => {
                const prov = f.proveedor;
                if (prov && mongoose.isValidObjectId(prov)) {
                    return { ...f, proveedor: proveedoresMap[String(prov)] || prov };
                }
                // si ya es texto o vacío, dejar tal cual
                return f;
            });

            return res.json({ ok: true, items: itemsPopulated, total, page: Number(page), limit: Number(limit) });
        } catch (dbErr) {
            console.error("Error ejecutando consulta en listarFacturas:", dbErr);
            return res.status(500).json({ ok: false, message: "Error en la consulta a la base de datos", error: dbErr.message });
        }
    } catch (error) {
        console.error("Error listando facturas:", error);
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
};

// Listar proveedores (simple: nombre, cif, _id)
const listarProveedores = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) return res.status(401).json({ ok: false, message: "Usuario no autenticado." });

        const items = await Proveedor.find({ usuario: usuarioId }).select("nombre cif").lean();
        return res.json({ ok: true, items });
    } catch (error) {
        console.error("Error listando proveedores:", error);
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
};

// Obtener lista de nombres de productos asociados a un proveedor (por id)
const listarProductosPorProveedor = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) return res.status(401).json({ ok: false, message: "Usuario no autenticado." });

        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, message: "Proveedor id inválido" });

        const facturas = await Factura.find({ usuario: usuarioId, proveedor: id }).select("productos.nombre").lean();
        const nombres = new Set();
        facturas.forEach((f) => {
            (f.productos || []).forEach((p) => {
                if (p && p.nombre) nombres.add(String(p.nombre).trim());
            });
        });

        return res.json({ ok: true, items: Array.from(nombres) });
    } catch (error) {
        console.error("Error listando productos por proveedor:", error);
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
};

// Listar todos los productos únicos existentes en las facturas
const listarProductos = async (req, res) => {
    try {
        const usuarioId = req.user?.sub || req.user?._id;
        if (!usuarioId) return res.status(401).json({ ok: false, message: "Usuario no autenticado." });

        const facturas = await Factura.find({ usuario: usuarioId }).select("productos.nombre").lean();
        const nombres = new Set();
        facturas.forEach((f) => {
            (f.productos || []).forEach((p) => {
                if (p && p.nombre) nombres.add(String(p.nombre).trim());
            });
        });

        return res.json({ ok: true, items: Array.from(nombres) });
    } catch (error) {
        console.error("Error listando productos:", error);
        return res.status(500).json({ ok: false, message: "Error interno" });
    }
};

module.exports = {
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
    listarProductos,
};