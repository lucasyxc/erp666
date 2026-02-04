// 商品类别（默认初始类别）
export const DEFAULT_CATEGORIES = [
  { value: 'lens', label: '镜片' },
  { value: 'frame', label: '镜架' },
  { value: 'finished_glasses', label: '成品眼镜' },
  { value: 'care_solution', label: '护理液' },
  { value: 'eye_care', label: '护眼产品' },
  { value: 'contact_lens', label: '角膜接触镜' },
  { value: 'service', label: '服务' },
  { value: 'equipment', label: '器械类' },
] as const;

// 类别
export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export type CategoryValue = string; // 改为动态字符串类型

// 品牌
export interface Brand {
  id: string;
  name: string;
  createdAt: string;
}

// 供应商
export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

// 生产厂家
export interface Manufacturer {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

// 系列（可选，与品牌关联）
export interface Series {
  id: string;
  brandId: string;
  name: string;
  createdAt: string;
}

// 镜片类型选项
export const LENS_TYPES = [
  { value: 'single_vision', label: '单光' },
  { value: 'progressive', label: '渐进' },
  { value: 'bifocal', label: '双光' },
  { value: 'reading', label: '老花' },
  { value: 'computer', label: '防蓝光' },
  { value: 'photochromic', label: '变色' },
  { value: 'polarized', label: '偏光' },
  { value: 'other', label: '其他' },
] as const;

// 折射率选项
export const REFRACTIVE_INDEX = [
  { value: '1.50', label: '1.50' },
  { value: '1.56', label: '1.56' },
  { value: '1.60', label: '1.60' },
  { value: '1.67', label: '1.67' },
  { value: '1.74', label: '1.74' },
  { value: 'other', label: '其他' },
] as const;

// 膜层选项
export const LENS_COATING = [
  { value: 'none', label: '无膜层' },
  { value: 'hard_coating', label: '加硬膜' },
  { value: 'anti_reflective', label: '减反射膜' },
  { value: 'anti_blue_light', label: '防蓝光膜' },
  { value: 'anti_uv', label: '防紫外线膜' },
  { value: 'anti_fog', label: '防雾膜' },
  { value: 'multi_coating', label: '多层膜' },
  { value: 'other', label: '其他' },
] as const;

// 功能选项（多选）
export const LENS_FUNCTIONS = [
  { value: 'anti_blue_light', label: '防蓝光' },
  { value: 'photochromic', label: '变色' },
  { value: 'tinted', label: '染色' },
  { value: 'multi_focus', label: '多点离焦' },
  { value: 'point_diffusion', label: '点扩散' },
  { value: 'point_matrix', label: '点矩阵' },
] as const;

// 非球面设计选项
export const ASPHERIC_DESIGN_OPTIONS = [
  { value: 'spherical', label: '球面' },
  { value: 'aspheric', label: '非球面' },
  { value: 'double_aspheric', label: '双非球面' },
  { value: 'freeform', label: '自由曲面' },
] as const;

// 成品镜类型选项
export const FINISHED_GLASSES_TYPES = [
  { value: 'reading_glasses', label: '老花镜' },
  { value: 'sunglasses', label: '太阳镜' },
  { value: 'prescription_glasses', label: '处方镜' },
  { value: 'safety_glasses', label: '防护镜' },
  { value: 'sports_glasses', label: '运动镜' },
  { value: 'computer_glasses', label: '电脑镜' },
  { value: 'other', label: '其他' },
] as const;

// 商品名称
export interface Product {
  id: string;
  /** 后端商品 id，新建时同步到后端后写入，用于编辑时同步更新 */
  backendId?: number;
  name: string;
  category: CategoryValue;
  brandId?: string; // 可选（服务类别不需要品牌）
  seriesId?: string; // 可选
  supplierId?: string; // 供应商
  manufacturerId?: string;
  lensType?: string; // 镜片类型（仅镜片类别使用）
  refractiveIndex?: string; // 折射率（仅镜片类别使用）
  coating?: string; // 膜层（仅镜片类别使用）
  functions?: string[]; // 功能（多选，仅镜片类别使用）
  asphericDesign?: string; // 非球面设计（仅镜片类别使用）：球面、非球面、双非球面、自由曲面
  material?: string; // 材质（仅镜片类别使用）
  finishedGlassesType?: string; // 成品镜类型（仅成品眼镜类别使用）
  specification?: string; // 规格（仅护理液、护理产品类别使用）
  validityMonths?: number; // 有效期，单位：个月（仅护理产品、角膜接触镜使用）
  validityManaged?: boolean; // 效期管理：true=是，false=否（仅护理产品类别使用）
  design?: string; // 设计（仅角膜接触镜使用）
  contactLensMaterial?: string; // 材质（仅角膜接触镜使用）
  model?: string; // 型号（仅器械类使用）
  price?: number; // 零售价格
  powerRange?: string[]; // 光度范围（选中的单元格，格式：行索引_柱镜值）
  inStock?: boolean; // 库存状态：true=有库存，false=无库存
  isStockLens?: boolean; // 现片/定制片：true=现片，false=定制片
  isBoutique?: boolean; // 精品：true=精品（仅镜架类别使用）
  annotation?: string; // 标注，若有则在商品名称后显示为「名称（标注）」
  createdAt: string;
}

/** 若商品有标注则返回「名称（标注）」，否则返回名称（使用全角括号） */
export function getProductDisplayName(p: { name: string; annotation?: string }): string {
  return p.annotation && p.annotation.trim()
    ? `${p.name}（${p.annotation.trim()}）`
    : p.name;
}

/** 商品参数 组合显示（用于销售明细等）；不含镜片类型/折射率（单光、1.60 等） */
export function getProductSpecDisplay(p: Product): string {
  const parts = [
    p.specification,
    p.model,
    p.finishedGlassesType,
  ]
    .filter(Boolean)
    .map((s) => (String(s ?? '').trim()))
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : '—';
}

// 光度范围模板
export interface PowerRangeTemplate {
  id: string;
  name: string;
  cells: string[]; // 选中的单元格，格式：行索引_柱镜值
  createdAt: string;
}

// 价目册
export interface PriceCatalog {
  id: string;
  name: string;
  productIds: string[];
  createdAt: string;
}

// 采购单明细
export interface PurchaseOrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

// 采购单
export interface PurchaseOrder {
  id: string;
  supplierId: string;
  items: PurchaseOrderItem[];
  createdAt: string;
}

// 镜片采购行：每个光度一行
export interface LensPurchaseRow {
  degree: string;   // 光度描述，如 "-3.00/-0.50"
  quantity: number;
  unitPrice: number;
}

// 采购列表中的采购单（支持镜片按光度明细）
export interface PurchaseListOrder {
  id: string;
  orderNo: string;  // 采购单号，如 CG2025012801
  productId: string;
  productName: string;
  rows: LensPurchaseRow[];
  status: 'active' | 'cancelled';
  createdAt: string;
  stockInAt?: string; // 入库时间（ISO 字符串），有值表示已入库
}

// 客户（销售用）
export interface Customer {
  id: string;
  name: string;
  gender?: 'male' | 'female'; // 男、女
  phone?: string;
  createdAt: string;
  /** 来自患者管理系统时的外部患者 id，用于下拉去重等 */
  externalPatientId?: number | null;
  patientNumber?: string;
  patientArchiveNumber?: string;
}

/** 验光数据单眼一行：眼别 + 球镜、柱镜、轴位、矫正视力、下加光、棱镜（水平/垂直） */
export type RefractionEye = 'right' | 'left';

export interface RefractionRow {
  eye: RefractionEye;
  sphere: string;       // 球镜，可输入 +/-，两位小数
  cylinder: string;     // 柱镜，范围 0～6.00，步长 0.25，两位小数，自动负号
  axis: string;         // 轴位
  correctedVA: string;  // 矫正视力：主视力（如 1.0、0.5）+ 可选右上标（+1、-2 等）
  addPower: string;     // 下加光，范围 0.50～4.00，步长 0.25，两位小数，自动正号
  prismHoriz: 'BI' | 'BD' | '';  // 棱镜水平方向
  prismHorizDelta: string;       // 棱镜水平棱镜度
  prismVert: 'BU' | 'BD' | '';   // 棱镜垂直方向
  prismVertDelta: string;        // 棱镜垂直棱镜度
}

/** 客户历史验光数据（用于导入） */
export interface RefractionRecord {
  id: string;
  customerId: string;
  rows: RefractionRow[];
  /** 瞳距（mm）：右眼、左眼、双眼 */
  pdRight?: string;
  pdLeft?: string;
  pdBoth?: string;
  createdAt: string;
}

/** 销售明细行：添加的商品，含序列号、名称、规格/型号/色号/光度、数量、零售价、折扣、销售价 */
export interface SaleItem {
  id: string;
  productId: string;
  /** 序列号（表格行号，从 1 开始） */
  serialNumber: number;
  /** 商品名称（含标注） */
  productName: string;
  /** 商品参数 组合显示 */
  specDisplay: string;
  quantity: number;
  /** 零售价格（单价） */
  retailPrice: number;
  /** 折扣（如 0.9 表示 9 折） */
  discount: number;
  /** 销售价格（本行金额，一般 = 零售价 * 数量 * 折扣） */
  salesPrice: number;
}

/** 销售单（开单后持久化）：单号 XS+日期YYYYMMDD+序号 */
export interface SalesOrder {
  id: string;
  orderNo: string;
  date: string;
  customerId: string;
  customerName: string;
  items: { productId: string; productName: string; specDisplay: string; quantity: number; salesPrice: number }[];
  totalAmount: number;
  createdAt: string;
}

/** 销售出库记录（开单且在库时扣减库存并写入） */
export interface SalesOutboundRecord {
  id: string;
  salesOrderId: string;
  salesOrderNo: string;
  productId: string;
  productName: string;
  specDisplay: string;
  quantity: number;
  createdAt: string;
}

/** 销售定制单（开单且无库存时写入，采购管理-销售定制展示） */
export interface SalesCustomOrder {
  id: string;
  salesOrderId: string;
  salesOrderNo: string;
  productId: string;
  productName: string;
  specDisplay: string;
  quantity: number;
  createdAt: string;
}

/** 镜片库存预警：按光度（cellKey）设置预警数量，库存 ≤ 该值时预警 */
export type StockAlertLens = { type: 'lens'; byDegree: Record<string, number> };

/** 非镜片库存预警：单一数量阈值，库存 ≤ 该值时预警 */
export type StockAlertSimple = { type: 'simple'; threshold: number };

export type StockAlertConfig = StockAlertLens | StockAlertSimple;

