import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, Card, Button, Table, InputNumber, Modal, Input, App, Select, Form } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { pinyin } from 'pinyin-pro';
import {
  isLoggedIn,
  updateProduct,
  listCategories,
  listProducts,
  listSuppliers,
  listPurchasePrices,
  setPurchasePrice as setPurchasePriceApi,
  listPurchaseListOrders,
  createPurchaseListOrder,
  updatePurchaseListOrder,
  listSalesCustomOrders,
} from '../../utils/api';
import { categoryStorage, productStorage, purchasePriceStorage, purchaseListStorage, supplierStorage, salesCustomStorage } from '../../utils/storage';
import { getSphereValues, getCylinderValues, cellKeyToDegree, degreeToCellKey } from '../../utils/powerRange';
import type { Category, Product, LensPurchaseRow, PurchaseListOrder, Supplier, SalesCustomOrder } from '../../types';
import { getProductDisplayName } from '../../types';
import './index.css';

type TabKey = 'price' | 'new';
type PurchaseListSubTabKey = 'purchase-orders' | 'sales-custom';

/** 镜片采购弹窗内一行（含 cellKey 便于与网格选区对应） */
type LensPurchaseRowWithKey = LensPurchaseRow & { cellKey: string };

type SalesCustomRow = SalesCustomOrder & {
  orderItemIndex: number;
  orderItemCount: number;
};

function SalesCustomList({ activeSubTab, records: recordsProp }: { activeSubTab: string; records?: SalesCustomOrder[] }) {
  const [listLocal, setListLocal] = useState<SalesCustomOrder[]>([]);
  const load = useCallback(() => {
    const all = salesCustomStorage.getAll();
    setListLocal([...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);
  useEffect(() => {
    if (activeSubTab !== 'sales-custom') return;
    if (recordsProp !== undefined) {
      setListLocal([...recordsProp].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      return;
    }
    load();
  }, [activeSubTab, load, recordsProp]);
  useEffect(() => {
    if (activeSubTab !== 'sales-custom') return;
    const onVisible = () => { if (recordsProp === undefined) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeSubTab, load, recordsProp]);
  const list = recordsProp !== undefined ? [...recordsProp].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : listLocal;
  const rows = useMemo((): SalesCustomRow[] => {
    const orderIdToCount = new Map<string, number>();
    for (const row of list) {
      orderIdToCount.set(row.salesOrderId, (orderIdToCount.get(row.salesOrderId) ?? 0) + 1);
    }
    const sorted = [...list].sort((a, b) => {
      const t = b.createdAt.localeCompare(a.createdAt);
      if (t !== 0) return t;
      const o = a.salesOrderId.localeCompare(b.salesOrderId);
      if (o !== 0) return o;
      return a.id.localeCompare(b.id);
    });
    const orderIdToIndex = new Map<string, number>();
    return sorted.map((row) => {
      const count = orderIdToCount.get(row.salesOrderId) ?? 1;
      const index = orderIdToIndex.get(row.salesOrderId) ?? 0;
      orderIdToIndex.set(row.salesOrderId, index + 1);
      return { ...row, orderItemIndex: index, orderItemCount: count };
    });
  }, [list]);
  return (
    <Table<SalesCustomRow>
      dataSource={rows}
      rowKey="id"
      size="small"
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      locale={{ emptyText: '暂无销售定制单，开单时无库存商品会自动加入此处' }}
      columns={[
        {
          title: '来源销售单号',
          dataIndex: 'salesOrderNo',
          key: 'salesOrderNo',
          width: 140,
          render: (v: string, record: SalesCustomRow) => ({
            children: v ?? '—',
            props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
          }),
        },
        {
          title: '添加时间',
          dataIndex: 'createdAt',
          key: 'createdAt',
          width: 160,
          render: (v: string, record: SalesCustomRow) => ({
            children: v ? new Date(v).toLocaleString('zh-CN') : '—',
            props: { rowSpan: record.orderItemIndex === 0 ? record.orderItemCount : 0 },
          }),
        },
        { title: '商品名称', dataIndex: 'productName', key: 'productName', ellipsis: true },
        { title: '规格/光度', dataIndex: 'specDisplay', key: 'specDisplay', ellipsis: true },
        { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' },
      ]}
    />
  );
}

export default function PurchasePage() {
  const { message, modal } = App.useApp();
  const [activeTab, setActiveTab] = useState<TabKey>('price');
  /** 采购列表下的子标签：采购单 | 销售定制（占位，待销售管理完成后编辑） */
  const [purchaseListSubTab, setPurchaseListSubTab] = useState<PurchaseListSubTabKey>('purchase-orders');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  /** 本地编辑中的采购价格，key=productId，未编辑过的商品不放入 */
  const [localPrices, setLocalPrices] = useState<Record<string, number | ''>>({});
  /** 商品列表检索关键词 */
  const [productSearchKeyword, setProductSearchKeyword] = useState('');
  /** 采购列表数据（用于采购列表 Tab） */
  const [purchaseList, setPurchaseList] = useState<PurchaseListOrder[]>([]);
  /** 镜片采购弹窗：当前选中的镜片商品，null 表示弹窗关闭 */
  const [lensPurchaseProduct, setLensPurchaseProduct] = useState<Product | null>(null);
  /** 镜片采购弹窗内的行数据（每光度一行：cellKey、度数、数量、单价） */
  const [lensPurchaseRows, setLensPurchaseRows] = useState<LensPurchaseRowWithKey[]>([]);
  /** 正在编辑的采购单 id，非空表示弹窗为编辑模式 */
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  /** 关联供应商弹窗：当前操作的商品 id */
  const [linkingSupplierProductId, setLinkingSupplierProductId] = useState<string | null>(null);
  const [linkSupplierForm] = Form.useForm();
  /** 查看采购单详情：当前查看的采购单，非空时显示详情弹窗 */
  const [viewingOrder, setViewingOrder] = useState<PurchaseListOrder | null>(null);
  /** 入库确认弹窗：当前待确认入库的采购单，非空时显示确认弹窗 */
  const [stockInConfirmOrder, setStockInConfirmOrder] = useState<PurchaseListOrder | null>(null);
  /** 未关联供应商时提示后，需要闪烁的「关联供应商」按钮所在商品 id */
  const [blinkSupplierProductId, setBlinkSupplierProductId] = useState<string | null>(null);
  /** 镜架采购弹窗：当前选中的镜架商品，null 表示弹窗关闭 */
  const [framePurchaseProduct, setFramePurchaseProduct] = useState<Product | null>(null);
  /** 镜架表单：总数量 + 多组型号/色号（精品时每行可填采购价），默认 5 组 */
  type FrameFormValues = { quantity: number; items: Array<{ model: string; colorCode: string; unitPrice?: number }> };
  const FRAME_ITEMS_DEFAULT: FrameFormValues['items'] = Array.from({ length: 5 }, () => ({ model: '', colorCode: '', unitPrice: undefined }));
  const [framePurchaseForm] = Form.useForm<FrameFormValues>();
  /** 护理液采购弹窗：当前选中的护理液商品，null 表示弹窗关闭 */
  const [careSolutionPurchaseProduct, setCareSolutionPurchaseProduct] = useState<Product | null>(null);
  type CareSolutionFormValues = { quantity: number; unitPrice: number };
  const [careSolutionPurchaseForm] = Form.useForm<CareSolutionFormValues>();

  /** 镜片采购网格拖拽状态（与光度范围一致） */
  const lensDragRef = useRef({ isDragging: false, start: null as { row: number; col: number } | null, isToggle: false, lastKey: '' });
  /** 本次拖拽新增的 cellKey 集合，mouseup 后用于弹窗批量输入数量 */
  const lensDragAddedKeysRef = useRef<Set<string>>(new Set());
  /** 拖拽结束后弹出的批量输入数量弹窗：待设置数量的 cellKeys */
  const [lensBatchQtyModal, setLensBatchQtyModal] = useState<{ cellKeys: string[]; value: number } | null>(null);
  /** 右键编辑数量的格子：{ cellKey, value, isNew }，isNew 表示从空白格打开（仅确认才加入） */
  const [lensQtyEdit, setLensQtyEdit] = useState<{ cellKey: string; value: number; isNew: boolean } | null>(null);

  const location = useLocation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  /** 登录时从后端拉取的采购价映射 productId -> price */
  const [purchasePricesMap, setPurchasePricesMap] = useState<Record<string, number>>({});
  /** 登录时从后端拉取的销售定制单（采购列表-销售定制） */
  const [salesCustomList, setSalesCustomList] = useState<SalesCustomOrder[]>([]);

  const refresh = useCallback(async () => {
    try {
      if (isLoggedIn()) {
        const [categoriesRes, productsRes, suppliersRes, pricesRes, ordersRes, customRes] = await Promise.all([
          listCategories(),
          listProducts(),
          listSuppliers(),
          listPurchasePrices(),
          listPurchaseListOrders({ status: 'active' }),
          listSalesCustomOrders(),
        ]);
        setCategories((categoriesRes.items || []) as Category[]);
        setProducts((productsRes.items || []) as Product[]);
        setSuppliers((suppliersRes.items || []) as Supplier[]);
        const priceMap: Record<string, number> = {};
        for (const p of pricesRes.items || []) {
          priceMap[p.productId] = p.price;
        }
        setPurchasePricesMap(priceMap);
        const list = (ordersRes.items || []) as PurchaseListOrder[];
        const seen = new Set<string>();
        setPurchaseList(list.filter((o) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        }));
        setSalesCustomList((customRes.items || []) as SalesCustomOrder[]);
      } else {
        setCategories(categoryStorage.getAll());
        setProducts(productStorage.getAll());
        setSuppliers(supplierStorage.getAll());
        setPurchasePricesMap({});
        const list = purchaseListStorage.getAll().filter((o) => o.status === 'active');
        const seen = new Set<string>();
        setPurchaseList(list.filter((o) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        }));
        setSalesCustomList([]);
      }
    } catch (e) {
      console.error(e);
      message.error((e as Error)?.message ?? '加载失败');
    }
  }, []);

  /** 是否为镜片商品（按类别名称判断） */
  const isLensProduct = useCallback(
    (product: Product) => categories.find((c) => c.id === product.category)?.name === '镜片',
    [categories],
  );

  /** 是否为镜架商品（按类别名称判断） */
  const isFrameProduct = useCallback(
    (product: Product) => categories.find((c) => c.id === product.category)?.name === '镜架',
    [categories],
  );

  /** 是否为护理液商品（按类别名称判断） */
  const isCareSolutionProduct = useCallback(
    (product: Product) => categories.find((c) => c.id === product.category)?.name === '护理液',
    [categories],
  );

  /** 取商品在后端的 id（用于采购单/采购价 API），本地商品无则返回 null */
  const getProductBackendId = useCallback((product: Product): number | null => {
    if (product.backendId != null) return product.backendId;
    if (typeof product.id === 'number' && !Number.isNaN(product.id)) return product.id;
    if (typeof product.id === 'string' && /^\d+$/.test(product.id)) return parseInt(product.id, 10);
    return null;
  }, []);

  /** 根据当前采购单列表计算下一个采购单号（CG 或 YJ 前缀） */
  const nextOrderNoFromList = useCallback((list: PurchaseListOrder[], prefix: 'CG' | 'YJ' = 'CG'): string => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayOrders = list.filter((o) => o.orderNo.startsWith(`${prefix}${today}`));
    const maxSeq = todayOrders.length
      ? Math.max(...todayOrders.map((o) => parseInt(o.orderNo.slice(10) || '0', 10)), 0)
      : 0;
    return `${prefix}${today}${String(maxSeq + 1).padStart(2, '0')}`;
  }, []);

  /** 获取某商品的采购价：登录时用后端数据，否则用本地 storage */
  const getPurchasePrice = useCallback(
    (productId: string): number | undefined => {
      if (isLoggedIn() && purchasePricesMap[productId] !== undefined) return purchasePricesMap[productId];
      const v = purchasePriceStorage.getPrice(productId);
      return v === undefined ? undefined : v;
    },
    [purchasePricesMap],
  );

  /** 打开镜片采购弹窗：新增模式不预选，由用户拖拽选择后再显示数量 1 */
  const openLensPurchaseModal = useCallback((product: Product) => {
    setEditingOrderId(null);
    setLensPurchaseProduct(product);
    setLensPurchaseRows([]);
  }, []);

  /** 关闭镜片采购弹窗 */
  const closeLensPurchaseModal = useCallback(() => {
    setLensPurchaseProduct(null);
    setLensPurchaseRows([]);
  }, []);

  /** 打开镜架采购弹窗 */
  const openFramePurchaseModal = useCallback((product: Product) => {
    setEditingOrderId(null);
    setFramePurchaseProduct(product);
    framePurchaseForm.setFieldsValue({ quantity: 1, items: FRAME_ITEMS_DEFAULT });
  }, [framePurchaseForm]);

  /** 关闭镜架采购弹窗 */
  const closeFramePurchaseModal = useCallback(() => {
    setFramePurchaseProduct(null);
    framePurchaseForm.resetFields();
  }, [framePurchaseForm]);

  /** 打开护理液采购弹窗 */
  const openCareSolutionPurchaseModal = useCallback((product: Product) => {
    setCareSolutionPurchaseProduct(product);
    const defaultPrice = getPurchasePrice(product.id) ?? 0;
    careSolutionPurchaseForm.setFieldsValue({ quantity: 1, unitPrice: defaultPrice });
  }, [careSolutionPurchaseForm, getPurchasePrice]);

  /** 关闭护理液采购弹窗 */
  const closeCareSolutionPurchaseModal = useCallback(() => {
    setCareSolutionPurchaseProduct(null);
    careSolutionPurchaseForm.resetFields();
  }, [careSolutionPurchaseForm]);

  /** 护理液采购弹窗 - 确认：校验后写入采购列表 */
  const confirmCareSolutionPurchase = useCallback(async (values: CareSolutionFormValues) => {
    if (!careSolutionPurchaseProduct) return;
    const { quantity, unitPrice } = values;
    if (quantity <= 0) {
      message.warning('请填写有效的采购数量');
      return;
    }
    if (unitPrice < 0) {
      message.warning('请填写有效的单价');
      return;
    }
    const productName = getProductDisplayName(careSolutionPurchaseProduct);
    const rows = [{ degree: '—', quantity, unitPrice }];
    if (isLoggedIn()) {
      const backendId = getProductBackendId(careSolutionPurchaseProduct);
      if (backendId != null) {
        try {
          const orderNo = nextOrderNoFromList(purchaseList);
          await createPurchaseListOrder({ orderNo, productId: backendId, productName, rows });
          await refresh();
          closeCareSolutionPurchaseModal();
          setActiveTab('new');
          message.success('已加入采购列表');
          return;
        } catch (e) {
          console.error(e);
          message.error((e as Error)?.message ?? '提交失败');
          return;
        }
      }
    }
    purchaseListStorage.add({
      productId: careSolutionPurchaseProduct.id,
      productName,
      rows,
    });
    closeCareSolutionPurchaseModal();
    setActiveTab('new');
    const list = purchaseListStorage.getAll().filter((o) => o.status === 'active');
    const seen = new Set<string>();
    setPurchaseList(list.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }));
    message.success('已加入采购列表');
  }, [careSolutionPurchaseProduct, closeCareSolutionPurchaseModal, message, purchaseList, getProductBackendId, nextOrderNoFromList, refresh]);

  /** 镜架采购弹窗 - 确定：精品镜架按型号/色号+采购价只生成一条采购单（不生成新商品）；非精品支持仅数量或按型号/色号 */
  const confirmFramePurchase = useCallback(async () => {
    if (!framePurchaseProduct) return;
    const values = framePurchaseForm.getFieldsValue() as FrameFormValues;
    const items = (values.items ?? []).map((i) => ({
      model: (i?.model ?? '').trim(),
      colorCode: (i?.colorCode ?? '').trim(),
      unitPrice: i?.unitPrice != null && i?.unitPrice !== '' ? Number(i.unitPrice) : undefined,
    }));
    const filledItems = items.filter((i) => i.model && i.colorCode);
    const defaultPrice = getPurchasePrice(framePurchaseProduct.id) ?? 0;
    const isBoutique = !!framePurchaseProduct.isBoutique;
    let rows: LensPurchaseRow[];

    if (isBoutique) {
      if (filledItems.length === 0) {
        message.warning('精品镜架请至少填写一行型号与色号');
        return;
      }
      rows = filledItems.map((i) => ({
        degree: `${i.model}/${i.colorCode}`,
        quantity: 1,
        unitPrice: i.unitPrice != null && i.unitPrice >= 0 ? i.unitPrice : defaultPrice,
      }));
    } else if (filledItems.length > 0) {
      rows = filledItems.map((i) => ({
        degree: `${i.model}/${i.colorCode}`,
        quantity: 1,
        unitPrice: defaultPrice,
      }));
    } else {
      const qty = values.quantity ?? 0;
      if (qty <= 0) {
        message.warning('请填写有效的数量，或在下方填写型号与色号');
        return;
      }
      rows = [{ degree: '—', quantity: qty, unitPrice: defaultPrice }];
    }

    const productName = getProductDisplayName(framePurchaseProduct);
    if (isLoggedIn()) {
      const backendId = getProductBackendId(framePurchaseProduct);
      if (backendId != null) {
        try {
          const orderNo = nextOrderNoFromList(purchaseList);
          await createPurchaseListOrder({ orderNo, productId: backendId, productName, rows });
          await refresh();
          closeFramePurchaseModal();
          setActiveTab('new');
          message.success('已加入采购列表');
          return;
        } catch (e) {
          console.error(e);
          message.error((e as Error)?.message ?? '提交失败');
          return;
        }
      }
    }
    purchaseListStorage.add({
      productId: framePurchaseProduct.id,
      productName,
      rows,
    });
    closeFramePurchaseModal();
    setActiveTab('new');
    const list = purchaseListStorage.getAll().filter((o) => o.status === 'active');
    const seen = new Set<string>();
    setPurchaseList(list.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }));
    message.success('已加入采购列表');
  }, [framePurchaseProduct, framePurchaseForm, closeFramePurchaseModal, message, refresh, getPurchasePrice, purchaseList, getProductBackendId, nextOrderNoFromList]);

  /** 镜片采购弹窗 - 确定：校验后写入采购列表 */
  const confirmLensPurchase = useCallback(async () => {
    if (!lensPurchaseProduct) return;
    const valid = lensPurchaseRows.every((r) => r.quantity >= 0 && r.unitPrice >= 0);
    if (!valid) {
      message.warning('请填写有效的数量与采购价格');
      return;
    }
    const hasQty = lensPurchaseRows.some((r) => r.quantity > 0);
    if (!hasQty) {
      message.warning('请至少输入一个光度的数量');
      return;
    }
    const rowsToSave: LensPurchaseRow[] = lensPurchaseRows
      .filter((r) => r.quantity > 0)
      .map(({ degree, quantity, unitPrice }) => ({ degree, quantity, unitPrice }));
    const productName = getProductDisplayName(lensPurchaseProduct);
    if (isLoggedIn()) {
      const backendId = getProductBackendId(lensPurchaseProduct);
      if (backendId != null) {
        try {
          const orderNo = nextOrderNoFromList(purchaseList);
          await createPurchaseListOrder({ orderNo, productId: backendId, productName, rows: rowsToSave });
          await refresh();
          closeLensPurchaseModal();
          setActiveTab('new');
          message.success('已加入采购列表');
          return;
        } catch (e) {
          console.error(e);
          message.error((e as Error)?.message ?? '提交失败');
          return;
        }
      }
    }
    purchaseListStorage.add({
      productId: lensPurchaseProduct.id,
      productName,
      rows: rowsToSave,
    });
    closeLensPurchaseModal();
    setActiveTab('new');
    const list = purchaseListStorage.getAll().filter((o) => o.status === 'active');
    const seen = new Set<string>();
    setPurchaseList(list.filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }));
    message.success('已加入采购列表');
  }, [lensPurchaseProduct, lensPurchaseRows, closeLensPurchaseModal, purchaseList, getProductBackendId, nextOrderNoFromList, refresh]);

  /** 编辑采购单：用该单数据打开镜片采购弹窗，按 degree 还原 cellKey 以支持网格拖拽 */
  const handleEditPurchaseOrder = useCallback((order: PurchaseListOrder) => {
    const product = products.find(
      (p) => String(p.id) === String(order.productId) || (p.backendId != null && String(p.backendId) === String(order.productId)),
    );
    if (!product) {
      message.warning('未找到对应商品');
      return;
    }
    setEditingOrderId(order.id);
    setLensPurchaseProduct(product);
    const rows: LensPurchaseRowWithKey[] = order.rows.map((r, i) => ({
      cellKey: degreeToCellKey(r.degree) ?? `legacy_${i}_${r.degree}`,
      degree: r.degree,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
    }));
    setLensPurchaseRows(rows);
  }, [products]);

  const handleCancelPurchaseOrder = useCallback((id: string) => {
    modal.confirm({
      title: '确认删除该采购单？',
      okText: '确认',
      cancelText: '返回',
      onOk: async () => {
        if (isLoggedIn() && /^\d+$/.test(id)) {
          try {
            await updatePurchaseListOrder(parseInt(id, 10), { status: 'cancelled' });
            await refresh();
            message.success('已删除');
            return;
          } catch (e) {
            console.error(e);
            message.error((e as Error)?.message ?? '删除失败');
            return;
          }
        }
        purchaseListStorage.update(id, { status: 'cancelled' });
        const list = purchaseListStorage.getAll().filter((o) => o.status === 'active');
        const seen = new Set<string>();
        setPurchaseList(list.filter((o) => {
          if (seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        }));
        message.success('已删除');
      },
    });
  }, [refresh]);

  /** 弹窗确定：新增或更新 */
  const confirmLensPurchaseOrUpdate = useCallback(async () => {
    if (editingOrderId) {
      const valid = lensPurchaseRows.every((r) => r.quantity >= 0 && r.unitPrice >= 0);
      if (!valid) {
        message.warning('请填写有效的数量与采购价格');
        return;
      }
      const rowsToSave: LensPurchaseRow[] = lensPurchaseRows
        .filter((r) => r.quantity > 0)
        .map(({ degree, quantity, unitPrice }) => ({ degree, quantity, unitPrice }));
      if (rowsToSave.length === 0) {
        message.warning('请至少输入一个光度的数量');
        return;
      }
      if (isLoggedIn() && /^\d+$/.test(editingOrderId)) {
        try {
          await updatePurchaseListOrder(parseInt(editingOrderId, 10), { rows: rowsToSave });
          await refresh();
          setEditingOrderId(null);
          closeLensPurchaseModal();
          setActiveTab('new');
          message.success('已更新');
          return;
        } catch (e) {
          console.error(e);
          message.error((e as Error)?.message ?? '更新失败');
          return;
        }
      }
      purchaseListStorage.update(editingOrderId, { rows: rowsToSave });
      setEditingOrderId(null);
      closeLensPurchaseModal();
      setActiveTab('new');
      const list = purchaseListStorage.getAll().filter((o) => o.status === 'active');
      const seen = new Set<string>();
      setPurchaseList(list.filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      }));
      message.success('已更新');
    } else {
      await confirmLensPurchase();
    }
  }, [editingOrderId, lensPurchaseRows, closeLensPurchaseModal, confirmLensPurchase, refresh]);

  /** 镜片采购弹窗点确定：新增时弹出“确认采购”；修改时弹出“是否确认修改采购订单”并展示修改前后内容 */
  const handleLensPurchaseOkWithConfirm = useCallback(() => {
    const valid = lensPurchaseRows.every((r) => r.quantity >= 0 && r.unitPrice >= 0);
    if (!valid) {
      message.warning('请填写有效的数量与采购价格');
      return;
    }
    const hasQty = lensPurchaseRows.some((r) => r.quantity > 0);
    if (!hasQty) {
      message.warning('请至少输入一个光度的数量');
      return;
    }
    const totalQty = lensPurchaseRows.reduce((s, r) => s + r.quantity, 0);
    const totalAmount = lensPurchaseRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
    const prices = [...new Set(lensPurchaseRows.map((r) => r.unitPrice))];
    const singlePrice = prices.length === 1 ? prices[0] : null;

    if (editingOrderId) {
      const originalOrder = purchaseList.find((o) => o.id === editingOrderId);
      if (!originalOrder) {
        message.warning('未找到原采购单');
        return;
      }
      const oldTotalQty = originalOrder.rows.reduce((s, x) => s + x.quantity, 0);
      const oldTotalAmt = originalOrder.rows.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
      const oldMap = new Map(originalOrder.rows.filter((r) => r.quantity > 0).map((r) => [r.degree, r.quantity]));
      const newMap = new Map(lensPurchaseRows.filter((r) => r.quantity > 0).map((r) => [r.degree, r.quantity]));
      const oldDegrees = [...oldMap.keys()].sort();
      const addedDegrees = [...newMap.keys()].filter((d) => !oldMap.has(d)).sort();
      const removedDegrees = [...oldMap.keys()].filter((d) => !newMap.has(d)).sort();
      modal.confirm({
        title: '是否确认修改采购订单？',
        width: 720,
        content: (
          <div>
            <div style={{ marginBottom: 16, textAlign: 'center', fontWeight: 500 }}>
              <span style={{ color: '#666' }}>商品名称：</span>
              {lensPurchaseProduct ? getProductDisplayName(lensPurchaseProduct) : originalOrder.productName}
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ flex: 1, padding: '12px', background: '#fafafa', borderRadius: 4 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#262626' }}>采购内容（修改前）</div>
                <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>光度明细：</div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {oldDegrees.map((degree) => {
                    const qty = oldMap.get(degree);
                    return (
                      <div key={degree} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                        <span>{degree}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qty} 片</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                  <div style={{ marginBottom: 4 }}><span style={{ color: '#666' }}>总数量：</span>{oldTotalQty} 片</div>
                  <div><span style={{ color: '#666' }}>总金额：</span>¥ {oldTotalAmt.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ flex: 1, padding: '12px', background: '#fafafa', borderRadius: 4 }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: '#262626' }}>修改内容（修改后）</div>
                <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>光度明细：</div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {oldDegrees
                    .filter((degree) => newMap.has(degree))
                    .map((degree) => {
                      const qty = newMap.get(degree);
                      return (
                        <div key={degree} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                          <span>{degree}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qty} 片</span>
                        </div>
                      );
                    })}
                  {addedDegrees.length > 0 && (
                    <>
                      {oldDegrees.filter((d) => newMap.has(d)).length > 0 && <div style={{ marginTop: 8, marginBottom: 4, fontSize: 12, color: '#52c41a', fontWeight: 500 }}>【新增】</div>}
                      {addedDegrees.map((degree) => {
                        const qty = newMap.get(degree);
                        return (
                          <div key={degree} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#52c41a' }}>
                            <span>{degree}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qty} 片</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {removedDegrees.length > 0 && (
                    <>
                      {(oldDegrees.filter((d) => newMap.has(d)).length > 0 || addedDegrees.length > 0) && <div style={{ marginTop: 8, marginBottom: 4, fontSize: 12, color: '#999', fontWeight: 500 }}>【取消】</div>}
                      {removedDegrees.map((degree) => {
                        const qty = oldMap.get(degree);
                        return (
                          <div key={degree} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#999' }}>
                            <span>{degree}</span>
                            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{qty} 片</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e8e8e8' }}>
                  <div style={{ marginBottom: 4 }}><span style={{ color: '#666' }}>总数量：</span>{totalQty} 片</div>
                  <div><span style={{ color: '#666' }}>总金额：</span>¥ {totalAmount.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        ),
        okText: '确认修改',
        cancelText: '取消',
        onOk: async () => await confirmLensPurchaseOrUpdate(),
      });
    } else {
      modal.confirm({
        title: '确认采购',
        width: 560,
        content: (
          <div style={{ lineHeight: 1.9 }}>
            <div><span style={{ color: '#666' }}>商品名称：</span>{lensPurchaseProduct ? getProductDisplayName(lensPurchaseProduct) : ''}</div>
            <div><span style={{ color: '#666' }}>采购数量：</span>{totalQty} 片</div>
            <div><span style={{ color: '#666' }}>采购单价：</span>{singlePrice != null ? `¥ ${singlePrice.toFixed(2)}` : '—'}</div>
            <div><span style={{ color: '#666' }}>采购总金额：</span><span style={{ fontWeight: 600 }}>¥ {totalAmount.toFixed(2)}</span></div>
          </div>
        ),
        okText: '确认',
        cancelText: '取消',
        onOk: async () => await confirmLensPurchaseOrUpdate(),
      });
    }
  }, [lensPurchaseProduct, lensPurchaseRows, message, modal, confirmLensPurchaseOrUpdate, editingOrderId, purchaseList]);

  const cylinderValues = useMemo(() => getCylinderValues(), []);

  /** 镜片采购网格：鼠标按下开始拖选。仅在设置的光度范围内的单元格可被选择 */
  const onLensGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('input, .ant-input-number')) return;
      const cell = (e.target as HTMLElement).closest('.purchase-lens-cell-item');
      if (!cell || !lensPurchaseProduct) return;
      const rowIndex = parseInt(cell.getAttribute('data-row') ?? '0', 10);
      const colValue = parseFloat(cell.getAttribute('data-col') ?? '0');
      const cellKey = `${rowIndex}_${colValue}`;
      const powerRange = lensPurchaseProduct.powerRange ?? [];
      if (!powerRange.includes(cellKey)) return; /* 不在光度范围内的单元格不能选择 */
      e.preventDefault();
      const wasSelected = lensPurchaseRows.some((r) => r.cellKey === cellKey);
      const defaultPrice = getPurchasePrice(lensPurchaseProduct.id) ?? 0;
      lensDragRef.current = { isDragging: true, start: { row: rowIndex, col: colValue }, isToggle: wasSelected, lastKey: '' };
      if (!wasSelected) lensDragAddedKeysRef.current = new Set([cellKey]);
      setLensPurchaseRows((prev) =>
        wasSelected ? prev.filter((r) => r.cellKey !== cellKey) : [...prev, { cellKey, degree: cellKeyToDegree(cellKey), quantity: 1, unitPrice: defaultPrice }],
      );
    },
    [lensPurchaseProduct, lensPurchaseRows, getPurchasePrice],
  );

  /** 镜片采购网格：拖动过程框选。仅对在设置的光度范围内的单元格生效 */
  const onLensGridMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const d = lensDragRef.current;
      if (!d.isDragging || !d.start || !lensPurchaseProduct) return;
      const cell = (e.target as HTMLElement).closest('.purchase-lens-cell-item');
      if (!cell) return;
      const rowIndex = parseInt(cell.getAttribute('data-row') ?? '0', 10);
      const colValue = parseFloat(cell.getAttribute('data-col') ?? '0');
      const powerRangeSet = new Set(lensPurchaseProduct.powerRange ?? []);
      if (!powerRangeSet.has(`${rowIndex}_${colValue}`)) return; /* 当前格不在范围内，不扩展选区 */
      const updateKey = `${d.start.row}_${d.start.col}_${rowIndex}_${colValue}_${d.isToggle}`;
      if (updateKey === d.lastKey) return;
      lensDragRef.current.lastKey = updateKey;
      const startColIndex = cylinderValues.indexOf(d.start.col);
      const endColIndex = cylinderValues.indexOf(colValue);
      if (startColIndex === -1 || endColIndex === -1) return;
      const minRow = Math.min(d.start.row, rowIndex);
      const maxRow = Math.max(d.start.row, rowIndex);
      const minCi = Math.min(startColIndex, endColIndex);
      const maxCi = Math.max(startColIndex, endColIndex);
      const defaultPrice = getPurchasePrice(lensPurchaseProduct.id) ?? 0;
      if (d.isToggle) {
        const removeKeys = new Set<string>();
        for (let r = minRow; r <= maxRow; r++)
          for (let c = minCi; c <= maxCi; c++) {
            const ck = `${r}_${cylinderValues[c]}`;
            if (powerRangeSet.has(ck)) removeKeys.add(ck);
          }
        setLensPurchaseRows((prev) => prev.filter((r) => !removeKeys.has(r.cellKey)));
      } else {
        setLensPurchaseRows((prev) => {
          const have = new Set(prev.map((r) => r.cellKey));
          const next = prev.slice();
          for (let r = minRow; r <= maxRow; r++)
            for (let c = minCi; c <= maxCi; c++) {
              const ck = `${r}_${cylinderValues[c]}`;
              if (powerRangeSet.has(ck) && !have.has(ck)) {
                have.add(ck);
                lensDragAddedKeysRef.current.add(ck);
                next.push({ cellKey: ck, degree: cellKeyToDegree(ck), quantity: 1, unitPrice: defaultPrice });
              }
            }
          return next;
        });
      }
    },
    [lensPurchaseProduct, cylinderValues],
  );

  /** 镜片采购网格：鼠标释放结束拖选；若有本次拖拽新增的格子，弹窗输入数量 */
  const onLensGridMouseUp = useCallback(() => {
    const added = lensDragAddedKeysRef.current;
    if (added.size > 0) {
      setLensBatchQtyModal({ cellKeys: Array.from(added), value: 1 });
      lensDragAddedKeysRef.current = new Set();
    }
    lensDragRef.current = { isDragging: false, start: null, isToggle: false, lastKey: '' };
  }, []);

  /** 镜片采购网格：右键已选格子弹窗编辑（默认 2）；右键空白格弹窗默认 1，仅点确认才加入、点取消不改 */
  const onLensGridContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const cell = (e.target as HTMLElement).closest('.purchase-lens-cell-item');
      if (!cell || !lensPurchaseProduct) return;
      if ((e.target as HTMLElement).closest('.purchase-lens-cell-out-of-range')) return;
      const rowIndex = parseInt(cell.getAttribute('data-row') ?? '0', 10);
      const colValue = parseFloat(cell.getAttribute('data-col') ?? '0');
      const cellKey = `${rowIndex}_${colValue}`;
      const powerRange = lensPurchaseProduct.powerRange ?? [];
      if (!powerRange.includes(cellKey)) return;
      const row = lensPurchaseRows.find((r) => r.cellKey === cellKey);
      if (row) {
        setLensQtyEdit({ cellKey, value: 2, isNew: false });
      } else {
        setLensQtyEdit({ cellKey, value: 1, isNew: true }); /* 空白格：只弹窗，默认 1，仅确认才选中 */
      }
    },
    [lensPurchaseProduct, lensPurchaseRows],
  );

  /** 编辑数量弹窗点取消：该格变为空（未选），并关闭弹窗 */
  const closeQtyEditCancel = useCallback(() => {
    if (lensQtyEdit && !lensQtyEdit.isNew) {
      setLensPurchaseRows((prev) => prev.filter((r) => r.cellKey !== lensQtyEdit.cellKey));
    }
    setLensQtyEdit(null);
  }, [lensQtyEdit]);

  /** 关闭镜片采购弹窗时清空数量编辑弹窗与批量数量弹窗 */
  useEffect(() => {
    if (!lensPurchaseProduct) {
      setLensQtyEdit(null);
      setLensBatchQtyModal(null);
    }
  }, [lensPurchaseProduct]);

  useEffect(() => {
    if (!lensPurchaseProduct) return;
    document.addEventListener('mouseup', onLensGridMouseUp);
    return () => document.removeEventListener('mouseup', onLensGridMouseUp);
  }, [lensPurchaseProduct, onLensGridMouseUp]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (location.pathname.startsWith('/purchase')) {
      refresh();
    }
  }, [location.pathname, refresh]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  useEffect(() => {
    if (categories.length === 0) return;
    const exists = categories.some((c) => c.id === selectedCategory);
    if (selectedCategory === null || !exists) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  const getDisplayPrice = useCallback((productId: string): number | '' => {
    if (localPrices[productId] !== undefined) return localPrices[productId];
    const p = getPurchasePrice(productId);
    return p === undefined ? '' : p;
  }, [localPrices, getPurchasePrice]);

  const setDisplayPrice = useCallback((productId: string, value: number | '') => {
    setLocalPrices((prev) => ({ ...prev, [productId]: value }));
  }, []);

  /** 商品名称转拼音首字母串（用于检索），如「蔡司」→「CS」 */
  const getPinyinInitials = useCallback((name: string): string => {
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
  }, []);

  const handleSaveRow = useCallback(
    (productId: string) => {
      const val = getDisplayPrice(productId);
      if (val === '' || val === undefined) {
        message.warning('请先输入采购价格');
        return;
      }
      const num = Number(val);
      if (Number.isNaN(num) || num < 0) {
        message.warning('请输入有效的采购价格');
        return;
      }
      const oldVal = getPurchasePrice(productId);
      const hadOld = oldVal !== undefined;
      const doSave = async () => {
        if (isLoggedIn()) {
          const product = products.find((p) => p.id === productId);
          const backendId = product ? getProductBackendId(product) : null;
          if (backendId != null) {
            await setPurchasePriceApi(backendId, num);
            setPurchasePricesMap((prev) => ({ ...prev, [productId]: num }));
          }
        }
        try {
          purchasePriceStorage.setPrice(productId, num);
        } catch (_) {}
        setLocalPrices((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        await refresh();
        message.success('已保存');
      };
      if (hadOld && oldVal !== num) {
        modal.confirm({
          title: '是否进行采购价格修改？',
          content: '确认将保存本次修改。',
          okText: '确认',
          cancelText: '取消',
          onOk: doSave,
        });
      } else {
        doSave();
      }
    },
    [getDisplayPrice, refresh, getPurchasePrice, products, getProductBackendId],
  );

  const buildColumns = useCallback(
    (categoryId: string): ColumnsType<Product> => {
      const category = categories.find((c) => c.id === categoryId);
      const isFrameCategory = category?.name === '镜架';
      
      const columns: ColumnsType<Product> = [
        { title: '序号', key: 'index', width: 72, align: 'center' as const, render: (_: unknown, __: Product, index: number) => index + 1 },
        { title: '商品名称', dataIndex: 'name', key: 'name', ellipsis: false, width: 420, render: (_: unknown, record: Product) => getProductDisplayName(record) },
        {
          title: '关联供应商',
          key: 'supplierId',
          width: 180,
          render: (_: unknown, record: Product) => {
            const supplier = record.supplierId ? suppliers.find((s) => s.id === record.supplierId) : null;
            if (supplier) {
              return (
                <Button
                  type="link"
                  size="small"
                  className="p-0"
                  onClick={() => {
                    setLinkingSupplierProductId(record.id);
                    linkSupplierForm.setFieldsValue({ linkSupplierId: record.supplierId });
                  }}
                >
                  {supplier.name}
                </Button>
              );
            }
            return (
              <Button
                type="link"
                size="small"
                className={blinkSupplierProductId === record.id ? 'p-0 purchase-link-supplier-blink' : 'p-0'}
                onClick={() => {
                  setLinkingSupplierProductId(record.id);
                  linkSupplierForm.setFieldsValue({ linkSupplierId: undefined });
                }}
              >
                关联供应商
              </Button>
            );
          },
        },
      ];

      // 只有镜架类别才显示精品列
      if (isFrameCategory) {
        columns.push({
          title: '精品',
          key: 'isBoutique',
          width: 80,
          align: 'center',
          render: (_: unknown, record: Product) => (record.isBoutique ? '是' : '否'),
        });
      }

      columns.push({
        title: '采购',
        dataIndex: 'id',
        key: 'purchase',
        width: 96,
        align: 'center',
        render: (_: unknown, record: Product) => (
          <Button
            size="small"
            onClick={() => {
              if (!record.supplierId) {
                message.warning('请关联供应商');
                setBlinkSupplierProductId(record.id);
                setTimeout(() => setBlinkSupplierProductId(null), 3000);
                return;
              }
              if (isLensProduct(record)) {
                if (!record.powerRange || record.powerRange.length === 0) {
                  message.warning('该镜片未维护光度范围，请先在商品管理中维护');
                  return;
                }
                openLensPurchaseModal(record);
              } else if (isFrameProduct(record)) {
                openFramePurchaseModal(record);
              } else if (isCareSolutionProduct(record)) {
                openCareSolutionPurchaseModal(record);
              } else setActiveTab('new');
            }}
          >
            采购
          </Button>
        ),
      });

      columns.push({
        title: () => <span className="purchase-price-col-offset purchase-price-header-title">采购价格</span>,
        key: 'purchasePrice',
        className: 'purchase-price-header-col',
        width: 140,
        align: 'center',
        sorter: (a: Product, b: Product) => {
          const pa = getDisplayPrice(a.id);
          const pb = getDisplayPrice(b.id);
          const na = (pa === '' || pa === undefined) ? Infinity : Number(pa);
          const nb = (pb === '' || pb === undefined) ? Infinity : Number(pb);
          return na - nb;
        },
        showSorterTooltip: false,
        render: (_: unknown, record: Product) => (
          <span className="purchase-price-col-offset" style={{ display: 'inline-block' }}>
            <InputNumber
              placeholder="采购价格"
              value={getDisplayPrice(record.id)}
              onChange={(v) => setDisplayPrice(record.id, v ?? '')}
              min={0}
              precision={2}
              controls={false}
              style={{ width: 88 }}
              size="small"
            />
          </span>
        ),
      });

      columns.push({
        title: () => <span className="purchase-save-col-offset">保存</span>,
        key: 'save',
        className: 'purchase-save-header-col',
        width: 96,
        align: 'center',
        render: (_: unknown, record: Product) => (
          <span className="purchase-save-col-offset" style={{ display: 'inline-block' }}>
            <Button type="primary" size="small" onClick={() => handleSaveRow(record.id)}>
              保存
            </Button>
          </span>
        ),
      });

      return columns;
    },
    [getDisplayPrice, setDisplayPrice, handleSaveRow, setActiveTab, isLensProduct, isFrameProduct, isCareSolutionProduct, openLensPurchaseModal, openFramePurchaseModal, openCareSolutionPurchaseModal, suppliers, linkSupplierForm, categories, message, blinkSupplierProductId],
  );

  const categoryTabItems = useMemo(
    () =>
      categories.map((c) => {
        const categoryProducts = products.filter((p) => p.category === c.id);
        const kw = (productSearchKeyword ?? '').trim().toLowerCase();
        const filteredProducts = kw
          ? categoryProducts.filter((p) => getPinyinInitials(p.name).toLowerCase().startsWith(kw))
          : categoryProducts;
        return {
          key: c.id,
          label: c.name,
          children: (
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="purchase-list-title-category">{c.name}</span>
                  <span className="purchase-list-title-suffix"> - 商品列表</span>
                  <Input
                    allowClear
                    placeholder="按商品名称拼音首字母检索"
                    value={productSearchKeyword}
                    onChange={(e) => setProductSearchKeyword(e.target.value)}
                    style={{ width: 220 }}
                    autoComplete="off"
                  />
                </div>
              }
              className="form-card purchase-product-list-card purchase-list-card-connected"
            >
              <Table
                columns={buildColumns(c.id)}
                dataSource={filteredProducts}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1020 }}
              />
            </Card>
          ),
        };
      }),
    [categories, products, buildColumns, productSearchKeyword, getPinyinInitials],
  );

  /** 采购列表展示顺序：未入库在最前，已入库按入库时间倒序（最新在前） */
  const purchaseListSorted = useMemo(() => {
    const notStocked = purchaseList.filter((o) => !o.stockInAt);
    const stocked = purchaseList.filter((o) => o.stockInAt).sort((a, b) => {
      const ta = (a.stockInAt ?? '').localeCompare(b.stockInAt ?? '');
      return -ta;
    });
    return [...notStocked, ...stocked];
  }, [purchaseList]);

  /** 采购单详情弹窗宽度：根据内容类型响应式设置（护理液较窄，镜片/镜架较宽） */
  const purchaseDetailModalWidth = useMemo(() => {
    if (!viewingOrder) return 420;
    const product = products.find((p) => p.id === viewingOrder.productId);
    const categoryName = categories.find((c) => c.id === product?.category)?.name;
    if (categoryName === '护理液') return 380;
    if (categoryName === '镜架') return 680;
    return 640; // 镜片等
  }, [viewingOrder, products, categories]);

  const tabItems = [
    {
      key: 'price',
      label: '采购价格管理',
      children: (
        <div className="purchase-tab">
          {categories.length === 0 ? (
            <Card title="采购价格管理" className="form-card">
              <p style={{ color: '#666' }}>暂无类别，请先在商品信息管理中添加类别。</p>
            </Card>
          ) : (
            <div className="purchase-category-connected">
              <Tabs
                type="card"
                activeKey={selectedCategory ?? categories[0]?.id ?? ''}
                onChange={(key) => setSelectedCategory(key)}
                items={categoryTabItems}
                className="purchase-category-tabs"
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'new',
      label: '采购列表',
      children: (
        <div className="purchase-tab">
          <Tabs
            type="card"
            activeKey={purchaseListSubTab}
            onChange={(k) => setPurchaseListSubTab(k as PurchaseListSubTabKey)}
            items={[
              {
                key: 'purchase-orders',
                label: '采购单',
                children: (
                  <Card
                    title={
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        采购列表
                        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={refresh}>
                          刷新
                        </Button>
                      </span>
                    }
                    className="form-card"
                  >
                    <Table<PurchaseListOrder>
                      dataSource={purchaseListSorted}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: '采购单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
                        {
                          title: '类别',
                          key: 'category',
                          width: 100,
                          render: (_: unknown, r: PurchaseListOrder) => {
                            const product = products.find((p) => p.id === r.productId);
                            const category = product ? categories.find((c) => c.id === product.category) : null;
                            const categoryName = category?.name ?? '—';
                            return (
                              <span style={{ color: r.stockInAt ? undefined : '#ff4d4f' }}>
                                {categoryName}
                              </span>
                            );
                          },
                        },
                        {
                          title: '采购商品信息',
                          key: 'summary',
                          render: (_: unknown, r: PurchaseListOrder) => {
                            const totalQty = r.rows.reduce((s, x) => s + x.quantity, 0);
                            const totalAmt = r.rows.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
                            return (
                              <span>
                                {r.productName}，共 {r.rows.length} 个光度，合计 {totalQty} 片，金额 ¥{totalAmt.toFixed(2)}
                              </span>
                            );
                          },
                        },
                        {
                          title: '入库',
                          key: 'stockIn',
                          width: 100,
                          align: 'center',
                          render: (_: unknown, r: PurchaseListOrder) =>
                            r.stockInAt ? (
                              <span style={{ color: '#52c41a' }}>已入库</span>
                            ) : (
                              <Button
                                size="small"
                                type="primary"
                                onClick={() => setStockInConfirmOrder(r)}
                              >
                                入库
                              </Button>
                            ),
                        },
                        {
                          title: '操作',
                          key: 'actions',
                          width: 200,
                          render: (_: unknown, r: PurchaseListOrder) => (
                            <span style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
                              <Button size="small" onClick={() => setViewingOrder(r)}>查看</Button>
                              <Button size="small" onClick={() => handleEditPurchaseOrder(r)}>修改</Button>
                              <Button size="small" danger onClick={() => handleCancelPurchaseOrder(r.id)}>删除</Button>
                            </span>
                          ),
                        },
                      ]}
                    />
                  </Card>
                ),
              },
              {
                key: 'sales-custom',
                label: '销售定制',
                children: (
                  <Card title="销售定制" className="form-card">
                    <SalesCustomList activeSubTab={purchaseListSubTab} records={isLoggedIn() ? salesCustomList : undefined} />
                  </Card>
                ),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="purchase-page">
      <h1 className="purchase-page-title">采购管理</h1>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
        items={tabItems}
      />
      <Modal
        title="镜片采购"
        open={!!lensPurchaseProduct}
        onCancel={() => {
          setEditingOrderId(null);
          closeLensPurchaseModal();
        }}
        footer={null}
        width={950}
        destroyOnHidden
      >
        {lensPurchaseProduct && (() => {
          const powerRange = lensPurchaseProduct.powerRange || [];
          const sphereValues = getSphereValues();
          /** 仅显示设置的光度范围：与光度范围一致，只显示 powerRange 中出现的行、列 */
          const rowIndices = [...new Set(powerRange.map((ck) => parseInt(ck.split('_')[0], 10)))].sort((a, b) => a - b);
          const colCyls = [...new Set(powerRange.map((ck) => parseFloat(ck.split('_')[1])))].sort((a, b) => b - a);
          const rowByKey: Record<string, LensPurchaseRowWithKey> = {};
          lensPurchaseRows.forEach((r) => { rowByKey[r.cellKey] = r; });
          const colCount = colCyls.length;
          const firstColW = 96; /* 第二列（球镜度数列）宽度 */
          const cylColW = 46; /* 柱镜列宽度 */
          const gridCols = colCount ? `${firstColW}px repeat(${colCount}, ${cylColW}px)` : `${firstColW}px`;
          const hasRange = powerRange.length > 0;
          return (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12, fontWeight: 500 }}>商品名称：{getProductDisplayName(lensPurchaseProduct)}</div>
              <div style={{ marginBottom: 6, fontSize: 13, color: '#666' }}>
                光度范围（横坐标柱镜、纵坐标球镜，仅显示已设置的光度）。拖拽框选多个光度。
                {!hasRange && <span style={{ color: '#faad14' }}> 当前商品未设置光度范围，请先在商品编辑中设置。</span>}
              </div>
              {!hasRange && (
                <div style={{ padding: 24, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>暂无光度范围，无法选择采购度数</div>
              )}
              {hasRange && (
              <div className="purchase-lens-grid-wrap" onMouseDown={onLensGridMouseDown} onMouseMove={onLensGridMouseMove} onContextMenu={onLensGridContextMenu}>
                <div className="purchase-lens-grid">
                  <div className="purchase-lens-grid-header" style={{ gridTemplateColumns: gridCols } as React.CSSProperties}>
                    <div className="purchase-lens-grid-header-cell purchase-lens-grid-first-col">球镜/柱镜</div>
                    {colCyls.map((cyl) => (
                      <div key={cyl} className="purchase-lens-grid-header-cell">
                        {cyl >= 0 ? `+${cyl.toFixed(2)}` : cyl.toFixed(2)}
                      </div>
                    ))}
                  </div>
                  <div className="purchase-lens-grid-body">
                    {rowIndices.map((rowIndex) => {
                      const sphere = sphereValues[rowIndex] ?? 0;
                      return (
                        <div key={rowIndex} className="purchase-lens-grid-row" style={{ gridTemplateColumns: gridCols } as React.CSSProperties}>
                          <div className="purchase-lens-grid-label">{sphere >= 0 ? `+${sphere.toFixed(2)}` : sphere.toFixed(2)}</div>
                          {colCyls.map((cyl) => {
                            const cellKey = `${rowIndex}_${cyl}`;
                            const isInRange = powerRange.includes(cellKey);
                            const row = rowByKey[cellKey];
                            const isSelected = !!row;
                            return (
                              <div
                                key={cyl}
                                className={`purchase-lens-cell-item ${isSelected ? 'selected' : ''} ${!isInRange ? 'purchase-lens-cell-out-of-range' : ''}`}
                                data-row={rowIndex}
                                data-col={cyl}
                              >
                                {isSelected && <span className="purchase-lens-cell-qty">{row?.quantity ?? 1}</span>}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              )}
              {(() => {
                const totalQty = lensPurchaseRows.reduce((s, r) => s + r.quantity, 0);
                const totalAmount = lensPurchaseRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
                const prices = [...new Set(lensPurchaseRows.map((r) => r.unitPrice))];
                const singlePrice = prices.length === 1 ? prices[0] : null;
                return (
                  <div style={{ marginTop: 12, padding: '12px 0', borderTop: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontWeight: 500 }}>
                      <span>采购数量：<span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span> 片</span>
                      <span>采购单价：{singlePrice != null ? `¥ ${singlePrice.toFixed(2)}` : '—'}</span>
                      <span>总金额：<span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {totalAmount.toFixed(2)}</span></span>
                    </div>
                  </div>
                );
              })()}
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={() => { setEditingOrderId(null); closeLensPurchaseModal(); }}>取消</Button>
                <Button type="primary" onClick={handleLensPurchaseOkWithConfirm}>确定</Button>
              </div>
            </div>
          );
        })()}
      </Modal>
      <Modal
        title="请输入数量"
        open={!!lensBatchQtyModal}
        onCancel={() => setLensBatchQtyModal(null)}
        footer={[
          <Button key="cancel" onClick={() => setLensBatchQtyModal(null)}>取消</Button>,
          <Button
            key="ok"
            type="primary"
            onClick={() => {
              if (!lensBatchQtyModal) return;
              const keysSet = new Set(lensBatchQtyModal.cellKeys);
              const qty = Math.max(0, Math.floor(Number(lensBatchQtyModal.value)));
              setLensPurchaseRows((prev) =>
                prev.map((r) => (keysSet.has(r.cellKey) ? { ...r, quantity: qty } : r)),
              );
              setLensBatchQtyModal(null);
            }}
          >
            确认
          </Button>,
        ]}
        destroyOnHidden
        width={360}
      >
        {lensBatchQtyModal && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 8, color: '#666' }}>
              已选择 {lensBatchQtyModal.cellKeys.length} 个光度，请填写采购数量（片）：
            </div>
            <InputNumber
              min={0}
              value={lensBatchQtyModal.value}
              onChange={(v) => setLensBatchQtyModal((prev) => (prev ? { ...prev, value: v ?? 0 } : null))}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </Modal>
      <Modal
        title="编辑数量"
        open={!!lensQtyEdit}
        onCancel={closeQtyEditCancel}
        footer={[
          <Button key="cancel" onClick={closeQtyEditCancel}>取消</Button>,
          <Button
            key="ok"
            type="primary"
            onClick={() => {
              if (!lensQtyEdit) return;
              const defaultPrice = lensPurchaseProduct ? getPurchasePrice(lensPurchaseProduct.id) ?? 0 : 0;
              if (lensQtyEdit.isNew) {
                setLensPurchaseRows((prev) => [
                  ...prev,
                  { cellKey: lensQtyEdit.cellKey, degree: cellKeyToDegree(lensQtyEdit.cellKey), quantity: lensQtyEdit.value, unitPrice: defaultPrice },
                ]);
              } else {
                setLensPurchaseRows((prev) =>
                  prev.map((r) => (r.cellKey === lensQtyEdit.cellKey ? { ...r, quantity: lensQtyEdit.value } : r)),
                );
              }
              setLensQtyEdit(null);
            }}
          >
            确认
          </Button>,
        ]}
        destroyOnHidden
        width={480}
      >
        {lensQtyEdit && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 8, wordBreak: 'keep-all' }}>
              <span style={{ color: '#666' }}>光度：</span>
              <span style={{ fontWeight: 500 }}>{cellKeyToDegree(lensQtyEdit.cellKey)}</span>
            </div>
            <div>
              <span style={{ color: '#666', marginRight: 8 }}>数量（片）：</span>
              <InputNumber
                min={0}
                value={lensQtyEdit.value}
                onChange={(v) => setLensQtyEdit((prev) => (prev ? { ...prev, value: v ?? 0 } : null))}
                style={{ width: 120 }}
              />
            </div>
          </div>
        )}
      </Modal>
      <Modal
        title="采购单详情"
        open={!!viewingOrder}
        onCancel={() => setViewingOrder(null)}
        footer={<Button onClick={() => setViewingOrder(null)}>关闭</Button>}
        width={purchaseDetailModalWidth}
        destroyOnHidden
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 12 } }}
      >
        {viewingOrder && (() => {
          const product = products.find((p) => p.id === viewingOrder.productId);
          const categoryName = categories.find((c) => c.id === product?.category)?.name;
          const isFrame = categoryName === '镜架';
          const isCareSolution = categoryName === '护理液';
          const totalQty = viewingOrder.rows.reduce((s, r) => s + r.quantity, 0);
          const totalAmt = viewingOrder.rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
          const parseDegree = (d: string): { sphere: number; cyl: number } => {
            const parts = (d ?? '').trim().split('/');
            if (parts.length !== 2) return { sphere: 0, cyl: 0 };
            const sphere = parseFloat(parts[0].trim());
            const cyl = parseFloat(parts[1].trim());
            return { sphere: Number.isNaN(sphere) ? 0 : sphere, cyl: Number.isNaN(cyl) ? 0 : cyl };
          };
          const filteredRows = viewingOrder.rows.filter((r) => r.quantity > 0);
          const detailRows = isFrame
            ? [...filteredRows]
            : [...filteredRows].sort((a, b) => {
                const pa = parseDegree(a.degree);
                const pb = parseDegree(b.degree);
                if (pa.cyl !== pb.cyl) return pa.cyl - pb.cyl;
                return pa.sphere - pb.sphere;
              });
          const mid = Math.ceil(detailRows.length / 2);
          const leftRows = detailRows.slice(0, mid);
          const rightRows = detailRows.slice(mid);
          const firstColTitle = isFrame ? '型号/色号' : '光度';
          const detailColumns = isCareSolution
            ? [
                { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'center' as const },
                {
                  title: '采购价',
                  key: 'unitPrice',
                  width: 90,
                  align: 'right' as const,
                  render: (_: unknown, r: LensPurchaseRow) => `¥ ${r.unitPrice.toFixed(2)}`,
                },
              ]
            : [
                { title: firstColTitle, dataIndex: 'degree', key: 'degree', width: 100 },
                { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'center' as const },
                {
                  title: '采购价',
                  key: 'unitPrice',
                  width: 90,
                  align: 'right' as const,
                  render: (_: unknown, r: LensPurchaseRow) => `¥ ${r.unitPrice.toFixed(2)}`,
                },
              ];
          const sectionTitle = isCareSolution ? '明细：' : isFrame ? '型号/色号明细：' : '光度明细：';
          const qtyUnit = isFrame ? '副' : isCareSolution ? '瓶' : '片';
          return (
            <div>
              {!isCareSolution && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{ color: '#666' }}>采购单号：</span>
                  <span style={{ fontWeight: 500 }}>{viewingOrder.orderNo}</span>
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <span style={{ color: '#666' }}>商品名称：</span>
                <span style={{ fontWeight: 500 }}>{viewingOrder.productName}</span>
              </div>
              <div style={{ marginBottom: 12, display: 'flex', gap: 24, fontWeight: 500 }}>
                <span>采购总数量：<span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span> {qtyUnit}</span>
                <span>总金额：<span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {totalAmt.toFixed(2)}</span></span>
              </div>
              <div style={{ marginBottom: 8, color: '#666' }}>{sectionTitle}</div>
              {isCareSolution ? (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Table
                    size="small"
                    dataSource={leftRows}
                    rowKey={(record) => record.degree}
                    pagination={false}
                    columns={detailColumns}
                    showHeader
                  />
                </div>
              ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: rightRows.length > 0 ? '1fr 1px 1fr' : '1fr',
                  gap: rightRows.length > 0 ? 16 : 0,
                  alignItems: 'stretch',
                }}
              >
                <div>
                  <Table
                    size="small"
                    dataSource={leftRows}
                    rowKey={(record) => record.degree}
                    pagination={false}
                    columns={detailColumns}
                  />
                </div>
                {rightRows.length > 0 && (
                  <>
                    <div style={{ background: '#e8e8e8', width: 1, minHeight: 24 }} />
                    <div>
                      <Table
                        size="small"
                        dataSource={rightRows}
                        rowKey={(record) => record.degree}
                        pagination={false}
                        columns={detailColumns}
                      />
                    </div>
                  </>
                )}
              </div>
              )}
            </div>
          );
        })()}
      </Modal>
      <Modal
        title="请确认是否入库"
        open={!!stockInConfirmOrder}
        onCancel={() => setStockInConfirmOrder(null)}
        onOk={async () => {
          if (!stockInConfirmOrder) return;
          const stockInAt = new Date().toISOString();
          if (isLoggedIn() && /^\d+$/.test(stockInConfirmOrder.id)) {
            try {
              await updatePurchaseListOrder(parseInt(stockInConfirmOrder.id, 10), { stockInAt });
              await refresh();
              setStockInConfirmOrder(null);
              message.success('入库成功');
              return;
            } catch (e) {
              console.error(e);
              message.error((e as Error)?.message ?? '入库失败');
              return;
            }
          }
          const updated = purchaseListStorage.update(stockInConfirmOrder.id, { stockInAt });
          if (updated) {
            setPurchaseList((prev) =>
              prev.map((o) => (o.id === stockInConfirmOrder.id ? { ...o, stockInAt } : o)),
            );
          }
          setStockInConfirmOrder(null);
          message.success('入库成功');
        }}
        okText="确认"
        cancelText="取消"
        width={560}
      >
        {stockInConfirmOrder && (() => {
          const totalQty = stockInConfirmOrder.rows.reduce((s, x) => s + x.quantity, 0);
          const totalAmt = stockInConfirmOrder.rows.reduce((s, x) => s + x.quantity * x.unitPrice, 0);
          const prices = [...new Set(stockInConfirmOrder.rows.map((r) => r.unitPrice))];
          const purchasePriceText = prices.length === 1 ? `¥ ${prices[0].toFixed(2)}` : '多档';
          return (
            <div style={{ padding: '8px 0', marginLeft: -8 }}>
              <div style={{ marginBottom: 12 }}><span style={{ color: '#666' }}>商品名称：</span>{stockInConfirmOrder.productName}</div>
              <div style={{ marginBottom: 12 }}><span style={{ color: '#666' }}>数量：</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span></div>
              <div style={{ marginBottom: 12 }}><span style={{ color: '#666' }}>采购单价：</span>{purchasePriceText}</div>
              <div><span style={{ color: '#666' }}>总金额：</span><span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>¥ {totalAmt.toFixed(2)}</span></div>
            </div>
          );
        })()}
      </Modal>
      <Modal
        title="镜架采购"
        open={!!framePurchaseProduct}
        onCancel={closeFramePurchaseModal}
        footer={null}
        width={560}
        destroyOnHidden
      >
        {framePurchaseProduct && (
          <Form
            form={framePurchaseForm}
            layout="vertical"
            autoComplete="off"
            initialValues={{ quantity: 1, items: FRAME_ITEMS_DEFAULT }}
            onValuesChange={(changed, all) => {
              if ('items' in changed && Array.isArray(all.items) && !framePurchaseProduct?.isBoutique) {
                const n = all.items.filter((i: { model?: string; colorCode?: string }) => (i?.model ?? '').trim() && (i?.colorCode ?? '').trim()).length;
                if (n > 0) framePurchaseForm.setFieldValue('quantity', n);
              }
            }}
          >
            <div style={{ marginBottom: 16, fontWeight: 500 }}>商品名称：{getProductDisplayName(framePurchaseProduct)}</div>
            {framePurchaseProduct.isBoutique && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#e6f7ff', borderRadius: 6, fontSize: 13, color: '#0050b3' }}>
                精品镜架：每行填写型号、色号及采购价，一副一个型号色号。采购单中只显示一个商品名称，查看采购单详情时可查看型号/色号明细。
              </div>
            )}
            {!framePurchaseProduct.isBoutique && (
              <Form.Item
                name="quantity"
                label="数量（仅填数量时生效；填写下方型号/色号时将按行数自动计算数量）"
                rules={[{ type: 'number', min: 0, message: '数量不能为负' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="直接采购时填写数量" />
              </Form.Item>
            )}
            <Form.Item label={framePurchaseProduct.isBoutique ? '型号 / 色号 / 采购价（每行一副，必填）' : '型号 / 色号（可选，填写后按行数自动计算数量）'}>
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...rest }) => (
                      <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        <Form.Item name={[name, 'model']} noStyle rules={[]}>
                          <Input placeholder="型号" style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name={[name, 'colorCode']} noStyle rules={[]}>
                          <Input placeholder="色号" style={{ width: 100 }} />
                        </Form.Item>
                        {framePurchaseProduct.isBoutique && (
                          <Form.Item name={[name, 'unitPrice']} noStyle rules={[]}>
                            <InputNumber placeholder="采购价" min={0} precision={2} style={{ width: 100 }} controls={false} />
                          </Form.Item>
                        )}
                        {fields.length > 1 && (
                          <Button type="text" danger size="small" onClick={() => remove(name)}>删除</Button>
                        )}
                      </div>
                    ))}
                    <Button type="dashed" onClick={() => add({ model: '', colorCode: '', unitPrice: undefined })} block style={{ marginBottom: 8 }}>
                      + 增加一行
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeFramePurchaseModal}>取消</Button>
              <Button type="primary" onClick={confirmFramePurchase}>确定</Button>
            </div>
          </Form>
        )}
      </Modal>
      <Modal
        title="护理液采购"
        open={!!careSolutionPurchaseProduct}
        onCancel={closeCareSolutionPurchaseModal}
        footer={null}
        width={420}
        destroyOnHidden
      >
        {careSolutionPurchaseProduct && (
          <Form
            form={careSolutionPurchaseForm}
            layout="vertical"
            autoComplete="off"
            onFinish={(values: CareSolutionFormValues) => confirmCareSolutionPurchase(values)}
          >
            <div style={{ marginBottom: 16, fontWeight: 500 }}>商品名称：{getProductDisplayName(careSolutionPurchaseProduct)}</div>
            <Form.Item
              name="quantity"
              label="采购数量"
              rules={[{ required: true, message: '请输入采购数量' }, { type: 'number', min: 1, message: '采购数量须大于 0' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder="请输入采购数量" />
            </Form.Item>
            <Form.Item
              name="unitPrice"
              label="采购单价（元）"
              rules={[{ required: true, message: '请输入采购单价' }, { type: 'number', min: 0, message: '采购单价不能为负' }]}
            >
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="请输入采购单价" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.quantity !== curr?.quantity || prev?.unitPrice !== curr?.unitPrice}>
              {({ getFieldValue }) => {
                const q = getFieldValue('quantity') ?? 0;
                const p = getFieldValue('unitPrice') ?? 0;
                const amount = (typeof q === 'number' && typeof p === 'number') ? q * p : 0;
                return (
                  <div style={{ marginBottom: 16, marginLeft: -8, padding: '12px 0', borderTop: '1px solid #f0f0f0', fontWeight: 500 }}>
                    <span style={{ color: '#666' }}>总金额：</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {amount.toFixed(2)}</span>
                  </div>
                );
              }}
            </Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeCareSolutionPurchaseModal}>取消</Button>
              <Button type="primary" htmlType="submit">确认</Button>
            </div>
          </Form>
        )}
      </Modal>
      <Modal
        title="关联供应商"
        open={!!linkingSupplierProductId}
        onOk={() => {
          linkSupplierForm.validateFields().then(async (values: { linkSupplierId: string }) => {
            if (linkingSupplierProductId) {
              const product = products.find((p) => p.id === linkingSupplierProductId);
              if (isLoggedIn() && product?.backendId != null) {
                await updateProduct(product.backendId, { supplier_id: Number(values.linkSupplierId) }).catch((e) =>
                  message.warning(`本地已更新，同步到服务器失败：${(e as Error).message}`)
                );
              }
              productStorage.update(linkingSupplierProductId, {
                supplierId: values.linkSupplierId,
              });
              message.success('供应商关联成功');
              setLinkingSupplierProductId(null);
              linkSupplierForm.resetFields();
              refresh();
            }
          });
        }}
        onCancel={() => {
          setLinkingSupplierProductId(null);
          linkSupplierForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={linkSupplierForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="linkSupplierId"
            label="选择供应商"
            rules={[{ required: true, message: '请选择供应商' }]}
          >
            <Select
              placeholder="请选择供应商"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
