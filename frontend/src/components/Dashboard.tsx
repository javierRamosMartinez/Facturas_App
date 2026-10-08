import { useEffect, useMemo, useState } from "react";
import DashboardFilters from "./DashboardFilters";
import DashboardResults from "./DashboardResults";
import { API } from "../config";
import type {
  DashboardFiltersState,
  FacturaItem,
  ProductAggregate,
  ProductPurchaseRow,
  Provider,
} from "./dashboardTypes";

type DashboardProps = {
  token: string;
  onInvoiceSelect: (invoiceId: string) => void;
};

const normalizeText = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const initialFilters: DashboardFiltersState = {
  proveedor: "",
  numeroFactura: "",
  clienteNombre: "",
  fechaDesde: "",
  fechaHasta: "",
  totalMin: "",
  totalMax: "",
  productoNombre: "",
  page: 1,
  limit: 25,
};

function Dashboard({ token, onInvoiceSelect }: DashboardProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [results, setResults] = useState<FacturaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerProducts, setProviderProducts] = useState<string[]>([]);
  const [allProducts, setAllProducts] = useState<string[]>([]);

  const selectedProductName = normalizeText(filters.productoNombre);

  const fetchList = async (page = 1) => {
    setLoading(true);

    const params = new URLSearchParams();
    Object.entries({ ...filters, page, limit: filters.limit }).forEach(
      ([key, value]) => {
        if (value !== null && value !== undefined && value !== "") {
          params.set(key, String(value));
        }
      },
    );

    const response = await fetch(`${API}/api/facturas?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (data.ok) {
      setResults(data.items || []);
      setTotal(data.total || 0);
    } else {
      setResults([]);
      setTotal(0);
    }

    setLoading(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    fetchList(1);
  };

  const handleFilterChange = (
    field: keyof DashboardFiltersState,
    value: string,
  ) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleProviderChange = async (providerId: string) => {
    setFilters((current) => ({
      ...current,
      proveedor: providerId,
      productoNombre: "",
    }));
    setProviderProducts([]);

    if (!providerId) return;

    try {
      const response = await fetch(
        `${API}/api/facturas/providers/${providerId}/products`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (data.ok && Array.isArray(data.items)) {
        setProviderProducts(data.items);
      }
    } catch (error) {
      console.error("Error cargando productos por proveedor:", error);
    }
  };

  useEffect(() => {
    const loadDashboardOptions = async () => {
      try {
        const providersResponse = await fetch(`${API}/api/facturas/providers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const providersData = await providersResponse.json();
        if (providersData.ok && Array.isArray(providersData.items)) {
          setProviders(providersData.items);
        }

        const productsResponse = await fetch(`${API}/api/facturas/products`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const productsData = await productsResponse.json();
        if (productsData.ok && Array.isArray(productsData.items)) {
          setAllProducts(productsData.items);
        }
      } catch (error) {
        console.error("Error cargando opciones del dashboard:", error);
      }
    };

    loadDashboardOptions();
  }, [token]);

  const productPurchases = useMemo<ProductPurchaseRow[]>(() => {
    if (!selectedProductName) return [];

    const rows: ProductPurchaseRow[] = [];
    results.forEach((invoice) => {
      const matchingProducts = (invoice.productos || []).filter(
        (product) =>
          normalizeText(product.nombre || "") === selectedProductName,
      );

      matchingProducts.forEach((product, index: number) => {
        rows.push({
          key: `${invoice._id || invoice.numeroFactura || "invoice"}-${index}`,
          invoiceId: invoice._id || "",
          fechaEmision: invoice.fechaEmision || "",
          proveedor:
            typeof invoice.proveedor === "string"
              ? invoice.proveedor
              : invoice.proveedor?.nombre || invoice.proveedor?._id || "",
          numeroFactura: invoice.numeroFactura || "",
          clienteNombre: invoice.clienteNombre || "",
          productoNombre: product.nombre || selectedProductName,
          cantidad: Number(product.cantidad || 0),
          precioUnitario: Number(product.precioUnitario || 0),
          importeTotal: Number(product.importeTotal || 0),
        });
      });
    });

    return rows;
  }, [results, selectedProductName]);

  const productAggregates = useMemo<ProductAggregate[]>(() => {
    if (selectedProductName) return [];

    const aggregates = new Map<string, { cantidad: number; importe: number }>();
    results.forEach((invoice) => {
      (invoice.productos || []).forEach((product) => {
        const name = String(product.nombre || "").trim();
        if (!name) return;
        const current = aggregates.get(name) || { cantidad: 0, importe: 0 };
        current.cantidad += Number(product.cantidad || 0);
        current.importe += Number(product.importeTotal || 0);
        aggregates.set(name, current);
      });
    });

    return Array.from(aggregates.entries()).map(([nombre, values]) => ({
      nombre,
      cantidad: values.cantidad,
      importe: values.importe,
    }));
  }, [results, selectedProductName]);

  const selectedProductAggregate = useMemo<ProductAggregate | null>(() => {
    if (!selectedProductName) return null;

    return {
      nombre: filters.productoNombre,
      cantidad: productPurchases.reduce(
        (sum, purchase) => sum + Number(purchase.cantidad || 0),
        0,
      ),
      importe: productPurchases.reduce(
        (sum, purchase) => sum + Number(purchase.importeTotal || 0),
        0,
      ),
    };
  }, [filters.productoNombre, productPurchases, selectedProductName]);

  return (
    <section className="panel dashboard-panel">
      <div className="dashboard-header">
        <div>
          <span className="eyebrow">Consulta</span>
          <h2>Facturas ya subidas</h2>
          <p className="panel-copy">
            Usa los filtros para localizar facturas, proveedores y productos.
          </p>
        </div>
      </div>

      <DashboardFilters
        filters={filters}
        providers={providers}
        products={providerProducts.length > 0 ? providerProducts : allProducts}
        onFilterChange={handleFilterChange}
        onProviderChange={handleProviderChange}
        onSubmit={handleSubmit}
      />

      <DashboardResults
        loading={loading}
        total={total}
        results={results}
        selectedProductName={selectedProductName}
        productPurchases={productPurchases}
        selectedProductAggregate={selectedProductAggregate}
        productAggregates={productAggregates}
        onInvoiceSelect={onInvoiceSelect}
      />
    </section>
  );
}

export default Dashboard;
