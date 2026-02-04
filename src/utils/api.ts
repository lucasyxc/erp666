/**
 * ERP 后端 API 调用。需先登录，请求会带 Authorization: Bearer <access_token>。
 * 按机构 id 隔离：类别、品牌、供应商、厂家、系列、商品、光度模板的 CRUD。
 */
/** 部署时 VITE_ERP_API_BASE 设为 "" 表示同源 /api/（Nginx 代理）；用 ?? 保留空字符串，用 || 会回退到默认 */
const ERP_API_BASE =
  (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_ERP_API_BASE : undefined) ?? 'http://127.0.0.1:8001';

/** 外部验光平台地址（登录、患者建议等），与 login 使用同一 base */
const EXTERNAL_API_BASE =
  (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_LOGIN_API_BASE : undefined) ?? 'https://aiforoptometry.com';

export function getToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/** 登录后写入的机构 id，用于外部患者建议等 */
export function getOrganizationId(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem('organization_id') : null;
}

async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: object } = {}
): Promise<T> {
  const token = getToken();
  const { method = 'GET', body } = options;
  const res = await fetch(`${ERP_API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('未登录或登录已过期');
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || '请求失败');
  }
  return res.json();
}

export interface ProductFieldOptions {
  lensTypes: string[];
  refractiveIndexes: string[];
  coatings: string[];
  asphericDesigns: string[];
  materials: string[];
  functions: string[];
  seriesNames: string[];
}

/**
 * 获取指定类别下已录入商品中出现过的字段值（去重、排序），用于新建商品下拉选项。
 * 需已登录，否则返回 401。
 */
export async function getProductFieldOptions(categoryName: string): Promise<ProductFieldOptions> {
  const token = getToken();
  const url = `${ERP_API_BASE}/api/erp/product-field-options/?category_name=${encodeURIComponent(categoryName)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('未登录或登录已过期');
    }
    throw new Error(res.statusText || '请求失败');
  }
  return res.json();
}

/** 部分更新商品时可只传需要更新的字段（如 in_stock, validity_managed, manufacturer_id, supplier_id, power_range） */
export type UpdateProductPayload = Partial<CreateProductPayload> & {
  in_stock?: boolean;
  validity_managed?: boolean;
  manufacturer_id?: number;
  supplier_id?: number;
  power_range?: string[];
};

/**
 * 更新后端商品。需已登录；商品须属于当前机构。支持部分更新。
 */
export async function updateProduct(
  productId: number,
  payload: UpdateProductPayload
): Promise<{ id: number; name: string }> {
  const token = getToken();
  const url = `${ERP_API_BASE}/api/erp/products/${productId}/`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('未登录或登录已过期');
    }
    if (res.status === 404) {
      throw new Error('商品不存在');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || '更新失败');
  }
  return res.json();
}

export interface CreateProductPayload {
  category_name: string;
  brand_name: string;
  series_name?: string;
  manufacturer_name?: string;
  name: string;
  lens_type?: string;
  refractive_index?: string;
  coating?: string;
  functions?: string[];
  aspheric_design?: string;
  material?: string;
  price?: number;
  power_range?: string[];
  annotation?: string;
  in_stock?: boolean;
}

/**
 * 在后端创建商品（按机构、名称解析类别/品牌/系列/厂家），便于下拉选项从库中读取。
 * 需已登录。
 */
export async function createProduct(payload: CreateProductPayload): Promise<{ id: number; name: string }> {
  const token = getToken();
  const url = `${ERP_API_BASE}/api/erp/products/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('未登录或登录已过期');
    }
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText || '创建失败');
  }
  return res.json();
}

// ---------- 类别 ----------
export async function listCategories(): Promise<{ items: Array<{ id: string; name: string; createdAt: string }> }> {
  return apiRequest('/api/erp/categories/');
}
export async function createCategory(name: string): Promise<{ id: string; name: string; createdAt: string }> {
  return apiRequest('/api/erp/categories/create/', { method: 'POST', body: { name } });
}
export async function updateCategory(id: string, name: string): Promise<{ id: string; name: string; createdAt: string }> {
  return apiRequest(`/api/erp/categories/${id}/`, { method: 'PUT', body: { name } });
}
export async function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/categories/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 品牌 ----------
export async function listBrands(): Promise<{ items: Array<{ id: string; name: string; createdAt: string }> }> {
  return apiRequest('/api/erp/brands/');
}
export async function createBrand(name: string): Promise<{ id: string; name: string; createdAt: string }> {
  return apiRequest('/api/erp/brands/create/', { method: 'POST', body: { name } });
}
export async function updateBrand(id: string, name: string): Promise<{ id: string; name: string; createdAt: string }> {
  return apiRequest(`/api/erp/brands/${id}/`, { method: 'PUT', body: { name } });
}
export async function deleteBrand(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/brands/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 供应商 ----------
export async function listSuppliers(): Promise<{
  items: Array<{ id: string; name: string; contact?: string; phone?: string; address?: string; createdAt: string }>;
}> {
  return apiRequest('/api/erp/suppliers/');
}
export async function createSupplier(data: { name: string; contact?: string; phone?: string; address?: string }): Promise<unknown> {
  return apiRequest('/api/erp/suppliers/create/', { method: 'POST', body: data });
}
export async function updateSupplier(id: string, data: { name: string; contact?: string; phone?: string; address?: string }): Promise<unknown> {
  return apiRequest(`/api/erp/suppliers/${id}/`, { method: 'PUT', body: data });
}
export async function deleteSupplier(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/suppliers/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 生产厂家 ----------
export async function listManufacturers(): Promise<{
  items: Array<{ id: string; name: string; contact?: string; phone?: string; address?: string; createdAt: string }>;
}> {
  return apiRequest('/api/erp/manufacturers/');
}
export async function createManufacturer(data: { name: string; contact?: string; phone?: string; address?: string }): Promise<unknown> {
  return apiRequest('/api/erp/manufacturers/create/', { method: 'POST', body: data });
}
export async function updateManufacturer(id: string, data: { name: string; contact?: string; phone?: string; address?: string }): Promise<unknown> {
  return apiRequest(`/api/erp/manufacturers/${id}/`, { method: 'PUT', body: data });
}
export async function deleteManufacturer(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/manufacturers/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 系列 ----------
export async function listSeries(params?: { brandId?: string }): Promise<{
  items: Array<{ id: string; brandId: string; name: string; createdAt: string }>;
}> {
  const q = params?.brandId ? `?brand_id=${params.brandId}` : '';
  return apiRequest(`/api/erp/series/${q}`);
}
export async function createSeries(data: { brandId: string; name: string }): Promise<{ id: string; brandId: string; name: string; createdAt: string }> {
  return apiRequest('/api/erp/series/create/', { method: 'POST', body: { brand_id: parseInt(data.brandId, 10), name: data.name } });
}
export async function updateSeries(id: string, data: { name?: string; brandId?: string }): Promise<unknown> {
  const body: { name?: string; brand_id?: number } = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.brandId !== undefined) body.brand_id = parseInt(data.brandId, 10);
  return apiRequest(`/api/erp/series/${id}/`, { method: 'PUT', body });
}
export async function deleteSeries(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/series/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 商品列表与删除 ----------
export async function listProducts(params?: { categoryId?: string }): Promise<{ items: unknown[] }> {
  const path = params?.categoryId ? `/api/erp/products/?category_id=${params.categoryId}` : '/api/erp/products/';
  return apiRequest(path);
}
export async function deleteProductApi(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/products/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 光度范围模板 ----------
export async function listPowerRangeTemplates(): Promise<{
  items: Array<{ id: string; name: string; cells: string[]; createdAt: string }>;
}> {
  return apiRequest('/api/erp/power-range-templates/');
}
export async function createPowerRangeTemplate(data: { name: string; cells: string[] }): Promise<unknown> {
  return apiRequest('/api/erp/power-range-templates/create/', { method: 'POST', body: data });
}
export async function updatePowerRangeTemplate(id: string, data: { name?: string; cells?: string[] }): Promise<unknown> {
  return apiRequest(`/api/erp/power-range-templates/${id}/`, { method: 'PUT', body: data });
}
export async function deletePowerRangeTemplate(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/power-range-templates/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 价目册 ----------
export async function listPriceCatalogs(): Promise<{
  items: Array<{ id: string; name: string; productIds: string[]; createdAt: string }>;
}> {
  return apiRequest('/api/erp/price-catalogs/');
}
export async function createPriceCatalog(data: { name: string; productIds?: string[] }): Promise<{
  id: string;
  name: string;
  productIds: string[];
  createdAt: string;
}> {
  return apiRequest('/api/erp/price-catalogs/create/', { method: 'POST', body: { name: data.name, productIds: data.productIds ?? [] } });
}
export async function updatePriceCatalog(
  id: string,
  data: { name?: string; productIds?: string[] }
): Promise<{ id: string; name: string; productIds: string[]; createdAt: string }> {
  return apiRequest(`/api/erp/price-catalogs/${id}/`, { method: 'PUT', body: data });
}
export async function deletePriceCatalog(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/price-catalogs/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 采购价 ----------
export async function listPurchasePrices(): Promise<{
  items: Array<{ productId: string; price: number; createdAt: string }>;
}> {
  return apiRequest('/api/erp/purchase-prices/');
}
export async function setPurchasePrice(productId: number, price: number): Promise<{
  productId: string;
  price: number;
  createdAt: string;
}> {
  return apiRequest('/api/erp/purchase-prices/set/', { method: 'POST', body: { product_id: productId, price } });
}

// ---------- 采购单（采购列表） ----------
export async function listPurchaseListOrders(params?: { status?: string }): Promise<{
  items: Array<{
    id: string;
    orderNo: string;
    productId: string;
    productName: string;
    rows: Array<{ degree: string; quantity: number; unitPrice: number }>;
    status: string;
    createdAt: string;
    stockInAt: string | null;
  }>;
}> {
  const q = params?.status ? `?status=${encodeURIComponent(params.status)}` : '';
  return apiRequest(`/api/erp/purchase-list-orders${q}`);
}
export async function createPurchaseListOrder(data: {
  orderNo: string;
  productId: number;
  productName: string;
  rows: Array<{ degree: string; quantity: number; unitPrice: number }>;
}): Promise<{
  id: string;
  orderNo: string;
  productId: string;
  productName: string;
  rows: Array<{ degree: string; quantity: number; unitPrice: number }>;
  status: string;
  createdAt: string;
  stockInAt: string | null;
}> {
  return apiRequest('/api/erp/purchase-list-orders/create/', {
    method: 'POST',
    body: { orderNo: data.orderNo, productId: data.productId, productName: data.productName, rows: data.rows },
  });
}
export async function updatePurchaseListOrder(
  orderId: number,
  data: { rows?: Array<{ degree: string; quantity: number; unitPrice: number }>; status?: string; stockInAt?: string }
): Promise<{
  id: string;
  orderNo: string;
  productId: string;
  productName: string;
  rows: Array<{ degree: string; quantity: number; unitPrice: number }>;
  status: string;
  createdAt: string;
  stockInAt: string | null;
}> {
  return apiRequest(`/api/erp/purchase-list-orders/${orderId}/`, { method: 'PUT', body: data });
}
export async function deletePurchaseListOrder(orderId: number): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/purchase-list-orders/${orderId}/delete/`, { method: 'DELETE' });
}

// ---------- 库存预警配置 ----------
export async function listStockAlertConfigs(): Promise<{
  items: Array<{ productId: string; type: string; byDegree: Record<string, number>; threshold: number | null }>;
}> {
  return apiRequest('/api/erp/stock-alert-configs/');
}
export async function setStockAlertConfig(data: {
  productId: number;
  type: 'lens' | 'simple';
  byDegree?: Record<string, number>;
  threshold?: number;
}): Promise<{ productId: string; type: string; byDegree: Record<string, number>; threshold: number | null }> {
  return apiRequest('/api/erp/stock-alert-configs/set/', {
    method: 'POST',
    body: { productId: data.productId, type: data.type, byDegree: data.byDegree ?? {}, threshold: data.threshold },
  });
}
export async function removeStockAlertConfig(productId: number): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/stock-alert-configs/${productId}/remove/`, { method: 'DELETE' });
}

// ---------- 预警已采购商品 id 列表 ----------
export async function getStockAlertPurchasedIds(): Promise<{ productIds: string[] }> {
  return apiRequest('/api/erp/stock-alert-purchased/');
}
export async function setStockAlertPurchasedIds(productIds: string[]): Promise<{ productIds: string[] }> {
  return apiRequest('/api/erp/stock-alert-purchased/set/', { method: 'POST', body: { productIds } });
}
export async function addStockAlertPurchasedIds(productIds: string[]): Promise<{ productIds: string[] }> {
  return apiRequest('/api/erp/stock-alert-purchased/add/', { method: 'POST', body: { productIds } });
}

// ---------- 客户 ----------
export async function listCustomers(): Promise<{
  items: Array<{ id: string; name: string; gender?: string; phone?: string; createdAt: string }>;
}> {
  return apiRequest('/api/erp/customers/');
}
/** 外部患者管理系统患者建议：GET /patients/suggest?q=xxx&organization_id=xxx&limit=10，机构 id 从登录后 localStorage 读取 */
export interface ExternalPatient {
  id: number;
  name: string;
  phone: string;
  /** 性别，外部接口可能为 "男"/"女" 或 "male"/"female" */
  gender?: string | null;
  gkid?: string;
  identifiers?: string[];
  birthDate?: string | null;
}
export async function suggestExternalPatients(
  q: string,
  options?: { organizationId: string; limit?: number }
): Promise<{ patients: ExternalPatient[] }> {
  const query = (q || '').trim();
  const orgId = options?.organizationId ?? getOrganizationId();
  if (!query || !orgId) return { patients: [] };
  const limit = Math.min(50, Math.max(1, options?.limit ?? 10));
  const url = `${EXTERNAL_API_BASE}/patients/suggest/?q=${encodeURIComponent(query)}&organization_id=${encodeURIComponent(orgId)}&limit=${limit}`;
  const res = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) return { patients: [] };
  const data = (await res.json().catch(() => ({}))) as { patients?: ExternalPatient[] };
  return { patients: Array.isArray(data.patients) ? data.patients : [] };
}

/**
 * 患者管理系统：根据机构ID、患者ID获取历史主觉验光 + 散瞳主觉验光 BCVA（远/近）。
 * POST https://aiforoptometry.com/api/prescription/subjective_refraction_history
 * 返回结构待后端约定后补充类型。
 * 注意：若外部接口报错 "Field 'subjective_right_old_vision_level' expected a number but got ''"，
 * 需在外部接口侧将空字符串 '' 转为 null 或 0 等合法数值，勿直接按 number 解析。
 */
export async function fetchSubjectiveRefractionHistory(
  organizationId: number,
  patientId: number
): Promise<unknown> {
  const url = `${EXTERNAL_API_BASE}/api/prescription/subjective_refraction_history`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ organizationId, patientId }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = res.statusText || '请求失败';
    try {
      const json = JSON.parse(text) as { message?: string; error?: string };
      message = json.message ?? json.error ?? message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json();
}
export type CreateCustomerPayload = {
  name: string;
  gender?: string;
  phone?: string;
  /** 来自患者管理系统时：外部患者 id，后端据此及 identifiers 写入患者编号、患者档案号 */
  externalPatientId?: number;
  identifiers?: string[];
};
export async function createCustomer(data: CreateCustomerPayload): Promise<{
  id: string; name: string; gender?: string; phone?: string; createdAt: string;
  externalPatientId?: number | null; patientNumber?: string; patientArchiveNumber?: string;
}> {
  return apiRequest('/api/erp/customers/create/', { method: 'POST', body: data });
}
export async function updateCustomer(id: string, data: { name?: string; gender?: string; phone?: string }): Promise<unknown> {
  return apiRequest(`/api/erp/customers/${id}/`, { method: 'PUT', body: data });
}
/** 用患者管理系统最新数据更新本系统客户（仅当客户来自该外部患者时） */
export async function syncCustomerFromExternal(
  customerId: string,
  data: { externalPatientId: number; name: string; phone?: string; gender?: string; identifiers?: string[] },
): Promise<{ id: string; name: string; gender?: string; phone?: string; createdAt: string; externalPatientId?: number | null; patientNumber?: string; patientArchiveNumber?: string }> {
  return apiRequest(`/api/erp/customers/${customerId}/sync-external/`, { method: 'POST', body: data });
}
export async function deleteCustomer(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/customers/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 验光记录 ----------
export async function listRefractionRecords(params?: { customerId?: string }): Promise<{
  items: Array<{
    id: string; customerId: string; rows: unknown[];
    pdRight?: string; pdLeft?: string; pdBoth?: string;
    createdAt: string;
  }>;
}> {
  const path = params?.customerId
    ? `/api/erp/refraction-records/?customer_id=${encodeURIComponent(params.customerId)}`
    : '/api/erp/refraction-records/';
  return apiRequest(path);
}
export async function createRefractionRecord(data: {
  customerId: string; rows: unknown[];
  pdRight?: string; pdLeft?: string; pdBoth?: string;
}): Promise<unknown> {
  return apiRequest('/api/erp/refraction-records/create/', {
    method: 'POST',
    body: { customerId: data.customerId, rows: data.rows, pdRight: data.pdRight, pdLeft: data.pdLeft, pdBoth: data.pdBoth },
  });
}
export async function updateRefractionRecord(id: string, data: { rows?: unknown[]; pdRight?: string; pdLeft?: string; pdBoth?: string }): Promise<unknown> {
  return apiRequest(`/api/erp/refraction-records/${id}/`, { method: 'PUT', body: data });
}
export async function deleteRefractionRecord(id: string): Promise<{ ok: boolean }> {
  return apiRequest(`/api/erp/refraction-records/${id}/delete/`, { method: 'DELETE' });
}

// ---------- 销售单 ----------
export async function listSalesOrders(): Promise<{
  items: Array<{
    id: string; orderNo: string; date: string; customerId: string; customerName: string;
    items: Array<{ productId: string; productName: string; specDisplay: string; quantity: number; salesPrice: number }>;
    totalAmount: number; createdAt: string;
  }>;
}> {
  return apiRequest('/api/erp/sales-orders/');
}
export async function createSalesOrder(data: {
  date: string; customerId: string; customerName: string;
  items: Array<{ productId: string; productName: string; specDisplay: string; quantity: number; salesPrice: number }>;
}): Promise<{
  id: string; orderNo: string; date: string; customerId: string; customerName: string;
  items: unknown[]; totalAmount: number; createdAt: string;
}> {
  return apiRequest('/api/erp/sales-orders/create/', { method: 'POST', body: data });
}

// ---------- 销售出库记录 ----------
export async function listSalesOutboundRecords(): Promise<{
  items: Array<{
    id: string; salesOrderId: string; salesOrderNo: string; productId: string; productName: string;
    specDisplay: string; quantity: number; createdAt: string;
  }>;
}> {
  return apiRequest('/api/erp/sales-outbound/');
}

// ---------- 销售定制单 ----------
export async function listSalesCustomOrders(): Promise<{
  items: Array<{
    id: string; salesOrderId: string; salesOrderNo: string; productId: string; productName: string;
    specDisplay: string; quantity: number; createdAt: string;
  }>;
}> {
  return apiRequest('/api/erp/sales-custom/');
}
