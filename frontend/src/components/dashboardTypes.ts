export type DashboardFiltersState = {
  proveedor: string;
  numeroFactura: string;
  clienteNombre: string;
  fechaDesde: string;
  fechaHasta: string;
  totalMin: string;
  totalMax: string;
  productoNombre: string;
  page: number;
  limit: number;
};

export type Provider = {
  _id: string;
  nombre: string;
  cif?: string;
};

export type ProductItem = {
  nombre?: string;
  cantidad?: number;
  precioUnitario?: number;
  importeTotal?: number;
};

export type FacturaItem = {
  _id?: string;
  fechaEmision?: string;
  proveedor?: string | Provider;
  numeroFactura?: string;
  clienteNombre?: string;
  totalFactura?: number;
  productos?: ProductItem[];
};

export type ProductPurchaseRow = {
  key: string;
  invoiceId: string;
  fechaEmision: string;
  proveedor: string;
  numeroFactura: string;
  clienteNombre: string;
  productoNombre: string;
  cantidad: number;
  precioUnitario: number;
  importeTotal: number;
};

export type ProductAggregate = {
  nombre: string;
  cantidad: number;
  importe: number;
};
