import type { Brand, Supplier, Manufacturer, Series, Product, Category, PowerRangeTemplate, PriceCatalog, PurchaseOrder, PurchaseListOrder, StockAlertConfig, Customer, RefractionRecord, SalesOrder, SalesOutboundRecord, SalesCustomOrder } from '../types';
import { DEFAULT_CATEGORIES } from '../types';

const STORAGE_KEYS = {
  BRANDS: 'erpxy_brands',
  CATEGORIES: 'erpxy_categories',
  SUPPLIERS: 'erpxy_suppliers',
  MANUFACTURERS: 'erpxy_manufacturers',
  SERIES: 'erpxy_series',
  PRODUCTS: 'erpxy_products',
  AUTH: 'erpxy_auth',
  POWER_RANGE_TEMPLATES: 'erpxy_power_range_templates',
  PRICE_CATALOGS: 'erpxy_price_catalogs',
  PURCHASE_PRICES: 'erpxy_purchase_prices',
  PURCHASE_ORDERS: 'erpxy_purchase_orders',
  PURCHASE_LIST: 'erpxy_purchase_list',
  STOCK_ALERTS: 'erpxy_stock_alerts',
  STOCK_ALERT_PURCHASED_IDS: 'erpxy_stock_alert_purchased_ids',
  CUSTOMERS: 'erpxy_customers',
  REFRACTION_RECORDS: 'erpxy_refraction_records',
  SALES_ORDERS: 'erpxy_sales_orders',
  SALES_OUTBOUND: 'erpxy_sales_outbound',
  SALES_CUSTOM: 'erpxy_sales_custom',
} as const;

function load<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? (JSON.parse(data) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** 生成唯一 id（时间戳 + 随机后缀，避免同一毫秒内重复） */
function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// 品牌
export const brandStorage = {
  getAll: (): Brand[] => load(STORAGE_KEYS.BRANDS, []),
  add: (item: Omit<Brand, 'id' | 'createdAt'>) => {
    const list = brandStorage.getAll();
    // 检查是否已存在同名品牌
    if (list.some((b) => b.name === item.name)) {
      throw new Error('品牌名称已存在');
    }
    const newItem: Brand = {
      ...item,
      id: `brand_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.BRANDS, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<Brand, 'id' | 'createdAt'>>) => {
    const list = brandStorage.getAll();
    const index = list.findIndex((b) => b.id === id);
    if (index === -1) {
      throw new Error('品牌不存在');
    }
    if (updates.name !== undefined) {
      if (list.some((b) => b.name === updates.name && b.id !== id)) {
        throw new Error('品牌名称已存在');
      }
    }
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.BRANDS, list);
    return list[index];
  },
  delete: (id: string) => {
    const list = brandStorage.getAll();
    const filtered = list.filter((b) => b.id !== id);
    if (filtered.length === list.length) {
      throw new Error('品牌不存在');
    }
    save(STORAGE_KEYS.BRANDS, filtered);
  },
};

// 类别
export const categoryStorage = {
  getAll: (): Category[] => {
    const stored = load<Category[]>(STORAGE_KEYS.CATEGORIES, []);
    // 如果存储为空，初始化默认类别
    if (stored.length === 0) {
      const defaultCategories: Category[] = DEFAULT_CATEGORIES.map((cat, idx) => ({
        id: `category_${cat.value}`,
        name: cat.label,
        createdAt: new Date(Date.now() - (DEFAULT_CATEGORIES.length - idx) * 1000).toISOString(),
      }));
      save(STORAGE_KEYS.CATEGORIES, defaultCategories);
      return defaultCategories;
    }
    return stored;
  },
  add: (item: Omit<Category, 'id' | 'createdAt'>) => {
    const list = categoryStorage.getAll();
    // 检查是否已存在同名类别
    if (list.some((c) => c.name === item.name)) {
      throw new Error('类别名称已存在');
    }
    const newItem: Category = {
      ...item,
      id: `category_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.CATEGORIES, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<Category, 'id' | 'createdAt'>>) => {
    const list = categoryStorage.getAll();
    const index = list.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error('类别不存在');
    }
    if (updates.name !== undefined) {
      if (list.some((c) => c.name === updates.name && c.id !== id)) {
        throw new Error('类别名称已存在');
      }
    }
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.CATEGORIES, list);
    return list[index];
  },
};

// 供应商
export const supplierStorage = {
  getAll: (): Supplier[] => load(STORAGE_KEYS.SUPPLIERS, []),
  add: (item: Omit<Supplier, 'id' | 'createdAt'>) => {
    const list = supplierStorage.getAll();
    if (list.some((s) => s.name === item.name)) {
      throw new Error('供应商名称已存在');
    }
    const newItem: Supplier = {
      ...item,
      id: `supplier_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.SUPPLIERS, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<Supplier, 'id' | 'createdAt'>>) => {
    const list = supplierStorage.getAll();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error('供应商不存在');
    }
    if (updates.name !== undefined) {
      if (list.some((s) => s.name === updates.name && s.id !== id)) {
        throw new Error('供应商名称已存在');
      }
    }
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.SUPPLIERS, list);
    return list[index];
  },
  delete: (id: string) => {
    const list = supplierStorage.getAll();
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length === list.length) {
      throw new Error('供应商不存在');
    }
    save(STORAGE_KEYS.SUPPLIERS, filtered);
  },
};

// 生产厂家
export const manufacturerStorage = {
  getAll: (): Manufacturer[] => load(STORAGE_KEYS.MANUFACTURERS, []),
  add: (item: Omit<Manufacturer, 'id' | 'createdAt'>) => {
    const list = manufacturerStorage.getAll();
    if (list.some((m) => m.name === item.name)) {
      throw new Error('厂家名称已存在');
    }
    const newItem: Manufacturer = {
      ...item,
      id: `manufacturer_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.MANUFACTURERS, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<Manufacturer, 'id' | 'createdAt'>>) => {
    const list = manufacturerStorage.getAll();
    const index = list.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('生产厂家不存在');
    }
    if (updates.name !== undefined) {
      if (list.some((m) => m.name === updates.name && m.id !== id)) {
        throw new Error('厂家名称已存在');
      }
    }
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.MANUFACTURERS, list);
    return list[index];
  },
  delete: (id: string) => {
    const list = manufacturerStorage.getAll();
    const filtered = list.filter((m) => m.id !== id);
    if (filtered.length === list.length) {
      throw new Error('生产厂家不存在');
    }
    save(STORAGE_KEYS.MANUFACTURERS, filtered);
  },
};

// 系列
export const seriesStorage = {
  getAll: (): Series[] => load(STORAGE_KEYS.SERIES, []),
  getByBrandId: (brandId: string): Series[] =>
    seriesStorage.getAll().filter((s) => s.brandId === brandId),
  add: (item: Omit<Series, 'id' | 'createdAt'>) => {
    const list = seriesStorage.getAll();
    const newItem: Series = {
      ...item,
      id: `series_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.SERIES, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<Series, 'id' | 'createdAt'>>) => {
    const list = seriesStorage.getAll();
    const index = list.findIndex((s) => s.id === id);
    if (index === -1) {
      throw new Error('系列不存在');
    }
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.SERIES, list);
    return list[index];
  },
  delete: (id: string) => {
    const list = seriesStorage.getAll();
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length === list.length) {
      throw new Error('系列不存在');
    }
    save(STORAGE_KEYS.SERIES, filtered);
  },
};

// 商品
export const productStorage = {
  getAll: (): Product[] => load(STORAGE_KEYS.PRODUCTS, []),
  add: (item: Omit<Product, 'id' | 'createdAt'>) => {
    const list = productStorage.getAll();
    const newItem: Product = {
      ...item,
      id: uniqueId('product'),
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.PRODUCTS, list);
    return newItem;
  },
  delete: (id: string) => {
    const list = productStorage.getAll();
    const filtered = list.filter((item) => item.id !== id);
    save(STORAGE_KEYS.PRODUCTS, filtered);
  },
  update: (id: string, updates: Partial<Omit<Product, 'id' | 'createdAt'>>) => {
    const list = productStorage.getAll();
    const index = list.findIndex((item) => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      save(STORAGE_KEYS.PRODUCTS, list);
      return list[index];
    }
    return null;
  },
};

// 登录态：后端登录用 access_token；兼容旧演示用 AUTH
const AUTH_KEYS = [
  'access_token',
  'refresh_token',
  'organization_id',
  'organization_name',
  'organization',
  'current_username',
  'csrftoken',
  STORAGE_KEYS.AUTH,
] as const;

export const authStorage = {
  /** 演示用：仅写本地，不调后端（已由 utils/login 接管真实登录） */
  login: (username: string) => {
    save(STORAGE_KEYS.AUTH, { username, loggedAt: new Date().toISOString() });
  },
  logout: () => {
    AUTH_KEYS.forEach((k) => localStorage.removeItem(k));
  },
  isLoggedIn: () =>
    !!localStorage.getItem('access_token') || !!localStorage.getItem(STORAGE_KEYS.AUTH),
};

// 光度范围模板
export const powerRangeTemplateStorage = {
  getAll: (): PowerRangeTemplate[] => load(STORAGE_KEYS.POWER_RANGE_TEMPLATES, []),
  add: (item: Omit<PowerRangeTemplate, 'id' | 'createdAt'>) => {
    const list = powerRangeTemplateStorage.getAll();
    const newItem: PowerRangeTemplate = {
      ...item,
      id: `template_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.POWER_RANGE_TEMPLATES, list);
    return newItem;
  },
  delete: (id: string) => {
    const list = powerRangeTemplateStorage.getAll();
    const filtered = list.filter((item) => item.id !== id);
    save(STORAGE_KEYS.POWER_RANGE_TEMPLATES, filtered);
  },
};

// 价目册
export const priceCatalogStorage = {
  getAll: (): PriceCatalog[] => load(STORAGE_KEYS.PRICE_CATALOGS, []),
  get: (id: string): PriceCatalog | undefined =>
    priceCatalogStorage.getAll().find((c) => c.id === id),
  add: (item: Omit<PriceCatalog, 'id' | 'createdAt'>) => {
    const list = priceCatalogStorage.getAll();
    const newItem: PriceCatalog = {
      ...item,
      id: `catalog_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.PRICE_CATALOGS, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<PriceCatalog, 'id' | 'createdAt'>>) => {
    const list = priceCatalogStorage.getAll();
    const index = list.findIndex((c) => c.id === id);
    if (index === -1) return;
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.PRICE_CATALOGS, list);
  },
  delete: (id: string) => {
    const list = priceCatalogStorage.getAll();
    const filtered = list.filter((c) => c.id !== id);
    save(STORAGE_KEYS.PRICE_CATALOGS, filtered);
  },
};

// 采购价格（按 productId 存储，每商品一个价格数值）
type PurchasePriceMap = Record<string, number>;

export const purchasePriceStorage = {
  getAll: (): PurchasePriceMap => load(STORAGE_KEYS.PURCHASE_PRICES, {}),
  getPrice: (productId: string): number | undefined => {
    const map = purchasePriceStorage.getAll();
    const v = map[productId];
    return v === undefined ? undefined : Number(v);
  },
  setPrice: (productId: string, price: number) => {
    const map = purchasePriceStorage.getAll();
    map[productId] = price;
    save(STORAGE_KEYS.PURCHASE_PRICES, map);
  },
  deleteByProductId: (productId: string) => {
    const map = purchasePriceStorage.getAll();
    delete map[productId];
    save(STORAGE_KEYS.PURCHASE_PRICES, map);
  },
};

// 采购单
export const purchaseOrderStorage = {
  getAll: (): PurchaseOrder[] => load(STORAGE_KEYS.PURCHASE_ORDERS, []),
  add: (item: Omit<PurchaseOrder, 'id' | 'createdAt'>) => {
    const list = purchaseOrderStorage.getAll();
    const newItem: PurchaseOrder = {
      ...item,
      id: `po_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.PURCHASE_ORDERS, list);
    return newItem;
  },
};

// 采购列表（镜片采购单等），单号格式：CG + 日期YYYYMMDD + 两位序号
function nextOrderNo(): string {
  const list = purchaseListStorage.getAll();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const todayOrders = list.filter((o) => o.orderNo.startsWith(`CG${today}`));
  const maxSeq = todayOrders.length
    ? Math.max(...todayOrders.map((o) => parseInt(o.orderNo.slice(10) || '0', 10)), 0)
    : 0;
  return `CG${today}${String(maxSeq + 1).padStart(2, '0')}`;
}

// 预警采购单号：YJ + 日期YYYYMMDD + 两位序号
function nextYJOrderNo(): string {
  const list = purchaseListStorage.getAll();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const todayOrders = list.filter((o) => o.orderNo.startsWith(`YJ${today}`));
  const maxSeq = todayOrders.length
    ? Math.max(...todayOrders.map((o) => parseInt(o.orderNo.slice(10) || '0', 10)), 0)
    : 0;
  return `YJ${today}${String(maxSeq + 1).padStart(2, '0')}`;
}

export const purchaseListStorage = {
  getAll: (): PurchaseListOrder[] => load(STORAGE_KEYS.PURCHASE_LIST, []),
  add: (item: Omit<PurchaseListOrder, 'id' | 'orderNo' | 'createdAt' | 'status'>, options?: { orderNoPrefix?: 'YJ' }) => {
    const list = purchaseListStorage.getAll();
    const orderNo = options?.orderNoPrefix === 'YJ' ? nextYJOrderNo() : nextOrderNo();
    const newItem: PurchaseListOrder = {
      ...item,
      id: uniqueId('pl'),
      orderNo,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.PURCHASE_LIST, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Pick<PurchaseListOrder, 'rows' | 'status' | 'stockInAt'>>) => {
    const list = purchaseListStorage.getAll();
    const idx = list.findIndex((o) => o.id === id);
    if (idx === -1) return undefined;
    const nextList = list.map((o, i) => (i === idx ? { ...o, ...updates } : o));
    save(STORAGE_KEYS.PURCHASE_LIST, nextList);
    return nextList[idx];
  },
  getById: (id: string): PurchaseListOrder | undefined => purchaseListStorage.getAll().find((o) => o.id === id),
};

/** 库存预警配置：key 为 productId */
export const stockAlertStorage = {
  getAll: (): Record<string, StockAlertConfig> => load(STORAGE_KEYS.STOCK_ALERTS, {}),
  get: (productId: string): StockAlertConfig | undefined => stockAlertStorage.getAll()[productId],
  set: (productId: string, config: StockAlertConfig) => {
    const all = stockAlertStorage.getAll();
    all[productId] = config;
    save(STORAGE_KEYS.STOCK_ALERTS, all);
  },
  remove: (productId: string) => {
    const all = stockAlertStorage.getAll();
    delete all[productId];
    save(STORAGE_KEYS.STOCK_ALERTS, all);
  },
};

// 客户
export const customerStorage = {
  getAll: (): Customer[] => load(STORAGE_KEYS.CUSTOMERS, []),
  add: (item: Omit<Customer, 'id' | 'createdAt'>) => {
    const list = customerStorage.getAll();
    const newItem: Customer = {
      ...item,
      id: uniqueId('customer'),
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.CUSTOMERS, list);
    return newItem;
  },
  update: (id: string, updates: Partial<Omit<Customer, 'id' | 'createdAt'>>) => {
    const list = customerStorage.getAll();
    const index = list.findIndex((c) => c.id === id);
    if (index === -1) return undefined;
    list[index] = { ...list[index], ...updates };
    save(STORAGE_KEYS.CUSTOMERS, list);
    return list[index];
  },
  getById: (id: string): Customer | undefined => customerStorage.getAll().find((c) => c.id === id),
};

// 客户历史验光数据（用于导入）
export const refractionRecordStorage = {
  getAll: (): RefractionRecord[] => load(STORAGE_KEYS.REFRACTION_RECORDS, []),
  getByCustomerId: (customerId: string): RefractionRecord[] =>
    refractionRecordStorage.getAll().filter((r) => r.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getLatestByCustomerId: (customerId: string): RefractionRecord | undefined =>
    refractionRecordStorage.getByCustomerId(customerId)[0],
  add: (item: Omit<RefractionRecord, 'id' | 'createdAt'>) => {
    const list = refractionRecordStorage.getAll();
    const newItem: RefractionRecord = {
      ...item,
      id: uniqueId('rr'),
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.REFRACTION_RECORDS, list);
    return newItem;
  },
};

function nextSalesOrderNo(): string {
  const list = load<SalesOrder[]>(STORAGE_KEYS.SALES_ORDERS, []);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const todayOrders = list.filter((o) => o.orderNo.startsWith(`XS${today}`));
  const maxSeq = todayOrders.length
    ? Math.max(...todayOrders.map((o) => parseInt(o.orderNo.slice(10) || '0', 10)), 0)
    : 0;
  return `XS${today}${String(maxSeq + 1).padStart(2, '0')}`;
}

export const salesOrderStorage = {
  getAll: (): SalesOrder[] => load(STORAGE_KEYS.SALES_ORDERS, []),
  add: (item: Omit<SalesOrder, 'id' | 'orderNo' | 'createdAt'>) => {
    const list = salesOrderStorage.getAll();
    const orderNo = nextSalesOrderNo();
    const date = new Date().toISOString().slice(0, 10);
    const newItem: SalesOrder = {
      ...item,
      id: uniqueId('so'),
      orderNo,
      date: item.date || date,
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.SALES_ORDERS, list);
    return newItem;
  },
};

export const salesOutboundStorage = {
  getAll: (): SalesOutboundRecord[] => load(STORAGE_KEYS.SALES_OUTBOUND, []),
  add: (item: Omit<SalesOutboundRecord, 'id' | 'createdAt'>) => {
    const list = salesOutboundStorage.getAll();
    const newItem: SalesOutboundRecord = {
      ...item,
      id: uniqueId('sout'),
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.SALES_OUTBOUND, list);
    return newItem;
  },
};

export const salesCustomStorage = {
  getAll: (): SalesCustomOrder[] => load(STORAGE_KEYS.SALES_CUSTOM, []),
  add: (item: Omit<SalesCustomOrder, 'id' | 'createdAt'>) => {
    const list = salesCustomStorage.getAll();
    const newItem: SalesCustomOrder = {
      ...item,
      id: uniqueId('sc'),
      createdAt: new Date().toISOString(),
    };
    list.push(newItem);
    save(STORAGE_KEYS.SALES_CUSTOM, list);
    return newItem;
  },
};

/** 库存预警列表中已采购的商品 ID（从预警发起采购并确认后标记为已采购；商品补货后不再在预警列表时从集合中移除） */
export const stockAlertPurchasedStorage = {
  getAll: (): string[] => load(STORAGE_KEYS.STOCK_ALERT_PURCHASED_IDS, []),
  add: (productIds: string[]) => {
    const set = new Set(stockAlertPurchasedStorage.getAll());
    productIds.forEach((id) => set.add(id));
    save(STORAGE_KEYS.STOCK_ALERT_PURCHASED_IDS, Array.from(set));
  },
  setAll: (productIds: string[]) => {
    save(STORAGE_KEYS.STOCK_ALERT_PURCHASED_IDS, productIds);
  },
};
