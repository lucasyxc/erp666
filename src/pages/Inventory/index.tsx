import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, Card, Table, Input, Button, Modal, App, InputNumber } from 'antd';
import { ReloadOutlined, EyeOutlined, WarningOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  isLoggedIn,
  listCategories,
  listProducts,
  listBrands,
  listPurchaseListOrders,
  listPurchasePrices,
  listStockAlertConfigs,
  getStockAlertPurchasedIds,
  listSalesOutboundRecords,
  setStockAlertConfig as setStockAlertConfigApi,
  removeStockAlertConfig as removeStockAlertConfigApi,
  setStockAlertPurchasedIds as setStockAlertPurchasedIdsApi,
  addStockAlertPurchasedIds as addStockAlertPurchasedIdsApi,
  createPurchaseListOrder,
} from '../../utils/api';
import { productStorage, categoryStorage, brandStorage, purchasePriceStorage, purchaseListStorage, stockAlertStorage, stockAlertPurchasedStorage, salesOutboundStorage } from '../../utils/storage';
import { getSphereValues, getCylinderValues, cellKeyToDegree } from '../../utils/powerRange';
import type { Category, Product, Brand, SalesOutboundRecord } from '../../types';
import type { LensPurchaseRow, PurchaseListOrder, StockAlertConfig } from '../../types';
import { getProductDisplayName } from '../../types';
import './index.css';

type TabKey = 'list' | 'inStockList' | 'alertList' | 'stockLog';
type StockLogSubTabKey = 'purchase-in' | 'sales-custom-in' | 'sales-out' | 'transfer' | 'return-exchange';

/** 镜片库存预警设置弹窗：横坐标柱镜、纵坐标球镜，显示光度范围，拖拽选择后弹窗输入预警数量，右键单格单独设置 */
function LensAlertSettingModal({
  product,
  initialConfig,
  onClose,
  onSave,
}: {
  product: Product;
  initialConfig?: StockAlertConfig | undefined;
  onClose: () => void;
  onSave: (product: Product, config: StockAlertConfig) => void | Promise<void>;
}) {
  const { message } = App.useApp();
  const powerRange = product.powerRange ?? [];
  const sphereValues = getSphereValues();
  const cylinderValues = getCylinderValues();
  const rowIndices = useMemo(
    () => [...new Set(powerRange.map((ck) => parseInt(ck.split('_')[0], 10)))].sort((a, b) => a - b),
    [powerRange],
  );
  const colCyls = useMemo(
    () => [...new Set(powerRange.map((ck) => parseFloat(ck.split('_')[1])))].sort((a, b) => b - a),
    [powerRange],
  );
  const powerRangeSet = useMemo(() => new Set(powerRange), [powerRange]);
  const firstColW = 96;
  const cylColW = 46;
  const gridCols = colCyls.length ? `${firstColW}px repeat(${colCyls.length}, ${cylColW}px)` : `${firstColW}px`;

  const existing = initialConfig ?? stockAlertStorage.get(product.id);
  const initialByDegree: Record<string, number> =
    existing?.type === 'lens' ? { ...existing.byDegree } : {};
  const [byDegree, setByDegree] = useState<Record<string, number>>(initialByDegree);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [inputModalVisible, setInputModalVisible] = useState(false);
  const [inputModalMode, setInputModalMode] = useState<'batch' | 'single'>('batch');
  const [singleCellKey, setSingleCellKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  const isToggleModeRef = useRef(false);
  const lastUpdateRef = useRef('');
  const selectedCellsRef = useRef<Set<string>>(new Set());
  useEffect(() => { selectedCellsRef.current = selectedCells; }, [selectedCells]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('.inventory-alert-lens-cell');
      if (!cell) return;
      const rowIndex = parseInt(cell.getAttribute('data-row') ?? '0', 10);
      const colValue = parseFloat(cell.getAttribute('data-col') ?? '0');
      const cellKey = `${rowIndex}_${colValue}`;
      if (!powerRangeSet.has(cellKey)) return;
      e.preventDefault();
      const wasSelected = selectedCells.has(cellKey);
      isDraggingRef.current = true;
      dragStartRef.current = { row: rowIndex, col: colValue };
      isToggleModeRef.current = wasSelected;
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (wasSelected) next.delete(cellKey);
        else next.add(cellKey);
        return next;
      });
    },
    [powerRangeSet, selectedCells],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingRef.current || !dragStartRef.current) return;
      const target = e.target as HTMLElement;
      const cell = target.closest('.inventory-alert-lens-cell');
      if (!cell) return;
      const rowIndex = parseInt(cell.getAttribute('data-row') ?? '0', 10);
      const colValue = parseFloat(cell.getAttribute('data-col') ?? '0');
      const cellKey = `${rowIndex}_${colValue}`;
      if (!powerRangeSet.has(cellKey)) return;
      const start = dragStartRef.current;
      const updateKey = `${start.row}_${start.col}_${rowIndex}_${colValue}_${isToggleModeRef.current}`;
      if (lastUpdateRef.current === updateKey) return;
      lastUpdateRef.current = updateKey;
      const minRow = Math.min(start.row, rowIndex);
      const maxRow = Math.max(start.row, rowIndex);
      const minCyl = Math.min(start.col, colValue);
      const maxCyl = Math.max(start.col, colValue);
      setSelectedCells((prev) => {
        const next = new Set(prev);
        for (let r = minRow; r <= maxRow; r++) {
          for (const c of colCyls) {
            if (c < minCyl - 0.01 || c > maxCyl + 0.01) continue;
            const key = `${r}_${c}`;
            if (!powerRangeSet.has(key)) continue;
            if (isToggleModeRef.current) next.delete(key);
            else next.add(key);
          }
        }
        return next;
      });
    },
    [colCyls, powerRangeSet],
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current && selectedCellsRef.current.size > 0) {
      setInputModalMode('batch');
      setSingleCellKey(null);
      setInputValue('');
      setInputModalVisible(true);
    }
    isDraggingRef.current = false;
    dragStartRef.current = null;
    lastUpdateRef.current = '';
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const openSingleInput = useCallback((cellKey: string) => {
    setSingleCellKey(cellKey);
    setInputModalMode('single');
    setInputValue(String(byDegree[cellKey] ?? ''));
    setInputModalVisible(true);
  }, [byDegree]);

  /** 子弹窗「确定」：仅更新本地 byDegree，不写入存储；完成设置需点击主弹窗「确认」 */
  const handleInputConfirm = useCallback(() => {
    const num = parseInt(inputValue.trim(), 10);
    if (Number.isNaN(num) || num < 0) {
      message.error('请输入有效的预警数量（非负整数）');
      return;
    }
    if (inputModalMode === 'batch') {
      const cells = selectedCellsRef.current;
      const next = { ...byDegree };
      cells.forEach((k) => { next[k] = num; });
      setByDegree(next);
      setSelectedCells(new Set());
    } else if (singleCellKey) {
      const next = { ...byDegree, [singleCellKey]: num };
      setByDegree(next);
    }
    setInputModalVisible(false);
    setInputValue('');
    setSingleCellKey(null);
  }, [inputModalMode, inputValue, byDegree, singleCellKey]);

  /** 主弹窗「确认」：写入存储并关闭，完成预警设置 */
  const handleConfirm = useCallback(async () => {
    await onSave(product, { type: 'lens', byDegree });
    message.success('预警设置已保存');
    onClose();
  }, [product, byDegree, onSave, onClose]);

  if (powerRange.length === 0) {
    return (
      <Modal title={`库存预警设置 - ${getProductDisplayName(product)}`} open onCancel={onClose} footer={<Button onClick={onClose}>关闭</Button>} width={480}>
        <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>该商品未设置光度范围，请先在商品管理中维护光度范围后再设置预警。</div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        title={`库存预警设置 - ${getProductDisplayName(product)}`}
        open
        onCancel={onClose}
        footer={[
          <Button key="cancel" onClick={onClose}>取消</Button>,
          <Button key="confirm" type="primary" onClick={handleConfirm}>确认</Button>,
        ]}
        width={950}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12, color: '#666' }}>
          横坐标柱镜、纵坐标球镜，显示商品设置的光度范围。拖拽选择后弹窗「请输入预警数量」批量设置；右键单个光度可单独设置。
        </div>
        <div className="inventory-stock-lens-grid-wrap inventory-alert-lens-grid-wrap">
          <div className="inventory-stock-lens-grid">
            <div
              className="inventory-stock-lens-grid-header"
              style={{ gridTemplateColumns: gridCols } as React.CSSProperties}
            >
              <div className="inventory-stock-lens-grid-header-cell inventory-stock-lens-grid-first-col">
                球镜/柱镜
              </div>
              {colCyls.map((cyl) => (
                <div key={cyl} className="inventory-stock-lens-grid-header-cell">
                  {cyl >= 0 ? `+${cyl.toFixed(2)}` : cyl.toFixed(2)}
                </div>
              ))}
            </div>
            <div
              className="inventory-stock-lens-grid-body inventory-alert-lens-grid-body"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
            >
              {rowIndices.map((rowIndex) => {
                const sphere = sphereValues[rowIndex] ?? 0;
                return (
                  <div
                    key={rowIndex}
                    className="inventory-stock-lens-grid-row"
                    style={{ gridTemplateColumns: gridCols } as React.CSSProperties}
                  >
                    <div className="inventory-stock-lens-grid-label">
                      {sphere >= 0 ? `+${sphere.toFixed(2)}` : sphere.toFixed(2)}
                    </div>
                    {colCyls.map((cyl) => {
                      const cellKey = `${rowIndex}_${cyl}`;
                      const inRange = powerRangeSet.has(cellKey);
                      const alertNum = byDegree[cellKey];
                      const selected = selectedCells.has(cellKey);
                      return (
                        <div
                          key={cyl}
                          className={`inventory-stock-lens-cell inventory-alert-lens-cell ${selected ? 'inventory-alert-lens-cell-selected' : ''}`}
                          data-row={rowIndex}
                          data-col={cyl}
                          style={{ cursor: inRange ? 'pointer' : 'default' }}
                          onContextMenu={(e) => {
                            if (!inRange) return;
                            e.preventDefault();
                            openSingleInput(cellKey);
                          }}
                        >
                          {inRange ? (
                            <>
                              {alertNum !== undefined && alertNum > 0 ? (
                                <span className="inventory-stock-lens-cell-qty">{alertNum}</span>
                              ) : (
                                <span className="inventory-stock-lens-cell-empty">-</span>
                              )}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        title="请输入预警数量"
        open={inputModalVisible}
        onCancel={() => {
          setInputModalVisible(false);
          if (inputModalMode === 'batch') setSelectedCells(new Set());
          setSingleCellKey(null);
          setInputValue('');
        }}
        onOk={handleInputConfirm}
        okText="确定"
        destroyOnHidden
      >
        <div style={{ marginBottom: 8 }}>库存低于该数量时触发预警（等于或大于不预警，便于补货采购）。</div>
        <Input
          type="number"
          min={0}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="预警数量"
          onPressEnter={() => handleInputConfirm()}
        />
      </Modal>
    </>
  );
}

/** 非镜片类库存预警设置弹窗：单一预警数量 */
function SimpleAlertModal({
  product,
  initialConfig,
  onClose,
  onSave,
}: {
  product: Product;
  initialConfig?: StockAlertConfig | undefined;
  onClose: () => void;
  onSave: (product: Product, config: StockAlertConfig | null) => void | Promise<void>;
}) {
  const { message } = App.useApp();
  const existing = initialConfig ?? stockAlertStorage.get(product.id);
  const initialThreshold = existing?.type === 'simple' ? existing.threshold : undefined;
  const [threshold, setThreshold] = useState<string>(initialThreshold !== undefined ? String(initialThreshold) : '');

  const handleSave = useCallback(async () => {
    const num = parseInt(threshold.trim(), 10);
    if (threshold.trim() === '') {
      await onSave(product, null);
      message.success('已清除预警设置');
      onClose();
      return;
    }
    if (Number.isNaN(num) || num < 0) {
      message.error('请输入有效的预警数量（非负整数）');
      return;
    }
    await onSave(product, { type: 'simple', threshold: num });
    message.success('预警设置已保存');
    onClose();
  }, [product, threshold, onSave, onClose]);

  return (
    <Modal
      title={`库存预警设置 - ${getProductDisplayName(product)}`}
      open
      onCancel={onClose}
      onOk={handleSave}
      okText="确认"
      destroyOnHidden
      width={400}
    >
      <div style={{ marginBottom: 8 }}>库存低于该数量时触发预警（等于或大于不预警）。留空并确认可清除预警。</div>
      <Input
        type="number"
        min={0}
        value={threshold}
        onChange={(e) => setThreshold(e.target.value)}
        placeholder="请输入预警数量"
      />
    </Modal>
  );
}

function SalesOutboundList({ activeSubTab, records: recordsProp }: { activeSubTab: string; records?: SalesOutboundRecord[] }) {
  const [listLocal, setListLocal] = useState<SalesOutboundRecord[]>([]);
  const load = useCallback(() => {
    const all = salesOutboundStorage.getAll();
    setListLocal([...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, []);
  useEffect(() => {
    if (activeSubTab !== 'sales-out') return;
    if (recordsProp !== undefined) {
      setListLocal([...recordsProp].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      return;
    }
    load();
  }, [activeSubTab, load, recordsProp]);
  useEffect(() => {
    if (activeSubTab !== 'sales-out') return;
    const onVisible = () => { if (recordsProp === undefined) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeSubTab, load, recordsProp]);
  const list = recordsProp !== undefined ? [...recordsProp].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : listLocal;
  return (
    <Table<SalesOutboundRecord>
      dataSource={list}
      rowKey="id"
      size="small"
      pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      locale={{ emptyText: '暂无销售出库记录' }}
      columns={[
        { title: '销售单号', dataIndex: 'salesOrderNo', key: 'salesOrderNo', width: 140 },
        {
          title: '出库时间',
          dataIndex: 'createdAt',
          key: 'createdAt',
          width: 160,
          render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '—'),
        },
        { title: '商品名称', dataIndex: 'productName', key: 'productName', ellipsis: true },
        {
          title: '光度',
          dataIndex: 'specDisplay',
          key: 'specDisplay',
          ellipsis: true,
          render: (v: string) => (v ? String(v).replace(/^(左|右)：/, '').trim() : '—'),
        },
        { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'center' },
      ]}
    />
  );
}

export default function InventoryPage() {
  const { message } = App.useApp();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>('list');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  /** 当前选中的类别（库存商品列表、在库商品列表共用） */
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  /** 采购列表（用于在库商品：仅展示已入库采购单对应的商品） */
  const [purchaseOrders, setPurchaseOrders] = useState<ReturnType<typeof purchaseListStorage.getAll>>([]);
  /** 库存查看弹窗：当前查看的商品，非空时显示该商品的入库记录 */
  const [viewingStockProduct, setViewingStockProduct] = useState<Product | null>(null);
  /** 出入库日志 - 当前子标签 */
  const [stockLogSubTab, setStockLogSubTab] = useState<StockLogSubTabKey>('purchase-in');
  /** 出入库日志 - 采购入库列表的「查看」弹窗：当前查看的采购单 */
  const [viewingOrderInLog, setViewingOrderInLog] = useState<PurchaseListOrder | null>(null);
  /** 库存预警设置弹窗：当前设置的商品，非空时根据类别显示镜片/简单预警弹窗 */
  const [alertSettingProduct, setAlertSettingProduct] = useState<Product | null>(null);
  /** 库存预警配置（用于预警列表随设置更新） */
  const [alertConfigs, setAlertConfigs] = useState<Record<string, StockAlertConfig>>({});
  /** 预警采购弹窗：是否打开；非空时为列表内单商品采购（只显示该商品） */
  const [alertPurchaseModalOpen, setAlertPurchaseModalOpen] = useState(false);
  /** 从列表点击「采购」时只采购该商品，为空表示顶部按钮批量采购 */
  const [alertPurchaseSingleProductId, setAlertPurchaseSingleProductId] = useState<string | null>(null);
  /** 预警采购弹窗：每行采购数量（rowKey -> 数量），镜片按光度行、非镜片按商品，均可编辑 */
  const [alertPurchaseQuantitiesByRow, setAlertPurchaseQuantitiesByRow] = useState<Record<string, number>>({});
  /** 预警列表中已采购的商品 ID（从 storage 读取，确认采购后 refresh 会更新） */
  const [alertPurchasedIds, setAlertPurchasedIds] = useState<string[]>([]);
  /** 登录时从后端拉取的采购价映射 productId -> price */
  const [purchasePricesMap, setPurchasePricesMap] = useState<Record<string, number>>({});
  /** 登录时从后端拉取的销售出库记录（出入库日志-销售出库） */
  const [salesOutboundRecords, setSalesOutboundRecords] = useState<SalesOutboundRecord[]>([]);

  const refresh = useCallback(async () => {
    try {
      if (isLoggedIn()) {
        const [categoriesRes, productsRes, brandsRes, ordersRes, pricesRes, configsRes, purchasedRes, outboundRes] = await Promise.all([
          listCategories(),
          listProducts(),
          listBrands(),
          listPurchaseListOrders(),
          listPurchasePrices(),
          listStockAlertConfigs(),
          getStockAlertPurchasedIds(),
          listSalesOutboundRecords(),
        ]);
        setCategories((categoriesRes.items || []) as Category[]);
        setProducts((productsRes.items || []) as Product[]);
        setBrands((brandsRes.items || []) as Brand[]);
        setPurchaseOrders((ordersRes.items || []) as PurchaseListOrder[]);
        const priceMap: Record<string, number> = {};
        for (const p of pricesRes.items || []) {
          priceMap[p.productId] = p.price;
        }
        setPurchasePricesMap(priceMap);
        const configMap: Record<string, StockAlertConfig> = {};
        for (const c of configsRes.items || []) {
          configMap[c.productId] =
            c.type === 'lens'
              ? { type: 'lens', byDegree: c.byDegree || {} }
              : { type: 'simple', threshold: c.threshold ?? 0 };
        }
        setAlertConfigs(configMap);
        setAlertPurchasedIds(purchasedRes.productIds || []);
        setSalesOutboundRecords((outboundRes.items || []) as SalesOutboundRecord[]);
      } else {
        setCategories(categoryStorage.getAll());
        setProducts(productStorage.getAll());
        setBrands(brandStorage.getAll());
        setPurchaseOrders(purchaseListStorage.getAll());
        setPurchasePricesMap({});
        setAlertConfigs(stockAlertStorage.getAll());
        setAlertPurchasedIds(stockAlertPurchasedStorage.getAll());
        setSalesOutboundRecords([]);
      }
    } catch (e) {
      console.error(e);
      message.error((e as Error)?.message ?? '加载失败');
    }
  }, []);

  /** 取商品在后端的 id（用于预警配置、采购单 API） */
  const getProductBackendId = useCallback((product: Product): number | null => {
    if (product.backendId != null) return product.backendId;
    if (typeof product.id === 'number' && !Number.isNaN(product.id)) return product.id;
    if (typeof product.id === 'string' && /^\d+$/.test(product.id)) return parseInt(product.id, 10);
    return null;
  }, []);

  /** 根据当前采购单列表计算下一个采购单号（YJ 前缀用于预警采购） */
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

  const handleSaveAlertConfig = useCallback(
    async (product: Product, config: StockAlertConfig | null) => {
      if (config === null) {
        if (isLoggedIn()) {
          const backendId = getProductBackendId(product);
          if (backendId != null) {
            try {
              await removeStockAlertConfigApi(backendId);
              await refresh();
              return;
            } catch (e) {
              console.error(e);
              message.error((e as Error)?.message ?? '清除失败');
              return;
            }
          }
        }
        try {
          stockAlertStorage.remove(product.id);
        } catch (_) {}
        await refresh();
        return;
      }
      if (isLoggedIn()) {
        const backendId = getProductBackendId(product);
        if (backendId != null) {
          try {
            if (config.type === 'lens') {
              await setStockAlertConfigApi({ productId: backendId, type: 'lens', byDegree: config.byDegree });
            } else {
              await setStockAlertConfigApi({ productId: backendId, type: 'simple', threshold: config.threshold });
            }
            await refresh();
            return;
          } catch (e) {
            console.error(e);
            message.error((e as Error)?.message ?? '保存失败');
            return;
          }
        }
      }
      try {
        stockAlertStorage.set(product.id, config);
      } catch (_) {}
      await refresh();
    },
    [refresh, getProductBackendId],
  );

  useEffect(() => {
    refresh();
  }, [location.pathname, refresh]);

  /** 从其他页面/标签页返回库存页时刷新在库数据（如刚在采购页点了入库） */
  useEffect(() => {
    if (!location.pathname.startsWith('/inventory')) return;
    const onVisible = () => refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [location.pathname, refresh]);

  /** 仅展示 inStock === true 的商品（库存商品管理用） */
  const inventoryProducts = useMemo(() => {
    return products.filter((p) => p.inStock === true);
  }, [products]);

  /** 已入库的采购单对应的商品 id 集合（仅：采购单已点入库、且有有效 stockInAt 的才计入） */
  const inStockProductIds = useMemo(() => {
    return new Set(
      purchaseOrders
        .filter((o) => o.stockInAt != null && String(o.stockInAt).trim() !== '')
        .map((o) => o.productId),
    );
  }, [purchaseOrders]);

  /** 在库商品：仅展示有至少一条已入库采购单的商品（在库商品列表只显示入库的商品） */
  const inStockProducts = useMemo(() => {
    return products.filter((p) => inStockProductIds.has(p.id));
  }, [products, inStockProductIds]);

  /** 按关键词过滤（名称、标注、类别名、品牌名）- 库存商品列表 */
  const filteredProducts = useMemo(() => {
    if (!searchKeyword.trim()) return inventoryProducts;
    const kw = searchKeyword.trim().toLowerCase();
    return inventoryProducts.filter((p) => {
      const displayName = getProductDisplayName(p).toLowerCase();
      const categoryName = categories.find((c) => c.id === p.category)?.name?.toLowerCase() ?? '';
      const brandName = p.brandId ? (brands.find((b) => b.id === p.brandId)?.name?.toLowerCase() ?? '') : '';
      return (
        displayName.includes(kw) ||
        (p.annotation && p.annotation.toLowerCase().includes(kw)) ||
        categoryName.includes(kw) ||
        brandName.includes(kw)
      );
    });
  }, [inventoryProducts, searchKeyword, categories, brands]);

  /** 按关键词过滤 - 在库商品列表 */
  const filteredInStockProducts = useMemo(() => {
    if (!searchKeyword.trim()) return inStockProducts;
    const kw = searchKeyword.trim().toLowerCase();
    return inStockProducts.filter((p) => {
      const displayName = getProductDisplayName(p).toLowerCase();
      const categoryName = categories.find((c) => c.id === p.category)?.name?.toLowerCase() ?? '';
      const brandName = p.brandId ? (brands.find((b) => b.id === p.brandId)?.name?.toLowerCase() ?? '') : '';
      return (
        displayName.includes(kw) ||
        (p.annotation && p.annotation.toLowerCase().includes(kw)) ||
        categoryName.includes(kw) ||
        brandName.includes(kw)
      );
    });
  }, [inStockProducts, searchKeyword, categories, brands]);

  /** 有库存商品的类别（未按检索过滤），用于保持检索时类别标签和检索框不消失 */
  const categoriesWithInventory = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of inventoryProducts) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    const ordered: { category: Category; products: Product[] }[] = [];
    for (const cat of categories) {
      const list = map.get(cat.id);
      if (list && list.length > 0) ordered.push({ category: cat, products: list });
    }
    const unknownIds = [...map.keys()].filter((id) => !categories.some((c) => c.id === id));
    for (const id of unknownIds) {
      ordered.push({ category: { id, name: id, createdAt: '' }, products: map.get(id)! });
    }
    return ordered;
  }, [inventoryProducts, categories]);

  /** 当前选中的类别 id（用于标签联动）- 库存商品列表 */
  const activeCategoryId = useMemo(() => {
    const firstId = categoriesWithInventory[0]?.category.id ?? '';
    if (!selectedCategoryId) return firstId;
    return categoriesWithInventory.some((p) => p.category.id === selectedCategoryId) ? selectedCategoryId : firstId;
  }, [selectedCategoryId, categoriesWithInventory]);

  /** 有在库商品的类别（用于在库商品列表的类别 Tab） */
  const categoriesWithInStock = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of inStockProducts) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    const ordered: { category: Category; products: Product[] }[] = [];
    for (const cat of categories) {
      const list = map.get(cat.id);
      if (list && list.length > 0) ordered.push({ category: cat, products: list });
    }
    const unknownIds = [...map.keys()].filter((id) => !categories.some((c) => c.id === id));
    for (const id of unknownIds) {
      ordered.push({ category: { id, name: id, createdAt: '' }, products: map.get(id)! });
    }
    return ordered;
  }, [inStockProducts, categories]);

  /** 当前选中的类别 id - 在库商品列表 */
  const activeCategoryIdInStock = useMemo(() => {
    const firstId = categoriesWithInStock[0]?.category.id ?? '';
    if (!selectedCategoryId) return firstId;
    return categoriesWithInStock.some((p) => p.category.id === selectedCategoryId) ? selectedCategoryId : firstId;
  }, [selectedCategoryId, categoriesWithInStock]);

  /** 按类别生成表格列：品牌在商品名称前，镜片无精品列，镜架有精品列；在库商品列表不显示库存预警列 */
  const buildColumns = useCallback(
    (category: Category, opts?: { forInStockList?: boolean }): ColumnsType<Product> => {
      const isLens = category.name === '镜片';
      const isFrame = category.name === '镜架';
      const forInStockList = opts?.forInStockList === true;
      const brandCol: ColumnsType<Product> = [
        {
          title: '品牌',
          key: 'brand',
          width: 100,
          render: (_: unknown, record: Product) =>
            record.brandId ? brands.find((b) => b.id === record.brandId)?.name ?? '-' : '-',
        },
      ];
      const nameCol: ColumnsType<Product> = [
        {
          title: '商品名称',
          dataIndex: 'name',
          key: 'name',
          width: 360,
          ellipsis: false,
          render: (_: string, record: Product) => getProductDisplayName(record),
        },
      ];
      const boutiqueCol: ColumnsType<Product> = [
        {
          title: '精品',
          key: 'isBoutique',
          width: 64,
          align: 'center',
          render: (_: unknown, record: Product) => (record.isBoutique ? '是' : '否'),
        },
      ];
      const purchasePriceCol: ColumnsType<Product> = [
        {
          title: '采购价格',
          key: 'purchasePrice',
          width: 100,
          align: 'right',
          render: (_: unknown, record: Product) => {
            const p = getPurchasePrice(record.id);
            return p !== undefined && p !== null ? `¥${p.toFixed(2)}` : '-';
          },
        },
      ];
      const tailCols: ColumnsType<Product> = [
        {
          title: '零售价',
          dataIndex: 'price',
          key: 'price',
          width: 100,
          align: 'right',
          render: (price: number | undefined) =>
            price !== undefined && price !== null ? `¥${price.toFixed(2)}` : '-',
        },
        ...(forInStockList
          ? []
          : [
              {
                title: '库存预警',
                key: 'stockAlert',
                width: 100,
                align: 'center' as const,
                render: (_: unknown, record: Product) => (
                  <Button
                    type="link"
                    size="small"
                    icon={<WarningOutlined />}
                    onClick={() => setAlertSettingProduct(record)}
                  >
                    预警设置
                  </Button>
                ),
              },
            ]),
      ];
      if (isLens) return [...brandCol, ...nameCol, ...purchasePriceCol, ...tailCols];
      if (isFrame) return [...brandCol, ...nameCol, ...boutiqueCol, ...purchasePriceCol, ...tailCols];
      return [...brandCol, ...nameCol, ...boutiqueCol, ...purchasePriceCol, ...tailCols];
    },
    [brands, getPurchasePrice],
  );

  /** 在库商品列表专用：在 buildColumns 基础上增加「库存查看」操作列 */
  const buildInStockColumns = useCallback(
    (category: Category): ColumnsType<Product> => [
      ...buildColumns(category, { forInStockList: true }),
      {
        title: '操作',
        key: 'action',
        width: 100,
        align: 'center',
        fixed: 'right',
        render: (_: unknown, record: Product) => (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setViewingStockProduct(record)}
          >
            库存查看
          </Button>
        ),
      },
    ],
    [buildColumns],
  );

  /** 构建与采购价格管理一致的：类别标签 + 下方一体卡片（按“有库存的类别”固定标签，检索无匹配时表格为空但检索框保留） */
  const categoryTabItems = useMemo(
    () =>
      categoriesWithInventory.map(({ category }) => {
        const list = filteredProducts.filter((p) => p.category === category.id);
        const uniqueList = Array.from(new Map(list.map((p) => [p.id, p])).values());
        return {
          key: category.id,
          label: category.name,
          children: (
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="inventory-list-title-category">{category.name}</span>
                  <span className="inventory-list-title-suffix"> - 商品列表</span>
                  <Input
                    allowClear
                    placeholder="搜索商品名称、类别、品牌"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    style={{ width: 220 }}
                    autoComplete="off"
                  />
                </div>
              }
              className="form-card inventory-product-list-card inventory-list-card-connected"
            >
              <Table<Product>
                rowKey="id"
                columns={buildColumns(category)}
                dataSource={uniqueList}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1052 }}
                locale={{ emptyText: searchKeyword.trim() ? '未找到匹配商品，请修改检索条件' : '暂无数据' }}
              />
            </Card>
          ),
        };
      }),
    [categoriesWithInventory, filteredProducts, searchKeyword, buildColumns],
  );

  /** 在库商品列表：按类别分 Tab 显示，便于分类查看（仅展示已入库采购单对应的商品） */
  const inStockCategoryTabItems = useMemo(
    () =>
      categoriesWithInStock.map(({ category }) => {
        const list = filteredInStockProducts.filter((p) => p.category === category.id);
        const uniqueList = Array.from(new Map(list.map((p) => [p.id, p])).values());
        return {
          key: category.id,
          label: category.name,
          children: (
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="inventory-list-title-category">{category.name}</span>
                  <span className="inventory-list-title-suffix"> - 在库商品列表</span>
                  <Button type="link" size="small" icon={<ReloadOutlined />} onClick={refresh}>
                    刷新
                  </Button>
                  <Input
                    allowClear
                    placeholder="搜索商品名称、类别、品牌"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    style={{ width: 220 }}
                    autoComplete="off"
                  />
                </div>
              }
              className="form-card inventory-product-list-card inventory-list-card-connected"
            >
              <Table<Product>
                rowKey="id"
                columns={buildInStockColumns(category)}
                dataSource={uniqueList}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1152 }}
                locale={{ emptyText: searchKeyword.trim() ? '未找到匹配商品，请修改检索条件' : '暂无数据' }}
              />
            </Card>
          ),
        };
      }),
    [categoriesWithInStock, filteredInStockProducts, searchKeyword, buildInStockColumns],
  );

  /** 已入库采购单（用于计算当前库存） */
  const stockInOrders = useMemo(
    () =>
      purchaseOrders.filter(
        (o) => o.stockInAt != null && String(o.stockInAt).trim() !== '',
      ),
    [purchaseOrders],
  );

  /** 当前库存：镜片按 productId -> degree -> 数量；非镜片按 productId -> 总数量（仅已入库） */
  const currentStockByProduct = useMemo(() => {
    const lensStock = new Map<string, Record<string, number>>();
    const simpleStock = new Map<string, number>();
    for (const order of stockInOrders) {
      const pid = order.productId;
      const product = products.find((p) => p.id === pid);
      const catName = product ? categories.find((c) => c.id === product.category)?.name : '';
      if (catName === '镜片') {
        let byDegree = lensStock.get(pid);
        if (!byDegree) {
          byDegree = {};
          lensStock.set(pid, byDegree);
        }
        for (const row of order.rows) {
          const d = (row.degree ?? '').trim();
          if (!d) continue;
          byDegree[d] = (byDegree[d] ?? 0) + row.quantity;
        }
      } else {
        const total = order.rows.reduce((s, r) => s + r.quantity, 0);
        simpleStock.set(pid, (simpleStock.get(pid) ?? 0) + total);
      }
    }
    return { lensStock, simpleStock };
  }, [stockInOrders, products, categories]);

  /** 处于预警中的商品（有预警配置且当前库存 ≤ 预警数量；入库后若库存高于预警则不再显示） */
  const alertListByCategory = useMemo(() => {
    const inAlert: Product[] = [];
    for (const p of inventoryProducts) {
      const config = alertConfigs[p.id];
      if (!config) continue;
      const catName = categories.find((c) => c.id === p.category)?.name ?? '';
      if (config.type === 'lens') {
        const byDegree = currentStockByProduct.lensStock.get(p.id) ?? {};
        const alertByDegree = config.byDegree;
        let anyInAlert = false;
        for (const [cellKey, threshold] of Object.entries(alertByDegree)) {
          const degree = cellKeyToDegree(cellKey);
          const stock = byDegree[degree] ?? 0;
          if (stock < threshold) {
            anyInAlert = true;
            break;
          }
        }
        if (anyInAlert) inAlert.push(p);
      } else {
        const total = currentStockByProduct.simpleStock.get(p.id) ?? 0;
        if (total < config.threshold) inAlert.push(p);
      }
    }
    const byCat = new Map<string, { category: Category; products: Product[] }>();
    for (const p of inAlert) {
      const cat = categories.find((c) => c.id === p.category);
      const key = p.category;
      const catInfo = cat ?? { id: key, name: key, createdAt: '' };
      if (!byCat.has(key)) byCat.set(key, { category: catInfo, products: [] });
      byCat.get(key)!.products.push(p);
    }
    return Array.from(byCat.values()).sort((a, b) =>
      categories.findIndex((c) => c.id === a.category.id) - categories.findIndex((c) => c.id === b.category.id),
    );
  }, [inventoryProducts, alertConfigs, categories, currentStockByProduct]);

  /** 当前预警列表中的商品 ID（用于清理已采购集合：补货后不再在预警列表则从已采购中移除） */
  const currentAlertProductIds = useMemo(
    () => alertListByCategory.flatMap(({ products }) => products.map((p) => p.id)),
    [alertListByCategory],
  );

  useEffect(() => {
    const kept = alertPurchasedIds.filter((id) => currentAlertProductIds.includes(id));
    if (kept.length < alertPurchasedIds.length) {
      if (isLoggedIn()) {
        setStockAlertPurchasedIdsApi(kept).then(() => setAlertPurchasedIds(kept)).catch(() => {});
      } else {
        try {
          stockAlertPurchasedStorage.setAll(kept);
        } catch (_) {}
        setAlertPurchasedIds(kept);
      }
    }
  }, [currentAlertProductIds, alertPurchasedIds]);

  /** 预警采购弹窗：列表数据（预警商品、预警数量、采购单价、总采购价格） */
  type AlertPurchaseItem = {
    product: Product;
    productName: string;
    isLens: boolean;
    suggestedQty: number;
    unitPrice: number;
    orderRows: LensPurchaseRow[];
  };
  const alertPurchaseItems = useMemo((): AlertPurchaseItem[] => {
    const items: AlertPurchaseItem[] = [];
    for (const { products: list } of alertListByCategory) {
      for (const product of list) {
        const config = alertConfigs[product.id];
        if (!config) continue;
        const catName = categories.find((c) => c.id === product.category)?.name ?? '';
        const unitPrice = getPurchasePrice(product.id) ?? 0;
        if (config.type === 'lens') {
          const byDegree = currentStockByProduct.lensStock.get(product.id) ?? {};
          const orderRows: LensPurchaseRow[] = [];
          let totalQty = 0;
          for (const [cellKey, threshold] of Object.entries(config.byDegree)) {
            const degree = cellKeyToDegree(cellKey);
            const stock = byDegree[degree] ?? 0;
            if (stock < threshold) {
              const qty = threshold - stock;
              totalQty += qty;
              orderRows.push({ degree, quantity: qty, unitPrice });
            }
          }
          if (orderRows.length > 0) {
            items.push({
              product,
              productName: getProductDisplayName(product),
              isLens: true,
              suggestedQty: totalQty,
              unitPrice,
              orderRows,
            });
          }
        } else {
          const total = currentStockByProduct.simpleStock.get(product.id) ?? 0;
          if (total < config.threshold) {
            const suggestedQty = Math.max(1, config.threshold - total);
            items.push({
              product,
              productName: getProductDisplayName(product),
              isLens: false,
              suggestedQty,
              unitPrice,
              orderRows: [{ degree: '-', quantity: suggestedQty, unitPrice }],
            });
          }
        }
      }
    }
    return items;
  }, [alertListByCategory, alertConfigs, categories, currentStockByProduct, getPurchasePrice]);

  /** 解析光度字符串为球镜/柱镜（用于按柱镜排序） */
  const parseDegree = useCallback((d: string): { sphere: number; cyl: number } => {
    const parts = (d ?? '').trim().split('/');
    if (parts.length !== 2) return { sphere: 0, cyl: 0 };
    const sphere = parseFloat(parts[0].trim());
    const cyl = parseFloat(parts[1].trim());
    return { sphere: Number.isNaN(sphere) ? 0 : sphere, cyl: Number.isNaN(cyl) ? 0 : cyl };
  }, []);

  /** 预警采购弹窗：展示行（镜片按光度展开，按柱镜再球镜排序） */
  type AlertPurchaseDisplayRow = {
    item: AlertPurchaseItem;
    degree: string;
    displayQty: number;
    rowKey: string;
  };
  const alertPurchaseDisplayRows = useMemo((): AlertPurchaseDisplayRow[] => {
    const rows: AlertPurchaseDisplayRow[] = [];
    for (const item of alertPurchaseItems) {
      if (item.isLens) {
        const sorted = [...item.orderRows].sort((a, b) => {
          const pa = parseDegree(a.degree);
          const pb = parseDegree(b.degree);
          if (pa.cyl !== pb.cyl) return pa.cyl - pb.cyl;
          return pa.sphere - pb.sphere;
        });
        for (const r of sorted) {
          rows.push({
            item,
            degree: r.degree,
            displayQty: r.quantity,
            rowKey: `${item.product.id}_${r.degree}`,
          });
        }
      } else {
        rows.push({
          item,
          degree: '-',
          displayQty: item.suggestedQty,
          rowKey: item.product.id,
        });
      }
    }
    return rows;
  }, [alertPurchaseItems, parseDegree]);

  /** 当前查看商品对应的已入库采购单列表 */
  const viewingStockOrders = useMemo(() => {
    if (!viewingStockProduct) return [];
    return purchaseOrders.filter(
      (o) => o.productId === viewingStockProduct.id && o.stockInAt != null && String(o.stockInAt).trim() !== '',
    );
  }, [viewingStockProduct, purchaseOrders]);

  /** 是否为「库存管理」镜片（用于在库查看：镜片且 inStock 则按球镜/柱镜网格展示） */
  const isViewingInStockLens = useMemo(() => {
    if (!viewingStockProduct) return false;
    const catName = categories.find((c) => c.id === viewingStockProduct.category)?.name;
    return catName === '镜片' && viewingStockProduct.inStock === true;
  }, [viewingStockProduct, categories]);

  /** 采购入库日志：已入库的采购单列表（按入库时间倒序） */
  const purchaseStockInList = useMemo(() => {
    return [...purchaseOrders]
      .filter((o) => o.stockInAt != null && String(o.stockInAt).trim() !== '')
      .sort((a, b) => (b.stockInAt ?? '').localeCompare(a.stockInAt ?? ''));
  }, [purchaseOrders]);

  /** 镜片按光度汇总的在库数量（degree -> 总数量），用于网格每格显示 */
  const lensDegreeToQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of viewingStockOrders) {
      for (const row of order.rows) {
        const d = (row.degree ?? '').trim();
        if (!d) continue;
        map.set(d, (map.get(d) ?? 0) + row.quantity);
      }
    }
    return map;
  }, [viewingStockOrders]);

  return (
    <div className="inventory-page">
      <h1 className="inventory-page-title">库存管理</h1>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => {
          setActiveTab(k as TabKey);
          if (k === 'inStockList' || k === 'alertList' || k === 'stockLog') refresh();
        }}
        className="inventory-tabs"
        items={[
          {
            key: 'list',
            label: '库存商品列表',
            children: (
              <div className="inventory-tab-content">
                {inventoryProducts.length === 0 ? (
                  <Card title="库存商品列表" className="form-card">
                    <div className="inventory-empty">暂无库存管理商品，请在商品信息管理中为商品设置「库存管理」。</div>
                  </Card>
                ) : (
                  <div className="inventory-category-connected">
                    <Tabs
                      type="card"
                      activeKey={activeCategoryId}
                      onChange={(key) => setSelectedCategoryId(key)}
                      items={categoryTabItems}
                      className="inventory-category-tabs"
                    />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'inStockList',
            label: '在库商品列表',
            children: (
              <div className="inventory-tab-content">
                {inStockProducts.length === 0 ? (
                  <Card
                    title={
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        在库商品列表
                        <Button type="link" size="small" icon={<ReloadOutlined />} onClick={refresh}>
                          刷新
                        </Button>
                      </span>
                    }
                    className="form-card"
                  >
                    <div className="inventory-empty">暂无在库商品，请先在采购管理的采购列表中办理采购单入库。</div>
                  </Card>
                ) : (
                  <div className="inventory-category-connected">
                    <Tabs
                      type="card"
                      activeKey={activeCategoryIdInStock}
                      onChange={(key) => setSelectedCategoryId(key)}
                      items={inStockCategoryTabItems}
                      className="inventory-category-tabs"
                    />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'alertList',
            label: '库存预警列表',
            children: (
              <div className="inventory-tab-content">
                {alertListByCategory.length === 0 ? (
                  <Card title="库存预警列表" className="form-card">
                    <div className="inventory-empty">
                      暂无预警商品。在「库存商品列表」中设置预警后，当库存低于预警数量会在此显示；入库后若库存达到或高于预警数量则不再显示。
                    </div>
                  </Card>
                ) : (
                  <div className="inventory-category-connected">
                    <Tabs
                      type="card"
                      activeKey={
                        selectedCategoryId && alertListByCategory.some((x) => x.category.id === selectedCategoryId)
                          ? selectedCategoryId
                          : alertListByCategory[0]?.category.id ?? ''
                      }
                      onChange={(key) => setSelectedCategoryId(key)}
                      className="inventory-category-tabs"
                      items={alertListByCategory.map(({ category, products: list }) => ({
                        key: category.id,
                        label: category.name,
                        children: (
                          <Card
                            title={
                              <span className="inventory-list-title-category">
                                {category.name} - 库存预警列表（共 {list.length} 个商品）
                              </span>
                            }
                            className="form-card inventory-product-list-card inventory-list-card-connected"
                          >
                            <Table<Product>
                              rowKey="id"
                              dataSource={list}
                              pagination={{ pageSize: 10 }}
                              columns={[
                                {
                                  title: '品牌',
                                  key: 'brand',
                                  width: 100,
                                  render: (_: unknown, record: Product) =>
                                    record.brandId ? brands.find((b) => b.id === record.brandId)?.name ?? '-' : '-',
                                },
                                {
                                  title: '商品名称',
                                  key: 'name',
                                  width: 360,
                                  render: (_: unknown, record: Product) => getProductDisplayName(record),
                                },
                                {
                                  title: '预警说明',
                                  key: 'alertDesc',
                                  width: 140,
                                  render: (_: unknown, record: Product) => {
                                    const config = alertConfigs[record.id];
                                    if (!config) return '-';
                                    if (config.type === 'lens') return '按光度预警';
                                    return `预警数量：${config.threshold}`;
                                  },
                                },
                                {
                                  title: '状态',
                                  key: 'alertStatus',
                                  width: 90,
                                  align: 'center',
                                  render: (_: unknown, record: Product) =>
                                    alertPurchasedIds.includes(record.id) ? '已采购' : '待采购',
                                },
                                {
                                  title: '采购',
                                  key: 'purchase',
                                  width: 90,
                                  align: 'center',
                                  render: (_: unknown, record: Product) => {
                                    const item = alertPurchaseItems.find((i) => i.product.id === record.id);
                                    if (!item) return '-';
                                    return (
                                      <Button
                                        type="link"
                                        size="small"
                                        icon={<ShoppingCartOutlined />}
                                        onClick={() => {
                                          setAlertPurchaseSingleProductId(record.id);
                                          const rows = alertPurchaseDisplayRows.filter((r) => r.item.product.id === record.id);
                                          const qty: Record<string, number> = {};
                                          rows.forEach((r) => { qty[r.rowKey] = r.displayQty; });
                                          setAlertPurchaseQuantitiesByRow(qty);
                                          setAlertPurchaseModalOpen(true);
                                        }}
                                      >
                                        采购
                                      </Button>
                                    );
                                  },
                                },
                                {
                                  title: '操作',
                                  key: 'action',
                                  width: 100,
                                  align: 'center',
                                  render: (_: unknown, record: Product) => (
                                    <Button
                                      type="link"
                                      size="small"
                                      icon={<EyeOutlined />}
                                      onClick={() => setViewingStockProduct(record)}
                                    >
                                      库存查看
                                    </Button>
                                  ),
                                },
                              ]}
                            />
                          </Card>
                        ),
                      }))}
                    />
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'stockLog',
            label: '出入库日志',
            children: (
              <div className="inventory-tab-content">
                <Tabs
                  type="card"
                  activeKey={stockLogSubTab}
                  onChange={(k) => setStockLogSubTab(k as StockLogSubTabKey)}
                  items={[
                    {
                      key: 'purchase-in',
                      label: '采购入库',
                      children: (
                        <Card title="采购入库" className="form-card">
                          <Table<PurchaseListOrder>
                            dataSource={purchaseStockInList}
                            rowKey="id"
                            pagination={{ pageSize: 10 }}
                            columns={[
                              { title: '采购单号', dataIndex: 'orderNo', key: 'orderNo', width: 140 },
                              {
                                title: '入库类型',
                                key: 'stockInType',
                                width: 100,
                                align: 'center',
                                render: (_: unknown, r: PurchaseListOrder) =>
                                  r.orderNo.startsWith('YJ') ? '预警入库' : '采购入库',
                              },
                              {
                                title: '采购时间',
                                key: 'stockInAt',
                                width: 170,
                                render: (_: unknown, r: PurchaseListOrder) =>
                                  r.stockInAt ? new Date(r.stockInAt).toLocaleString('zh-CN') : '-',
                              },
                              {
                                title: '入库商品',
                                dataIndex: 'productName',
                                key: 'productName',
                                ellipsis: true,
                                render: (_: unknown, r: PurchaseListOrder) => r.productName,
                              },
                              {
                                title: '数量',
                                key: 'qty',
                                width: 90,
                                align: 'center',
                                render: (_: unknown, r: PurchaseListOrder) =>
                                  r.rows.reduce((s, x) => s + x.quantity, 0),
                              },
                              {
                                title: '金额',
                                key: 'amount',
                                width: 110,
                                align: 'right',
                                render: (_: unknown, r: PurchaseListOrder) =>
                                  `¥${r.rows.reduce((s, x) => s + x.quantity * x.unitPrice, 0).toFixed(2)}`,
                              },
                              {
                                title: '操作',
                                key: 'action',
                                width: 90,
                                align: 'center',
                                render: (_: unknown, r: PurchaseListOrder) => (
                                  <Button type="link" size="small" onClick={() => setViewingOrderInLog(r)}>
                                    查看
                                  </Button>
                                ),
                              },
                            ]}
                          />
                        </Card>
                      ),
                    },
                    {
                      key: 'sales-custom-in',
                      label: '销售定制入库',
                      children: (
                        <Card title="销售定制入库" className="form-card">
                          <div style={{ padding: 48, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>
                            此页面为占位，后续逐步开发。
                          </div>
                        </Card>
                      ),
                    },
                    {
                      key: 'sales-out',
                      label: '销售出库',
                      children: (
                        <Card title="销售出库" className="form-card">
                          <SalesOutboundList activeSubTab={stockLogSubTab} records={isLoggedIn() ? salesOutboundRecords : undefined} />
                        </Card>
                      ),
                    },
                    {
                      key: 'transfer',
                      label: '调拨入库/出库',
                      children: (
                        <Card title="调拨入库/出库" className="form-card">
                          <div style={{ padding: 48, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>
                            此页面为占位，后续逐步开发。
                          </div>
                        </Card>
                      ),
                    },
                    {
                      key: 'return-exchange',
                      label: '退换货出入库',
                      children: (
                        <Card title="退换货出入库" className="form-card">
                          <div style={{ padding: 48, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>
                            此页面为占位，后续逐步开发。
                          </div>
                        </Card>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
      <Modal
        title={viewingStockProduct ? `库存查看 - ${getProductDisplayName(viewingStockProduct)}` : '库存查看'}
        open={!!viewingStockProduct}
        onCancel={() => setViewingStockProduct(null)}
        footer={[
          <Button key="close" onClick={() => setViewingStockProduct(null)}>
            关闭
          </Button>,
        ]}
        width={isViewingInStockLens && (viewingStockProduct?.powerRange?.length ?? 0) > 0 ? 950 : 640}
        destroyOnHidden
      >
        {viewingStockProduct && (() => {
          const powerRange = viewingStockProduct.powerRange ?? [];
          const sphereValues = getSphereValues();
          const rowIndices = [...new Set(powerRange.map((ck) => parseInt(ck.split('_')[0], 10)))].sort((a, b) => a - b);
          const colCyls = [...new Set(powerRange.map((ck) => parseFloat(ck.split('_')[1])))].sort((a, b) => b - a);
          const firstColW = 96;
          const cylColW = 46;
          const gridCols = colCyls.length ? `${firstColW}px repeat(${colCyls.length}, ${cylColW}px)` : `${firstColW}px`;
          const showLensGrid =
            isViewingInStockLens && powerRange.length > 0 && viewingStockOrders.length > 0;
          const viewingAlertConfig = viewingStockProduct ? alertConfigs[viewingStockProduct.id] : undefined;
          const isDegreeInAlert = (cellKey: string): boolean => {
            if (!viewingAlertConfig || viewingAlertConfig.type !== 'lens') return false;
            const threshold = viewingAlertConfig.byDegree[cellKey];
            if (threshold === undefined) return false;
            const degree = cellKeyToDegree(cellKey);
            const stock = lensDegreeToQty.get(degree) ?? 0;
            return stock < threshold;
          };

          return (
            <div>
              {showLensGrid ? (
                <>
                  <div style={{ marginBottom: 12, color: '#666' }}>
                    横坐标柱镜、纵坐标球镜，每格显示该光度的在库数量（片）。预警光度标红显示。
                  </div>
                  <div className="inventory-stock-lens-grid-wrap">
                    <div className="inventory-stock-lens-grid">
                      <div
                        className="inventory-stock-lens-grid-header"
                        style={{ gridTemplateColumns: gridCols } as React.CSSProperties}
                      >
                        <div className="inventory-stock-lens-grid-header-cell inventory-stock-lens-grid-first-col">
                          球镜/柱镜
                        </div>
                        {colCyls.map((cyl) => (
                          <div key={cyl} className="inventory-stock-lens-grid-header-cell">
                            {cyl >= 0 ? `+${cyl.toFixed(2)}` : cyl.toFixed(2)}
                          </div>
                        ))}
                      </div>
                      <div className="inventory-stock-lens-grid-body">
                        {rowIndices.map((rowIndex) => {
                          const sphere = sphereValues[rowIndex] ?? 0;
                          return (
                            <div
                              key={rowIndex}
                              className="inventory-stock-lens-grid-row"
                              style={{ gridTemplateColumns: gridCols } as React.CSSProperties}
                            >
                              <div className="inventory-stock-lens-grid-label">
                                {sphere >= 0 ? `+${sphere.toFixed(2)}` : sphere.toFixed(2)}
                              </div>
                              {colCyls.map((cyl) => {
                                const cellKey = `${rowIndex}_${cyl}`;
                                const degree = powerRange.includes(cellKey) ? cellKeyToDegree(cellKey) : '';
                                const qty = degree ? lensDegreeToQty.get(degree) ?? 0 : 0;
                                const inAlert = powerRange.includes(cellKey) && isDegreeInAlert(cellKey);
                                return (
                                  <div
                                    key={cyl}
                                    className={`inventory-stock-lens-cell${inAlert ? ' inventory-stock-lens-cell-alert' : ''}`}
                                    title={degree ? `${degree}：${qty} 片${inAlert ? '（预警）' : ''}` : ''}
                                  >
                                    {powerRange.includes(cellKey) ? (
                                      qty > 0 ? (
                                        <span className="inventory-stock-lens-cell-qty">{qty}</span>
                                      ) : (
                                        <span className="inventory-stock-lens-cell-empty">-</span>
                                      )
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {viewingStockProduct && categories.find((c) => c.id === viewingStockProduct.category)?.name !== '镜架' && (
                    <div style={{ marginBottom: 12, color: '#666' }}>
                      {viewingStockProduct && categories.find((c) => c.id === viewingStockProduct.category)?.name === '镜片'
                        ? '以下为该商品已入库的采购单记录，含光度与数量，可据此核对在库情况。'
                        : '以下为该商品已入库的采购单记录，可据此核对在库情况。'}
                    </div>
                  )}
                  {viewingStockOrders.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>
                      暂无入库记录
                    </div>
                  ) : viewingStockProduct &&
                    categories.find((c) => c.id === viewingStockProduct.category)?.name === '镜片' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {viewingStockOrders.map((order) => {
                        const parseDegree = (d: string): { sphere: number; cyl: number } => {
                          const parts = (d ?? '').trim().split('/');
                          if (parts.length !== 2) return { sphere: 0, cyl: 0 };
                          const sphere = parseFloat(parts[0].trim());
                          const cyl = parseFloat(parts[1].trim());
                          return { sphere: Number.isNaN(sphere) ? 0 : sphere, cyl: Number.isNaN(cyl) ? 0 : cyl };
                        };
                        const degreeRows = [...order.rows.filter((r) => r.quantity > 0)].sort((a, b) => {
                          const pa = parseDegree(a.degree);
                          const pb = parseDegree(b.degree);
                          if (pa.cyl !== pb.cyl) return pa.cyl - pb.cyl;
                          return pa.sphere - pb.sphere;
                        });
                        const mid = Math.ceil(degreeRows.length / 2);
                        const leftRows = degreeRows.slice(0, mid);
                        const rightRows = degreeRows.slice(mid);
                        const totalQty = order.rows.reduce((s, r) => s + r.quantity, 0);
                        const totalAmt = order.rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
                        const degreeColumns = [
                          { title: '光度', dataIndex: 'degree', key: 'degree', width: 100 },
                          { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'center' as const },
                          {
                            title: '金额',
                            key: 'amount',
                            width: 90,
                            align: 'right' as const,
                            render: (_: unknown, r: LensPurchaseRow) => `¥ ${(r.quantity * r.unitPrice).toFixed(2)}`,
                          },
                        ];
                        return (
                          <div key={order.id} style={{ padding: 12, border: '1px solid #e8e8e8', borderRadius: 8 }}>
                            <div style={{ marginBottom: 8, color: '#666' }}>光度明细：</div>
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
                                  columns={degreeColumns}
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
                                      columns={degreeColumns}
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                            <div
                              style={{
                                marginTop: 12,
                                paddingTop: 12,
                                borderTop: '1px solid #f0f0f0',
                                display: 'flex',
                                gap: 24,
                                fontWeight: 500,
                              }}
                            >
                              <span>
                                采购数量：<span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span> 片
                              </span>
                              <span>
                                采购金额：<span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {totalAmt.toFixed(2)}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : viewingStockProduct &&
                    categories.find((c) => c.id === viewingStockProduct.category)?.name === '镜架' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                      {viewingStockOrders.map((order) => {
                        const frameRows = order.rows.filter((r) => r.quantity > 0);
                        const totalQty = order.rows.reduce((s, r) => s + r.quantity, 0);
                        const totalAmt = order.rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
                        const frameColumns = [
                          { title: '型号/色号', dataIndex: 'degree', key: 'degree', width: 120 },
                          { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'center' as const },
                          {
                            title: '采购价',
                            dataIndex: 'unitPrice',
                            key: 'unitPrice',
                            width: 90,
                            align: 'right' as const,
                            render: (v: number) => `¥ ${(v ?? 0).toFixed(2)}`,
                          },
                          {
                            title: '金额',
                            key: 'amount',
                            width: 90,
                            align: 'right' as const,
                            render: (_: unknown, r: LensPurchaseRow) => `¥ ${(r.quantity * r.unitPrice).toFixed(2)}`,
                          },
                        ];
                        return (
                          <div key={order.id} style={{ padding: 12, border: '1px solid #e8e8e8', borderRadius: 8 }}>
                            <Table
                              size="small"
                              dataSource={frameRows}
                              rowKey={(record, i) => `${record.degree}-${i}`}
                              pagination={false}
                              columns={frameColumns}
                            />
                            <div
                              style={{
                                marginTop: 12,
                                paddingTop: 12,
                                borderTop: '1px solid #f0f0f0',
                                display: 'flex',
                                gap: 24,
                                fontWeight: 500,
                              }}
                            >
                              <span>
                                总数量：<span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span> 副
                              </span>
                              <span>
                                总金额：<span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {totalAmt.toFixed(2)}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Table
                      size="small"
                      dataSource={viewingStockOrders}
                      rowKey="id"
                      pagination={false}
                      columns={[
                        {
                          title: '采购数量',
                          key: 'qty',
                          width: 90,
                          align: 'center' as const,
                          render: (_: unknown, r: (typeof viewingStockOrders)[0]) =>
                            r.rows.reduce((s, x) => s + x.quantity, 0),
                        },
                        {
                          title: '采购金额',
                          key: 'amount',
                          width: 100,
                          align: 'right' as const,
                          render: (_: unknown, r: (typeof viewingStockOrders)[0]) =>
                            `¥${r.rows.reduce((s, x) => s + x.quantity * x.unitPrice, 0).toFixed(2)}`,
                        },
                      ]}
                    />
                  )}
                </>
              )}
            </div>
          );
        })()}
      </Modal>
      {alertSettingProduct && categories.find((c) => c.id === alertSettingProduct.category)?.name === '镜片' && (
        <LensAlertSettingModal
          product={alertSettingProduct}
          initialConfig={alertConfigs[alertSettingProduct.id]}
          onClose={() => setAlertSettingProduct(null)}
          onSave={handleSaveAlertConfig}
        />
      )}
      {alertSettingProduct && categories.find((c) => c.id === alertSettingProduct.category)?.name !== '镜片' && (
        <SimpleAlertModal
          product={alertSettingProduct}
          initialConfig={alertConfigs[alertSettingProduct.id]}
          onClose={() => setAlertSettingProduct(null)}
          onSave={handleSaveAlertConfig}
        />
      )}
      <Modal
        title={
          alertPurchaseSingleProductId
            ? `预警采购 - ${alertPurchaseItems.find((i) => i.product.id === alertPurchaseSingleProductId)?.productName ?? ''}`
            : '预警采购'
        }
        open={alertPurchaseModalOpen}
        onCancel={() => {
          setAlertPurchaseModalOpen(false);
          setAlertPurchaseSingleProductId(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => { setAlertPurchaseModalOpen(false); setAlertPurchaseSingleProductId(null); }}>取消</Button>,
          <Button
            key="confirm"
            type="primary"
            onClick={async () => {
              const itemsToAdd = alertPurchaseSingleProductId
                ? alertPurchaseItems.filter((i) => i.product.id === alertPurchaseSingleProductId)
                : alertPurchaseItems;
              if (itemsToAdd.length === 0) {
                message.warning('暂无预警商品');
                return;
              }
              let count = 0;
              if (isLoggedIn()) {
                try {
                  let currentList = purchaseOrders;
                  for (const item of itemsToAdd) {
                    const rows: LensPurchaseRow[] = item.isLens
                      ? item.orderRows.map((r) => ({
                          degree: r.degree,
                          quantity: Math.max(0, Math.floor(alertPurchaseQuantitiesByRow[`${item.product.id}_${r.degree}`] ?? r.quantity)),
                          unitPrice: r.unitPrice,
                        })).filter((r) => r.quantity > 0)
                      : [{ degree: '-', quantity: Math.max(1, Math.floor(alertPurchaseQuantitiesByRow[item.product.id] ?? item.suggestedQty)), unitPrice: item.unitPrice }];
                    if (item.isLens && rows.length === 0) continue;
                    const totalQty = item.isLens ? rows.reduce((s, r) => s + r.quantity, 0) : rows[0].quantity;
                    if (totalQty < 1) continue;
                    const backendId = getProductBackendId(item.product);
                    if (backendId == null) continue;
                    const orderNo = nextOrderNoFromList(currentList, 'YJ');
                    await createPurchaseListOrder({
                      orderNo,
                      productId: backendId,
                      productName: item.productName,
                      rows: item.isLens ? rows : [{ degree: '-', quantity: totalQty, unitPrice: item.unitPrice }],
                    });
                    currentList = [...currentList, { id: '', orderNo, productId: String(backendId), productName: item.productName, rows: [], status: 'active', createdAt: '' }];
                    count += 1;
                  }
                  if (count > 0) {
                    await addStockAlertPurchasedIdsApi(itemsToAdd.map((i) => String(i.product.id)));
                  }
                  await refresh();
                  message.success(count === 1 ? '已生成 1 个采购单（单号 YJ+日期+编号）' : `已生成 ${count} 个采购单（单号 YJ+日期+编号）`);
                  setAlertPurchaseModalOpen(false);
                  setAlertPurchaseSingleProductId(null);
                } catch (e) {
                  console.error(e);
                  message.error((e as Error)?.message ?? '提交失败');
                }
                return;
              }
              for (const item of itemsToAdd) {
                const rows: LensPurchaseRow[] = item.isLens
                  ? item.orderRows.map((r) => ({
                      degree: r.degree,
                      quantity: Math.max(0, Math.floor(alertPurchaseQuantitiesByRow[`${item.product.id}_${r.degree}`] ?? r.quantity)),
                      unitPrice: r.unitPrice,
                    })).filter((r) => r.quantity > 0)
                  : [{ degree: '-', quantity: Math.max(1, Math.floor(alertPurchaseQuantitiesByRow[item.product.id] ?? item.suggestedQty)), unitPrice: item.unitPrice }];
                if (item.isLens && rows.length === 0) continue;
                const totalQty = item.isLens ? rows.reduce((s, r) => s + r.quantity, 0) : rows[0].quantity;
                if (totalQty < 1) continue;
                purchaseListStorage.add(
                  {
                    productId: item.product.id,
                    productName: item.productName,
                    rows: item.isLens ? rows : [{ degree: '-', quantity: totalQty, unitPrice: item.unitPrice }],
                  },
                  { orderNoPrefix: 'YJ' },
                );
                count += 1;
              }
              if (count > 0) {
                stockAlertPurchasedStorage.add(itemsToAdd.map((i) => i.product.id));
              }
              message.success(count === 1 ? '已生成 1 个采购单（单号 YJ+日期+编号）' : `已生成 ${count} 个采购单（单号 YJ+日期+编号）`);
              setAlertPurchaseModalOpen(false);
              setAlertPurchaseSingleProductId(null);
              refresh();
            }}
          >
            确认
          </Button>,
        ]}
        width={800}
        destroyOnHidden
      >
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          {alertPurchaseSingleProductId
            ? '确认后将生成该商品的采购单并加入采购列表，采购单号格式：YJ+日期+编号。'
            : '以下为当前预警商品，确认后将按列表生成采购单并加入采购列表，采购单号格式：YJ+日期+编号。'}
        </div>
        {(() => {
          const modalRows =
            alertPurchaseSingleProductId
              ? alertPurchaseDisplayRows.filter((r) => r.item.product.id === alertPurchaseSingleProductId)
              : alertPurchaseDisplayRows;
          const totalQty = modalRows.reduce(
            (s, row) => s + Math.max(0, Math.floor(alertPurchaseQuantitiesByRow[row.rowKey] ?? row.displayQty)),
            0,
          );
          const totalPrice = modalRows.reduce(
            (s, row) => {
              const qty = Math.max(0, Math.floor(alertPurchaseQuantitiesByRow[row.rowKey] ?? row.displayQty));
              return s + qty * row.item.unitPrice;
            },
            0,
          );
          const twoColumns = modalRows.length > 10;
          const leftRows = twoColumns ? modalRows.slice(0, Math.ceil(modalRows.length / 2)) : modalRows;
          const rightRows = twoColumns ? modalRows.slice(Math.ceil(modalRows.length / 2)) : [];
          const tableColumns = [
            {
              title: '光度',
              key: 'degree',
              width: 100,
              align: 'center' as const,
              render: (_: unknown, row: AlertPurchaseDisplayRow) =>
                row.item.isLens ? (
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.degree}</span>
                ) : (
                  '—'
                ),
            },
            {
              title: '采购单价',
              key: 'unitPrice',
              width: 100,
              align: 'right' as const,
              render: (_: unknown, row: AlertPurchaseDisplayRow) =>
                row.item.unitPrice > 0 ? `¥ ${row.item.unitPrice.toFixed(2)}` : '—',
            },
            {
              title: '预警采购数量',
              key: 'displayQty',
              width: 120,
              align: 'center' as const,
              render: (_: unknown, row: AlertPurchaseDisplayRow) => (
                <InputNumber
                  min={0}
                  value={alertPurchaseQuantitiesByRow[row.rowKey] ?? row.displayQty}
                  onChange={(v) =>
                    setAlertPurchaseQuantitiesByRow((prev) => ({
                      ...prev,
                      [row.rowKey]: Math.max(0, Math.floor(Number(v) || 0)),
                    }))
                  }
                  style={{ width: 88 }}
                />
              ),
            },
          ];
          return (
            <>
              <div style={{ marginBottom: 12, display: 'flex', gap: 24, fontWeight: 500, fontSize: 14 }}>
                <span>总采购数量：<span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span> 片</span>
                <span>总采购价格：<span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {totalPrice.toFixed(2)}</span></span>
              </div>
              {twoColumns ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Table<AlertPurchaseDisplayRow>
                    rowKey={(r) => r.rowKey}
                    dataSource={leftRows}
                    pagination={false}
                    size="small"
                    columns={tableColumns}
                  />
                  <Table<AlertPurchaseDisplayRow>
                    rowKey={(r) => r.rowKey}
                    dataSource={rightRows}
                    pagination={false}
                    size="small"
                    columns={tableColumns}
                  />
                </div>
              ) : (
                <Table<AlertPurchaseDisplayRow>
                  rowKey={(r) => r.rowKey}
                  dataSource={modalRows}
                  pagination={false}
                  size="small"
                  columns={tableColumns}
                />
              )}
            </>
          );
        })()}
      </Modal>
      <Modal
        title="采购入库明细"
        open={!!viewingOrderInLog}
        onCancel={() => setViewingOrderInLog(null)}
        footer={<Button onClick={() => setViewingOrderInLog(null)}>关闭</Button>}
        width={640}
        destroyOnHidden
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 12 } }}
      >
        {viewingOrderInLog && (() => {
          const order = viewingOrderInLog;
          const product = products.find((p) => p.id === order.productId);
          const isFrame = categories.find((c) => c.id === product?.category)?.name === '镜架';
          const totalQty = order.rows.reduce((s, r) => s + r.quantity, 0);
          const totalAmt = order.rows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
          const parseDegree = (d: string): { sphere: number; cyl: number } => {
            const parts = (d ?? '').trim().split('/');
            if (parts.length !== 2) return { sphere: 0, cyl: 0 };
            const sphere = parseFloat(parts[0].trim());
            const cyl = parseFloat(parts[1].trim());
            return { sphere: Number.isNaN(sphere) ? 0 : sphere, cyl: Number.isNaN(cyl) ? 0 : cyl };
          };
          const filteredRows = order.rows.filter((r) => r.quantity > 0);
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
          const detailColumns = [
            { title: firstColTitle, dataIndex: 'degree', key: 'degree', width: 100 },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, align: 'center' as const },
            {
              title: '金额',
              key: 'amount',
              width: 90,
              align: 'right' as const,
              render: (_: unknown, r: LensPurchaseRow) => `¥ ${(r.quantity * r.unitPrice).toFixed(2)}`,
            },
          ];
          const sectionTitle = isFrame ? '型号/色号明细：' : '光度明细：';
          const qtyUnit = isFrame ? '副' : '片';
          return (
            <div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ color: '#666' }}>采购单号：</span>
                <span style={{ fontWeight: 500 }}>{order.orderNo}</span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ color: '#666' }}>入库商品：</span>
                <span style={{ fontWeight: 500 }}>{order.productName}</span>
              </div>
              <div style={{ marginBottom: 8, color: '#666' }}>{sectionTitle}</div>
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
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 24, fontWeight: 500 }}>
                <span>总数量：<span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalQty}</span> {qtyUnit}</span>
                <span>总金额：<span style={{ fontVariantNumeric: 'tabular-nums' }}>¥ {totalAmt.toFixed(2)}</span></span>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
