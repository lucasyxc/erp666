import { useState, useCallback, useMemo, useEffect, type ReactNode } from 'react';
import { Tabs, Card, Input, Button, Modal, Form, Select, App, AutoComplete, Table, InputNumber } from 'antd';
import { UserAddOutlined, DeleteOutlined } from '@ant-design/icons';
import { pinyin } from 'pinyin-pro';
import {
  isLoggedIn,
  getOrganizationId,
  listCustomers,
  createCustomer as createCustomerApi,
  suggestExternalPatients,
  syncCustomerFromExternal,
  fetchSubjectiveRefractionHistory,
  listRefractionRecords,
  listSalesOrders,
  createSalesOrder as createSalesOrderApi,
  listProducts,
  listCategories,
  listPurchaseListOrders,
} from '../../utils/api';
import type { ExternalPatient } from '../../utils/api';
import { customerStorage, refractionRecordStorage, productStorage, purchaseListStorage, categoryStorage, salesOrderStorage, salesOutboundStorage, salesCustomStorage } from '../../utils/storage';
import type { Category, Customer, RefractionRow, RefractionEye, RefractionRecord, SaleItem, Product, SalesOrder, LensPurchaseRow, PurchaseListOrder } from '../../types';
import { getProductDisplayName, getProductSpecDisplay } from '../../types';
import './index.css';

const EYE_LABELS: Record<RefractionEye, string> = { right: '右眼', left: '左眼' };

const PRISM_HORIZ_OPTIONS = [
  { value: 'BI', label: 'BI' },
  { value: 'BD', label: 'BD' },
];

const PRISM_VERT_OPTIONS = [
  { value: 'BU', label: 'BU' },
  { value: 'BD', label: 'BD' },
];

/** 折扣固定选项：4、5、6、7、8、9、10 折（默认 10 折）。内部存 0.4～1 */
const DISCOUNT_OPTION_VALUES = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] as const;
const DISCOUNT_OPTIONS = [4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: n / 10, label: `${n}折` }));

function isDiscountInOptions(d: number): boolean {
  return DISCOUNT_OPTION_VALUES.some((v) => Math.abs(v - d) < 1e-6);
}

function formatDiscountLabel(d: number): string {
  const n = Math.round(d * 100) / 10;
  return n % 1 === 0 ? `${Math.round(n)}折` : `${n}折`;
}

/** 将数值字符串格式化为两位小数，如 "2.2" -> "2.20"，"2.256" -> "2.26" */
function formatToTwoDecimals(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const n = parseFloat(t);
  if (Number.isNaN(n)) return t;
  return n.toFixed(2);
}

/** 球镜输入：仅允许 +/- 开头 + 数字，最多两位小数 */
function restrictSphereInput(value: string): string {
  const sign = value.startsWith('+') || value.startsWith('-') ? value[0] : '';
  const rest = sign ? value.slice(1) : value;
  const match = rest.match(/^\d*(\.\d{0,2})?/);
  const numPart = match ? match[0] : '';
  return sign + numPart;
}

/** 数值输入（柱镜、下加光）：仅允许数字，最多两位小数 */
function restrictTwoDecimalInput(value: string): string {
  const match = value.replace(/[^\d.]/g, '').match(/^\d*(\.\d{0,2})?/);
  return match ? match[0] : '';
}

/** 瞳距输入（mm）：仅允许非负数字，最多一位小数 */
function restrictPdInput(value: string): string {
  const match = value.replace(/[^\d.]/g, '').match(/^\d*(\.\d{0,1})?/);
  return match ? match[0] : '';
}

const CYLINDER_MIN = 0;
const CYLINDER_MAX = 6;
const ADD_POWER_MIN = 0.5;
const ADD_POWER_MAX = 4;
const REFRACTION_STEP = 0.25;

/** 将数值限制在 [min, max] 并按步长 0.25 取整，返回两位小数字符串 */
function clampAndSnapToStep(value: number, min: number, max: number, step: number): string {
  const clamped = Math.max(min, Math.min(max, value));
  const snapped = Math.round(clamped / step) * step;
  return snapped.toFixed(2);
}

/** 矫正视力：解析为主视力 + 可选右上标（+、-、+1、-2 等，输入 + 或 - 即按右上标显示） */
function parseCorrectedVA(value: string): { main: string; suffix: string } {
  const m = value.trim().match(/^(.+?)([+-]\d*)$/);
  if (m) return { main: m[1].trim(), suffix: m[2] };
  return { main: value.trim(), suffix: '' };
}

function createEmptyRefractionRow(eye: RefractionEye): RefractionRow {
  return {
    eye,
    sphere: '',
    cylinder: '',
    axis: '',
    correctedVA: '',
    addPower: '',
    prismHoriz: '',
    prismHorizDelta: '',
    prismVert: '',
    prismVertDelta: '',
  };
}

/** 单眼验光格式：球镜/柱镜×轴位° | ADD：下加光 | 水平棱镜 棱镜度△ | 垂直棱镜 棱镜度△，无数据部分不显示；轴位、棱镜度带单位，球镜柱镜下加光不加 */
function formatRefractionRow(row: RefractionRow): string {
  const parts: string[] = [];
  const sphere = (row.sphere ?? '').trim();
  const cylinder = (row.cylinder ?? '').trim();
  const axis = (row.axis ?? '').trim();
  if (sphere || cylinder || axis) {
    const cylPart = cylinder ? `/${cylinder.startsWith('-') ? cylinder : `-${cylinder}`}` : '';
    parts.push(`${sphere || ''}${cylPart}${axis ? `×${axis}°` : ''}`);
  }
  const addPower = (row.addPower ?? '').trim();
  if (addPower) parts.push(`ADD：${addPower.startsWith('+') ? addPower : `+${addPower}`}`);
  const pH = (row.prismHoriz ?? '').trim();
  const pHDelta = (row.prismHorizDelta ?? '').trim();
  if (pH && pHDelta) parts.push(`${pH} ${pHDelta}△`);
  const pV = (row.prismVert ?? '').trim();
  const pVDelta = (row.prismVertDelta ?? '').trim();
  if (pV && pVDelta) parts.push(`${pV} ${pVDelta}△`);
  return parts.join(' | ');
}

function hasRefractionData(rows: RefractionRow[]): boolean {
  return rows.some(
    (r) =>
      (r.sphere ?? '').trim() ||
      (r.cylinder ?? '').trim() ||
      (r.axis ?? '').trim() ||
      (r.addPower ?? '').trim() ||
      ((r.prismHoriz ?? '').trim() && (r.prismHorizDelta ?? '').trim()) ||
      ((r.prismVert ?? '').trim() && (r.prismVertDelta ?? '').trim()),
  );
}

/** 是否为验光数据格式（右：... 左：... 或 右眼：... 左眼：...），此类不在下拉选项中显示 */
function isRefractionFormat(s: string): boolean {
  const t = (s ?? '').trim();
  if (!t) return false;
  return (/[右][眼]?：/.test(t) && /[左][眼]?：/.test(t));
}

/** 从单眼验光字符串解析出 RefractionRow（用于销售单 specDisplay 导入） */
function parseOneEyeSpec(eye: RefractionEye, partStr: string): RefractionRow {
  const part = (partStr ?? '').trim();
  const row = createEmptyRefractionRow(eye);
  if (!part) return row;
  const sphereMatch = part.match(/^([+-]?\d+(?:\.\d+)?)/);
  if (sphereMatch) row.sphere = sphereMatch[1];
  const cylMatch = part.match(/\/(-?\d+(?:\.\d+)?)/);
  if (cylMatch) row.cylinder = cylMatch[1].startsWith('-') ? cylMatch[1].slice(1) : cylMatch[1];
  const axisMatch = part.match(/×(\d+)°?/);
  if (axisMatch) row.axis = axisMatch[1];
  const addMatch = part.match(/ADD[：:]\s*([+-]?\d+(?:\.\d+)?)/i);
  if (addMatch) row.addPower = addMatch[1].startsWith('+') ? addMatch[1].slice(1) : addMatch[1];
  const prismHMatch = part.match(/(BI|BD)\s+(\d+(?:\.\d+)?)\s*△?/);
  if (prismHMatch) {
    row.prismHoriz = prismHMatch[1] as 'BI' | 'BD';
    row.prismHorizDelta = prismHMatch[2];
  }
  const prismVMatch = part.match(/(BU|BD)\s+(\d+(?:\.\d+)?)\s*△?/);
  if (prismVMatch) {
    row.prismVert = prismVMatch[1] as 'BU' | 'BD';
    row.prismVertDelta = prismVMatch[2];
  }
  const vaMatch = part.match(/(\d+(?:\.\d+)?)\s*([+-]\d*)?(?:\s*\||$)/);
  if (vaMatch && !row.sphere && !row.cylinder) {
    row.correctedVA = vaMatch[1] + (vaMatch[2] ?? '');
  }
  return row;
}

/** 将销售单商品参数（右：... ；左：...）解析为 RefractionRow[]，解析失败返回 null */
function parseSpecDisplayToRefractionRows(specDisplay: string): RefractionRow[] | null {
  const s = (specDisplay ?? '').trim();
  if (!s || !isRefractionFormat(s)) return null;
  const m = s.match(/右[眼]?[：:]\s*([\s\S]+?)\s*[；;]\s*左[眼]?[：:]\s*([\s\S]+)/);
  if (!m) return null;
  const rightPart = m[1].trim();
  const leftPart = m[2].trim();
  const rightRow = parseOneEyeSpec('right', rightPart);
  const leftRow = parseOneEyeSpec('left', leftPart);
  return [rightRow, leftRow];
}

/** 双眼验光字符串，用于镜片商品参数：右：... ；左：...（不含瞳距） */
function formatRefractionForSpec(rows: RefractionRow[]): string {
  const EYE_LABELS: Record<RefractionEye, string> = { right: '右', left: '左' };
  const ordered = rows.slice().sort((a, b) => (a.eye === 'right' ? -1 : b.eye === 'right' ? 1 : 0));
  const parts = ordered
    .map((row) => {
      const s = formatRefractionRow(row);
      return s ? `${EYE_LABELS[row.eye]}：${s}` : '';
    })
    .filter(Boolean);
  return parts.join(' ；');
}

/** FIFO 扣减采购单库存；degree 与 row.degree 精确匹配（镜架型号/色号、镜片球镜柱镜、其他 "—"） */
function deductPurchaseStock(productId: string, degree: string, qty: number): void {
  const all = purchaseListStorage.getAll();
  const orders = all
    .filter((o) => o.productId === productId && o.stockInAt != null && String(o.stockInAt).trim() !== '')
    .sort((a, b) => (a.stockInAt ?? '').localeCompare(b.stockInAt ?? ''));
  let remain = qty;
  for (const order of orders) {
    if (remain <= 0) break;
    const newRows: LensPurchaseRow[] = [];
    for (const row of order.rows) {
      const d = (row.degree ?? '').trim() || '—';
      if (d !== degree) {
        newRows.push({ ...row });
        continue;
      }
      const take = Math.min(remain, row.quantity);
      remain -= take;
      if (row.quantity - take > 0) {
        newRows.push({ ...row, quantity: row.quantity - take });
      }
    }
    if (newRows.length !== order.rows.length || newRows.some((r, i) => r.quantity !== order.rows[i]?.quantity)) {
      purchaseListStorage.update(order.id, { rows: newRows });
    }
  }
}

const LENS_SPEC_CHOICE_VALUES = ['__双眼__', '__右眼__', '__左眼__'] as const;
type LensSpecChoice = '双眼' | '右眼' | '左眼';

/** 可导入的历史验光：来自验光记录表 或 来自销售单商品参数 */
type ImportableRefraction =
  | { source: 'record'; record: RefractionRecord }
  | { source: 'order'; orderId: string; orderNo: string; date: string; createdAt: string; specDisplay: string };

/** 患者管理系统主观验光历史接口返回：单次检查中的 subjective 结构 */
interface ExternalSubjective {
  right_spherical?: string | null;
  right_cylindrical?: string | null;
  right_axis?: number | null;
  left_spherical?: string | null;
  left_cylindrical?: string | null;
  left_axis?: number | null;
  right_old_vision?: string | null;
  right_old_vision_sign?: string | null;
  right_old_vision_level?: number | null;
  left_old_vision?: string | null;
  left_old_vision_sign?: string | null;
  left_old_vision_level?: number | null;
  both_pupil_distance?: string | null;
  right_near_add_power?: string | null;
  left_near_add_power?: string | null;
}

/** 患者管理系统主观验光历史接口：list 中单条检查 */
interface ExternalRefractionListItem {
  exam_id: number;
  examination_date: string;
  subjective?: ExternalSubjective | null;
}

/** 患者管理系统主观验光历史接口完整返回 */
interface ExternalRefractionHistoryResponse {
  ok?: boolean;
  list?: ExternalRefractionListItem[];
}

/** 视力显示规则：第二位小数不为零保留两位（如 0.05），第二位小数为零保留一位（如 1.2） */
function formatVisionDisplay(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  if (!v) return '—';
  const n = parseFloat(v);
  if (Number.isNaN(n)) return v;
  if (Math.round(n * 100) % 10 === 0) return n.toFixed(1);
  return n.toFixed(2);
}

/** 球镜、柱镜、下加光：强制两位小数显示 */
function formatTwoDecimalsForDisplay(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
  if (Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

/** 矫正视力临床显示：vision 为主值（按视力规则格式化），vision_sign + vision_level 为右上角标，如 1.2⁺¹ */
function formatCorrectedVisionDisplay(
  vision: string | null | undefined,
  visionSign: string | null | undefined,
  visionLevel: number | null | undefined,
): ReactNode {
  const v = formatVisionDisplay(vision);
  if (v === '—') return '—';
  const sign = (visionSign ?? '').trim();
  const level = visionLevel != null ? String(visionLevel) : '';
  const sup = sign || level ? `${sign}${level}` : '';
  if (!sup) return v;
  return (
    <span>
      {v}
      <sup style={{ marginLeft: 1 }}>{sup}</sup>
    </span>
  );
}

/** 球镜、柱镜、下加光：强制两位小数存入表单 */
function toTwoDecimalsString(value: string | null | undefined, stripLeadingPlusMinus = false): string {
  const v = (value ?? '').trim();
  if (stripLeadingPlusMinus) {
    const vv = v.replace(/^[+-]/, '').trim();
    if (!vv) return '';
    const n = parseFloat(vv);
    return Number.isNaN(n) ? vv : n.toFixed(2);
  }
  if (!v) return '';
  const n = parseFloat(v);
  return Number.isNaN(n) ? v : n.toFixed(2);
}

/** 将患者管理系统单条检查的 subjective 转为本系统 RefractionRow[] 及瞳距 */
function externalSubjectiveToRefraction(
  subjective: ExternalSubjective | null | undefined,
): { rows: RefractionRow[]; pdBoth: string } {
  const s = subjective ?? {};
  const visionToCorrectedVA = (
    v: string | null | undefined,
    sign: string | null | undefined,
    level: number | null | undefined,
  ) => {
    const vv = (v ?? '').trim();
    if (!vv) return '';
    const formatted = formatVisionDisplay(vv);
    if (formatted === '—') return '';
    const ss = (sign ?? '').trim();
    const ll = level != null ? String(level) : '';
    return formatted + ss + ll;
  };
  const rightRow: RefractionRow = {
    eye: 'right',
    sphere: toTwoDecimalsString(s.right_spherical),
    cylinder: toTwoDecimalsString(s.right_cylindrical, true),
    axis: s.right_axis != null ? String(s.right_axis) : '',
    correctedVA: visionToCorrectedVA(s.right_old_vision, s.right_old_vision_sign, s.right_old_vision_level),
    addPower: toTwoDecimalsString((s.right_near_add_power ?? '').replace(/^\+/, ''), true),
    prismHoriz: '',
    prismHorizDelta: '',
    prismVert: '',
    prismVertDelta: '',
  };
  const leftRow: RefractionRow = {
    eye: 'left',
    sphere: toTwoDecimalsString(s.left_spherical),
    cylinder: toTwoDecimalsString(s.left_cylindrical, true),
    axis: s.left_axis != null ? String(s.left_axis) : '',
    correctedVA: visionToCorrectedVA(s.left_old_vision, s.left_old_vision_sign, s.left_old_vision_level),
    addPower: toTwoDecimalsString((s.left_near_add_power ?? '').replace(/^\+/, ''), true),
    prismHoriz: '',
    prismHorizDelta: '',
    prismVert: '',
    prismVertDelta: '',
  };
  const pdBoth = (s.both_pupil_distance ?? '').trim();
  return { rows: [rightRow, leftRow], pdBoth };
}

type SalesTabKey = 'new-sale' | 'sales-list' | 'customer-list';

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  Male: '男',
  Female: '女',
};
/** 性别显示：支持 male/female 或 男/女，无则显示 — */
function formatGenderDisplay(gender: string | null | undefined): string {
  if (gender == null || String(gender).trim() === '') return '—';
  const g = String(gender).trim();
  if (GENDER_LABELS[g]) return GENDER_LABELS[g];
  if (g === '男' || g === '女') return g;
  return '—';
}
/** 外部患者性别转本系统存储：男→male，女→female，已是 male/female 则原样，否则 undefined */
function externalGenderToInternal(gender: string | null | undefined): 'male' | 'female' | undefined {
  if (gender == null || String(gender).trim() === '') return undefined;
  const g = String(gender).trim();
  if (g === '男' || g === 'male' || g === 'Male') return 'male';
  if (g === '女' || g === 'female' || g === 'Female') return 'female';
  return undefined;
}

const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
];

/** 姓名转拼音首字母（用于检索），如「张三」→「ZS」 */
function getPinyinInitials(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .split('')
    .map((char) => {
      if (/[\u4e00-\u9fa5]/.test(char)) {
        const py = pinyin(char, { toneType: 'none' });
        return (py.trim()[0] || '').toUpperCase();
      }
      if (/[a-zA-Z0-9]/.test(char)) return char.toUpperCase();
      return '';
    })
    .join('');
}

type NewCustomerFormValues = {
  name: string;
  gender?: 'male' | 'female';
  phone?: string;
};

interface SalesListRow {
  key: string;
  orderId: string;
  orderNo: string;
  date: string;
  customerName: string;
  productName: string;
  quantity: number;
  salesPrice: number;
  totalAmount: number;
  /** 同一销售单内的行序号（0 为首行，用于合并单元格） */
  orderItemIndex: number;
  /** 同一销售单的商品行数（用于 rowSpan） */
  orderItemCount: number;
}

function flattenSalesOrders(orders: SalesOrder[]): SalesListRow[] {
  const rows: SalesListRow[] = [];
  for (const o of orders) {
    const itemCount = o.items.length;
    for (let i = 0; i < itemCount; i++) {
      const it = o.items[i];
      const spec = (it.specDisplay ?? '').trim();
      const productName = spec ? `${it.productName} ${spec}` : it.productName;
      rows.push({
        key: `${o.id}-${i}`,
        orderId: o.id,
        orderNo: o.orderNo,
        date: o.date,
        customerName: o.customerName,
        productName,
        quantity: it.quantity,
        salesPrice: it.salesPrice,
        totalAmount: o.totalAmount,
        orderItemIndex: i,
        orderItemCount: itemCount,
      });
    }
  }
  return rows;
}

function SalesOrderList({ refreshKey, orders: ordersProp }: { refreshKey: number; orders?: SalesOrder[] }) {
  const [ordersLocal, setOrdersLocal] = useState<SalesOrder[]>([]);
  useEffect(() => {
    if (ordersProp !== undefined) {
      setOrdersLocal(ordersProp);
      return;
    }
    const all = salesOrderStorage.getAll();
    const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setOrdersLocal(sorted);
  }, [refreshKey, ordersProp]);
  const orders = ordersProp !== undefined ? ordersProp : ordersLocal;
  const rows = useMemo(() => flattenSalesOrders(orders), [orders]);
  return (
    <Table<SalesListRow>
      dataSource={rows}
      rowKey="key"
      size="small"
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      locale={{ emptyText: '暂无销售单' }}
      columns={[
        {
          title: '销售日期',
          dataIndex: 'date',
          key: 'date',
          width: 112,
          align: 'center',
          render: (v: string, record: SalesListRow) => ({
            children: v ?? '—',
            props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
          }),
        },
        {
          title: '销售单号',
          dataIndex: 'orderNo',
          key: 'orderNo',
          width: 136,
          align: 'center',
          render: (v: string, record: SalesListRow) => ({
            children: v ?? '—',
            props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
          }),
        },
        {
          title: '客户姓名',
          dataIndex: 'customerName',
          key: 'customerName',
          width: 100,
          ellipsis: true,
          render: (v: string, record: SalesListRow) => ({
            children: v ?? '—',
            props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
          }),
        },
        { title: '销售商品名称', dataIndex: 'productName', key: 'productName', ellipsis: true },
        { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 72, align: 'center' },
        {
          title: '销售价格',
          dataIndex: 'salesPrice',
          key: 'salesPrice',
          width: 100,
          align: 'right',
          render: (v: number) => (v != null ? `¥ ${Number(v).toFixed(2)}` : '—'),
        },
        {
          title: '总金额',
          dataIndex: 'totalAmount',
          key: 'totalAmount',
          width: 100,
          align: 'right',
          render: (v: number, record: SalesListRow) => ({
            children: v != null ? `¥ ${Number(v).toFixed(2)}` : '—',
            props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
          }),
        },
      ]}
    />
  );
}

export default function SalesPage() {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState<SalesTabKey>('new-sale');
  const [customers, setCustomers] = useState<Customer[]>([]);
  /** 客户输入框：可输入姓名或首字母检索，选中后存 customerId；空字符串表示未选 */
  const [customerKeyword, setCustomerKeyword] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  /** 当前选中客户在患者管理系统中的患者 ID（选择/创建时写入，用于导入验光数据请求，避免 customers 未刷新时缺失） */
  const [selectedCustomerExternalPatientId, setSelectedCustomerExternalPatientId] = useState<number | null>(null);
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [newCustomerForm] = Form.useForm<NewCustomerFormValues>();
  /** 客户列表检索关键词（姓名、联系方式或首字母） */
  const [customerListKeyword, setCustomerListKeyword] = useState('');
  /** 查看销售历史弹窗：当前查看的客户 id，非空时显示该客户的销售历史 */
  const [viewingHistoryCustomerId, setViewingHistoryCustomerId] = useState<string | null>(null);
  /** 验光数据：右眼、左眼两行 */
  const [refractionRows, setRefractionRows] = useState<RefractionRow[]>(() => [
    createEmptyRefractionRow('right'),
    createEmptyRefractionRow('left'),
  ]);
  /** 瞳距（mm）：右眼、左眼、双眼 */
  const [pdRight, setPdRight] = useState('');
  const [pdLeft, setPdLeft] = useState('');
  const [pdBoth, setPdBoth] = useState('');
  /** 导入验光数据选择弹窗：打开时展示该客户的历史验光记录列表供选择 */
  const [importRefractionModalOpen, setImportRefractionModalOpen] = useState(false);
  /** 患者管理系统历史验光：打开导入弹窗且当前客户有 externalPatientId 时请求，返回结构待后端约定 */
  const [externalRefractionLoading, setExternalRefractionLoading] = useState(false);
  const [externalRefractionError, setExternalRefractionError] = useState<string | null>(null);
  const [externalRefractionData, setExternalRefractionData] = useState<unknown>(null);
  /** 商品列表（从商品信息管理读取，用于检索） */
  const [products, setProducts] = useState<Product[]>([]);
  /** 商品检索框关键词 */
  const [productKeyword, setProductKeyword] = useState('');
  /** 已添加的销售明细（商品显示框） */
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  /** 销售单列表刷新标识（开单后递增以重新拉取） */
  const [salesListKey, setSalesListKey] = useState(0);
  /** 登录时从后端拉取的销售单、验光记录 */
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [refractionRecords, setRefractionRecords] = useState<RefractionRecord[]>([]);
  /** 登录时从后端拉取的类别、采购列表（未登录用 storage） */
  const [categories, setCategories] = useState<Category[]>([]);
  const [purchaseList, setPurchaseList] = useState<PurchaseListOrder[]>([]);
  /** 外部患者管理系统患者建议（按关键词请求 /patients/suggest） */
  const [externalPatients, setExternalPatients] = useState<ExternalPatient[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);

  const setRefractionRow = useCallback((eye: RefractionEye, field: keyof RefractionRow, value: string | RefractionEye) => {
    setRefractionRows((prev) =>
      prev.map((r) => (r.eye === eye ? { ...r, [field]: value } : r)),
    );
  }, []);

  /** 将某条历史验光记录应用到当前表单 */
  const applyRefractionRecord = useCallback((record: RefractionRecord) => {
    const rightRow = record.rows.find((r) => r.eye === 'right') ?? createEmptyRefractionRow('right');
    const leftRow = record.rows.find((r) => r.eye === 'left') ?? createEmptyRefractionRow('left');
    setRefractionRows([rightRow, leftRow]);
    setPdRight(record.pdRight ?? '');
    setPdLeft(record.pdLeft ?? '');
    setPdBoth(record.pdBoth ?? '');
  }, []);

  /** 当前客户可导入的历史验光：销售单中带验光格式的商品参数（按单日期倒序）+ 验光记录表 */
  const importableRefractionList = useMemo((): ImportableRefraction[] => {
    if (!selectedCustomerId) return [];
    const ordersList = isLoggedIn() ? salesOrders : salesOrderStorage.getAll();
    const orders = ordersList
      .filter((o: SalesOrder) => o.customerId === selectedCustomerId)
      .sort((a: SalesOrder, b: SalesOrder) => b.createdAt.localeCompare(a.createdAt));
    const fromOrders: ImportableRefraction[] = [];
    for (const order of orders) {
      const item = order.items.find((it) => isRefractionFormat(it.specDisplay ?? ''));
      if (item?.specDisplay) {
        fromOrders.push({
          source: 'order',
          orderId: order.id,
          orderNo: order.orderNo,
          date: order.date,
          createdAt: order.createdAt,
          specDisplay: item.specDisplay,
        });
      }
    }
    const records = isLoggedIn()
      ? refractionRecords.filter((r) => r.customerId === selectedCustomerId)
      : refractionRecordStorage.getByCustomerId(selectedCustomerId);
    const fromStorage = records.map((r) => ({
      source: 'record' as const,
      record: r,
    }));
    return [...fromOrders, ...fromStorage];
  }, [selectedCustomerId, salesOrders, refractionRecords]);

  /** 点击「导入验光数据」：未选客户则提示；无本系统历史且非患者管理系统客户则提示；否则打开选择弹窗，若为患者管理系统客户则立即请求外部验光历史 */
  const handleImportRefraction = useCallback(() => {
    if (!selectedCustomerId) {
      message.warning('请先选择客户');
      return;
    }
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const orgId = getOrganizationId();
    // 优先用 customers 中的 externalPatientId，其次用选择时缓存的（避免刚同步后列表未刷新）
    const patientId = customer?.externalPatientId ?? selectedCustomerExternalPatientId ?? null;
    // 控制台输出机构 id 和患者 id，便于排查
    console.log('[导入验光数据] 机构ID:', orgId ?? '未设置', '患者ID:', patientId ?? '非患者管理系统客户');

    const hasExternal = patientId != null && isLoggedIn() && orgId != null;
    if (!importableRefractionList.length && !hasExternal) {
      message.warning('该客户暂无历史验光数据');
      return;
    }

    setExternalRefractionError(null);
    setExternalRefractionData(null);
    setImportRefractionModalOpen(true);

    // 患者管理系统客户：在点击时立即请求外部验光历史，不依赖 useEffect
    if (hasExternal && orgId != null && patientId != null) {
      console.log('[导入验光数据] 正在请求患者管理系统，机构ID:', orgId, '患者ID:', patientId);
      setExternalRefractionLoading(true);
      fetchSubjectiveRefractionHistory(Number(orgId), patientId)
        .then((data) => {
          setExternalRefractionData(data);
        })
        .catch((e) => {
          setExternalRefractionError(e instanceof Error ? e.message : '获取患者管理系统验光数据失败');
          setExternalRefractionData(null);
        })
        .finally(() => {
          setExternalRefractionLoading(false);
        });
    }
  }, [selectedCustomerId, customers, importableRefractionList.length, selectedCustomerExternalPatientId, message]);

  /** 从选择弹窗中选中一条（来自记录表或销售单）并导入 */
  const handleSelectImportableRefraction = useCallback(
    (item: ImportableRefraction) => {
      if (item.source === 'record') {
        applyRefractionRecord(item.record);
      } else {
        const rows = parseSpecDisplayToRefractionRows(item.specDisplay);
        if (rows?.length) {
          setRefractionRows(rows);
          setPdRight('');
          setPdLeft('');
          setPdBoth('');
        }
      }
      setImportRefractionModalOpen(false);
      message.success('已导入所选历史验光数据');
    },
    [applyRefractionRecord, message],
  );

  /** 患者管理系统返回的检查列表（用于弹窗表格） */
  const externalRefractionList = useMemo((): ExternalRefractionListItem[] => {
    if (externalRefractionData == null || typeof externalRefractionData !== 'object') return [];
    const res = externalRefractionData as ExternalRefractionHistoryResponse;
    return Array.isArray(res.list) ? res.list : [];
  }, [externalRefractionData]);

  /** 从患者管理系统历史检查列表中选中一条并填入验光数据 */
  const handleSelectExternalRefraction = useCallback(
    (item: ExternalRefractionListItem) => {
      const { rows, pdBoth: pd } = externalSubjectiveToRefraction(item.subjective);
      setRefractionRows(rows);
      setPdRight('');
      setPdLeft('');
      setPdBoth(pd);
      setImportRefractionModalOpen(false);
      setExternalRefractionData(null);
      setExternalRefractionError(null);
      message.success('已导入所选检查的验光数据');
    },
    [message],
  );

  const refresh = useCallback(async () => {
    try {
      if (isLoggedIn()) {
        const [custRes, refRes, ordRes, prodRes, catRes, purchRes] = await Promise.all([
          listCustomers(),
          listRefractionRecords(),
          listSalesOrders(),
          listProducts(),
          listCategories(),
          listPurchaseListOrders(),
        ]);
        setCustomers(
          (custRes.items || []).map((item: Record<string, unknown>) => ({
            ...item,
            externalPatientId: item.externalPatientId ?? item.external_patient_id ?? null,
            patientNumber: item.patientNumber ?? item.patient_number ?? '',
            patientArchiveNumber: item.patientArchiveNumber ?? item.patient_archive_number ?? '',
          })) as Customer[],
        );
        setRefractionRecords((refRes.items || []) as RefractionRecord[]);
        setSalesOrders((ordRes.items || []) as SalesOrder[]);
        setProducts((prodRes.items || []) as Product[]);
        setCategories((catRes.items || []) as Category[]);
        setPurchaseList(
          ((purchRes.items || []) as PurchaseListOrder[]).filter(
            (o) => o.stockInAt != null && String(o.stockInAt).trim() !== '',
          ),
        );
      } else {
        setCustomers(customerStorage.getAll());
        setCategories(categoryStorage.getAll());
        setProducts(productStorage.getAll());
        setPurchaseList(
          purchaseListStorage.getAll().filter(
            (o: PurchaseListOrder) => o.stockInAt != null && String(o.stockInAt).trim() !== '',
          ),
        );
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '刷新失败');
    }
  }, [message]);

  const refreshCustomers = useCallback(() => {
    if (isLoggedIn()) {
      listCustomers()
        .then((res) =>
          setCustomers(
            (res.items || []).map((item: Record<string, unknown>) => ({
              ...item,
              externalPatientId: item.externalPatientId ?? item.external_patient_id ?? null,
              patientNumber: item.patientNumber ?? item.patient_number ?? '',
              patientArchiveNumber: item.patientArchiveNumber ?? item.patient_archive_number ?? '',
            })) as Customer[],
          ),
        )
        .catch(() => {});
    } else {
      setCustomers(customerStorage.getAll());
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** 输入关键词时请求外部患者管理系统患者建议（已登录且有关键词、机构 id 时，防抖 300ms）；若有本系统已存在的同一患者则用患者管理系统最新数据同步 */
  useEffect(() => {
    const kw = (customerKeyword ?? '').trim();
    if (!kw || !isLoggedIn() || !getOrganizationId()) {
      setExternalPatients([]);
      return;
    }
    const t = setTimeout(() => {
      setLoadingExternal(true);
      suggestExternalPatients(kw, { organizationId: getOrganizationId()!, limit: 10 })
        .then(({ patients }) => {
          setExternalPatients(patients);
          const toSync = patients.filter((p) =>
            customers.some((c) => c.externalPatientId != null && c.externalPatientId === p.id),
          );
          if (toSync.length > 0) {
            Promise.all(
              toSync.map((p) => {
                const c = customers.find((x) => x.externalPatientId != null && x.externalPatientId === p.id);
                return c
                  ? syncCustomerFromExternal(c.id, {
                      externalPatientId: p.id,
                      name: p.name ?? '',
                      phone: p.phone ?? '',
                      gender: externalGenderToInternal(p.gender),
                      identifiers: Array.isArray(p.identifiers) ? p.identifiers : [],
                    })
                  : Promise.resolve();
              }),
            )
              .then(() => refreshCustomers())
              .catch(() => {});
          }
        })
        .catch(() => setExternalPatients([]))
        .finally(() => setLoadingExternal(false));
    }, 300);
    return () => clearTimeout(t);
    // 仅随关键词变化请求；同步用当前 customers/refreshCustomers，不加入 deps 以免 customers 更新后重复请求
  }, [customerKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 已入库的采购单（用于镜架在库型号/色号） */
  const stockInOrders = purchaseList;
  /** 镜架商品：有型号/色号入库时，productId -> 在库的型号/色号列表（degree 字段，如 "ABC-001/黑色"） */
  const frameInStockSpecs = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const order of stockInOrders) {
      const product = products.find((p) => p.id === order.productId);
      const catName = product ? categories.find((c) => c.id === product.category)?.name : '';
      if (catName !== '镜架') continue;
      const set = new Set<string>();
      for (const row of order.rows) {
        const d = (row.degree ?? '').trim();
        if (d && d !== '—' && row.quantity > 0) set.add(d);
      }
      if (set.size > 0) {
        const existing = map.get(order.productId) ?? [];
        set.forEach((s) => existing.push(s));
        map.set(order.productId, [...new Set(existing)]);
      }
    }
    return map;
  }, [stockInOrders, products, categories]);

  /** 镜片在库按光度汇总：productId -> degree -> 数量（仅已入库的镜片采购单） */
  const lensStockByProduct = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const order of stockInOrders) {
      const product = products.find((p) => p.id === order.productId);
      const catName = product ? categories.find((c) => c.id === product.category)?.name : '';
      if (catName !== '镜片') continue;
      let byDegree = map.get(order.productId);
      if (!byDegree) {
        byDegree = {};
        map.set(order.productId, byDegree);
      }
      for (const row of order.rows) {
        const d = (row.degree ?? '').trim();
        if (!d) continue;
        byDegree[d] = (byDegree[d] ?? 0) + row.quantity;
      }
    }
    return map;
  }, [stockInOrders, products, categories]);

  /** 镜架在库按型号/色号汇总：productId -> degree -> 数量 */
  const frameStockByProduct = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const order of stockInOrders) {
      const product = products.find((p) => p.id === order.productId);
      const catName = product ? categories.find((c) => c.id === product.category)?.name : '';
      if (catName !== '镜架') continue;
      let byDegree = map.get(order.productId);
      if (!byDegree) {
        byDegree = {};
        map.set(order.productId, byDegree);
      }
      for (const row of order.rows) {
        const d = (row.degree ?? '').trim();
        if (!d || d === '—') continue;
        byDegree[d] = (byDegree[d] ?? 0) + row.quantity;
      }
    }
    return map;
  }, [stockInOrders, products, categories]);

  /** 其他在库商品（护理液等）按 productId 汇总：degree 固定 "—" */
  const otherStockByProduct = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const order of stockInOrders) {
      const product = products.find((p) => p.id === order.productId);
      const catName = product ? categories.find((c) => c.id === product.category)?.name : '';
      if (catName === '镜片' || catName === '镜架') continue;
      let byDegree = map.get(order.productId);
      if (!byDegree) {
        byDegree = {};
        map.set(order.productId, byDegree);
      }
      for (const row of order.rows) {
        const d = (row.degree ?? '').trim() || '—';
        byDegree[d] = (byDegree[d] ?? 0) + row.quantity;
      }
    }
    return map;
  }, [stockInOrders, products, categories]);

  /** 镜片规格是否含下加光或棱镜：此类一律按销售定制单处理，不做出库 */
  function lensSpecHasAddOrPrism(specDisplay: string): boolean {
    const s = (specDisplay ?? '').trim();
    if (!s) return false;
    return /ADD[：:]/i.test(s) || /棱镜/.test(s) || /△/.test(s);
  }

  /** 从镜片商品参数文本解析光度（右：xxx 或 左：xxx，用于匹配库存 degree）。下加光(ADD)等仅展示用，库存按球镜/柱镜匹配，需剔除 ADD 部分 */
  function parseDegreeFromLensSpec(specDisplay: string): string | null {
    const s = (specDisplay ?? '').trim();
    if (!s) return null;
    let degreePart: string;
    const m = s.match(/^[左右][眼]?[：:]\s*(.+)$/);
    if (m) {
      degreePart = m[1].trim();
    } else {
      degreePart = s;
    }
    /* 剔除下加光 ADD：+2.00 等，库存不按 ADD 区分 */
    degreePart = degreePart
      .replace(/\s*\|\s*ADD[：:].*$/i, '')
      .replace(/\s*ADD[：:]\s*[+-]?\d+(\.\d+)?/gi, '')
      .trim();
    return degreePart || null;
  }

  /** 将商品参数中的光度转为库存 degree 可能格式并查找数量（库存为 球镜/柱镜 如 -1.00/-0.00、-1.00/+0.00） */
  function getLensStockQtyBySpec(byDegree: Record<string, number>, parsedDegree: string): number {
    const r = getLensMatchedDegree(byDegree, parsedDegree);
    return r ? byDegree[r] ?? 0 : 0;
  }

  /** 镜片库存匹配到的 degree 键（用于出库扣减）。采购单柱镜 0 存为 +0.00，验光可能为 -0.00，需等价匹配 */
  function getLensMatchedDegree(byDegree: Record<string, number>, parsedDegree: string): string | null {
    if (!parsedDegree || !byDegree) return null;
    if (byDegree[parsedDegree] != null && byDegree[parsedDegree] > 0) return parsedDegree;
    const beforeAxis = parsedDegree.split('×')[0].trim();
    if (beforeAxis !== parsedDegree && byDegree[beforeAxis] != null && byDegree[beforeAxis] > 0) return beforeAxis;
    /* 柱镜 0 的两种写法：-0.00 与 +0.00 等价，采购单用 +0.00，验光常用 -0.00 */
    if (beforeAxis.includes('/')) {
      const altKey = beforeAxis.endsWith('/-0.00')
        ? beforeAxis.replace('/-0.00', '/+0.00')
        : (beforeAxis.endsWith('/+0.00') ? beforeAxis.replace('/+0.00', '/-0.00') : '');
      if (altKey && byDegree[altKey] != null && byDegree[altKey] > 0) return altKey;
    }
    if (!parsedDegree.includes('/')) {
      const n = parseFloat(parsedDegree);
      if (!Number.isNaN(n)) {
        const sphereFmt = n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
        const k = byDegree[`${sphereFmt}/-0.00`] != null && byDegree[`${sphereFmt}/-0.00`] > 0
          ? `${sphereFmt}/-0.00` : (byDegree[`${sphereFmt}/+0.00`] != null && byDegree[`${sphereFmt}/+0.00`] > 0 ? `${sphereFmt}/+0.00` : null);
        if (k) return k;
      }
    }
    return null;
  }

  /** 商品检索：按商品名称包含或商品名称拼音首字母前缀匹配；无输入时不展示下拉 */
  const filteredProductOptions = useMemo(() => {
    const kw = (productKeyword ?? '').trim().toLowerCase();
    if (!kw) return [];
    return products.filter((p) => {
      const displayName = getProductDisplayName(p);
      const nameLower = displayName.toLowerCase();
      const nameInitials = getPinyinInitials(displayName).toLowerCase();
      return nameLower.includes(kw) || nameInitials.startsWith(kw);
    });
  }, [products, productKeyword]);

  /** 添加商品到销售明细；镜片且验光有数据时，商品参数填入验光数据 */
  const handleAddProduct = useCallback(
    (product: Product) => {
      const retailPrice = product.price ?? 0;
      const quantity = 1;
      const discount = 1;
      let specDisplay = getProductSpecDisplay(product);
      if (product.category === 'lens' && hasRefractionData(refractionRows)) {
        specDisplay = formatRefractionForSpec(refractionRows);
      }
      const newItem: SaleItem = {
        id: `si-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        productId: product.id,
        serialNumber: saleItems.length + 1,
        productName: getProductDisplayName(product),
        specDisplay,
        quantity,
        retailPrice,
        discount,
        salesPrice: retailPrice * quantity * discount,
      };
      setSaleItems((prev) => [...prev, newItem]);
      setProductKeyword('');
    },
    [saleItems.length, refractionRows],
  );

  /** 更新某行数量、折扣、销售价格或商品参数。销售价格为输入时按销售价格反算折扣；改数量时按折扣重算销售价格。 */
  const updateSaleItem = useCallback((id: string, updates: { quantity?: number; discount?: number; salesPrice?: number; specDisplay?: string }) => {
    setSaleItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const quantity = updates.quantity ?? item.quantity;
        const denom = item.retailPrice * quantity;
        let discount: number;
        let salesPrice: number;
        if (updates.salesPrice != null) {
          salesPrice = updates.salesPrice;
          discount = denom > 0 ? Math.max(0, salesPrice / denom) : item.discount;
        } else {
          discount = updates.discount ?? item.discount;
          salesPrice = denom * discount;
        }
        const next: SaleItem = { ...item, quantity, discount, salesPrice };
        if (updates.specDisplay !== undefined) next.specDisplay = updates.specDisplay;
        return next;
      }),
    );
  }, []);

  /** 当前明细中已使用的商品参数（去重），供商品参数列选择；排除验光数据格式（右眼：... 左眼：...） */
  const specDisplayOptions = useMemo(() => {
    const set = new Set<string>();
    saleItems.forEach((item) => {
      const s = (item.specDisplay ?? '').trim();
      if (s && !isRefractionFormat(s)) set.add(s);
    });
    return Array.from(set).map((s) => ({ value: s }));
  }, [saleItems]);

  /** 删除一行并重新编号序列号 */
  const removeSaleItem = useCallback((id: string) => {
    setSaleItems((prev) => {
      const next = prev.filter((item) => item.id !== id);
      return next.map((item, index) => ({ ...item, serialNumber: index + 1 }));
    });
  }, []);

  /** 新增一行销售明细（用于镜片双眼光度不同时增加左眼行），并重新编号 */
  const addSaleItemRow = useCallback((template: SaleItem, specDisplay: string) => {
    const newItem: SaleItem = {
      id: `si-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      productId: template.productId,
      serialNumber: 0,
      productName: template.productName,
      specDisplay,
      quantity: 1,
      retailPrice: template.retailPrice,
      discount: template.discount,
      salesPrice: template.retailPrice * 1 * template.discount,
    };
    setSaleItems((prev) => {
      const next = [...prev, newItem];
      return next.map((item, index) => ({ ...item, serialNumber: index + 1 }));
    });
  }, []);

  /** 销售明细总金额 */
  const totalAmount = useMemo(() => saleItems.reduce((s, i) => s + i.salesPrice, 0), [saleItems]);

  /** 开单：登录时走后端（自动出库/定制+扣库存），未登录走本地 storage */
  const handleSubmitOrder = useCallback(async () => {
    if (!selectedCustomerId) {
      message.warning('请先选择客户');
      return;
    }
    if (saleItems.length === 0) {
      message.warning('请至少添加一件商品');
      return;
    }
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const customerName = customer?.name ?? '';
    const date = new Date().toISOString().slice(0, 10);
    const items = saleItems.map((it) => ({
      productId: it.productId,
      productName: it.productName,
      specDisplay: it.specDisplay,
      quantity: it.quantity,
      salesPrice: it.salesPrice,
    }));
    const total = saleItems.reduce((s, i) => s + i.salesPrice, 0);

    if (isLoggedIn()) {
      try {
        await createSalesOrderApi({ date, customerId: selectedCustomerId, customerName, items });
        await refresh();
        message.success('开单成功');
        setSaleItems([]);
        setSelectedCustomerId(null);
        setSelectedCustomerExternalPatientId(null);
        setCustomerKeyword('');
        setRefractionRows([createEmptyRefractionRow('right'), createEmptyRefractionRow('left')]);
        setPdRight('');
        setPdLeft('');
        setPdBoth('');
        setSalesListKey((k) => k + 1);
        setActiveTab('sales-list');
      } catch (e) {
        message.error(e instanceof Error ? e.message : '开单失败');
      }
      return;
    }

    const order = salesOrderStorage.add({ date, customerId: selectedCustomerId, customerName, items, totalAmount: total });
    const orderNo = order.orderNo;

    for (const it of saleItems) {
      const product = products.find((p) => p.id === it.productId);
      const catName = product ? categories.find((c) => c.id === product.category)?.name ?? '' : '';
      let degree: string | null = null;
      let stockQty = 0;

      if (!product) {
        salesCustomStorage.add({
          salesOrderId: order.id,
          salesOrderNo: orderNo,
          productId: it.productId,
          productName: it.productName,
          specDisplay: it.specDisplay,
          quantity: it.quantity,
        });
        continue;
      }

      if (catName === '镜片') {
        if (lensSpecHasAddOrPrism(it.specDisplay)) {
          salesCustomStorage.add({
            salesOrderId: order.id,
            salesOrderNo: orderNo,
            productId: it.productId,
            productName: it.productName,
            specDisplay: it.specDisplay,
            quantity: it.quantity,
          });
          continue;
        }
        const parsed = parseDegreeFromLensSpec(it.specDisplay);
        const byDegree = lensStockByProduct.get(it.productId);
        degree = byDegree ? getLensMatchedDegree(byDegree, parsed ?? '') : null;
        stockQty = degree && byDegree ? byDegree[degree] ?? 0 : 0;
      } else if (catName === '镜架') {
        const spec = (it.specDisplay ?? '').trim();
        degree = spec || '—';
        stockQty = frameStockByProduct.get(it.productId)?.[degree] ?? 0;
      } else {
        degree = '—';
        stockQty = otherStockByProduct.get(it.productId)?.['—'] ?? 0;
      }

      if (degree != null && stockQty >= it.quantity) {
        deductPurchaseStock(it.productId, degree, it.quantity);
        salesOutboundStorage.add({
          salesOrderId: order.id,
          salesOrderNo: orderNo,
          productId: it.productId,
          productName: it.productName,
          specDisplay: it.specDisplay,
          quantity: it.quantity,
        });
      } else {
        salesCustomStorage.add({
          salesOrderId: order.id,
          salesOrderNo: orderNo,
          productId: it.productId,
          productName: it.productName,
          specDisplay: it.specDisplay,
          quantity: it.quantity,
        });
      }
    }

    setPurchaseList(
      purchaseListStorage.getAll().filter(
        (o: PurchaseListOrder) => o.stockInAt != null && String(o.stockInAt).trim() !== '',
      ),
    );
    message.success('开单成功');
    setSaleItems([]);
    setSelectedCustomerId(null);
    setSelectedCustomerExternalPatientId(null);
    setCustomerKeyword('');
    setRefractionRows([createEmptyRefractionRow('right'), createEmptyRefractionRow('left')]);
    setPdRight('');
    setPdLeft('');
    setPdBoth('');
    setSalesListKey((k) => k + 1);
    setActiveTab('sales-list');
  }, [selectedCustomerId, saleItems, customers, message, products, categories, lensStockByProduct, frameStockByProduct, otherStockByProduct, setPurchaseList, refresh]);

  /** 镜片商品参数选择：双眼 / 右眼 / 左眼 */
  const handleLensSpecChoice = useCallback(
    (record: SaleItem, choice: LensSpecChoice) => {
      const rightRow = refractionRows.find((r) => r.eye === 'right');
      const leftRow = refractionRows.find((r) => r.eye === 'left');
      const rightSpec = rightRow ? formatRefractionRow(rightRow) : '';
      const leftSpec = leftRow ? formatRefractionRow(leftRow) : '';
      if (choice === '右眼') {
        updateSaleItem(record.id, { specDisplay: rightSpec ? `右：${rightSpec}` : '' });
        return;
      }
      if (choice === '左眼') {
        updateSaleItem(record.id, { specDisplay: leftSpec ? `左：${leftSpec}` : '' });
        return;
      }
      if (choice === '双眼') {
        updateSaleItem(record.id, { specDisplay: rightSpec ? `右：${rightSpec}` : '' });
        if (leftSpec) addSaleItemRow(record, `左：${leftSpec}`);
      }
    },
    [refractionRows, updateSaleItem, addSaleItemRow],
  );

  /** 按关键词过滤客户：姓名包含或拼音首字母前缀匹配；无输入时不展示下拉避免列表过长 */
  const filteredCustomerOptions = useMemo(() => {
    const kw = (customerKeyword ?? '').trim().toLowerCase();
    if (!kw) return [];
    const initials = getPinyinInitials(customerKeyword).toLowerCase();
    return customers.filter((c) => {
      const nameLower = c.name.trim().toLowerCase();
      const nameInitials = getPinyinInitials(c.name).toLowerCase();
      return nameLower.includes(kw) || nameInitials.startsWith(initials);
    });
  }, [customers, customerKeyword]);

  /** 客户下拉选项：本系统客户优先（先展示），外部患者去重后在后 */
  const customerSearchOptions = useMemo(() => {
    const local = filteredCustomerOptions.map((c) => ({
      value: c.id,
      label: (
        <span>
          <span className="sales-option-local-tag">本系统</span> {c.name}
          {c.phone ? <span className="sales-option-phone"> · {c.phone}</span> : null}
        </span>
      ),
    }));
    // 去重：本系统已有（externalPatientId 一致或姓名+手机一致）的外部患者不再展示，优先显示本系统条目
    const extDeduped = externalPatients.filter((p) => {
      const nameP = (p.name ?? '').trim();
      const phoneP = (p.phone ?? '').trim();
      return !customers.some(
        (c) =>
          (c.externalPatientId != null && c.externalPatientId === p.id) ||
          (c.name.trim() === nameP && (c.phone ?? '').trim() === phoneP),
      );
    });
    const ext = extDeduped.map((p) => ({
      value: `ext-${p.id}`,
      label: (
        <span>
          <span className="sales-option-external-tag">患者管理系统</span> {p.name}
          {p.phone ? <span className="sales-option-phone"> · {p.phone}</span> : null}
        </span>
      ),
    }));
    if (loadingExternal && ext.length === 0) {
      return [
        ...local,
        { value: '__loading__', label: <span className="sales-option-loading">患者管理系统搜索中…</span>, disabled: true },
      ];
    }
    return [...local, ...ext];
  }, [filteredCustomerOptions, externalPatients, loadingExternal, customers]);

  /** 客户列表按关键词过滤：姓名、联系方式包含或姓名拼音首字母前缀匹配 */
  const filteredCustomerList = useMemo(() => {
    const kw = (customerListKeyword ?? '').trim().toLowerCase();
    if (!kw) return customers;
    const initials = getPinyinInitials(customerListKeyword).toLowerCase();
    return customers.filter((c) => {
      const nameLower = c.name.trim().toLowerCase();
      const phoneLower = (c.phone ?? '').trim().toLowerCase();
      const nameInitials = getPinyinInitials(c.name).toLowerCase();
      return (
        nameLower.includes(kw) ||
        phoneLower.includes(kw) ||
        nameInitials.startsWith(initials)
      );
    });
  }, [customers, customerListKeyword]);

  /** 当前查看的客户的销售历史：仅当 viewingHistoryCustomerId 有值时计算 */
  const customerHistoryData = useMemo(() => {
    if (!viewingHistoryCustomerId) return { orders: [] as SalesOrder[], rows: [] as SalesListRow[] };
    const all = isLoggedIn() ? salesOrders : salesOrderStorage.getAll();
    const orders = all
      .filter((o) => o.customerId === viewingHistoryCustomerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const rows = flattenSalesOrders(orders);
    return { orders, rows };
  }, [viewingHistoryCustomerId, salesOrders]);

  const handleSelectCustomer = useCallback(
    async (value: string) => {
      if (!value) {
        setSelectedCustomerId(null);
        setSelectedCustomerExternalPatientId(null);
        setCustomerKeyword('');
        return;
      }
      if (value.startsWith('ext-')) {
        const externalId = value.slice(4);
        const patient = externalPatients.find((p) => String(p.id) === externalId);
        if (!patient) {
          setExternalPatients([]);
          return;
        }
        const patientIdNum = patient.id;
        const name = (patient.name ?? '').trim();
        const phone = (patient.phone ?? '').trim() || undefined;
        const existing = customers.find(
          (c) => c.name.trim() === name && (c.phone?.trim() || undefined) === phone,
        );
        try {
          if (existing) {
            setSelectedCustomerId(existing.id);
            setSelectedCustomerExternalPatientId(existing.externalPatientId ?? patientIdNum);
            setCustomerKeyword(existing.name);
            setExternalPatients([]);
            return;
          }
          if (isLoggedIn()) {
            const res = await createCustomerApi({
              name,
              phone,
              gender: externalGenderToInternal(patient.gender),
              externalPatientId: patientIdNum,
              identifiers: Array.isArray(patient.identifiers) ? patient.identifiers : [],
            });
            await refreshCustomers();
            setSelectedCustomerId(res.id);
            setSelectedCustomerExternalPatientId(res.externalPatientId ?? patientIdNum);
            setCustomerKeyword(res.name);
            setExternalPatients([]);
            message.success('已从患者管理系统同步客户到本系统');
          } else {
            const added = customerStorage.add({
              name,
              phone,
              gender: externalGenderToInternal(patient.gender),
            });
            refreshCustomers();
            setSelectedCustomerId(added.id);
            setSelectedCustomerExternalPatientId(patientIdNum);
            setCustomerKeyword(added.name);
            setExternalPatients([]);
            message.success('已从患者管理系统同步客户到本系统');
          }
        } catch (e) {
          message.error(e instanceof Error ? e.message : '同步客户失败');
        }
        return;
      }
      const c = customers.find((x) => x.id === value);
      setSelectedCustomerId(value || null);
      setSelectedCustomerExternalPatientId(c?.externalPatientId ?? null);
      setCustomerKeyword(c ? c.name : '');
    },
    [customers, externalPatients, message, refreshCustomers],
  );

  const handleCustomerSearch = useCallback((value: string | undefined) => {
    const v = (value ?? '').trim();
    setCustomerKeyword(value ?? '');
    if (!v) {
      setSelectedCustomerId(null);
      setSelectedCustomerExternalPatientId(null);
    }
  }, []);

  const openNewCustomerModal = useCallback(() => {
    newCustomerForm.resetFields();
    setNewCustomerModalOpen(true);
  }, [newCustomerForm]);

  const closeNewCustomerModal = useCallback(() => {
    setNewCustomerModalOpen(false);
    newCustomerForm.resetFields();
  }, [newCustomerForm]);

  const submitNewCustomer = useCallback(() => {
    newCustomerForm.validateFields().then(async (values: NewCustomerFormValues) => {
      const name = (values.name ?? '').trim();
      if (!name) {
        message.warning('请输入客户姓名');
        return;
      }
      const phone = (values.phone ?? '').trim() || undefined;
      const alreadyExists = customers.some(
        (c) => c.name.trim() === name && (c.phone?.trim() || undefined) === phone,
      );
      if (alreadyExists) {
        message.warning('该客户已存在');
        return;
      }
      try {
        if (isLoggedIn()) {
          const res = await createCustomerApi({ name, gender: values.gender, phone });
          await refresh();
          setSelectedCustomerId(res.id);
          setCustomerKeyword(res.name);
          closeNewCustomerModal();
          message.success('客户已添加');
        } else {
          const added = customerStorage.add({
            name,
            gender: values.gender,
            phone,
          });
          refreshCustomers();
          setSelectedCustomerId(added.id);
          setCustomerKeyword(added.name);
          closeNewCustomerModal();
          message.success('客户已添加');
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : '添加失败');
      }
    });
  }, [newCustomerForm, message, refreshCustomers, refresh, closeNewCustomerModal, customers]);

  const customerListColumns = [
    {
      title: '序号',
      key: 'index',
      width: 72,
      align: 'center' as const,
      render: (_: unknown, __: Customer, index: number) => index + 1,
    },
    {
      title: '客户姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      ellipsis: true,
    },
    {
      title: '性别',
      dataIndex: 'gender',
      key: 'gender',
      width: 72,
      align: 'center' as const,
      render: (_: unknown, record: Customer) => formatGenderDisplay(record.gender),
    },
    {
      title: '联系方式',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
      ellipsis: true,
      render: (phone: string | undefined) => phone?.trim() || '—',
    },
    {
      title: '患者编号',
      dataIndex: 'patientNumber',
      key: 'patientNumber',
      minWidth: 160,
      ellipsis: false,
      render: (v: string | undefined) => (v != null && String(v).trim() ? String(v).trim() : '—'),
    },
    {
      title: '患者档案号',
      dataIndex: 'patientArchiveNumber',
      key: 'patientArchiveNumber',
      minWidth: 160,
      ellipsis: false,
      render: (v: string | undefined) => (v != null && String(v).trim() ? String(v).trim() : '—'),
    },
    {
      title: '操作',
      key: 'action',
      width: 112,
      align: 'center' as const,
      render: (_: unknown, record: Customer) => (
        <Button type="link" size="small" onClick={() => setViewingHistoryCustomerId(record.id)}>
          查看销售历史
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'new-sale',
      label: '新建销售',
      children: (
        <div className="sales-tab">
          <Card className="form-card sales-new-sale-card">
            <div className="sales-customer-row">
              <span className="sales-customer-label">客户：</span>
              <div className="sales-customer-input-wrap">
                <AutoComplete
                  value={customerKeyword}
                  onChange={(value) => handleCustomerSearch(value)}
                  onSelect={(value) => handleSelectCustomer(value)}
                  options={customerSearchOptions}
                  placeholder="输入客户姓名或首字母检索（含患者管理系统患者）"
                  allowClear
                  className="sales-customer-input"
                  filterOption={false}
                  styles={{ popup: { root: { minWidth: 260 } } }}
                />
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  onClick={openNewCustomerModal}
                  className="sales-new-customer-btn"
                >
                  新建客户
                </Button>
              </div>
            </div>
            {selectedCustomerId && (
              <div className="sales-customer-selected-hint">
                已选客户：{customers.find((c) => c.id === selectedCustomerId)?.name ?? ''}
              </div>
            )}

            <div className="sales-refraction-section">
              <div className="sales-refraction-header">
                <span className="sales-refraction-title">验光数据</span>
                <Button type="default" onClick={handleImportRefraction}>
                  导入验光数据
                </Button>
              </div>
              <div className="sales-refraction-table-wrap">
                <table className="sales-refraction-table">
                  <thead>
                    <tr>
                      <th className="sales-refraction-th-eye">眼别</th>
                      <th>球镜（D）</th>
                      <th>柱镜（D）</th>
                      <th>轴位（°）</th>
                      <th>矫正视力</th>
                      <th>瞳距（mm）</th>
                      <th>下加光（D）</th>
                      <th colSpan={2}>棱镜（水平）（△）</th>
                      <th colSpan={2}>棱镜（垂直）（△）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refractionRows.map((row) => (
                      <tr key={row.eye}>
                        <td className="sales-refraction-td-eye">{EYE_LABELS[row.eye]}</td>
                        <td>
                          <div className="sales-refraction-cell">
                            {(() => {
                              const v = (row.sphere ?? '').trim();
                              if (!v) return null;
                              if (v[0] === '+' || v[0] === '-') return null;
                              const n = parseFloat(v);
                              if (!Number.isNaN(n) && n === 0) return null; /* 0.00 不提示符号 */
                              return <div className="sales-refraction-hint">请输入+/-符号</div>;
                            })()}
                            <Input
                              value={row.sphere}
                              onChange={(e) => setRefractionRow(row.eye, 'sphere', restrictSphereInput(e.target.value))}
                              onBlur={() => {
                                const v = row.sphere.trim();
                                if (!v) return;
                                const sign = v[0] === '+' || v[0] === '-' ? v[0] : '';
                                const numPart = sign ? v.slice(1) : v;
                                const formatted = formatToTwoDecimals(numPart);
                                if (formatted !== numPart) setRefractionRow(row.eye, 'sphere', sign + formatted);
                              }}
                              className="sales-refraction-input"
                              autoComplete="off"
                            />
                          </div>
                        </td>
                        <td>
                          <div className="sales-refraction-cell">
                            {(() => {
                              const v = row.cylinder.trim();
                              const n = parseFloat(v);
                              const outOfRange = v !== '' && !Number.isNaN(n) && (n < CYLINDER_MIN || n > CYLINDER_MAX);
                              return outOfRange ? <div className="sales-refraction-hint">超过柱镜范围</div> : null;
                            })()}
                            <Input
                              value={row.cylinder === '' ? '' : `-${row.cylinder}`}
                              onChange={(e) => {
                                let v = e.target.value;
                                if (v.startsWith('-')) v = v.slice(1);
                                setRefractionRow(row.eye, 'cylinder', restrictTwoDecimalInput(v));
                              }}
                              onBlur={() => {
                                const v = row.cylinder.trim();
                                if (!v) return;
                                const n = parseFloat(v);
                                if (!Number.isNaN(n)) {
                                  setRefractionRow(row.eye, 'cylinder', clampAndSnapToStep(n, CYLINDER_MIN, CYLINDER_MAX, REFRACTION_STEP));
                                }
                              }}
                              className="sales-refraction-input"
                              autoComplete="off"
                            />
                          </div>
                        </td>
                        <td>
                          <Input
                            value={row.axis}
                            onChange={(e) => setRefractionRow(row.eye, 'axis', e.target.value)}
                            className="sales-refraction-input"
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <div className="sales-corrected-va-single">
                            <Input
                              value={row.correctedVA}
                              onChange={(e) => setRefractionRow(row.eye, 'correctedVA', e.target.value)}
                              className="sales-refraction-input"
                              autoComplete="off"
                            />
                            {(() => {
                              if (!row.correctedVA) return null;
                              const { main, suffix } = parseCorrectedVA(row.correctedVA);
                              return (
                                <div className="sales-corrected-va-overlay" aria-hidden>
                                  <span className="sales-corrected-va-main-text">{main}</span>
                                  {suffix && <sup>{suffix}</sup>}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                        <td>
                          <Input
                            value={row.eye === 'right' ? pdRight : pdLeft}
                            onChange={(e) => (row.eye === 'right' ? setPdRight : setPdLeft)(restrictPdInput(e.target.value))}
                            placeholder=""
                            className="sales-refraction-input sales-pd-cell-input"
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <div className="sales-refraction-cell">
                            {(() => {
                              const v = row.addPower.trim();
                              const n = parseFloat(v);
                              const outOfRange = v !== '' && !Number.isNaN(n) && (n < ADD_POWER_MIN || n > ADD_POWER_MAX);
                              return outOfRange ? <div className="sales-refraction-hint">超过下加光范围</div> : null;
                            })()}
                            <Input
                              value={row.addPower === '' ? '' : `+${row.addPower}`}
                              onChange={(e) => {
                                let v = e.target.value;
                                if (v.startsWith('+')) v = v.slice(1);
                                setRefractionRow(row.eye, 'addPower', restrictTwoDecimalInput(v));
                              }}
                              onBlur={() => {
                                const v = row.addPower.trim();
                                if (!v) return;
                                const n = parseFloat(v);
                                if (!Number.isNaN(n)) {
                                  setRefractionRow(row.eye, 'addPower', clampAndSnapToStep(n, ADD_POWER_MIN, ADD_POWER_MAX, REFRACTION_STEP));
                                }
                              }}
                              className="sales-refraction-input"
                              autoComplete="off"
                            />
                          </div>
                        </td>
                        <td>
                          <Select
                            placeholder="BI/BD"
                            value={row.prismHoriz || undefined}
                            onChange={(v) => setRefractionRow(row.eye, 'prismHoriz', v ?? '')}
                            allowClear
                            options={PRISM_HORIZ_OPTIONS}
                            className="sales-refraction-select"
                          />
                        </td>
                        <td>
                          <Input
                            value={row.prismHorizDelta}
                            onChange={(e) => setRefractionRow(row.eye, 'prismHorizDelta', e.target.value)}
                            className="sales-refraction-input"
                            autoComplete="off"
                          />
                        </td>
                        <td>
                          <Select
                            placeholder="BU/BD"
                            value={row.prismVert || undefined}
                            onChange={(v) => setRefractionRow(row.eye, 'prismVert', v ?? '')}
                            allowClear
                            options={PRISM_VERT_OPTIONS}
                            className="sales-refraction-select"
                          />
                        </td>
                        <td>
                          <Input
                            value={row.prismVertDelta}
                            onChange={(e) => setRefractionRow(row.eye, 'prismVertDelta', e.target.value)}
                            className="sales-refraction-input"
                            autoComplete="off"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sales-pd-row">
                <span className="sales-pd-label">瞳距：</span>
                <span className="sales-pd-item">
                  <Input
                    value={pdBoth}
                    onChange={(e) => setPdBoth(restrictPdInput(e.target.value))}
                    placeholder="双眼"
                    className="sales-pd-input"
                    autoComplete="off"
                  />
                  <span className="sales-pd-unit">mm</span>
                </span>
              </div>
            </div>

            <div className="sales-product-section">
              <div className="sales-product-header">
                <span className="sales-product-label">添加商品：</span>
                <div className="sales-product-search-wrap">
                  <AutoComplete
                    value={productKeyword}
                    onChange={(value) => setProductKeyword(value)}
                    onSelect={(value) => {
                      const product = products.find((p) => p.id === value);
                      if (product) handleAddProduct(product);
                    }}
                    options={filteredProductOptions.map((p) => ({
                      value: p.id,
                      label: getProductDisplayName(p),
                    }))}
                    placeholder="输入商品名称或名称首字母检索，选择后加入列表"
                    allowClear
                    className="sales-product-search"
                    filterOption={false}
                    styles={{ popup: { root: { minWidth: 560 } } }}
                  />
                </div>
              </div>
              <div className="sales-product-table-wrap">
                <Table<SaleItem>
                  dataSource={saleItems}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  locale={{ emptyText: '暂无商品，请在上方检索并选择商品添加' }}
                  columns={[
                    { title: '序列号', dataIndex: 'serialNumber', key: 'serialNumber', width: 80, align: 'center' },
                    {
                      title: '类别',
                      key: 'category',
                      width: 72,
                      align: 'center',
                      render: (_: unknown, record: SaleItem) => {
                        const product = products.find((p) => p.id === record.productId);
                        return product ? categories.find((c) => c.id === product.category)?.name ?? '—' : '—';
                      },
                    },
                    { title: '商品名称', dataIndex: 'productName', key: 'productName', ellipsis: true },
                    {
                      title: '商品参数',
                      dataIndex: 'specDisplay',
                      key: 'specDisplay',
                      width: 280,
                      ellipsis: false,
                      render: (val: string, record: SaleItem) => {
                        const product = products.find((p) => p.id === record.productId);
                        const catName = product ? categories.find((c) => c.id === product.category)?.name ?? '' : '';
                        const isFrame = catName === '镜架';
                        const isLens = catName === '镜片';
                        const isCareSolution = catName === '护理液';
                        const inStockSpecs = frameInStockSpecs.get(record.productId);
                        const lensChoiceOptions = [
                          { value: '__双眼__', label: '双眼' },
                          { value: '__右眼__', label: '右眼' },
                          { value: '__左眼__', label: '左眼' },
                        ];
                        const options = isLens
                          ? lensChoiceOptions
                          : isFrame
                            ? inStockSpecs && inStockSpecs.length > 0
                              ? inStockSpecs.map((s) => ({ value: s }))
                              : []
                            : inStockSpecs && inStockSpecs.length > 0
                              ? inStockSpecs.map((s) => ({ value: s }))
                              : specDisplayOptions;
                        const placeholder =
                          isLens
                            ? '验光数据'
                            : isFrame
                              ? '型号/色号'
                              : isCareSolution
                                ? '规格'
                                : inStockSpecs && inStockSpecs.length > 0
                                  ? '选择在库型号/色号'
                                  : '输入或选择商品参数';
                        const trimmed = (val ?? '').trim();
                        const isEmptyOrDash = !trimmed || trimmed === '—';
                        const displayValue = isFrame && isEmptyOrDash ? '' : (val ?? '');
                        const isCustomLens = isLens && trimmed && lensSpecHasAddOrPrism(trimmed);
                        const lensStockStatus: 'in' | 'out' | null =
                          isLens && trimmed && !isCustomLens
                            ? (() => {
                                const byDegree = lensStockByProduct.get(record.productId);
                                if (!byDegree || Object.keys(byDegree).length === 0) return null;
                                const parsedDegree = parseDegreeFromLensSpec(trimmed);
                                if (!parsedDegree) return null;
                                const qty = getLensStockQtyBySpec(byDegree, parsedDegree);
                                return qty > 0 ? 'in' : 'out';
                              })()
                            : null;
                        const specInputClass =
                          isCustomLens
                            ? 'sales-item-spec-input sales-item-spec-custom'
                            : lensStockStatus === 'in'
                              ? 'sales-item-spec-input sales-item-spec-in-stock'
                              : lensStockStatus === 'out'
                                ? 'sales-item-spec-input sales-item-spec-out-of-stock'
                                : 'sales-item-spec-input';
                        const onSelect = (value: string) => {
                          if (value === '__双眼__') {
                            handleLensSpecChoice(record, '双眼');
                            return;
                          }
                          if (value === '__右眼__') {
                            handleLensSpecChoice(record, '右眼');
                            return;
                          }
                          if (value === '__左眼__') {
                            handleLensSpecChoice(record, '左眼');
                            return;
                          }
                          updateSaleItem(record.id, { specDisplay: value ?? '' });
                        };
                        return (
                          <AutoComplete
                            value={displayValue}
                            onChange={(v) => {
                              if (!LENS_SPEC_CHOICE_VALUES.includes(v as (typeof LENS_SPEC_CHOICE_VALUES)[number])) {
                                updateSaleItem(record.id, { specDisplay: v ?? '' });
                              }
                            }}
                            onSelect={onSelect}
                            placeholder={placeholder}
                            className={specInputClass}
                            filterOption={false}
                            getPopupContainer={() => document.body}
                            styles={{ popup: { root: { zIndex: 1050, minWidth: 160 } } }}
                          >
                            {options.map((opt) => (
                              <Select.Option key={String(opt.value)} value={String(opt.value)}>
                                {typeof opt.label === 'string' ? opt.label : opt.label}
                              </Select.Option>
                            ))}
                          </AutoComplete>
                        );
                      },
                    },
                    {
                      title: '数量',
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 64,
                      render: (val: number, record: SaleItem) => (
                        <InputNumber
                          min={1}
                          value={val}
                          onChange={(v) => updateSaleItem(record.id, { quantity: v ?? 1 })}
                          className="sales-item-input-num sales-item-quantity-input"
                        />
                      ),
                    },
                    {
                      title: '零售价格',
                      dataIndex: 'retailPrice',
                      key: 'retailPrice',
                      width: 100,
                      align: 'right',
                      render: (v: number) => (v != null ? `¥ ${Number(v).toFixed(2)}` : '—'),
                    },
                    {
                      title: '折扣',
                      dataIndex: 'discount',
                      key: 'discount',
                      width: 100,
                      align: 'center',
                      render: (_: number, record: SaleItem) => {
                        const denom = record.retailPrice * record.quantity;
                        const d = denom > 0 ? record.salesPrice / denom : null;
                        if (d == null || Number.isNaN(d)) return '—';
                        const inOpts = isDiscountInOptions(d);
                        const displayVal = DISCOUNT_OPTIONS.find((o) => Math.abs(o.value - d) < 1e-6)?.value ?? d;
                        if (inOpts) {
                          return (
                            <Select
                              value={displayVal}
                              onChange={(v) => updateSaleItem(record.id, { discount: v ?? 1 })}
                              options={DISCOUNT_OPTIONS}
                              className="sales-item-discount-select"
                              style={{ width: '100%' }}
                            />
                          );
                        }
                        return <span className="sales-item-discount-readonly">{formatDiscountLabel(d)}</span>;
                      },
                    },
                    {
                      title: '销售价格',
                      dataIndex: 'salesPrice',
                      key: 'salesPrice',
                      width: 110,
                      align: 'right',
                      render: (v: number, record: SaleItem) => (
                        <InputNumber
                          min={0}
                          step={0.01}
                          precision={2}
                          value={v}
                          onChange={(val) => updateSaleItem(record.id, { salesPrice: val ?? 0 })}
                          className="sales-item-input-num sales-item-price-input"
                          formatter={(val) => (val != null && val !== '' ? `¥ ${Number(val).toFixed(2)}` : '')}
                          parser={(val) => {
                            const s = String(val ?? '').replace(/¥\s?/g, '').trim();
                            const n = parseFloat(s);
                            return Number.isNaN(n) ? 0 : n;
                          }}
                          controls={false}
                        />
                      ),
                    },
                    {
                      title: '操作',
                      key: 'action',
                      width: 72,
                      align: 'center',
                      render: (_: unknown, record: SaleItem) => (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => removeSaleItem(record.id)}
                        >
                          删除
                        </Button>
                      ),
                    },
                  ]}
                />
              </div>
              <div className="sales-order-footer">
                <span className="sales-order-total">
                  总金额：<strong>¥ {totalAmount.toFixed(2)}</strong>
                </span>
                <Button type="primary" onClick={handleSubmitOrder}>
                  开单
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      key: 'sales-list',
      label: '销售单列表',
      children: (
        <div className="sales-tab">
          <Card title="销售单列表" className="form-card">
            <SalesOrderList refreshKey={salesListKey} orders={isLoggedIn() ? salesOrders : undefined} />
          </Card>
        </div>
      ),
    },
    {
      key: 'customer-list',
      label: '客户列表',
      children: (
        <div className="sales-tab">
          <Card
            title={
              <div className="sales-customer-list-header">
                <span>客户列表</span>
                <Input
                  allowClear
                  placeholder="按客户姓名、联系方式或首字母检索"
                  value={customerListKeyword}
                  onChange={(e) => setCustomerListKeyword(e.target.value)}
                  className="sales-customer-list-search"
                  autoComplete="off"
                />
              </div>
            }
            className="form-card"
          >
            <Table<Customer>
              dataSource={filteredCustomerList}
              rowKey="id"
              columns={customerListColumns}
              pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
              locale={{ emptyText: customerListKeyword.trim() ? '未找到匹配的客户' : '暂无客户数据' }}
            />
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div className="sales-page">
      <h1 className="sales-page-title">销售管理</h1>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as SalesTabKey)}
        items={tabItems}
      />
      <Modal
        title="新建客户"
        open={newCustomerModalOpen}
        onOk={submitNewCustomer}
        onCancel={closeNewCustomerModal}
        okText="确定"
        cancelText="取消"
        width={400}
      >
        <Form form={newCustomerForm} layout="vertical" autoComplete="off" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入客户姓名' }]}
          >
            <Input placeholder="请输入客户姓名" />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Select placeholder="请选择性别" allowClear options={GENDER_OPTIONS} />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="请输入联系电话（选填）" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={viewingHistoryCustomerId ? `销售历史 - ${customers.find((c) => c.id === viewingHistoryCustomerId)?.name ?? ''}` : '销售历史'}
        open={!!viewingHistoryCustomerId}
        onCancel={() => setViewingHistoryCustomerId(null)}
        footer={null}
        width="min(90vw, 1400px)"
        destroyOnHidden
      >
        <Table<SalesListRow>
          dataSource={customerHistoryData.rows}
          rowKey="key"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          locale={{ emptyText: '该客户暂无销售记录' }}
          columns={[
            {
              title: '销售日期',
              dataIndex: 'date',
              key: 'date',
              width: 112,
              align: 'center',
              render: (v: string, record: SalesListRow) => ({
                children: v ?? '—',
                props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
              }),
            },
            {
              title: '销售单号',
              dataIndex: 'orderNo',
              key: 'orderNo',
              width: 136,
              align: 'center',
              render: (v: string, record: SalesListRow) => ({
                children: v ?? '—',
                props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
              }),
            },
            { title: '销售商品名称', dataIndex: 'productName', key: 'productName', ellipsis: false },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 72, align: 'center' },
            {
              title: '销售价格',
              dataIndex: 'salesPrice',
              key: 'salesPrice',
              width: 100,
              align: 'right',
              render: (v: number) => (v != null ? `¥ ${Number(v).toFixed(2)}` : '—'),
            },
            {
              title: '总金额',
              dataIndex: 'totalAmount',
              key: 'totalAmount',
              width: 100,
              align: 'right',
              render: (v: number, record: SalesListRow) => ({
                children: v != null ? `¥ ${Number(v).toFixed(2)}` : '—',
                props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
              }),
            },
          ]}
        />
      </Modal>
      <Modal
        title="选择历史验光数据"
        open={importRefractionModalOpen}
        onCancel={() => {
          setImportRefractionModalOpen(false);
          setExternalRefractionData(null);
          setExternalRefractionError(null);
        }}
        footer={null}
        width={700}
        destroyOnHidden
      >
        <div style={{ marginTop: 8 }}>
          {externalRefractionLoading && (
            <div style={{ marginBottom: 12, color: 'var(--ant-color-text-secondary)' }}>正在从患者管理系统获取验光历史…</div>
          )}
          {externalRefractionError && (
            <div style={{ marginBottom: 12, color: 'var(--ant-color-error)' }}>{externalRefractionError}</div>
          )}
          {externalRefractionList.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>患者管理系统历史检查</div>
              <Table<ExternalRefractionListItem>
                dataSource={externalRefractionList}
                rowKey={(item) => String(item.exam_id)}
                size="small"
                pagination={
                  externalRefractionList.length > 10
                    ? { pageSize: 10, showTotal: (t) => `共 ${t} 条` }
                    : false
                }
                columns={[
                  {
                    title: '检查日期',
                    key: 'examination_date',
                    width: 112,
                    align: 'center',
                    render: (_: unknown, item: ExternalRefractionListItem) =>
                      item.examination_date
                        ? new Date(item.examination_date).toLocaleDateString('zh-CN')
                        : '—',
                  },
                  {
                    title: '右眼',
                    key: 'right',
                    render: (_: unknown, item: ExternalRefractionListItem) => {
                      const s = item.subjective;
                      if (!s) return '—';
                      return (
                        <span className="sales-external-eye-summary">
                          {[
                            formatTwoDecimalsForDisplay(s.right_spherical),
                            formatTwoDecimalsForDisplay(s.right_cylindrical),
                            s.right_axis ?? '—',
                          ].join(' / ')}
                          {' · '}
                          {formatCorrectedVisionDisplay(s.right_old_vision, s.right_old_vision_sign, s.right_old_vision_level)}
                        </span>
                      );
                    },
                  },
                  {
                    title: '左眼',
                    key: 'left',
                    render: (_: unknown, item: ExternalRefractionListItem) => {
                      const s = item.subjective;
                      if (!s) return '—';
                      return (
                        <span className="sales-external-eye-summary">
                          {[
                            formatTwoDecimalsForDisplay(s.left_spherical),
                            formatTwoDecimalsForDisplay(s.left_cylindrical),
                            s.left_axis ?? '—',
                          ].join(' / ')}
                          {' · '}
                          {formatCorrectedVisionDisplay(s.left_old_vision, s.left_old_vision_sign, s.left_old_vision_level)}
                        </span>
                      );
                    },
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 80,
                    align: 'center',
                    render: (_: unknown, item: ExternalRefractionListItem) => (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => handleSelectExternalRefraction(item)}
                      >
                        导入
                      </Button>
                    ),
                  },
                ]}
              />
            </div>
          )}
          {importableRefractionList.length > 0 && (
            <div style={{ marginTop: externalRefractionList.length > 0 ? 16 : 0 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>本系统历史验光</div>
              <Table<ImportableRefraction>
                dataSource={importableRefractionList}
              rowKey={(item) => (item.source === 'record' ? item.record.id : `order-${item.orderId}`)}
              size="small"
              pagination={
                importableRefractionList.length > 10
                  ? { pageSize: 10, showTotal: (t) => `共 ${t} 条` }
                  : false
              }
              columns={[
                {
                  title: '来源',
                  key: 'source',
                  width: 80,
                  render: (_: unknown, item: ImportableRefraction) =>
                    item.source === 'record' ? '验光记录' : '销售单',
                },
                {
                  title: '日期',
                  key: 'date',
                  width: 140,
                  render: (_: unknown, item: ImportableRefraction) => {
                    const iso =
                      item.source === 'record' ? item.record.createdAt : item.createdAt;
                    return iso
                      ? new Date(iso).toLocaleString('zh-CN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '—';
                  },
                },
                {
                  title: '单号',
                  key: 'orderNo',
                  width: 120,
                  render: (_: unknown, item: ImportableRefraction) =>
                    item.source === 'order' ? item.orderNo : '—',
                },
                {
                  title: '右眼',
                  key: 'right',
                  ellipsis: true,
                  render: (_: unknown, item: ImportableRefraction) => {
                    if (item.source === 'record') {
                      const row = item.record.rows?.find((r) => r.eye === 'right');
                      return row ? formatRefractionRow(row) : '—';
                    }
                    const rows = parseSpecDisplayToRefractionRows(item.specDisplay);
                    const row = rows?.find((r) => r.eye === 'right');
                    return row ? formatRefractionRow(row) : item.specDisplay.split('；')[0] ?? '—';
                  },
                },
                {
                  title: '左眼',
                  key: 'left',
                  ellipsis: true,
                  render: (_: unknown, item: ImportableRefraction) => {
                    if (item.source === 'record') {
                      const row = item.record.rows?.find((r) => r.eye === 'left');
                      return row ? formatRefractionRow(row) : '—';
                    }
                    const rows = parseSpecDisplayToRefractionRows(item.specDisplay);
                    const row = rows?.find((r) => r.eye === 'left');
                    return row ? formatRefractionRow(row) : item.specDisplay.split('；')[1] ?? '—';
                  },
                },
                {
                  title: '操作',
                  key: 'action',
                  width: 80,
                  align: 'center',
                  render: (_: unknown, item: ImportableRefraction) => (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => handleSelectImportableRefraction(item)}
                    >
                      导入
                    </Button>
                  ),
                },
              ]}
              />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
