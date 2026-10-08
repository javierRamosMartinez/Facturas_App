import { Button, Input, Select } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import type { DashboardFiltersState, Provider } from "./dashboardTypes";

type DashboardFiltersProps = {
  filters: DashboardFiltersState;
  providers: Provider[];
  products: string[];
  onFilterChange: (
    field: keyof DashboardFiltersState,
    value: string,
  ) => void;
  onProviderChange: (providerId: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

function DashboardFilters({
  filters,
  providers,
  products,
  onFilterChange,
  onProviderChange,
  onSubmit,
}: DashboardFiltersProps) {
  return (
    <form onSubmit={onSubmit} className="dashboard-filters">
      <div className="filter-row">
        <Select
          allowClear
          placeholder="Todos los proveedores"
          value={filters.proveedor || undefined}
          onChange={(value) => onProviderChange(value || "")}
          options={providers.map((provider) => ({
            label: provider.nombre,
            value: provider._id,
          }))}
        />
        <Input
          placeholder="Nº factura"
          value={filters.numeroFactura}
          onChange={(event) =>
            onFilterChange("numeroFactura", event.target.value)
          }
        />
        <Input
          placeholder="Cliente"
          value={filters.clienteNombre}
          onChange={(event) =>
            onFilterChange("clienteNombre", event.target.value)
          }
        />
      </div>

      <div className="filter-row">
        <Input
          type="date"
          aria-label="Fecha desde"
          value={filters.fechaDesde}
          onChange={(event) =>
            onFilterChange("fechaDesde", event.target.value)
          }
        />
        <Input
          type="date"
          aria-label="Fecha hasta"
          value={filters.fechaHasta}
          onChange={(event) =>
            onFilterChange("fechaHasta", event.target.value)
          }
        />
        <Select
          allowClear
          placeholder="Todos los productos"
          value={filters.productoNombre || undefined}
          onChange={(value) =>
            onFilterChange("productoNombre", value || "")
          }
          options={products.map((name) => ({ label: name, value: name }))}
        />
      </div>

      <div className="filter-row filter-row-actions">
        <Input
          type="number"
          placeholder="Total min"
          value={filters.totalMin}
          onChange={(event) => onFilterChange("totalMin", event.target.value)}
        />
        <Input
          type="number"
          placeholder="Total max"
          value={filters.totalMax}
          onChange={(event) => onFilterChange("totalMax", event.target.value)}
        />
        <Button type="primary" htmlType="submit" icon={<FilterOutlined />}>
          Filtrar
        </Button>
      </div>
    </form>
  );
}

export default DashboardFilters;
