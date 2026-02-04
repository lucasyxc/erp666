import React, { useState, useEffect, useMemo, useRef, useCallback, useImperativeHandle } from 'react';
import {
  Tabs,
  Form,
  Input,
  Button,
  Select,
  Table,
  Space,
  Card,
  Grid,
  Row,
  Col,
  Modal,
  Popconfirm,
  AutoComplete,
  Tooltip,
  Checkbox,
  Switch,
  App,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { pinyin } from 'pinyin-pro';
import {
  createProduct,
  getProductFieldOptions,
  updateProduct,
  isLoggedIn,
  listCategories,
  listBrands,
  listSuppliers,
  listManufacturers,
  listSeries,
  listProducts,
  listPowerRangeTemplates,
  createCategory,
  updateCategory,
  deleteCategory,
  createBrand,
  updateBrand,
  deleteBrand,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createManufacturer,
  updateManufacturer,
  deleteManufacturer,
  createSeries,
  updateSeries,
  deleteSeries,
  deleteProductApi,
  createPowerRangeTemplate,
  updatePowerRangeTemplate,
  deletePowerRangeTemplate,
  listPriceCatalogs,
  createPriceCatalog,
  updatePriceCatalog,
  deletePriceCatalog,
} from '../../utils/api';
import {
  brandStorage,
  categoryStorage,
  supplierStorage,
  manufacturerStorage,
  seriesStorage,
  productStorage,
  powerRangeTemplateStorage,
  priceCatalogStorage,
} from '../../utils/storage';
import type { Brand, Category, Supplier, Manufacturer, Series, Product, PowerRangeTemplate, PriceCatalog } from '../../types';
import { LENS_TYPES, REFRACTIVE_INDEX, LENS_COATING, LENS_FUNCTIONS, ASPHERIC_DESIGN_OPTIONS, FINISHED_GLASSES_TYPES, getProductDisplayName } from '../../types';
import './index.css';

type TabKey = 'category' | 'brand' | 'supplier' | 'manufacturer' | 'series' | 'product' | 'allProducts';

// 护理液规格：part1 ml part2 单位（支/瓶/盒）
const SPECIFICATION_UNITS = [{ value: '支', label: '支' }, { value: '瓶', label: '瓶' }, { value: '盒', label: '盒' }] as const;

// 护眼产品规格：输入框 + 单位（颗/片/包）装
const CARE_PRODUCT_SPEC_UNITS = [{ value: '颗', label: '颗' }, { value: '片', label: '片' }, { value: '包', label: '包' }] as const;

function buildSpecification(part1: string, part2: string, unit?: string): string | undefined {
  const a = (part1 ?? '').trim();
  const b = (part2 ?? '').trim();
  if (!a && !b && !unit) return undefined;
  const mid = [a, 'ml', b].filter(Boolean).join(' ');
  return unit ? `${mid} ${unit}` : mid;
}

function buildSpecificationCareProduct(part1: string, unit?: string): string | undefined {
  const a = (part1 ?? '').trim();
  if (!a && !unit) return undefined;
  return unit ? `${a} ${unit}装` : undefined;
}

function parseSpecification(s: string | undefined): { part1: string; part2: string; unit?: string } {
  if (!s || !s.trim()) return { part1: '', part2: '', unit: undefined };
  const t = s.trim();
  // 护眼产品格式：X 颗装 / X 片装 / X 包装
  const careUnits = ['颗', '片', '包'] as const;
  for (const u of careUnits) {
    const suffix = `${u}装`;
    if (t.endsWith(suffix)) {
      const part1 = t.slice(0, -suffix.length).trim();
      return { part1, part2: '', unit: u };
    }
  }
  // 护理液格式：... ml ... 单位（支/瓶/盒）
  const units = ['支', '瓶', '盒'] as const;
  for (const u of units) {
    if (t.endsWith(u)) {
      const rest = t.slice(0, -u.length).trim();
      const idx = rest.indexOf(' ml ');
      if (idx >= 0) {
        return { part1: rest.slice(0, idx).trim(), part2: rest.slice(idx + 4).trim(), unit: u };
      }
      return { part1: rest, part2: '', unit: u };
    }
  }
  const idx = t.indexOf(' ml ');
  if (idx >= 0) return { part1: t.slice(0, idx).trim(), part2: t.slice(idx + 4).trim(), unit: undefined };
  return { part1: t, part2: '', unit: undefined };
}

export default function ProductPage() {
  const { message, modal } = App.useApp();
  const [brandForm] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [supplierForm] = Form.useForm();
  const [manufacturerForm] = Form.useForm();
  const [seriesForm] = Form.useForm();
  const [productForm] = Form.useForm();

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('product');
  const selectedBrandId = Form.useWatch('brandId', productForm);
  const bp = Grid.useBreakpoint();
  const isMobile = !bp.sm; /* xs: 小屏用竖排表单 */
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [editSeriesForm] = Form.useForm();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCategoryForm] = Form.useForm();
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editBrandForm] = Form.useForm();
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editSupplierForm] = Form.useForm();
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null);
  const [editManufacturerForm] = Form.useForm();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [powerRangeVisible, setPowerRangeVisible] = useState(false);
  const [powerRangeCells, setPowerRangeCells] = useState<string[]>([]);
  const [powerRangeTemplates, setPowerRangeTemplates] = useState<PowerRangeTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showAddButtonHint, setShowAddButtonHint] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProductForm] = Form.useForm();
  const [linkingProductId, setLinkingProductId] = useState<string | null>(null);
  const [linkManufacturerForm] = Form.useForm();
  const [linkingSupplierProductId, setLinkingSupplierProductId] = useState<string | null>(null);
  const [linkSupplierForm] = Form.useForm();
  const [newLensProductVisible, setNewLensProductVisible] = useState(false);
  const [newLensProductForm] = Form.useForm();
  const [newProductVisible, setNewProductVisible] = useState(false);
  const [newProductForm] = Form.useForm();
  // 存储每个类别的表单数据，确保各类别独立
  const [categoryFormData, setCategoryFormData] = useState<Record<string, any>>({});
  // 价目册：选中的价目册 id，null 表示显示全部商品
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [priceCatalogs, setPriceCatalogs] = useState<PriceCatalog[]>([]);
  const [newCatalogVisible, setNewCatalogVisible] = useState(false);
  const [newCatalogName, setNewCatalogName] = useState('');
  const [newCatalogSearchKeyword, setNewCatalogSearchKeyword] = useState('');
  const [newCatalogSelectedIds, setNewCatalogSelectedIds] = useState<string[]>([]);
  const [editingCatalog, setEditingCatalog] = useState<PriceCatalog | null>(null);
  const [editCatalogName, setEditCatalogName] = useState('');
  const [editCatalogSupplierId, setEditCatalogSupplierId] = useState<string | null>(null);
  const [addToCatalogVisible, setAddToCatalogVisible] = useState(false);
  const [addToCatalogBrandId, setAddToCatalogBrandId] = useState<string | null>(null);
  const [addToCatalogSelectedIds, setAddToCatalogSelectedIds] = useState<string[]>([]);
  const [allProductsSearchKeyword, setAllProductsSearchKeyword] = useState('');
  /** 镜片类别下拉选项（从后端数据库拉取，多端一致） */
  const [lensCategoryOptionsFromApi, setLensCategoryOptionsFromApi] = useState<{
    lensTypes: string[];
    refractiveIndexes: string[];
    coatings: string[];
    asphericDesigns: string[];
    materials: string[];
    functions: string[];
    seriesNames: string[];
  } | null>(null);

  // 打开「新建商品-镜片」弹窗时从后端拉取下拉选项（按机构、类别去重排序）
  useEffect(() => {
    if (!newLensProductVisible || !selectedCategory) return;
    const categoryName = categories.find((c) => c.id === selectedCategory)?.name;
    if (categoryName !== '镜片') return;
    getProductFieldOptions('镜片')
      .then((data) => setLensCategoryOptionsFromApi(data))
      .catch(() => setLensCategoryOptionsFromApi(null));
  }, [newLensProductVisible, selectedCategory, categories]);

  // 监听镜片相关字段，自动生成商品名称
  const brandId = Form.useWatch('brandId', productForm);
  const seriesName = Form.useWatch('seriesName', productForm);
  const refractiveIndex = Form.useWatch('refractiveIndex', productForm);
  const asphericDesign = Form.useWatch('asphericDesign', productForm);
  const functions = Form.useWatch('functions', productForm);
  const coating = Form.useWatch('coating', productForm);
  const material = Form.useWatch('material', productForm);
  const lensType = Form.useWatch('lensType', productForm);

  // 获取品牌名称的首字母（用于排序）
  const getFirstLetter = (name: string): string => {
    if (!name) return '';
    const firstChar = name.trim()[0];
    // 如果是中文字符，转换为拼音首字母
    if (/[\u4e00-\u9fa5]/.test(firstChar)) {
      const pinyinStr = pinyin(firstChar, { toneType: 'none' });
      // 取拼音的第一个字符作为首字母
      const firstLetter = pinyinStr.trim()[0] || '';
      return firstLetter.toUpperCase() || 'ZZZ';
    }
    // 如果是英文字母，直接返回大写
    if (/[a-zA-Z]/.test(firstChar)) {
      return firstChar.toUpperCase();
    }
    // 其他字符（数字、符号等）放在最后
    return 'ZZZ';
  };

  const refresh = async () => {
    try {
      if (isLoggedIn()) {
        const [categoriesRes, brandsRes, suppliersRes, manufacturersRes, seriesRes, productsRes, templatesRes, catalogsRes] =
          await Promise.all([
            listCategories(),
            listBrands(),
            listSuppliers(),
            listManufacturers(),
            listSeries(),
            listProducts(),
            listPowerRangeTemplates(),
            listPriceCatalogs(),
          ]);
        const allBrands = brandsRes.items as Brand[];
        const sortedBrands = [...allBrands].sort((a, b) => {
          const letterA = getFirstLetter(a.name);
          const letterB = getFirstLetter(b.name);
          if (letterA !== letterB) return letterA.localeCompare(letterB);
          return a.name.localeCompare(b.name, 'zh-CN');
        });
        setBrands(sortedBrands);
        setCategories(categoriesRes.items as Category[]);
        setSuppliers(suppliersRes.items as Supplier[]);
        setManufacturers(manufacturersRes.items as Manufacturer[]);
        setSeries(seriesRes.items as Series[]);
        setProducts(productsRes.items as Product[]);
        setPowerRangeTemplates(templatesRes.items as PowerRangeTemplate[]);
        setPriceCatalogs((catalogsRes.items || []) as PriceCatalog[]);
      } else {
        const [allBrands, categories, suppliers, manufacturers, series, products, priceCatalogs, templates] =
          await Promise.all([
            brandStorage.getAll(),
            categoryStorage.getAll(),
            supplierStorage.getAll(),
            manufacturerStorage.getAll(),
            seriesStorage.getAll(),
            productStorage.getAll(),
            priceCatalogStorage.getAll(),
            powerRangeTemplateStorage.getAll(),
          ]);
        const sortedBrands = [...allBrands].sort((a, b) => {
          const letterA = getFirstLetter(a.name);
          const letterB = getFirstLetter(b.name);
          if (letterA !== letterB) return letterA.localeCompare(letterB);
          return a.name.localeCompare(b.name, 'zh-CN');
        });
        setBrands(sortedBrands);
        setCategories(categories);
        setSuppliers(suppliers);
        setManufacturers(manufacturers);
        setSeries(series);
        setProducts(products);
        setPriceCatalogs(priceCatalogs);
        setPowerRangeTemplates(templates);
      }
    } catch (e) {
      console.error(e);
      message.error((e as Error)?.message ?? '加载失败');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onBrandFinish = async (values: { name: string }) => {
    try {
      if (isLoggedIn()) {
        await createBrand(values.name.trim());
      } else {
        await brandStorage.add({ name: values.name });
      }
      message.success('品牌添加成功');
      brandForm.resetFields();
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '品牌添加失败';
      if (msg === '品牌名称已存在') {
        modal.warning({ content: '该品牌名称已创建', okText: '确定', maskClosable: true });
      } else {
        message.error(msg);
      }
    }
  };

  const onCategoryFinish = async (values: { name: string }) => {
    try {
      if (isLoggedIn()) {
        await createCategory(values.name.trim());
      } else {
        await categoryStorage.add({ name: values.name });
      }
      message.success('类别添加成功');
      categoryForm.resetFields();
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '类别添加失败';
      if (msg === '类别名称已存在') {
        modal.warning({ content: '该类别名称已创建', okText: '确定', maskClosable: true });
      } else {
        message.error(msg);
      }
    }
  };

  const onSupplierFinish = async (values: {
    name: string;
    contact?: string;
    phone?: string;
    address?: string;
  }) => {
    try {
      if (isLoggedIn()) {
        await createSupplier({
          name: values.name.trim(),
          contact: values.contact?.trim(),
          phone: values.phone?.trim(),
          address: values.address?.trim(),
        });
      } else {
        await supplierStorage.add(values);
      }
      message.success('供应商添加成功');
      supplierForm.resetFields();
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '供应商添加失败';
      if (msg === '供应商名称已存在') {
        modal.warning({ content: '该供应商名称已创建', okText: '确定', maskClosable: true });
      } else {
        message.error(msg);
      }
    }
  };

  const onManufacturerFinish = async (values: {
    name: string;
    contact?: string;
    phone?: string;
    address?: string;
  }) => {
    try {
      if (isLoggedIn()) {
        await createManufacturer({
          name: values.name.trim(),
          contact: values.contact?.trim(),
          phone: values.phone?.trim(),
          address: values.address?.trim(),
        });
      } else {
        await manufacturerStorage.add(values);
      }
      message.success('生产厂家添加成功');
      manufacturerForm.resetFields();
      await refresh();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '生产厂家添加失败';
      if (msg === '厂家名称已存在') {
        modal.warning({ content: '该生产厂家已创建', okText: '确定', maskClosable: true });
      } else {
        message.error(msg);
      }
    }
  };

  const onSeriesFinish = async (values: { brandId: string; name: string }) => {
    try {
      if (isLoggedIn()) {
        await createSeries({ brandId: values.brandId, name: values.name.trim() });
      } else {
        await seriesStorage.add({ brandId: values.brandId, name: values.name });
      }
      message.success('系列添加成功');
      seriesForm.resetFields();
      await refresh();
    } catch (e) {
      message.error((e as Error)?.message ?? '系列添加失败');
    }
  };

  const handleEditSeries = (record: Series) => {
    setEditingSeries(record);
    editSeriesForm.setFieldsValue({
      brandId: record.brandId,
      name: record.name,
    });
  };

  const handleEditCategory = (record: Category) => {
    setEditingCategory(record);
    editCategoryForm.setFieldsValue({ name: record.name });
  };

  const handleEditBrand = (record: Brand) => {
    setEditingBrand(record);
    editBrandForm.setFieldsValue({ name: record.name });
  };

  const handleUpdateBrand = () => {
    editBrandForm.validateFields().then(async (values) => {
      if (editingBrand) {
        try {
          if (isLoggedIn()) {
            await updateBrand(editingBrand.id, values.name.trim());
          } else {
            await brandStorage.update(editingBrand.id, { name: values.name.trim() });
          }
          message.success('品牌更新成功');
          setEditingBrand(null);
          editBrandForm.resetFields();
          await refresh();
        } catch (error: unknown) {
          message.error((error as Error)?.message || '品牌更新失败');
        }
      }
    });
  };

  const handleDeleteBrand = async (id: string) => {
    try {
      if (isLoggedIn()) {
        await deleteBrand(id);
      } else {
        await brandStorage.delete(id);
      }
      message.success('品牌删除成功');
      await refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || '品牌删除失败');
    }
  };

  const handleEditSupplier = (record: Supplier) => {
    setEditingSupplier(record);
    editSupplierForm.setFieldsValue({
      name: record.name,
      contact: record.contact ?? '',
      phone: record.phone ?? '',
      address: record.address ?? '',
    });
  };

  const handleUpdateSupplier = () => {
    editSupplierForm.validateFields().then(async (values: { name: string; contact?: string; phone?: string; address?: string }) => {
      if (editingSupplier) {
        try {
          if (isLoggedIn()) {
            await updateSupplier(editingSupplier.id, {
              name: values.name?.trim() ?? '',
              contact: values.contact?.trim(),
              phone: values.phone?.trim(),
              address: values.address?.trim(),
            });
          } else {
            await supplierStorage.update(editingSupplier.id, {
              name: values.name?.trim(),
              contact: values.contact?.trim() || undefined,
              phone: values.phone?.trim() || undefined,
              address: values.address?.trim() || undefined,
            });
          }
          message.success('供应商更新成功');
          setEditingSupplier(null);
          editSupplierForm.resetFields();
          await refresh();
        } catch (error: unknown) {
          message.error((error as Error)?.message || '供应商更新失败');
        }
      }
    });
  };

  const handleDeleteSupplier = async (id: string) => {
    try {
      if (isLoggedIn()) {
        await deleteSupplier(id);
      } else {
        await supplierStorage.delete(id);
      }
      message.success('供应商删除成功');
      await refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || '供应商删除失败');
    }
  };

  const handleEditManufacturer = (record: Manufacturer) => {
    setEditingManufacturer(record);
    editManufacturerForm.setFieldsValue({
      name: record.name,
      contact: record.contact ?? '',
      phone: record.phone ?? '',
      address: record.address ?? '',
    });
  };

  const handleUpdateManufacturer = () => {
    editManufacturerForm.validateFields().then(async (values: { name: string; contact?: string; phone?: string; address?: string }) => {
      if (editingManufacturer) {
        try {
          if (isLoggedIn()) {
            await updateManufacturer(editingManufacturer.id, {
              name: values.name?.trim() ?? '',
              contact: values.contact?.trim(),
              phone: values.phone?.trim(),
              address: values.address?.trim(),
            });
          } else {
            await manufacturerStorage.update(editingManufacturer.id, {
              name: values.name?.trim(),
              contact: values.contact?.trim() || undefined,
              phone: values.phone?.trim() || undefined,
              address: values.address?.trim() || undefined,
            });
          }
          message.success('生产厂家更新成功');
          setEditingManufacturer(null);
          editManufacturerForm.resetFields();
          await refresh();
        } catch (error: unknown) {
          message.error((error as Error)?.message || '生产厂家更新失败');
        }
      }
    });
  };

  const handleDeleteManufacturer = async (id: string) => {
    try {
      if (isLoggedIn()) {
        await deleteManufacturer(id);
      } else {
        await manufacturerStorage.delete(id);
      }
      message.success('生产厂家删除成功');
      await refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || '生产厂家删除失败');
    }
  };

  const handleUpdateCategory = () => {
    editCategoryForm.validateFields().then(async (values) => {
      if (editingCategory) {
        try {
          if (isLoggedIn()) {
            await updateCategory(editingCategory.id, values.name.trim());
          } else {
            await categoryStorage.update(editingCategory.id, { name: values.name.trim() });
          }
          message.success('类别更新成功');
          setEditingCategory(null);
          editCategoryForm.resetFields();
          await refresh();
        } catch (error: unknown) {
          message.error((error as Error)?.message || '类别更新失败');
        }
      }
    });
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      if (isLoggedIn()) {
        await deleteCategory(id);
      } else {
        await categoryStorage.delete(id);
      }
      message.success('类别删除成功');
      await refresh();
    } catch (error: unknown) {
      const msg = (error as Error)?.message || '类别删除失败';
      if (msg.includes('存在商品') || msg.includes('无法删除')) {
        message.warning('该类别下存在商品，无法删除');
      } else {
        message.error(msg);
      }
    }
  };

  const handleUpdateSeries = () => {
    editSeriesForm.validateFields().then(async (values) => {
      if (editingSeries) {
        try {
          if (isLoggedIn()) {
            await updateSeries(editingSeries.id, { brandId: values.brandId, name: values.name.trim() });
          } else {
            await seriesStorage.update(editingSeries.id, {
              brandId: values.brandId,
              name: values.name,
            });
          }
          message.success('系列更新成功');
          setEditingSeries(null);
          editSeriesForm.resetFields();
          await refresh();
        } catch (error: unknown) {
          message.error((error as Error)?.message || '系列更新失败');
        }
      }
    });
  };

  const handleDeleteSeries = async (id: string) => {
    try {
      if (isLoggedIn()) {
        await deleteSeries(id);
      } else {
        await seriesStorage.delete(id);
      }
      message.success('系列删除成功');
      await refresh();
    } catch (error: unknown) {
      message.error((error as Error)?.message || '系列删除失败');
    }
  };

  const onProductFinish = (values: {
    name: string;
    brandId: string;
    seriesName?: string;
    manufacturerId?: string;
    lensType?: string;
    refractiveIndex?: string;
    coating?: string;
    functions?: string[];
    asphericDesign?: string;
  }) => {
    if (!selectedCategory) {
      message.error('请先选择类别');
      return;
    }
    if (!values.name || !values.name.trim()) {
      message.error('请输入商品名称');
      return;
    }
    if (!values.brandId) {
      message.error('请选择品牌');
      return;
    }
    (async () => {
      let seriesId: string | undefined = undefined;
      if (values.seriesName && values.seriesName.trim()) {
        const seriesName = values.seriesName.trim();
        const existingSeries = series
          .filter((s) => s.brandId === values.brandId)
          .find((s) => s.name === seriesName);
        if (existingSeries) {
          seriesId = existingSeries.id;
        } else if (isLoggedIn()) {
          const res = await createSeries({ brandId: values.brandId, name: seriesName });
          seriesId = String(res.id);
        } else {
          const newSeries = await seriesStorage.add({
            brandId: values.brandId,
            name: seriesName,
          });
          seriesId = newSeries.id;
        }
      }
      const category = categories.find((c) => c.id === selectedCategory);
      const brand = brands.find((b) => b.id === values.brandId);
      const manufacturer = values.manufacturerId ? manufacturers.find((m) => m.id === values.manufacturerId) : undefined;
      const productName = values.name.trim();
      const payload = {
        name: productName,
        category: selectedCategory,
        brandId: values.brandId,
        seriesId,
        manufacturerId: values.manufacturerId || undefined,
        lensType: values.lensType || undefined,
        refractiveIndex: values.refractiveIndex || undefined,
        coating: values.coating || undefined,
        functions: values.functions && values.functions.length > 0 ? values.functions : undefined,
        asphericDesign: values.asphericDesign || undefined,
        material: values.material || undefined,
        price: values.price ? Number(values.price) : undefined,
        powerRange: powerRangeCells.length > 0 ? powerRangeCells : undefined,
        inStock: false,
      };
      if (isLoggedIn() && category?.name && brand?.name) {
        const res = await createProduct({
          category_name: category.name,
          brand_name: brand.name,
          series_name: values.seriesName?.trim() || undefined,
          manufacturer_name: manufacturer?.name,
          name: productName,
          lens_type: values.lensType?.trim(),
          refractive_index: values.refractiveIndex?.trim(),
          coating: values.coating?.trim(),
          functions: payload.functions,
          aspheric_design: values.asphericDesign?.trim(),
          material: values.material?.trim(),
          price: payload.price,
          power_range: payload.powerRange,
          in_stock: false,
        }).catch((e) => {
          message.warning(`同步到服务器失败：${(e as Error).message}`);
          throw e;
        });
        try {
          const newItem = await productStorage.add(payload);
          await productStorage.update(newItem.id, { backendId: res.id });
        } catch (_) {
          // 后端已成功，仅本地写入失败，refresh 会从服务端拉取
        }
      } else {
        await productStorage.add(payload);
      }
      message.success('商品添加成功');
      productForm.resetFields();
      setPowerRangeCells([]);
      setShowAddButtonHint(false);
      await refresh();
    })().catch((e) => message.error((e as Error)?.message ?? '添加失败'));
  };

  // 检查当前选中的类别是否是镜片
  const isLensCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '镜片';
  }, [selectedCategory, categories]);

  // 检查当前选中的类别是否是服务
  const isServiceCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '服务';
  }, [selectedCategory, categories]);

  const isCareProductCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '护理产品';
  }, [selectedCategory, categories]);

  const isContactLensCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '角膜接触镜';
  }, [selectedCategory, categories]);

  const isFrameCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '镜架';
  }, [selectedCategory, categories]);

  // 生成镜片商品名称的函数
  const generateLensProductName = useMemo(() => {
    if (!isLensCategory) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (seriesName && seriesName.trim()) {
      parts.push(seriesName.trim());
    }
    
    // 3. 折射率
    if (refractiveIndex && refractiveIndex.trim()) {
      parts.push(refractiveIndex.trim());
    }
    
    // 4. 非球面设计
    if (asphericDesign && asphericDesign.trim()) {
      parts.push(asphericDesign.trim());
    }
    
    // 5. 功能
    if (functions && functions.length > 0) {
      const functionLabels = functions.join('、');
      if (functionLabels) parts.push(functionLabels);
    }
    
    // 6. 膜层
    if (coating && coating.trim()) {
      parts.push(coating.trim());
    }
    
    // 7. 镜片类型
    if (lensType && lensType.trim()) {
      parts.push(lensType.trim());
    }
    
    // 8. 材质
    if (material && material.trim()) {
      parts.push(material.trim());
    }
    
    // 9. 类别
    if (selectedCategory) {
      const category = categories.find((c) => c.id === selectedCategory);
      if (category) parts.push(category.name);
    }
    
    return parts.join(' ');
  }, [isLensCategory, brandId, seriesName, refractiveIndex, asphericDesign, functions, coating, lensType, material, selectedCategory, brands, categories]);

  // 当相关字段变化时，自动更新商品名称（仅镜片类别）
  useEffect(() => {
    if (isLensCategory && generateLensProductName) {
      productForm.setFieldValue('name', generateLensProductName);
    }
  }, [isLensCategory, generateLensProductName, productForm]);

  // 从已保存的商品中提取历史选项（使用 state 中的 series）
  const getHistoricalOptions = useMemo(() => {
    const lensProducts = products.filter((p) => {
      const cat = categories.find((c) => c.id === p.category);
      return cat?.name === '镜片';
    });
    const allSeries = series;

    return {
      lensTypes: Array.from(new Set(lensProducts.map((p) => p.lensType).filter(Boolean) as string[])).sort(),
      refractiveIndexes: Array.from(new Set(lensProducts.map((p) => p.refractiveIndex).filter(Boolean) as string[])).sort(),
      coatings: Array.from(new Set(lensProducts.map((p) => p.coating).filter(Boolean) as string[])).sort(),
      asphericDesigns: Array.from(new Set(lensProducts.map((p) => p.asphericDesign).filter(Boolean) as string[])).sort(),
      materials: Array.from(new Set(lensProducts.map((p) => p.material).filter(Boolean) as string[])).sort(),
      functions: Array.from(
        new Set(
          lensProducts
            .flatMap((p) => p.functions || [])
            .filter(Boolean) as string[]
        )
      ).sort(),
      seriesNames: Array.from(
        new Set(
          lensProducts
            .map((p) => {
              if (p.seriesId) {
                const s = allSeries.find((s) => s.id === p.seriesId);
                return s?.name;
              }
              return null;
            })
            .filter(Boolean) as string[]
        )
      ).sort(),
    };
  }, [products, categories, series]);

  const brandColumns: ColumnsType<Brand> = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      align: 'center',
      render: (_: any, __: Brand, index: number) => index + 1,
    },
    {
      title: '首字母',
      key: 'firstLetter',
      width: 80,
      align: 'center',
      render: (_: any, record: Brand) => getFirstLetter(record.name),
    },
    { title: '品牌名称', dataIndex: 'name', key: 'name' },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: Brand) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEditBrand(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个品牌吗？"
            onConfirm={() => handleDeleteBrand(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const categoryColumns: ColumnsType<Category> = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      render: (_: any, __: Category, index: number) => index + 1,
    },
    { title: '类别名称', dataIndex: 'name', key: 'name' },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: (_: any, record: Category) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEditCategory(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该类别吗？该类别下若有商品将无法删除。"
            onConfirm={() => handleDeleteCategory(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const supplierColumns: ColumnsType<Supplier> = [
    {
      title: '序号',
      key: 'index',
      width: 64,
      align: 'center',
      render: (_: any, __: Supplier, index: number) => index + 1,
    },
    { title: '供应商名称', dataIndex: 'name', key: 'name' },
    { title: '联系人', dataIndex: 'contact', key: 'contact' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Supplier) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEditSupplier(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该供应商吗？"
            onConfirm={() => handleDeleteSupplier(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const seriesColumns: ColumnsType<Series> = [
    {
      title: '品牌',
      dataIndex: 'brandId',
      key: 'brandId',
      render: (id: string) => brands.find((b) => b.id === id)?.name ?? '-',
    },
    { title: '系列名称', dataIndex: 'name', key: 'name' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Series) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEditSeries(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个系列吗？"
            onConfirm={() => handleDeleteSeries(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const manufacturerColumns: ColumnsType<Manufacturer> = [
    {
      title: '序号',
      key: 'index',
      width: 64,
      align: 'center',
      render: (_: any, __: Manufacturer, index: number) => index + 1,
    },
    { title: '厂家名称', dataIndex: 'name', key: 'name' },
    { title: '联系人', dataIndex: 'contact', key: 'contact' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Manufacturer) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleEditManufacturer(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除该生产厂家吗？"
            onConfirm={() => handleDeleteManufacturer(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 获取商品品牌的首字母（用于排序）
  const getProductBrandFirstLetter = (product: Product): string => {
    const brand = brands.find((b) => b.id === product.brandId);
    if (!brand) return 'ZZZ';
    return getFirstLetter(brand.name);
  };

  // 按品牌首字母排序的商品列表
  const sortedProducts = useMemo(() => {
    if (!selectedCategory) return [];
    const filtered = products.filter((p) => p.category === selectedCategory);
    return [...filtered].sort((a, b) => {
      const letterA = getProductBrandFirstLetter(a);
      const letterB = getProductBrandFirstLetter(b);
      if (letterA !== letterB) {
        return letterA.localeCompare(letterB);
      }
      // 如果首字母相同，按品牌名称排序
      const brandA = brands.find((br) => br.id === a.brandId)?.name || '';
      const brandB = brands.find((br) => br.id === b.brandId)?.name || '';
      if (brandA !== brandB) {
        return brandA.localeCompare(brandB, 'zh-CN');
      }
      // 如果品牌也相同，按商品名称排序
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }, [products, selectedCategory, brands]);

  // 删除商品处理函数
  const handleDeleteProduct = async (id: string) => {
    try {
      if (isLoggedIn()) {
        await deleteProductApi(id);
      } else {
        await productStorage.delete(id);
      }
      message.success('商品删除成功');
      await refresh();
    } catch (e) {
      message.error((e as Error)?.message ?? '删除失败');
    }
  };

  const productColumns: ColumnsType<Product> = useMemo(
    () => {
      const baseColumns: ColumnsType<Product> = [
        {
          title: '序号',
          key: 'index',
          width: 80,
          align: 'center',
          render: (_: any, __: Product, index: number) => index + 1,
        },
      ];
      
      // 服务类别不显示首字母列
      if (!isServiceCategory) {
        baseColumns.push({
          title: '首字母',
          key: 'firstLetter',
          width: 80,
          align: 'center',
          render: (_: any, record: Product) => {
            const brand = brands.find((b) => b.id === record.brandId);
            if (!brand) return '-';
            return getFirstLetter(brand.name);
          },
        });
      }
      
      baseColumns.push({
        title: isServiceCategory ? '服务名称' : '商品名称',
        dataIndex: 'name',
        key: 'name',
        render: (_: unknown, record: Product) => getProductDisplayName(record),
      });
      
      if (isCareProductCategory || isContactLensCategory) {
        baseColumns.push({
          title: '有效期',
          key: 'validityMonths',
          width: 100,
          align: 'center',
          render: (_: any, record: Product) =>
            record.validityMonths != null ? `${record.validityMonths}个月` : '-',
        });
        baseColumns.push({
          title: '效期管理',
          key: 'validityManaged',
          width: 100,
          align: 'center',
          render: (_: any, record: Product) => {
            const label =
              record.validityManaged === true ? '是' : record.validityManaged === false ? '否' : '未设置';
            const bg =
              record.validityManaged === true
                ? '#52c41a'
                : record.validityManaged === false
                ? '#ff4d4f'
                : '#d9d9d9';
            return (
              <Button
                type="text"
                size="small"
                style={{
                  backgroundColor: bg,
                  color: '#fff',
                  border: 'none',
                  minWidth: '80px',
                }}
                onClick={async () => {
                  const newValidity = record.validityManaged !== true;
                  try {
                    if (isLoggedIn() && record.backendId != null) {
                      await updateProduct(record.backendId, { validity_managed: newValidity }).catch((e) => {
                        message.warning(`同步到服务器失败：${(e as Error).message}`);
                        throw e;
                      });
                    }
                    try {
                      await productStorage.update(record.id, { validityManaged: newValidity });
                    } catch (_) {
                      // 后端已成功，仅本地写入失败
                    }
                    message.success(newValidity ? '已设置效期管理' : '已设置为否');
                    await refresh();
                  } catch (e) {
                    message.error((e as Error)?.message ?? '更新失败');
                  }
                }}
              >
                {label}
              </Button>
            );
          },
        });
      }
      
      baseColumns.push({
        title: '生产厂家',
        key: 'manufacturer',
        width: 200,
        render: (_: any, record: Product) => {
          if (!record.manufacturerId) {
            return (
              <Button
                type="link"
                size="small"
                onClick={() => setLinkingProductId(record.id)}
              >
                关联厂家
              </Button>
            );
          }
          const manufacturer = manufacturers.find((m) => m.id === record.manufacturerId);
          return manufacturer?.name || '-';
        },
      });

      if (isFrameCategory) {
        baseColumns.push({
          title: '精品',
          key: 'isBoutique',
          width: 64,
          align: 'center',
          render: (_: any, record: Product) => (record.isBoutique ? '是' : '否'),
        });
      }

      const priceTitle = isServiceCategory ? '服务价格' : isContactLensCategory ? '零售价格（元/片）' : '零售价格';
      baseColumns.push({
        title: <span style={{ whiteSpace: 'nowrap' }}>{priceTitle}</span>,
        dataIndex: 'price',
        key: 'price',
        width: isContactLensCategory ? 150 : 120,
        align: 'right',
        render: (price: number | undefined) => 
          price !== undefined && price !== null ? `¥${price.toFixed(2)}` : '-',
      });
      
      // 服务类别不显示库存管理列
      if (!isServiceCategory) {
        baseColumns.push({
          title: '库存管理',
          key: 'inStock',
          width: 100,
          align: 'center',
          render: (_: any, record: Product) => (
            <Button
              type="text"
              size="small"
              style={{
                backgroundColor: record.inStock === true ? '#52c41a' : record.inStock === false ? '#ff4d4f' : '#d9d9d9',
                color: '#fff',
                border: 'none',
                minWidth: '80px',
              }}
              onClick={async () => {
                const newStockStatus = record.inStock !== true;
                try {
                  if (isLoggedIn() && record.backendId != null) {
                    await updateProduct(record.backendId, { in_stock: newStockStatus }).catch((e) => {
                      message.warning(`同步到服务器失败：${(e as Error).message}`);
                      throw e;
                    });
                  }
                  try {
                    await productStorage.update(record.id, { inStock: newStockStatus });
                  } catch (_) {
                    // 后端已成功，仅本地写入失败
                  }
                  message.success(newStockStatus ? '已设置为库存管理' : '已设置为非库存管理');
                  await refresh();
                } catch (e) {
                  message.error((e as Error)?.message ?? '更新失败');
                }
              }}
            >
              {record.inStock === true ? '库存' : record.inStock === false ? '非库存' : '未设置'}
            </Button>
          ),
        });
      }
      
      baseColumns.push({
        title: '操作',
        key: 'action',
        width: 220,
        align: 'center',
        render: (_: any, record: Product) => {
          const category = categories.find((c) => c.id === record.category);
          const isService = category?.name === '服务';
          const isFrame = category?.name === '镜架';
          const isCareProduct = category?.name === '护理产品' || category?.name === '护眼产品';
          const isContactLens = category?.name === '角膜接触镜';
          
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setEditingProduct(record);
                  const isLens = category?.name === '镜片';
                  
                  if (isService) {
                    // 服务类别只需要设置名称和价格
                    editProductForm.setFieldsValue({
                      name: record.name,
                      price: record.price,
                    });
                  } else {
                    // 获取系列名称
                    let seriesName = '';
                    if (record.seriesId) {
                      const s = series.find((s) => s.id === record.seriesId);
                      seriesName = s?.name || '';
                    }
                    
                  const spec = parseSpecification(record.specification);
                  editProductForm.setFieldsValue({
                    name: record.name,
                    brandId: record.brandId,
                    seriesName: seriesName,
                    manufacturerId: record.manufacturerId,
                    lensType: record.lensType,
                    refractiveIndex: record.refractiveIndex,
                    coating: record.coating,
                    functions: record.functions,
                    asphericDesign: record.asphericDesign,
                    material: record.material,
                    finishedGlassesType: record.finishedGlassesType,
                    specificationPart1: spec.part1,
                    specificationPart2: spec.part2,
                    specificationUnit: spec.unit,
                    validityMonths: record.validityMonths,
                    design: record.design,
                    contactLensMaterial: record.contactLensMaterial,
                    model: record.model,
                    price: record.price,
                  });
                    setPowerRangeCells(record.powerRange || []);
                  }
                }}
              >
                编辑
              </Button>
              {/* 服务、镜架、护理产品、护眼产品、角膜接触镜不显示光度范围按钮 */}
              {!isService && !isFrame && !isCareProduct && !isContactLens && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setEditingProductId(record.id);
                    setPowerRangeCells(record.powerRange || []);
                    setPowerRangeVisible(true);
                  }}
                >
                  光度范围
                </Button>
              )}
              <Popconfirm
                title="确定要删除这个商品吗？"
                onConfirm={() => handleDeleteProduct(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          );
        },
      });
      
      return baseColumns;
    },
    [isServiceCategory, isCareProductCategory, isContactLensCategory, isFrameCategory, brands, manufacturers, categories, series]
  );

  // 全部商品按名称首字母排序，用于「全部商品列表」标签页
  const allProductsSortedByNameLetter = useMemo(() => {
    const letter = (name: string): string => {
      if (!name) return '';
      const firstChar = name.trim()[0];
      if (/[\u4e00-\u9fa5]/.test(firstChar)) {
        const pinyinStr = pinyin(firstChar, { toneType: 'none' });
        return (pinyinStr.trim()[0] || '').toUpperCase() || 'ZZZ';
      }
      if (/[a-zA-Z]/.test(firstChar)) return firstChar.toUpperCase();
      return 'ZZZ';
    };
    return [...products].sort((a, b) => {
      const la = letter(a.name);
      const lb = letter(b.name);
      if (la !== lb) return la.localeCompare(lb);
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
  }, [products]);

  // 商品名称转拼音首字母串（用于检索），如「你好」→「nh」
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

  // 价目册或全部：当前要展示的商品列表（首字母排序），并按拼音首字母检索过滤
  const allProductsListDisplay = useMemo(() => {
    const letter = (name: string): string => {
      if (!name) return '';
      const firstChar = name.trim()[0];
      if (/[\u4e00-\u9fa5]/.test(firstChar)) {
        const pinyinStr = pinyin(firstChar, { toneType: 'none' });
        return (pinyinStr.trim()[0] || '').toUpperCase() || 'ZZZ';
      }
      if (/[a-zA-Z]/.test(firstChar)) return firstChar.toUpperCase();
      return 'ZZZ';
    };
    let list = selectedCatalogId
      ? products.filter((p) => {
          const cat = priceCatalogs.find((c) => c.id === selectedCatalogId);
          return cat?.productIds.includes(p.id);
        })
      : allProductsSortedByNameLetter;
    if (selectedCatalogId) {
      list = [...list].sort((a, b) => {
        const la = letter(a.name);
        const lb = letter(b.name);
        if (la !== lb) return la.localeCompare(lb);
        return (a.name || '').localeCompare(b.name || '', 'zh-CN');
      });
    }
    const kw = allProductsSearchKeyword.trim().toLowerCase();
    if (kw) {
      list = list.filter((p) => getPinyinInitials(p.name).toLowerCase().startsWith(kw));
    }
    return list;
  }, [selectedCatalogId, priceCatalogs, products, allProductsSortedByNameLetter, allProductsSearchKeyword, getPinyinInitials]);

  // 新建价目册弹窗内：按拼音首字母检索后的商品列表（首字母排序），用于多选
  const newCatalogProductList = useMemo(() => {
    const letter = (name: string): string => {
      if (!name) return '';
      const firstChar = name.trim()[0];
      if (/[\u4e00-\u9fa5]/.test(firstChar)) {
        const pinyinStr = pinyin(firstChar, { toneType: 'none' });
        return (pinyinStr.trim()[0] || '').toUpperCase() || 'ZZZ';
      }
      if (/[a-zA-Z]/.test(firstChar)) return firstChar.toUpperCase();
      return 'ZZZ';
    };
    let list = [...products].sort((a, b) => {
      const la = letter(a.name);
      const lb = letter(b.name);
      if (la !== lb) return la.localeCompare(lb);
      return (a.name || '').localeCompare(b.name || '', 'zh-CN');
    });
    const kw = newCatalogSearchKeyword.trim().toLowerCase();
    if (kw) list = list.filter((p) => getPinyinInitials(p.name).toLowerCase().startsWith(kw));
    return list;
  }, [products, newCatalogSearchKeyword, getPinyinInitials]);

  const tabItems = [
    {
      key: 'product',
      label: '新建商品',
      children: (
        <div className="product-tab">
          {!selectedCategory ? (
            <Card title="选择类别" className="form-card">
              <div className="category-cards">
                {categories.map((category) => {
                  const cardContent = (
                    <Card
                      key={category.id}
                      hoverable
                      className="category-card"
                      onClick={() => {
                        setSelectedCategory(category.id);
                        productForm.setFieldValue('category', category.id);
                      }}
                    >
                      <div className="category-card-content">
                        <div className="category-card-title">{category.name}</div>
                      </div>
                    </Card>
                  );

                  if (category.name === '成品眼镜') {
                    return (
                      <Tooltip
                        key={category.id}
                        title="老花镜，太阳镜，运动眼镜，护目镜，套镜"
                        placement="top"
                      >
                        {cardContent}
                      </Tooltip>
                    );
                  }

                  return cardContent;
                })}
              </div>
            </Card>
          ) : (
            <Card
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Button
                    onClick={() => {
                      setSelectedCategory(null);
                      productForm.resetFields();
                    }}
                    className="back-button"
                  >
                    返回
                  </Button>
                  {isLensCategory ? (
                    <Button
                      type="primary"
                      onClick={() => {
                        // 重置表单，不保留之前的数据
                        newLensProductForm.resetFields();
                        setPowerRangeCells([]);
                        setNewLensProductVisible(true);
                      }}
                    >
                      新建商品 - 镜片
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      onClick={() => {
                        // 重置表单，不保留之前的数据
                        newProductForm.resetFields();
                        // 清除该类别的表单数据缓存
                        if (selectedCategory) {
                          setCategoryFormData((prev) => {
                            const newData = { ...prev };
                            delete newData[selectedCategory];
                            return newData;
                          });
                        }
                        setNewProductVisible(true);
                      }}
                    >
                      {isServiceCategory
                        ? `新建服务 - ${categories.find((c) => c.id === selectedCategory)?.name || ''}`
                        : `新建商品 - ${categories.find((c) => c.id === selectedCategory)?.name || ''}`}
                    </Button>
                  )}
                </div>
              }
              className="form-card"
            >
              <Table
                columns={productColumns}
                dataSource={sortedProducts}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                scroll={{ x: 700 }}
              />
            </Card>
          )}
        </div>
      ),
    },
    {
      key: 'allProducts',
      label: '全部商品列表',
      children: (
        <div className="product-tab">
          <Row gutter={16} wrap={false}>
            <Col flex="0 0 200px" className="price-catalog-side">
              <Card title="价目册管理" size="small" className="form-card price-catalog-card">
                <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                  <div
                    className={'price-catalog-item price-catalog-item-all' + (selectedCatalogId === null ? ' active' : '')}
                    onClick={() => setSelectedCatalogId(null)}
                  >
                    全部商品
                  </div>
                  <div className="price-catalog-btn-row">
                    <Button type="primary" block size="small" onClick={() => { setNewCatalogName(''); setNewCatalogSearchKeyword(''); setNewCatalogSelectedIds([]); setNewCatalogVisible(true); }}>
                      新建价目册
                    </Button>
                  </div>
                  {priceCatalogs.map((c, index) => (
                    <div
                      key={c.id}
                      className={'price-catalog-item' + (selectedCatalogId === c.id ? ' active' : '')}
                      onClick={() => setSelectedCatalogId(c.id)}
                    >
                      <span className="price-catalog-index">{index + 1}.</span>
                      <span className="price-catalog-name">{c.name}</span>
                      <Space size={4} onClick={(e) => e.stopPropagation()}>
                        <Button type="link" size="small" className="p-0" onClick={() => { setEditingCatalog(c); setEditCatalogName(c.name); setEditCatalogSupplierId(null); }}>编辑</Button>
                        <Popconfirm
                          title="确定删除该价目册？"
                          onConfirm={async () => {
                            if (isLoggedIn()) {
                              await deletePriceCatalog(c.id);
                            } else {
                              await priceCatalogStorage.delete(c.id);
                            }
                            await refresh();
                            if (selectedCatalogId === c.id) setSelectedCatalogId(null);
                          }}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="link" size="small" danger className="p-0">删除</Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  ))}
                </Space>
              </Card>
              {selectedCatalogId && (
                <Button type="default" block size="small" style={{ marginTop: 8 }} onClick={() => { setAddToCatalogBrandId(null); setAddToCatalogSelectedIds([]); setAddToCatalogVisible(true); }}>
                  添加同品牌商品
                </Button>
              )}
            </Col>
            <Col flex="1" style={{ minWidth: 0 }}>
              <Card
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>{selectedCatalogId ? (priceCatalogs.find((c) => c.id === selectedCatalogId)?.name ?? '') + ' - 商品列表' : '全部商品列表'}</span>
                    <Input
                      allowClear
                      placeholder="按商品名称拼音首字母检索"
                      value={allProductsSearchKeyword}
                      onChange={(e) => setAllProductsSearchKeyword(e.target.value)}
                      style={{ width: 220 }}
                      autoComplete="off"
                    />
                  </div>
                }
                className="form-card"
              >
                <Table
                  columns={[
                    { title: '序号', key: 'index', width: 80, align: 'center', render: (_: unknown, __: Product, index: number) => index + 1 },
                    { title: '首字母', key: 'letter', width: 80, align: 'center', render: (_: unknown, record: Product) => getFirstLetter(record.name) },
                    { title: '商品名称', dataIndex: 'name', key: 'name', render: (_: unknown, record: Product) => getProductDisplayName(record) },
                    {
                      title: '供应商',
                      key: 'supplier',
                      width: 140,
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
                            className="p-0"
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
                  ]}
                  dataSource={allProductsListDisplay}
                  rowKey="id"
                  pagination={{ pageSize: 20 }}
                />
              </Card>
            </Col>
          </Row>
          <Modal
            className="new-catalog-modal"
            title="新建价目册"
            open={newCatalogVisible}
            onOk={async () => {
              const name = (newCatalogName || '').trim();
              if (!name) { message.warning('请输入价目册名称'); return; }
              if (isLoggedIn()) {
                await createPriceCatalog({ name, productIds: newCatalogSelectedIds });
              } else {
                await priceCatalogStorage.add({ name, productIds: newCatalogSelectedIds });
              }
              await refresh();
              setNewCatalogVisible(false);
              setNewCatalogName('');
              setNewCatalogSearchKeyword('');
              setNewCatalogSelectedIds([]);
              message.success('价目册已创建');
            }}
            onCancel={() => { setNewCatalogVisible(false); setNewCatalogName(''); setNewCatalogSearchKeyword(''); setNewCatalogSelectedIds([]); }}
            okText="确定"
            cancelText="取消"
            width={720}
          >
            <Space orientation="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <span style={{ color: 'red' }}>*</span> 价目册名称
              </div>
              <Input value={newCatalogName} onChange={(e) => setNewCatalogName(e.target.value)} placeholder="请输入名称" autoComplete="off" />
              <div>按商品名称拼音首字母检索后勾选商品</div>
              <Input
                allowClear
                placeholder="按商品名称拼音首字母检索"
                value={newCatalogSearchKeyword}
                onChange={(e) => setNewCatalogSearchKeyword(e.target.value)}
                autoComplete="off"
              />
              <Table
                rowSelection={{
                  selectedRowKeys: newCatalogSelectedIds,
                  onChange: (keys) => setNewCatalogSelectedIds(keys as string[]),
                }}
                columns={[
                  { title: '序号', key: 'index', width: 64, align: 'center', render: (_: unknown, __: Product, index: number) => index + 1 },
                  { title: '首字母', key: 'letter', width: 64, align: 'center', render: (_: unknown, record: Product) => getFirstLetter(record.name) },
                  { title: '商品名称', dataIndex: 'name', key: 'name', ellipsis: false, render: (_: unknown, record: Product) => getProductDisplayName(record) },
                ]}
                dataSource={newCatalogProductList}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Space>
          </Modal>
          <Modal
            title="编辑价目册"
            open={!!editingCatalog}
            onOk={async () => {
              const name = (editCatalogName || '').trim();
              if (!name) { message.warning('请输入价目册名称'); return; }
              if (editingCatalog) {
                if (isLoggedIn()) {
                  await updatePriceCatalog(editingCatalog.id, { name });
                } else {
                  await priceCatalogStorage.update(editingCatalog.id, { name });
                }
                if (editCatalogSupplierId && editingCatalog.productIds.length > 0) {
                  const supplierIdNum = Number(editCatalogSupplierId);
                  if (isLoggedIn()) {
                    await Promise.all(
                      editingCatalog.productIds
                        .map((productId) => products.find((p) => p.id === productId))
                        .filter((p): p is Product => p?.backendId != null)
                        .map((p) => updateProduct(p.backendId!, { supplier_id: supplierIdNum }).catch(() => {}))
                    );
                  }
                  try {
                    await Promise.all(editingCatalog.productIds.map((productId) =>
                      productStorage.update(productId, { supplierId: editCatalogSupplierId })
                    ));
                  } catch (_) {
                    // 后端已成功，仅本地写入失败
                  }
                  message.success(`已保存，价目册内 ${editingCatalog.productIds.length} 个商品已关联该供应商`);
                } else {
                  message.success('已保存');
                }
                await refresh();
                setEditingCatalog(null);
                setEditCatalogName('');
                setEditCatalogSupplierId(null);
              }
            }}
            onCancel={() => { setEditingCatalog(null); setEditCatalogName(''); setEditCatalogSupplierId(null); }}
            okText="确定"
            cancelText="取消"
          >
            <Space orientation="vertical" style={{ width: '100%' }} size={16}>
              <div>
                <span style={{ color: 'red' }}>*</span> 价目册名称
              </div>
              <Input value={editCatalogName} onChange={(e) => setEditCatalogName(e.target.value)} placeholder="请输入名称" autoComplete="off" />
              <div>
                <div style={{ marginBottom: 8 }}>关联供应商（选定后保存，价目册内所有商品均关联此供应商）</div>
                <Select
                  placeholder="请选择供应商"
                  allowClear
                  style={{ width: '100%' }}
                  value={editCatalogSupplierId}
                  onChange={(v) => setEditCatalogSupplierId(v)}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            </Space>
          </Modal>
          <Modal
            title="添加同品牌商品"
            open={addToCatalogVisible}
            onOk={async () => {
              if (!selectedCatalogId || addToCatalogSelectedIds.length === 0) {
                message.warning('请选择要添加的商品');
                return;
              }
              const cat = priceCatalogs.find((c) => c.id === selectedCatalogId);
              if (!cat) return;
              const merged = [...new Set([...cat.productIds, ...addToCatalogSelectedIds])];
              if (isLoggedIn()) {
                await updatePriceCatalog(selectedCatalogId, { productIds: merged });
              } else {
                await priceCatalogStorage.update(selectedCatalogId, { productIds: merged });
              }
              await refresh();
              setAddToCatalogVisible(false);
              setAddToCatalogBrandId(null);
              setAddToCatalogSelectedIds([]);
              message.success('已添加 ' + addToCatalogSelectedIds.length + ' 个商品');
            }}
            onCancel={() => { setAddToCatalogVisible(false); setAddToCatalogBrandId(null); setAddToCatalogSelectedIds([]); }}
            okText="确定"
            cancelText="取消"
            width={520}
          >
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ marginBottom: 8 }}>选择品牌</div>
              <Select
                placeholder="请选择品牌"
                allowClear
                style={{ width: '100%' }}
                value={addToCatalogBrandId}
                onChange={(v) => { setAddToCatalogBrandId(v); setAddToCatalogSelectedIds([]); }}
                options={brands.map((b) => ({ value: b.id, label: b.name }))}
              />
              {addToCatalogBrandId && (
                <>
                  <div style={{ marginTop: 16, marginBottom: 8 }}>同品牌商品（可多选）</div>
                  <Checkbox.Group
                    value={addToCatalogSelectedIds}
                    onChange={(vals) => setAddToCatalogSelectedIds(vals as string[])}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}
                  >
                    {products
                      .filter((p) => p.brandId === addToCatalogBrandId)
                      .map((p) => (
                        <Checkbox key={p.id} value={p.id}>{getProductDisplayName(p)}</Checkbox>
                      ))}
                  </Checkbox.Group>
                </>
              )}
            </Space>
          </Modal>
        </div>
      ),
    },
    {
      key: 'category',
      label: '类别管理',
      children: (
        <div className="product-tab">
          <Card title="类别管理" className="form-card">
            <Form
              form={categoryForm}
              layout={isMobile ? 'vertical' : 'inline'}
              onFinish={onCategoryFinish}
              className="product-form product-form-category"
              autoComplete="off"
            >
              <Form.Item
                name="name"
                rules={[{ required: true, message: '请输入类别名称' }]}
              >
                <Input placeholder="类别名称" className="input-brand" autoComplete="off" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">
                  添加
                </Button>
              </Form.Item>
            </Form>
            <Table
              columns={categoryColumns}
              dataSource={categories}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 400 }}
            />
          </Card>
        </div>
      ),
    },
    {
      key: 'brand',
      label: '品牌管理',
      children: (
        <div className="product-tab">
          <Card title="品牌管理" className="form-card">
            <Form
              form={brandForm}
              layout={isMobile ? 'vertical' : 'inline'}
              onFinish={onBrandFinish}
              className="product-form product-form-brand"
              autoComplete="off"
            >
              <Form.Item
                name="name"
                rules={[{ required: true, message: '请输入品牌名称' }]}
              >
                <Input placeholder="请输入品牌名称" className="input-brand" autoComplete="off" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">
                  添加
                </Button>
              </Form.Item>
            </Form>
            <Table
              columns={brandColumns}
              dataSource={brands}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 400 }}
            />
          </Card>
        </div>
      ),
    },
    {
      key: 'supplier',
      label: '供应商管理',
      children: (
        <div className="product-tab">
          <Card title="供应商管理" className="form-card">
            <Form
              form={supplierForm}
              layout="vertical"
              onFinish={onSupplierFinish}
              className="product-form product-form-supplier"
              autoComplete="off"
            >
              <Space wrap size={16} style={{ width: '100%', marginBottom: 0 }} align="end">
                <Form.Item
                  name="name"
                  label="供应商名称"
                  rules={[{ required: true, message: '请输入供应商名称' }]}
                  style={{ marginBottom: 0 }}
                  className="supplier-form-name-item"
                >
                  <Input placeholder="供应商名称" className="input-w200" autoComplete="off" />
                </Form.Item>
                <Form.Item name="contact" label="联系人" style={{ marginBottom: 0 }}>
                  <Input placeholder="联系人" className="input-w160" autoComplete="off" />
                </Form.Item>
                <Form.Item name="phone" label="电话" style={{ marginBottom: 0 }}>
                  <Input placeholder="电话" className="input-w160" autoComplete="off" />
                </Form.Item>
                <Form.Item name="address" label="地址" style={{ marginBottom: 0 }}>
                  <Input placeholder="地址" className="input-w280" autoComplete="off" />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" htmlType="submit">
                    添加
                  </Button>
                </Form.Item>
              </Space>
              <Form.Item noStyle shouldUpdate>
                {(form) => {
                  const err = form.getFieldError('name');
                  if (!err?.length) return null;
                  return (
                    <div className="supplier-form-error-row" style={{ color: 'var(--ant-color-error)', fontSize: 12, marginTop: 2, marginBottom: 16 }}>
                      {err.join(' ')}
                    </div>
                  );
                }}
              </Form.Item>
            </Form>
            <Table
              columns={supplierColumns}
              dataSource={suppliers}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 600 }}
            />
          </Card>
        </div>
      ),
    },
    {
      key: 'manufacturer',
      label: '生产厂家管理',
      children: (
        <div className="product-tab">
          <Card title="生产厂家管理" className="form-card">
            <Form
              form={manufacturerForm}
              layout="vertical"
              onFinish={onManufacturerFinish}
              className="product-form product-form-manufacturer"
              autoComplete="off"
            >
              <Space wrap size={16} style={{ width: '100%', marginBottom: 0 }} align="end">
                <Form.Item
                  name="name"
                  label="厂家名称"
                  rules={[{ required: true, message: '请输入厂家名称' }]}
                  style={{ marginBottom: 0 }}
                  className="manufacturer-form-name-item"
                >
                  <Input placeholder="请输入厂家名称" className="input-w200" autoComplete="off" />
                </Form.Item>
                <Form.Item name="contact" label="联系人" style={{ marginBottom: 0 }}>
                  <Input placeholder="联系人" className="input-w160" autoComplete="off" />
                </Form.Item>
                <Form.Item name="phone" label="电话" style={{ marginBottom: 0 }}>
                  <Input placeholder="电话" className="input-w160" autoComplete="off" />
                </Form.Item>
                <Form.Item name="address" label="地址" style={{ marginBottom: 0 }}>
                  <Input placeholder="地址" className="input-w280" autoComplete="off" />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button type="primary" htmlType="submit">
                    添加
                  </Button>
                </Form.Item>
              </Space>
              <Form.Item noStyle shouldUpdate>
                {(form) => {
                  const err = form.getFieldError('name');
                  if (!err?.length) return null;
                  return (
                    <div className="manufacturer-form-error-row" style={{ color: 'var(--ant-color-error)', fontSize: 12, marginTop: 2, marginBottom: 16 }}>
                      {err.join(' ')}
                    </div>
                  );
                }}
              </Form.Item>
            </Form>
            <Table
              columns={manufacturerColumns}
              dataSource={manufacturers}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 600 }}
            />
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div className="product-page">
      <h1 className="product-page-title">商品信息管理</h1>
      <Tabs
        activeKey={activeTab}
        onChange={(k) => {
          setActiveTab(k as TabKey);
          if (k !== 'product') {
            setSelectedCategory(null);
            productForm.resetFields();
          }
        }}
        items={tabItems}
      />
      <Modal
        title="编辑系列"
        open={!!editingSeries}
        onOk={handleUpdateSeries}
        onCancel={() => {
          setEditingSeries(null);
          editSeriesForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form
          form={editSeriesForm}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            name="brandId"
            label="品牌"
            rules={[{ required: true, message: '请选择品牌' }]}
          >
            <Select
              placeholder="选择品牌"
              className="select-w200"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Form.Item>
          <Form.Item
            name="name"
            label="系列名称"
            rules={[{ required: true, message: '请输入系列名称' }]}
          >
            <Input placeholder="系列名称" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="编辑类别"
        open={!!editingCategory}
        onOk={handleUpdateCategory}
        onCancel={() => {
          setEditingCategory(null);
          editCategoryForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={editCategoryForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="name"
            label="类别名称"
            rules={[{ required: true, message: '请输入类别名称' }]}
          >
            <Input placeholder="类别名称" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="编辑品牌"
        open={!!editingBrand}
        onOk={handleUpdateBrand}
        onCancel={() => {
          setEditingBrand(null);
          editBrandForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={editBrandForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="name"
            label="品牌名称"
            rules={[{ required: true, message: '请输入品牌名称' }]}
          >
            <Input placeholder="品牌名称" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="编辑供应商"
        open={!!editingSupplier}
        onOk={handleUpdateSupplier}
        onCancel={() => {
          setEditingSupplier(null);
          editSupplierForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={editSupplierForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="name"
            label="供应商名称"
            rules={[{ required: true, message: '请输入供应商名称' }]}
          >
            <Input placeholder="供应商名称" autoComplete="off" />
          </Form.Item>
          <Form.Item name="contact" label="联系人">
            <Input placeholder="联系人" autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="电话" autoComplete="off" />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input placeholder="地址" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="编辑生产厂家"
        open={!!editingManufacturer}
        onOk={handleUpdateManufacturer}
        onCancel={() => {
          setEditingManufacturer(null);
          editManufacturerForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={editManufacturerForm} layout="vertical" autoComplete="off">
          <Form.Item name="name" label="厂家名称">
            <Input placeholder="厂家名称" autoComplete="off" />
          </Form.Item>
          <Form.Item name="contact" label="联系人">
            <Input placeholder="联系人" autoComplete="off" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input placeholder="电话" autoComplete="off" />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input placeholder="地址" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={editingProduct && categories.find((c) => c.id === editingProduct.category)?.name === '服务' 
          ? '编辑服务' 
          : `编辑商品 - ${editingProduct ? categories.find((c) => c.id === editingProduct.category)?.name || '' : ''}`}
        open={!!editingProduct}
        onOk={() => {
          editProductForm.validateFields().then(async (values) => {
            if (!editingProduct) return;
            
            // 生成商品名称（如果是镜片、镜架或成品眼镜类别）
            const category = categories.find((c) => c.id === editingProduct.category);
            const isLens = category?.name === '镜片';
            const isFrame = category?.name === '镜架';
            const isService = category?.name === '服务';
            const isFinishedGlasses = category?.name === '成品眼镜';
            const isCareSolution = category?.name === '护理液';
            const isCareProduct = category?.name === '护理产品' || category?.name === '护眼产品';
            const isContactLens = category?.name === '角膜接触镜';
            const isEquipment = category?.name === '器械类';
            const isEyeCare = category?.name === '护眼产品';
            let productName = editingProduct.name;
            
            // 服务类别只需要更新名称和价格
            if (isService) {
              if (!values.name || !values.name.trim()) {
                message.error('请输入服务名称');
                return;
              }
              if (isLoggedIn() && editingProduct.backendId != null) {
                await updateProduct(editingProduct.backendId, {
                  name: values.name.trim(),
                  price: values.price ? Number(values.price) : undefined,
                }).catch((e) => {
                  message.warning(`同步到服务器失败：${(e as Error).message}`);
                  throw e;
                });
              }
              try {
                await productStorage.update(editingProduct.id, {
                  name: values.name.trim(),
                  price: values.price ? Number(values.price) : undefined,
                });
              } catch (_) {
                // 后端已成功，仅本地写入失败
              }
              message.success('服务更新成功');
              setEditingProduct(null);
              editProductForm.resetFields();
              setPowerRangeCells([]);
              await refresh();
              return;
            }
            if (!values.brandId) {
              message.error('请选择品牌');
              return;
            }
            let seriesId: string | undefined = undefined;
            if (values.seriesName && values.seriesName.trim()) {
              const seriesName = values.seriesName.trim();
              const existingSeries = series
                .filter((s) => s.brandId === values.brandId)
                .find((s) => s.name === seriesName);
              if (existingSeries) {
                seriesId = existingSeries.id;
              } else if (isLoggedIn()) {
                const res = await createSeries({ brandId: values.brandId, name: seriesName });
                seriesId = String(res.id);
              } else {
                const newSeries = await seriesStorage.add({
                  brandId: values.brandId,
                  name: seriesName,
                });
                seriesId = newSeries.id;
              }
            }
            
            if (isLens) {
              const parts: string[] = [];
              
              // 品牌
              const brand = brands.find((b) => b.id === values.brandId);
              if (brand) parts.push(brand.name);
              
              // 系列
              if (values.seriesName && values.seriesName.trim()) {
                parts.push(values.seriesName.trim());
              }
              
              // 折射率
              if (values.refractiveIndex && values.refractiveIndex.trim()) {
                parts.push(values.refractiveIndex.trim());
              }
              
              // 非球面设计
              if (values.asphericDesign && values.asphericDesign.trim()) {
                parts.push(values.asphericDesign.trim());
              }
              
              // 功能
              if (values.functions && values.functions.length > 0) {
                const functionLabels = values.functions.join('、');
                if (functionLabels) parts.push(functionLabels);
              }
              
              // 膜层
              if (values.coating && values.coating.trim()) {
                parts.push(values.coating.trim());
              }
              
              // 镜片类型
              if (values.lensType && values.lensType.trim()) {
                parts.push(values.lensType.trim());
              }
              
              // 材质
              if (values.material && values.material.trim()) {
                parts.push(values.material.trim());
              }
              
              // 类别
              if (category) parts.push(category.name);
              
              productName = parts.join(' ');
            } else if (isFrame) {
              // 镜架：品牌、系列、材质、类别
              const parts: string[] = [];
              
              // 品牌
              const brand = brands.find((b) => b.id === values.brandId);
              if (brand) parts.push(brand.name);
              
              // 系列
              if (values.seriesName && values.seriesName.trim()) {
                parts.push(values.seriesName.trim());
              }
              
              // 材质
              if (values.material && values.material.trim()) {
                parts.push(values.material.trim());
              }
              
              // 类别
              if (category) parts.push(category.name);
              
              productName = parts.join(' ');
            } else if (isFinishedGlasses) {
              // 成品眼镜：品牌、系列、材质、类型
              const parts: string[] = [];
              
              // 品牌
              const brand = brands.find((b) => b.id === values.brandId);
              if (brand) parts.push(brand.name);
              
              // 系列
              if (values.seriesName && values.seriesName.trim()) {
                parts.push(values.seriesName.trim());
              }
              
              // 材质
              if (values.material && values.material.trim()) {
                parts.push(values.material.trim());
              }
              
              // 类型
              if (values.finishedGlassesType && values.finishedGlassesType.trim()) {
                parts.push(values.finishedGlassesType.trim());
              }
              
              productName = parts.join(' ');
            } else if (isContactLens) {
              // 角膜接触镜：品牌、系列、设计、类型
              const parts: string[] = [];
              const brand = brands.find((b) => b.id === values.brandId);
              if (brand) parts.push(brand.name);
              if (values.seriesName && values.seriesName.trim()) parts.push(values.seriesName.trim());
              if (values.design && values.design.trim()) parts.push(values.design.trim());
              if (values.material && values.material.trim()) parts.push(values.material.trim());
              productName = parts.join(' ');
            } else if (isCareProduct) {
              // 护理产品：品牌、系列、类型、规格
              const parts: string[] = [];
              
              // 品牌
              const brand = brands.find((b) => b.id === values.brandId);
              if (brand) parts.push(brand.name);
              
              // 系列
              if (values.seriesName && values.seriesName.trim()) {
                parts.push(values.seriesName.trim());
              }
              
              // 类型
              if (values.material && values.material.trim()) {
                parts.push(values.material.trim());
              }
              
              // 规格（护理产品：ml 格式；护眼产品：X 颗/片/包装）
              const spec = isEyeCare
                ? buildSpecificationCareProduct(values.specificationPart1 ?? '', values.specificationUnit)
                : buildSpecification(
                    values.specificationPart1 ?? '',
                    values.specificationPart2 ?? '',
                    values.specificationUnit
                  );
              if (spec && spec.trim()) {
                parts.push(spec.trim());
              }
              
              productName = parts.join(' ');
            } else if (isEquipment) {
              // 器械类：品牌、系列、类型、型号
              const parts: string[] = [];
              const brand = brands.find((b) => b.id === values.brandId);
              if (brand) parts.push(brand.name);
              if (values.seriesName && values.seriesName.trim()) parts.push(values.seriesName.trim());
              if (values.material && values.material.trim()) parts.push(values.material.trim());
              if (values.model && values.model.trim()) parts.push(values.model.trim() + '型');
              productName = parts.join(' ');
            }
            
            // 更新商品：已登录时先同步后端，再写本地（保证 localStorage 失败也已完成后端同步）
            const specification = (isCareSolution || isCareProduct)
              ? (isEyeCare
                  ? buildSpecificationCareProduct(values.specificationPart1 ?? '', values.specificationUnit)
                  : buildSpecification(
                      values.specificationPart1 ?? '',
                      values.specificationPart2 ?? '',
                      values.specificationUnit
                    ))
              : undefined;
            const editBrand = brands.find((b) => b.id === values.brandId);
            if (editingProduct.backendId && category?.name && editBrand?.name) {
              const editManufacturer = values.manufacturerId ? manufacturers.find((m) => m.id === values.manufacturerId) : undefined;
              await updateProduct(editingProduct.backendId, {
                category_name: category.name,
                brand_name: editBrand.name,
                series_name: values.seriesName?.trim(),
                manufacturer_name: editManufacturer?.name,
                name: productName,
                lens_type: values.lensType?.trim(),
                refractive_index: values.refractiveIndex?.trim(),
                coating: values.coating?.trim(),
                functions: values.functions && values.functions.length > 0 ? values.functions : undefined,
                aspheric_design: values.asphericDesign?.trim(),
                material: values.material?.trim(),
                price: values.price ? Number(values.price) : undefined,
                power_range: powerRangeCells.length > 0 ? powerRangeCells : undefined,
                annotation: editingProduct.annotation?.trim(),
                in_stock: editingProduct.inStock ?? false,
              }).catch((e) => {
                message.warning(`同步到服务器失败：${e.message}`);
                throw e;
              });
            }
            try {
              await productStorage.update(editingProduct.id, {
                name: productName,
                brandId: values.brandId,
                seriesId: seriesId,
                manufacturerId: values.manufacturerId || undefined,
                lensType: values.lensType || undefined,
                refractiveIndex: values.refractiveIndex || undefined,
                coating: values.coating || undefined,
                functions: values.functions && values.functions.length > 0 ? values.functions : undefined,
                asphericDesign: values.asphericDesign || undefined,
                material: values.material || undefined,
                finishedGlassesType: values.finishedGlassesType ? values.finishedGlassesType.trim() : undefined,
                ...((isCareSolution || isCareProduct) && { specification }),
                ...((isCareProduct || isContactLens) && {
                  validityMonths: values.validityMonths != null && values.validityMonths !== '' ? Number(values.validityMonths) : undefined,
                }),
                ...(isContactLens && {
                  design: values.design ? values.design.trim() : undefined,
                  contactLensMaterial: values.contactLensMaterial ? values.contactLensMaterial.trim() : undefined,
                }),
                ...(isEquipment && { model: values.model ? values.model.trim() : undefined }),
                price: values.price ? Number(values.price) : undefined,
                powerRange: powerRangeCells.length > 0 ? powerRangeCells : undefined,
              });
            } catch (_) {
              // 后端已成功，仅本地写入失败
            }

            message.success('商品更新成功');
            setEditingProduct(null);
            editProductForm.resetFields();
            setPowerRangeCells([]);
            await refresh();
          }).catch(() => {
            message.error('请检查表单项是否填写完整');
          });
        }}
        onCancel={() => {
          setEditingProduct(null);
          editProductForm.resetFields();
          setPowerRangeCells([]);
        }}
        okText="确定"
        cancelText="取消"
        width={800}
      >
        {editingProduct && <EditProductForm 
          editingProduct={editingProduct}
          editProductForm={editProductForm}
          categories={categories}
          brands={brands}
          series={series}
          manufacturers={manufacturers}
          getHistoricalOptions={getHistoricalOptions}
          setEditingProductId={setEditingProductId}
          setPowerRangeVisible={setPowerRangeVisible}
          products={products}
        />}
      </Modal>
      <Modal
        title="关联生产厂家"
        open={!!linkingProductId}
        onOk={() => {
          linkManufacturerForm.validateFields().then(async (values) => {
            if (linkingProductId) {
              const product = products.find((p) => p.id === linkingProductId);
              if (isLoggedIn() && product?.backendId != null) {
                await updateProduct(product.backendId, { manufacturer_id: Number(values.linkManufacturerId) }).catch((e) => {
                  message.warning(`同步到服务器失败：${(e as Error).message}`);
                  throw e;
                });
              }
              try {
                await productStorage.update(linkingProductId, { manufacturerId: values.linkManufacturerId });
              } catch (_) {
                // 后端已成功，仅本地写入失败
              }
              message.success('厂家关联成功');
              setLinkingProductId(null);
              linkManufacturerForm.resetFields();
              await refresh();
            }
          });
        }}
        onCancel={() => {
          setLinkingProductId(null);
          linkManufacturerForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
      >
        <Form form={linkManufacturerForm} layout="vertical" autoComplete="off">
          <Form.Item
            name="linkManufacturerId"
            label="选择生产厂家"
            rules={[{ required: true, message: '请选择生产厂家' }]}
          >
            <Select
              placeholder="请选择生产厂家"
              options={manufacturers.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="关联供应商"
        open={!!linkingSupplierProductId}
        onOk={() => {
          linkSupplierForm.validateFields().then(async (values) => {
            if (linkingSupplierProductId) {
              const product = products.find((p) => p.id === linkingSupplierProductId);
              if (isLoggedIn() && product?.backendId != null) {
                await updateProduct(product.backendId, { supplier_id: Number(values.linkSupplierId) }).catch((e) => {
                  message.warning(`同步到服务器失败：${(e as Error).message}`);
                  throw e;
                });
              }
              try {
                await productStorage.update(linkingSupplierProductId, { supplierId: values.linkSupplierId });
              } catch (_) {
                // 后端已成功，仅本地写入失败
              }
              message.success('供应商关联成功');
              setLinkingSupplierProductId(null);
              linkSupplierForm.resetFields();
              await refresh();
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
              options={suppliers.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="新建商品 - 镜片"
        open={newLensProductVisible}
        afterOpenChange={(open) => {
          if (open && selectedCategory) {
            // 弹窗打开时，恢复该类别的表单数据
            const cachedData = categoryFormData[selectedCategory];
            if (cachedData) {
              newLensProductForm.setFieldsValue(cachedData);
            }
          }
        }}
        onOk={() => {
          newLensProductForm.validateFields().then(async (values) => {
            if (!selectedCategory) {
              message.error('请先选择类别');
              return;
            }
            if (!values.brandId) {
              message.error('请选择品牌');
              return;
            }
            
            // 处理系列：如果输入了系列名称，检查是否存在，不存在则创建
            let seriesId: string | undefined = undefined;
            if (values.seriesName && values.seriesName.trim()) {
              const seriesName = values.seriesName.trim();
              const existingSeries = isLoggedIn()
                ? series.filter((s) => s.brandId === values.brandId).find((s) => s.name === seriesName)
                : seriesStorage.getByBrandId(values.brandId).find((s) => s.name === seriesName);
              if (existingSeries) {
                seriesId = existingSeries.id;
              } else if (isLoggedIn()) {
                const res = await createSeries({ brandId: values.brandId, name: seriesName });
                seriesId = String(res.id);
              } else {
                const newSeries = seriesStorage.add({
                  brandId: values.brandId,
                  name: seriesName,
                });
                seriesId = newSeries.id;
              }
            }
            
            // 生成商品名称
            const parts: string[] = [];
            
            // 品牌
            const brand = brands.find((b) => b.id === values.brandId);
            if (brand) parts.push(brand.name);
            
            // 系列
            if (values.seriesName && values.seriesName.trim()) {
              parts.push(values.seriesName.trim());
            }
            
            // 折射率
            if (values.refractiveIndex && values.refractiveIndex.trim()) {
              parts.push(values.refractiveIndex.trim());
            }
            
            // 非球面设计
            if (values.asphericDesign && values.asphericDesign.trim()) {
              parts.push(values.asphericDesign.trim());
            }
            
            // 功能
            if (values.functions && values.functions.length > 0) {
              const functionLabels = values.functions.join('、');
              if (functionLabels) parts.push(functionLabels);
            }
            
            // 膜层
            if (values.coating && values.coating.trim()) {
              parts.push(values.coating.trim());
            }
            
            // 镜片类型
            if (values.lensType && values.lensType.trim()) {
              parts.push(values.lensType.trim());
            }
            
            // 材质
            if (values.material && values.material.trim()) {
              parts.push(values.material.trim());
            }
            
            // 类别
            const category = categories.find((c) => c.id === selectedCategory);
            if (category) parts.push(category.name);
            
            const productName = parts.join(' ');
            const manufacturer = values.manufacturerId ? manufacturers.find((m) => m.id === values.manufacturerId) : undefined;
            const lensPayload = {
              name: productName,
              category: selectedCategory,
              brandId: values.brandId,
              seriesId: seriesId,
              manufacturerId: values.manufacturerId || undefined,
              lensType: values.lensType || undefined,
              refractiveIndex: values.refractiveIndex || undefined,
              coating: values.coating || undefined,
              functions: values.functions && values.functions.length > 0 ? values.functions : undefined,
              asphericDesign: values.asphericDesign || undefined,
              material: values.material || undefined,
              price: values.price ? Number(values.price) : undefined,
              powerRange: powerRangeCells.length > 0 ? powerRangeCells : undefined,
              annotation: values.annotation?.trim() || undefined,
              inStock: false,
            };

            // 已登录时先同步后端，再写本地（保证 localStorage 失败也已完成后端同步）
            if (category?.name && brand?.name && isLoggedIn()) {
              const res = await createProduct({
                category_name: category.name,
                brand_name: brand.name,
                series_name: values.seriesName?.trim() || undefined,
                manufacturer_name: manufacturer?.name,
                name: productName,
                lens_type: values.lensType?.trim(),
                refractive_index: values.refractiveIndex?.trim(),
                coating: values.coating?.trim(),
                functions: lensPayload.functions,
                aspheric_design: values.asphericDesign?.trim(),
                material: values.material?.trim(),
                price: lensPayload.price,
                power_range: lensPayload.powerRange,
                annotation: lensPayload.annotation,
                in_stock: false,
              }).catch((e) => {
                message.warning(`同步到服务器失败：${(e as Error).message}`);
                throw e;
              });
              try {
                const newItem = await productStorage.add(lensPayload);
                await productStorage.update(newItem.id, { backendId: res.id });
              } catch (_) {
                // 后端已成功，仅本地写入失败，refresh 会从服务端拉取
              }
            } else {
              await productStorage.add(lensPayload);
            }

            message.success('商品添加成功');
            // 清除该类别的表单数据缓存
            if (selectedCategory) {
              setCategoryFormData((prev) => {
                const newData = { ...prev };
                delete newData[selectedCategory];
                return newData;
              });
            }
            newLensProductForm.resetFields();
            setPowerRangeCells([]);
            setShowAddButtonHint(false);
            setNewLensProductVisible(false);
            await refresh();
          });
        }}
        onCancel={() => {
          setNewLensProductVisible(false);
          // 保存当前类别的表单数据
          if (selectedCategory) {
            const formValues = newLensProductForm.getFieldsValue();
            setCategoryFormData((prev) => ({
              ...prev,
              [selectedCategory]: formValues,
            }));
          }
          newLensProductForm.resetFields();
          setPowerRangeCells([]);
        }}
        okText="确定"
        cancelText="取消"
        width={800}
      >
        <NewLensProductForm
          form={newLensProductForm}
          brands={brands}
          manufacturers={manufacturers}
          getHistoricalOptions={getHistoricalOptions}
          lensCategoryOptionsFromApi={lensCategoryOptionsFromApi}
          selectedBrandId={Form.useWatch('brandId', newLensProductForm)}
          powerRangeCells={powerRangeCells}
          setPowerRangeCells={setPowerRangeCells}
          setPowerRangeVisible={setPowerRangeVisible}
          setEditingProductId={setEditingProductId}
          selectedCategory={selectedCategory}
          categories={categories}
          products={products}
          series={series}
        />
      </Modal>
      <Modal
        title={isServiceCategory ? '新建服务' : `新建商品 - ${selectedCategory ? categories.find((c) => c.id === selectedCategory)?.name || '' : ''}`}
        open={newProductVisible}
        afterOpenChange={(open) => {
          if (open && selectedCategory) {
            // 弹窗打开时，恢复该类别的表单数据
            const cachedData = categoryFormData[selectedCategory];
            if (cachedData) {
              newProductForm.setFieldsValue(cachedData);
            }
          }
        }}
        onOk={() => {
          newProductForm.validateFields().then(async (values) => {
            if (!selectedCategory) {
              message.error('请先选择类别');
              return;
            }
            if (!values.name || !values.name.trim()) {
              message.error(isServiceCategory ? '请输入服务名称' : '请输入商品名称');
              return;
            }
            try {
              if (isServiceCategory) {
                if (isLoggedIn()) {
                  const res = await createProduct({
                    category_name: '服务',
                    brand_name: '',
                    name: values.name.trim(),
                    price: values.price ? Number(values.price) : undefined,
                  }).catch((e) => {
                    message.warning(`同步到服务器失败：${(e as Error).message}`);
                    throw e;
                  });
                  try {
                    const newItem = await productStorage.add({
                      name: values.name.trim(),
                      category: selectedCategory,
                      price: values.price ? Number(values.price) : undefined,
                    });
                    await productStorage.update(newItem.id, { backendId: res.id });
                  } catch (_) {
                    // 后端已成功，仅本地写入失败
                  }
                } else {
                  await productStorage.add({
                    name: values.name.trim(),
                    category: selectedCategory,
                    price: values.price ? Number(values.price) : undefined,
                  });
                }
                message.success('服务添加成功');
              } else {
                if (!values.brandId) {
                  message.error('请选择品牌');
                  return;
                }
                let seriesId: string | undefined = undefined;
                if (values.seriesName && values.seriesName.trim()) {
                  const seriesName = values.seriesName.trim();
                  const existingSeries = series
                    .filter((s) => s.brandId === values.brandId)
                    .find((s) => s.name === seriesName);
                  if (existingSeries) {
                    seriesId = existingSeries.id;
                  } else if (isLoggedIn()) {
                    const res = await createSeries({ brandId: values.brandId, name: seriesName });
                    seriesId = String(res.id);
                  } else {
                    const newSeries = await seriesStorage.add({
                      brandId: values.brandId,
                      name: seriesName,
                    });
                    seriesId = newSeries.id;
                  }
                }
                const category = categories.find((c) => c.id === selectedCategory);
                const isCareSolutionAdd = category?.name === '护理液';
                const isCareProductAdd = category?.name === '护理产品' || category?.name === '护眼产品';
                const isContactLensAdd = category?.name === '角膜接触镜';
                const isEquipmentAdd = category?.name === '器械类';
                const isFrameAdd = category?.name === '镜架';
                const isEyeCareAdd = category?.name === '护眼产品';
                const specification = (isCareSolutionAdd || isCareProductAdd)
                  ? (isEyeCareAdd
                      ? buildSpecificationCareProduct(values.specificationPart1 ?? '', values.specificationUnit)
                      : buildSpecification(
                          values.specificationPart1 ?? '',
                          values.specificationPart2 ?? '',
                          values.specificationUnit
                        ))
                  : undefined;
                const nonLensPayload = {
                  name: values.name.trim(),
                  category: selectedCategory,
                  brandId: values.brandId,
                  seriesId,
                  manufacturerId: values.manufacturerId || undefined,
                  material: values.material ? values.material.trim() : undefined,
                  finishedGlassesType: values.finishedGlassesType ? values.finishedGlassesType.trim() : undefined,
                  ...(specification !== undefined && { specification }),
                  ...((isCareProductAdd || isContactLensAdd) && {
                    validityMonths: values.validityMonths != null && values.validityMonths !== '' ? Number(values.validityMonths) : undefined,
                  }),
                  ...(isContactLensAdd && {
                    design: values.design ? values.design.trim() : undefined,
                    contactLensMaterial: values.contactLensMaterial ? values.contactLensMaterial.trim() : undefined,
                  }),
                  ...(isEquipmentAdd && { model: values.model ? values.model.trim() : undefined }),
                  ...(isFrameAdd && { isBoutique: !!values.isBoutique }),
                  price: values.price ? Number(values.price) : undefined,
                  inStock: false,
                };
                if (isLoggedIn() && category?.name) {
                  const brand = brands.find((b) => b.id === values.brandId);
                  const res = await createProduct({
                    category_name: category.name,
                    brand_name: brand?.name ?? '',
                    series_name: values.seriesName?.trim() || undefined,
                    manufacturer_name: values.manufacturerId ? manufacturers.find((m) => m.id === values.manufacturerId)?.name : undefined,
                    name: values.name.trim(),
                    material: values.material?.trim(),
                    price: values.price ? Number(values.price) : undefined,
                  }).catch((e) => {
                    message.warning(`同步到服务器失败：${(e as Error).message}`);
                    throw e;
                  });
                  try {
                    const newItem = await productStorage.add(nonLensPayload);
                    await productStorage.update(newItem.id, { backendId: res.id });
                  } catch (_) {
                    // 后端已成功，仅本地写入失败
                  }
                } else {
                  await productStorage.add(nonLensPayload);
                }
                message.success('商品添加成功');
              }
              if (selectedCategory) {
                setCategoryFormData((prev) => {
                  const newData = { ...prev };
                  delete newData[selectedCategory];
                  return newData;
                });
              }
              newProductForm.resetFields();
              setNewProductVisible(false);
              await refresh();
            } catch (e) {
              message.error((e as Error)?.message ?? '保存失败');
            }
          });
        }}
        onCancel={() => {
          setNewProductVisible(false);
          // 保存当前类别的表单数据
          if (selectedCategory) {
            const formValues = newProductForm.getFieldsValue();
            setCategoryFormData((prev) => ({
              ...prev,
              [selectedCategory]: formValues,
            }));
          }
          newProductForm.resetFields();
        }}
        okText="确定"
        cancelText="取消"
        width={600}
      >
        <NewProductForm
          form={newProductForm}
          brands={brands}
          manufacturers={manufacturers}
          getHistoricalOptions={getHistoricalOptions}
          selectedCategory={selectedCategory}
          categories={categories}
          products={products}
          series={series}
          isServiceCategory={isServiceCategory}
        />
      </Modal>
      <Modal
        title="光度范围"
        open={powerRangeVisible}
        onCancel={() => {
          setPowerRangeVisible(false);
          if (!editingProductId) {
            setPowerRangeCells([]);
          }
          setSelectedTemplateId(undefined);
          setEditingProductId(null);
        }}
        footer={null}
        width="auto"
        style={{ maxWidth: '1220px' }}
        destroyOnHidden={false}
        maskClosable={false}
      >
        {powerRangeVisible && (
          <PowerRangeTable
            initialCells={powerRangeCells}
            templates={powerRangeTemplates}
            selectedTemplateId={selectedTemplateId}
            onSave={async (cells) => {
              if (editingProductId) {
                const product = products.find((p) => p.id === editingProductId);
                if (isLoggedIn() && product?.backendId != null) {
                  await updateProduct(product.backendId, { power_range: cells.length > 0 ? cells : undefined }).catch((e) => {
                    message.warning(`同步到服务器失败：${(e as Error).message}`);
                    throw e;
                  });
                }
                try {
                  await productStorage.update(editingProductId, {
                    powerRange: cells.length > 0 ? cells : undefined,
                  });
                } catch (_) {
                  // 后端已成功，仅本地写入失败
                }
                message.success('光度范围已更新');
                await refresh();
              } else {
                // 新建商品时保存到状态
                setPowerRangeCells(cells);
                message.success('光度范围已保存');
                // 显示闪烁提示
                setShowAddButtonHint(true);
                // 5秒后自动停止闪烁
                setTimeout(() => {
                  setShowAddButtonHint(false);
                }, 5000);
              }
              setPowerRangeVisible(false);
              setSelectedTemplateId(undefined);
              setEditingProductId(null);
            }}
            onCancel={() => {
              setPowerRangeVisible(false);
              if (!editingProductId) {
                setPowerRangeCells([]);
              }
              setSelectedTemplateId(undefined);
              setEditingProductId(null);
            }}
            onTemplateChange={(templateId) => {
              setSelectedTemplateId(templateId);
            }}
            onSaveTemplate={async (name, cells) => {
              if (isLoggedIn()) {
                await createPowerRangeTemplate({ name, cells });
                const res = await listPowerRangeTemplates();
                setPowerRangeTemplates(res.items as PowerRangeTemplate[]);
              } else {
                await powerRangeTemplateStorage.add({ name, cells });
                setPowerRangeTemplates(await powerRangeTemplateStorage.getAll());
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// 新建商品表单组件（非镜片类别）
function NewProductForm({
  form,
  brands,
  manufacturers,
  getHistoricalOptions,
  selectedCategory,
  categories,
  products,
  series,
  isServiceCategory,
}: {
  form: ReturnType<typeof Form.useForm>[0];
  brands: Brand[];
  manufacturers: Manufacturer[];
  getHistoricalOptions: {
    lensTypes: string[];
    refractiveIndexes: string[];
    coatings: string[];
    asphericDesigns: string[];
    materials: string[];
    functions: string[];
    seriesNames: string[];
  };
  selectedCategory: string | null;
  categories: Category[];
  products: Product[];
  series: Series[];
  isServiceCategory?: boolean;
}) {
  const selectedBrandId = Form.useWatch('brandId', form);
  
  // 监听字段变化，自动生成商品名称（镜架类别和成品眼镜类别）
  const brandId = Form.useWatch('brandId', form);
  const material = Form.useWatch('material', form);
  const seriesName = Form.useWatch('seriesName', form);
  const finishedGlassesType = Form.useWatch('finishedGlassesType', form);
  const specificationPart1 = Form.useWatch('specificationPart1', form);
  const specificationPart2 = Form.useWatch('specificationPart2', form);
  const specificationUnit = Form.useWatch('specificationUnit', form);
  const design = Form.useWatch('design', form);
  const model = Form.useWatch('model', form);
  
  // 判断是否为镜架类别
  const isFrameCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '镜架';
  }, [selectedCategory, categories]);
  
  // 判断是否为成品眼镜类别
  const isFinishedGlassesCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '成品眼镜';
  }, [selectedCategory, categories]);

  // 判断是否为护理液类别
  const isCareSolutionCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '护理液';
  }, [selectedCategory, categories]);

  // 判断是否为护理产品/护眼产品类别（类型、有效期、光度范围等共用）
  const isCareProductCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '护理产品' || category?.name === '护眼产品';
  }, [selectedCategory, categories]);

  // 判断是否为角膜接触镜类别
  const isContactLensCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '角膜接触镜';
  }, [selectedCategory, categories]);

  // 判断是否为器械类类别
  const isEquipmentCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '器械类';
  }, [selectedCategory, categories]);

  // 护理产品仅（规格用 ml 格式）
  const isCareProductOnlyCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '护理产品';
  }, [selectedCategory, categories]);

  // 护眼产品仅（规格用 颗/片/包装）
  const isEyeCareCategory = useMemo(() => {
    if (!selectedCategory) return false;
    const category = categories.find((c) => c.id === selectedCategory);
    return category?.name === '护眼产品';
  }, [selectedCategory, categories]);
  
  // 生成商品名称（镜架：品牌、系列、材质、类别）
  const generateFrameProductName = useMemo(() => {
    if (!isFrameCategory) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (seriesName && seriesName.trim()) {
      parts.push(seriesName.trim());
    }
    
    // 3. 材质
    if (material && material.trim()) {
      parts.push(material.trim());
    }
    
    // 4. 类别
    if (selectedCategory) {
      const category = categories.find((c) => c.id === selectedCategory);
      if (category) parts.push(category.name);
    }
    
    return parts.join(' ');
  }, [isFrameCategory, brandId, seriesName, material, selectedCategory, categories, brands]);
  
  // 生成商品名称（成品眼镜：品牌、系列、材质、类型）
  const generateFinishedGlassesProductName = useMemo(() => {
    if (!isFinishedGlassesCategory) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (seriesName && seriesName.trim()) {
      parts.push(seriesName.trim());
    }
    
    // 3. 材质
    if (material && material.trim()) {
      parts.push(material.trim());
    }
    
    // 4. 类型
    if (finishedGlassesType && finishedGlassesType.trim()) {
      parts.push(finishedGlassesType.trim());
    }
    
    return parts.join(' ');
  }, [isFinishedGlassesCategory, brandId, seriesName, material, finishedGlassesType, brands]);
  
  // 生成商品名称（护理液/护理产品/护眼产品：品牌、系列、类型、规格）
  const generateCareProductName = useMemo(() => {
    if (!isCareSolutionCategory && !isCareProductCategory) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (seriesName && seriesName.trim()) {
      parts.push(seriesName.trim());
    }
    
    // 3. 类型
    if (material && material.trim()) {
      parts.push(material.trim());
    }
    
    // 4. 规格（护理液/护理产品：ml 格式；护眼产品：X 颗/片/包装）
    const spec = isEyeCareCategory
      ? buildSpecificationCareProduct(specificationPart1 ?? '', specificationUnit)
      : buildSpecification(specificationPart1 ?? '', specificationPart2 ?? '', specificationUnit);
    if (spec && spec.trim()) {
      parts.push(spec.trim());
    }
    
    return parts.join(' ');
  }, [isCareSolutionCategory, isCareProductCategory, isEyeCareCategory, brandId, seriesName, material, specificationPart1, specificationPart2, specificationUnit, brands]);
  
  // 生成商品名称（角膜接触镜：品牌、系列、设计、类型）
  const generateContactLensProductName = useMemo(() => {
    if (!isContactLensCategory) return '';
    
    const parts: string[] = [];
    
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    if (seriesName && seriesName.trim()) parts.push(seriesName.trim());
    if (design && design.trim()) parts.push(design.trim());
    if (material && material.trim()) parts.push(material.trim());
    
    return parts.join(' ');
  }, [isContactLensCategory, brandId, seriesName, design, material, brands]);
  
  // 生成商品名称（器械类：品牌、系列、类型、型号型）
  const generateEquipmentProductName = useMemo(() => {
    if (!isEquipmentCategory) return '';
    const parts: string[] = [];
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    if (seriesName && seriesName.trim()) parts.push(seriesName.trim());
    if (material && material.trim()) parts.push(material.trim());
    if (model && model.trim()) parts.push(model.trim() + '型');
    return parts.join(' ');
  }, [isEquipmentCategory, brandId, seriesName, material, model, brands]);
  
  // 当相关字段变化时，自动更新商品名称
  useEffect(() => {
    if (isFrameCategory && generateFrameProductName) {
      form.setFieldValue('name', generateFrameProductName);
    }
  }, [isFrameCategory, generateFrameProductName, form]);
  
  useEffect(() => {
    if (isFinishedGlassesCategory && generateFinishedGlassesProductName) {
      form.setFieldValue('name', generateFinishedGlassesProductName);
    }
  }, [isFinishedGlassesCategory, generateFinishedGlassesProductName, form]);
  
  useEffect(() => {
    if ((isCareSolutionCategory || isCareProductCategory) && generateCareProductName) {
      form.setFieldValue('name', generateCareProductName);
    }
  }, [isCareSolutionCategory, isCareProductCategory, generateCareProductName, form]);
  
  useEffect(() => {
    if (isContactLensCategory && generateContactLensProductName !== undefined) {
      form.setFieldValue('name', generateContactLensProductName);
    }
  }, [isContactLensCategory, generateContactLensProductName, form]);
  
  useEffect(() => {
    if (isEquipmentCategory && generateEquipmentProductName !== undefined) {
      form.setFieldValue('name', generateEquipmentProductName);
    }
  }, [isEquipmentCategory, generateEquipmentProductName, form]);
  
  // 获取当前类别的历史选项（仅限当前类别）
  const currentCategoryOptions = useMemo(() => {
    if (!selectedCategory) return { seriesNames: [], materials: [], finishedGlassesTypes: [], specifications: [], designs: [], contactLensMaterials: [], models: [] };
    
    const categoryProducts = products.filter((p) => p.category === selectedCategory);
    const allSeries = series;
    
    return {
      seriesNames: Array.from(
        new Set(
          categoryProducts
            .map((p) => {
              if (p.seriesId) {
                const s = allSeries.find((s) => s.id === p.seriesId);
                return s?.name;
              }
              return null;
            })
            .filter(Boolean) as string[]
        )
      ).sort(),
      materials: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.material)
            .filter(Boolean) as string[]
        )
      ).sort(),
      finishedGlassesTypes: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.finishedGlassesType)
            .filter(Boolean) as string[]
        )
      ).sort(),
      specifications: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.specification)
            .filter(Boolean) as string[]
        )
      ).sort(),
      designs: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.design)
            .filter(Boolean) as string[]
        )
      ).sort(),
      contactLensMaterials: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.contactLensMaterial)
            .filter(Boolean) as string[]
        )
      ).sort(),
      models: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.model)
            .filter(Boolean) as string[]
        )
      ).sort(),
    };
  }, [selectedCategory, products, series]);
  
  const seriesOptions = useMemo(() => {
    const currentBrandId = selectedBrandId || '';
    const brandSeries = series.filter((s) => s.brandId === currentBrandId);
    return currentCategoryOptions.seriesNames
      .filter((name) => brandSeries.some((s) => s.name === name))
      .filter((name) => !['智锐系列', '青少年', '单光'].includes(name))
      .map((name) => ({ value: name, label: name }));
  }, [selectedBrandId, currentCategoryOptions.seriesNames, series]);
  
  // 如果是服务类别，只显示服务名称和服务价格
  if (isServiceCategory) {
    return (
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="name"
              label="服务名称"
              rules={[{ required: true, message: '请输入服务名称' }]}
            >
              <Input
                placeholder="请输入服务名称"
                autoComplete="off"
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="price"
              label="服务价格"
            >
              <Input
                type="number"
                placeholder="请输入服务价格"
                autoComplete="off"
                min={0}
                step={0.01}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    );
  }

  return (
    <Form form={form} layout="vertical" autoComplete="off">
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input
              placeholder={(isFrameCategory || isFinishedGlassesCategory || isCareSolutionCategory || isCareProductCategory || isContactLensCategory || isEquipmentCategory) ? "将根据所选信息自动生成" : "请输入商品名称"}
              readOnly={isFrameCategory || isFinishedGlassesCategory || isCareSolutionCategory || isCareProductCategory || isContactLensCategory || isEquipmentCategory}
              style={(isFrameCategory || isFinishedGlassesCategory || isCareSolutionCategory || isCareProductCategory || isContactLensCategory || isEquipmentCategory) ? { backgroundColor: '#f5f5f5' } : {}}
              autoComplete="off"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="brandId"
            label="品牌"
            rules={[{ required: true, message: '请选择品牌' }]}
          >
            <Select
              placeholder="请选择品牌"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              onChange={() => form.setFieldValue('seriesName', undefined)}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="seriesName"
            label="系列（选填）"
          >
            <AutoComplete
              placeholder="有则选，没有可输入"
              options={seriesOptions}
              disabled={!selectedBrandId}
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              allowClear
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="manufacturerId"
            label="生产厂家（选填）"
          >
            <Select
              placeholder="请选择生产厂家"
              allowClear
              options={manufacturers.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="material"
            label={(isCareSolutionCategory || isCareProductCategory || isContactLensCategory || isEquipmentCategory) ? '类型（选填）' : '材质（选填）'}
          >
            <AutoComplete
              placeholder={(isCareSolutionCategory || isCareProductCategory || isContactLensCategory || isEquipmentCategory) ? '请选择或输入类型' : '请选择或输入材质'}
              options={currentCategoryOptions.materials.map((m) => ({
                value: m,
                label: m,
              }))}
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              allowClear
            />
          </Form.Item>
        </Col>
        {isFrameCategory && (
          <Col span={12}>
            <Form.Item name="isBoutique" label="精品" valuePropName="checked" initialValue={false}>
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
          </Col>
        )}
        {isEquipmentCategory && (
          <Col span={12}>
            <Form.Item name="model" label="型号（选填）">
              <AutoComplete
                placeholder="请选择或输入型号"
                options={currentCategoryOptions.models.map((m) => ({ value: m, label: m }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        {isFinishedGlassesCategory && (
          <Col span={12}>
            <Form.Item
              name="finishedGlassesType"
              label="成品镜类型"
            >
              <AutoComplete
                placeholder="请选择或输入成品镜类型"
                options={[
                  ...FINISHED_GLASSES_TYPES.map((t) => ({
                    value: t.label,  // 使用中文作为value
                    label: t.label,
                  })),
                  ...currentCategoryOptions.finishedGlassesTypes
                    .filter((t) => !FINISHED_GLASSES_TYPES.some((ft) => ft.label === t))
                    .map((t) => ({
                      value: t,
                      label: t,
                    })),
                ]}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        {/* 护理液、护理产品：输入框 ml 输入框 单位（支/瓶/盒） */}
        {(isCareSolutionCategory || isCareProductOnlyCategory) && (
          <Col span={12}>
            <Form.Item label="规格" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <Form.Item name="specificationPart1" noStyle>
                  <Input placeholder="如 300" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
                </Form.Item>
                <span style={{ flexShrink: 0, color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>ml</span>
                <Form.Item name="specificationPart2" noStyle>
                  <Input placeholder="如 120" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
                </Form.Item>
                <Form.Item name="specificationUnit" noStyle>
                  <Select
                    placeholder="单位"
                    allowClear
                    options={SPECIFICATION_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    style={{ width: 72, flexShrink: 0 }}
                  />
                </Form.Item>
              </div>
            </Form.Item>
          </Col>
        )}
        {/* 护眼产品：输入框 单位（颗/片/包）装 */}
        {isEyeCareCategory && (
          <Col span={12}>
            <Form.Item label="规格" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <Form.Item name="specificationPart1" noStyle>
                  <Input placeholder="如 30" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
                </Form.Item>
                <Form.Item name="specificationUnit" noStyle>
                  <Select
                    placeholder="单位"
                    allowClear
                    options={CARE_PRODUCT_SPEC_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    style={{ width: 72, flexShrink: 0 }}
                  />
                </Form.Item>
                <span style={{ flexShrink: 0, color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>装</span>
              </div>
            </Form.Item>
          </Col>
        )}
        {isContactLensCategory && (
          <>
            <Col span={12}>
              <Form.Item name="design" label="设计（选填）">
                <AutoComplete
                  placeholder="请选择或输入设计"
                  options={currentCategoryOptions.designs.map((d) => ({ value: d, label: d }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contactLensMaterial" label="材质（选填）">
                <AutoComplete
                  placeholder="请选择或输入材质"
                  options={currentCategoryOptions.contactLensMaterials.map((m) => ({ value: m, label: m }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
          </>
        )}
        {(isCareProductCategory || isContactLensCategory) && (
          <Col span={12}>
            <Form.Item name="validityMonths" label="有效期（个月）">
              <Input
                type="number"
                placeholder="请输入月数"
                autoComplete="off"
                min={0}
                step={1}
                addonAfter="个月"
                className="input-no-spinner"
              />
            </Form.Item>
          </Col>
        )}
        <Col span={12}>
          <Form.Item
            name="price"
            label={isContactLensCategory ? '零售价格（元/片）' : '零售价格'}
          >
            <Input
              type="number"
              placeholder={isContactLensCategory ? '请输入零售价格（元/片）' : '请输入零售价格'}
              autoComplete="off"
              min={0}
              step={0.01}
            />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}

// 新建镜片商品表单组件：下拉选项优先从后端数据库拉取（多端一致），无则用本地商品历史
function NewLensProductForm({
  form,
  brands,
  manufacturers,
  getHistoricalOptions,
  lensCategoryOptionsFromApi,
  selectedBrandId,
  powerRangeCells,
  setPowerRangeCells,
  setPowerRangeVisible,
  setEditingProductId,
  selectedCategory,
  categories,
  products,
  series,
}: {
  form: ReturnType<typeof Form.useForm>[0];
  brands: Brand[];
  manufacturers: Manufacturer[];
  getHistoricalOptions: {
    lensTypes: string[];
    refractiveIndexes: string[];
    coatings: string[];
    asphericDesigns: string[];
    materials: string[];
    functions: string[];
    seriesNames: string[];
  };
  lensCategoryOptionsFromApi?: {
    lensTypes: string[];
    refractiveIndexes: string[];
    coatings: string[];
    asphericDesigns: string[];
    materials: string[];
    functions: string[];
    seriesNames: string[];
  } | null;
  selectedBrandId?: string;
  powerRangeCells: string[];
  setPowerRangeCells: (cells: string[]) => void;
  setPowerRangeVisible: (visible: boolean) => void;
  setEditingProductId: (id: string | null) => void;
  selectedCategory: string | null;
  categories: Category[];
  products: Product[];
  series: Series[];
}) {
  // 本地计算的历史选项（未登录或接口失败时回退）
  const computedLensCategoryOptions = useMemo(() => {
    if (!selectedCategory) return { lensTypes: [], refractiveIndexes: [], coatings: [], asphericDesigns: [], materials: [], functions: [], seriesNames: [] };
    
    const category = categories.find((c) => c.id === selectedCategory);
    if (category?.name !== '镜片') return { lensTypes: [], refractiveIndexes: [], coatings: [], asphericDesigns: [], materials: [], functions: [], seriesNames: [] };
    
    const lensProducts = products.filter((p) => p.category === selectedCategory);
    const allSeries = series;
    
    return {
      lensTypes: Array.from(new Set(lensProducts.map((p) => p.lensType).filter(Boolean) as string[])).sort(),
      refractiveIndexes: Array.from(new Set(lensProducts.map((p) => p.refractiveIndex).filter(Boolean) as string[])).sort(),
      coatings: Array.from(new Set(lensProducts.map((p) => p.coating).filter(Boolean) as string[])).sort(),
      asphericDesigns: Array.from(new Set(lensProducts.map((p) => p.asphericDesign).filter(Boolean) as string[])).sort(),
      materials: Array.from(new Set(lensProducts.map((p) => p.material).filter(Boolean) as string[])).sort(),
      functions: Array.from(
        new Set(
          lensProducts
            .flatMap((p) => p.functions || [])
            .filter(Boolean) as string[]
        )
      ).sort(),
      seriesNames: Array.from(
        new Set(
          lensProducts
            .map((p) => {
              if (p.seriesId) {
                const s = allSeries.find((s) => s.id === p.seriesId);
                return s?.name;
              }
              return null;
            })
            .filter(Boolean) as string[]
        )
      ).sort(),
    };
  }, [selectedCategory, categories, products, series]);

  // 优先使用后端返回的选项（数据库去重排序），多端一致
  const lensCategoryOptions = lensCategoryOptionsFromApi ?? computedLensCategoryOptions;
  
  const seriesOptions = useMemo(() => {
    const currentBrandId = selectedBrandId || '';
    const brandSeries = series.filter((s) => s.brandId === currentBrandId);
    return [
      ...brandSeries
        .filter((s) => !['智锐系列', '青少年', '单光'].includes(s.name))
        .map((s) => ({ value: s.name, label: s.name })),
      ...lensCategoryOptions.seriesNames
        .filter((name) => 
          !brandSeries.some((s) => s.name === name) &&
          !['智锐系列', '青少年', '单光'].includes(name)
        )
        .map((name) => ({ value: name, label: name })),
    ];
  }, [selectedBrandId, lensCategoryOptions.seriesNames, series]);
  
  // 监听字段变化，自动生成商品名称
  const brandId = Form.useWatch('brandId', form);
  const seriesName = Form.useWatch('seriesName', form);
  const refractiveIndex = Form.useWatch('refractiveIndex', form);
  const asphericDesign = Form.useWatch('asphericDesign', form);
  const functions = Form.useWatch('functions', form);
  const coating = Form.useWatch('coating', form);
  const lensType = Form.useWatch('lensType', form);
  const material = Form.useWatch('material', form);
  
  // 生成商品名称
  const generateProductName = useMemo(() => {
    const parts: string[] = [];
    
    // 1. 品牌
    if (brandId) {
      const brand = brands.find((b) => b.id === brandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (seriesName && seriesName.trim()) {
      parts.push(seriesName.trim());
    }
    
    // 3. 折射率
    if (refractiveIndex && refractiveIndex.trim()) {
      parts.push(refractiveIndex.trim());
    }
    
    // 4. 非球面设计
    if (asphericDesign && asphericDesign.trim()) {
      parts.push(asphericDesign.trim());
    }
    
    // 5. 功能
    if (functions && functions.length > 0) {
      const functionLabels = functions.join('、');
      if (functionLabels) parts.push(functionLabels);
    }
    
    // 6. 膜层
    if (coating && coating.trim()) {
      parts.push(coating.trim());
    }
    
    // 7. 镜片类型
    if (lensType && lensType.trim()) {
      parts.push(lensType.trim());
    }
    
    // 8. 材质
    if (material && material.trim()) {
      parts.push(material.trim());
    }
    
    // 9. 类别
    if (selectedCategory) {
      const category = categories.find((c) => c.id === selectedCategory);
      if (category) parts.push(category.name);
    }
    
    return parts.join(' ');
  }, [brandId, seriesName, refractiveIndex, asphericDesign, functions, coating, lensType, material, selectedCategory, brands, categories]);
  
  // 当相关字段变化时，自动更新商品名称
  useEffect(() => {
    if (generateProductName) {
      form.setFieldValue('name', generateProductName);
    }
  }, [generateProductName, form]);
  
  return (
    <Form form={form} layout="vertical" autoComplete="off">
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            name="name"
            label="商品名称"
          >
            <Input
              placeholder="将根据所选信息自动生成"
              readOnly
              style={{ backgroundColor: '#f5f5f5' }}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="brandId"
            label="品牌"
            rules={[{ required: true, message: '请选择品牌' }]}
          >
            <Select
              placeholder="请选择品牌"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              onChange={() => form.setFieldValue('seriesName', undefined)}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="lensType"
            label="镜片类型"
            rules={[{ required: true, message: '请选择或输入镜片类型' }]}
          >
              <AutoComplete
                placeholder="请选择或输入镜片类型"
                options={lensCategoryOptions.lensTypes.map((t) => ({
                  value: t,
                  label: t,
                }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="seriesName"
            label="系列（选填）"
          >
            <AutoComplete
              placeholder="有则选，没有可输入"
              options={seriesOptions}
              disabled={!selectedBrandId}
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              allowClear
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="refractiveIndex"
            label="折射率"
            rules={[{ required: true, message: '请选择或输入折射率' }]}
          >
              <AutoComplete
                placeholder="请选择或输入折射率"
                options={lensCategoryOptions.refractiveIndexes.map((r) => ({
                  value: r,
                  label: r,
                }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="functions"
            label="功能"
          >
              <Select
                mode="tags"
                placeholder="请选择或输入功能（可多选）"
                allowClear
                showSearch
                  options={lensCategoryOptions.functions.map((f) => ({
                    value: f,
                    label: f,
                  }))}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  tokenSeparators={['、', ',']}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="coating"
                label="膜层"
                rules={[{ required: true, message: '请选择或输入膜层' }]}
              >
                <AutoComplete
                  placeholder="请选择或输入膜层"
                  options={lensCategoryOptions.coatings.map((c) => ({
                    value: c,
                    label: c,
                  }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="asphericDesign"
                label="非球面设计"
              >
                <AutoComplete
                  placeholder="请选择或输入非球面设计"
                  options={lensCategoryOptions.asphericDesigns.map((o) => ({
                    value: o,
                    label: o,
                  }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="material"
                label="材质"
              >
                <AutoComplete
                  placeholder="请选择或输入材质"
                  options={lensCategoryOptions.materials.map((m) => ({
                    value: m,
                    label: m,
                  }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
        <Col span={12}>
          <Form.Item
            name="manufacturerId"
            label="生产厂家（选填）"
          >
            <Select
              placeholder="请选择生产厂家"
              allowClear
              options={manufacturers.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="annotation"
            label="标注"
          >
            <Input
              placeholder="选填，有则显示在商品名称后为「名称（标注）」"
              allowClear
              autoComplete="off"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="price"
            label="零售价格"
          >
            <Input
              type="number"
              placeholder="请输入零售价格"
              autoComplete="off"
              min={0}
              step={0.01}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="光度范围">
            <Button
              onClick={() => {
                setEditingProductId(null);
                setPowerRangeVisible(true);
              }}
            >
              光度范围
            </Button>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}

// 编辑商品表单组件（分离出来以避免 Hooks 规则违反）
function EditProductForm({
  editingProduct,
  editProductForm,
  categories,
  brands,
  series,
  manufacturers,
  getHistoricalOptions,
  setEditingProductId,
  setPowerRangeVisible,
  products,
}: {
  editingProduct: Product;
  editProductForm: ReturnType<typeof Form.useForm>[0];
  categories: Category[];
  brands: Brand[];
  series: Series[];
  manufacturers: Manufacturer[];
  getHistoricalOptions: {
    lensTypes: string[];
    refractiveIndexes: string[];
    coatings: string[];
    asphericDesigns: string[];
    materials: string[];
    functions: string[];
    seriesNames: string[];
  };
  setEditingProductId: (id: string) => void;
  setPowerRangeVisible: (visible: boolean) => void;
  products: Product[];
}) {
  const category = categories.find((c) => c.id === editingProduct.category);
  const isLens = category?.name === '镜片';
  const isFrame = category?.name === '镜架';
  const isService = category?.name === '服务';
  const isFinishedGlasses = category?.name === '成品眼镜';
  const isCareSolution = category?.name === '护理液';
  const isCareProduct = category?.name === '护理产品' || category?.name === '护眼产品';
  const isContactLens = category?.name === '角膜接触镜';
  const isEquipment = category?.name === '器械类';
  const isCareProductOnly = category?.name === '护理产品';
  const isEyeCare = category?.name === '护眼产品';
  const selectedBrandId = Form.useWatch('brandId', editProductForm);
  
  // 监听字段变化，自动生成商品名称（镜架类别和成品眼镜类别）
  const editBrandId = Form.useWatch('brandId', editProductForm);
  const editMaterial = Form.useWatch('material', editProductForm);
  const editSeriesName = Form.useWatch('seriesName', editProductForm);
  const editFinishedGlassesType = Form.useWatch('finishedGlassesType', editProductForm);
  const editSpecificationPart1 = Form.useWatch('specificationPart1', editProductForm);
  const editSpecificationPart2 = Form.useWatch('specificationPart2', editProductForm);
  const editSpecificationUnit = Form.useWatch('specificationUnit', editProductForm);
  const editDesign = Form.useWatch('design', editProductForm);
  const editModel = Form.useWatch('model', editProductForm);
  
  // 生成商品名称（镜架：品牌、系列、材质、类别）
  const generateFrameProductName = useMemo(() => {
    if (!isFrame) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (editBrandId) {
      const brand = brands.find((b) => b.id === editBrandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (editSeriesName && editSeriesName.trim()) {
      parts.push(editSeriesName.trim());
    }
    
    // 3. 材质
    if (editMaterial && editMaterial.trim()) {
      parts.push(editMaterial.trim());
    }
    
    // 4. 类别
    if (editingProduct.category) {
      const category = categories.find((c) => c.id === editingProduct.category);
      if (category) parts.push(category.name);
    }
    
    return parts.join(' ');
  }, [isFrame, editBrandId, editSeriesName, editMaterial, editingProduct.category, categories, brands]);
  
  // 生成商品名称（成品眼镜：品牌、系列、材质、类型）
  const generateFinishedGlassesProductName = useMemo(() => {
    if (!isFinishedGlasses) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (editBrandId) {
      const brand = brands.find((b) => b.id === editBrandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (editSeriesName && editSeriesName.trim()) {
      parts.push(editSeriesName.trim());
    }
    
    // 3. 材质
    if (editMaterial && editMaterial.trim()) {
      parts.push(editMaterial.trim());
    }
    
    // 4. 类型
    if (editFinishedGlassesType && editFinishedGlassesType.trim()) {
      parts.push(editFinishedGlassesType.trim());
    }
    
    return parts.join(' ');
  }, [isFinishedGlasses, editBrandId, editSeriesName, editMaterial, editFinishedGlassesType, brands]);
  
  // 生成商品名称（护理液/护理产品/护眼产品：品牌、系列、类型、规格）
  const generateCareProductName = useMemo(() => {
    if (!isCareSolution && !isCareProduct) return '';
    
    const parts: string[] = [];
    
    // 1. 品牌
    if (editBrandId) {
      const brand = brands.find((b) => b.id === editBrandId);
      if (brand) parts.push(brand.name);
    }
    
    // 2. 系列
    if (editSeriesName && editSeriesName.trim()) {
      parts.push(editSeriesName.trim());
    }
    
    // 3. 类型
    if (editMaterial && editMaterial.trim()) {
      parts.push(editMaterial.trim());
    }
    
    // 4. 规格（护理液/护理产品：ml 格式；护眼产品：X 颗/片/包装）
    const spec = isEyeCare
      ? buildSpecificationCareProduct(editSpecificationPart1 ?? '', editSpecificationUnit)
      : buildSpecification(editSpecificationPart1 ?? '', editSpecificationPart2 ?? '', editSpecificationUnit);
    if (spec && spec.trim()) {
      parts.push(spec.trim());
    }
    
    return parts.join(' ');
  }, [isCareSolution, isCareProduct, isEyeCare, editBrandId, editSeriesName, editMaterial, editSpecificationPart1, editSpecificationPart2, editSpecificationUnit, brands]);
  
  // 生成商品名称（角膜接触镜：品牌、系列、设计、类型）
  const generateContactLensProductName = useMemo(() => {
    if (!isContactLens) return '';
    
    const parts: string[] = [];
    if (editBrandId) {
      const brand = brands.find((b) => b.id === editBrandId);
      if (brand) parts.push(brand.name);
    }
    if (editSeriesName && editSeriesName.trim()) parts.push(editSeriesName.trim());
    if (editDesign && editDesign.trim()) parts.push(editDesign.trim());
    if (editMaterial && editMaterial.trim()) parts.push(editMaterial.trim());
    return parts.join(' ');
  }, [isContactLens, editBrandId, editSeriesName, editDesign, editMaterial, brands]);
  
  // 生成商品名称（器械类：品牌、系列、类型、型号型）
  const generateEquipmentProductName = useMemo(() => {
    if (!isEquipment) return '';
    const parts: string[] = [];
    if (editBrandId) {
      const brand = brands.find((b) => b.id === editBrandId);
      if (brand) parts.push(brand.name);
    }
    if (editSeriesName && editSeriesName.trim()) parts.push(editSeriesName.trim());
    if (editMaterial && editMaterial.trim()) parts.push(editMaterial.trim());
    if (editModel && editModel.trim()) parts.push(editModel.trim() + '型');
    return parts.join(' ');
  }, [isEquipment, editBrandId, editSeriesName, editMaterial, editModel, brands]);
  
  // 当相关字段变化时，自动更新商品名称（镜架）
  useEffect(() => {
    if (isFrame && generateFrameProductName) {
      editProductForm.setFieldValue('name', generateFrameProductName);
    }
  }, [isFrame, generateFrameProductName, editProductForm]);
  
  // 当相关字段变化时，自动更新商品名称（成品眼镜）
  useEffect(() => {
    if (isFinishedGlasses && generateFinishedGlassesProductName) {
      editProductForm.setFieldValue('name', generateFinishedGlassesProductName);
    }
  }, [isFinishedGlasses, generateFinishedGlassesProductName, editProductForm]);
  
  // 当相关字段变化时，自动更新商品名称（护理液/护理产品）
  useEffect(() => {
    if ((isCareSolution || isCareProduct) && generateCareProductName) {
      editProductForm.setFieldValue('name', generateCareProductName);
    }
  }, [isCareSolution, isCareProduct, generateCareProductName, editProductForm]);
  
  // 当相关字段变化时，自动更新商品名称（角膜接触镜）
  useEffect(() => {
    if (isContactLens && generateContactLensProductName !== undefined) {
      editProductForm.setFieldValue('name', generateContactLensProductName);
    }
  }, [isContactLens, generateContactLensProductName, editProductForm]);
  
  // 当相关字段变化时，自动更新商品名称（器械类）
  useEffect(() => {
    if (isEquipment && generateEquipmentProductName !== undefined) {
      editProductForm.setFieldValue('name', generateEquipmentProductName);
    }
  }, [isEquipment, generateEquipmentProductName, editProductForm]);
  
  // 获取当前类别的历史选项（仅限当前类别）
  const currentCategoryOptions = useMemo(() => {
    if (!editingProduct.category) return { seriesNames: [], lensTypes: [], refractiveIndexes: [], coatings: [], asphericDesigns: [], materials: [], functions: [], finishedGlassesTypes: [], specifications: [], designs: [], contactLensMaterials: [], models: [] };
    
    const categoryProducts = products.filter((p) => p.category === editingProduct.category);
    const allSeries = series;
    
    const baseOptions = {
      seriesNames: Array.from(
        new Set(
          categoryProducts
            .map((p) => {
              if (p.seriesId) {
                const s = allSeries.find((s) => s.id === p.seriesId);
                return s?.name;
              }
              return null;
            })
            .filter(Boolean) as string[]
        )
      ).sort(),
      materials: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.material)
            .filter(Boolean) as string[]
        )
      ).sort(),
      finishedGlassesTypes: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.finishedGlassesType)
            .filter(Boolean) as string[]
        )
      ).sort(),
      specifications: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.specification)
            .filter(Boolean) as string[]
        )
      ).sort(),
      designs: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.design)
            .filter(Boolean) as string[]
        )
      ).sort(),
      contactLensMaterials: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.contactLensMaterial)
            .filter(Boolean) as string[]
        )
      ).sort(),
      models: Array.from(
        new Set(
          categoryProducts
            .map((p) => p.model)
            .filter(Boolean) as string[]
        )
      ).sort(),
    };
    
    if (isLens) {
      return {
        ...baseOptions,
        lensTypes: Array.from(new Set(categoryProducts.map((p) => p.lensType).filter(Boolean) as string[])).sort(),
        refractiveIndexes: Array.from(new Set(categoryProducts.map((p) => p.refractiveIndex).filter(Boolean) as string[])).sort(),
        coatings: Array.from(new Set(categoryProducts.map((p) => p.coating).filter(Boolean) as string[])).sort(),
        asphericDesigns: Array.from(new Set(categoryProducts.map((p) => p.asphericDesign).filter(Boolean) as string[])).sort(),
        functions: Array.from(
          new Set(
            categoryProducts
              .flatMap((p) => p.functions || [])
              .filter(Boolean) as string[]
          )
        ).sort(),
      };
    }
    
    return baseOptions;
  }, [editingProduct.category, products, isLens, series]);
  
  const seriesOptions = useMemo(() => {
    const currentBrandId = selectedBrandId || '';
    const brandSeries = series.filter((s) => s.brandId === currentBrandId);
    return [
      ...brandSeries
        .filter((s) => !['智锐系列', '青少年', '单光'].includes(s.name))
        .map((s) => ({ value: s.name, label: s.name })),
      ...currentCategoryOptions.seriesNames
        .filter((name) => 
          !brandSeries.some((s) => s.name === name) &&
          !['智锐系列', '青少年', '单光'].includes(name)
        )
        .map((name) => ({ value: name, label: name })),
    ];
  }, [selectedBrandId, currentCategoryOptions.seriesNames, series]);
  
  // 如果是服务类别，只显示服务名称和服务价格
  if (isService) {
    return (
      <Form
        form={editProductForm}
        layout="vertical"
        autoComplete="off"
      >
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="name"
              label="服务名称"
              rules={[{ required: true, message: '请输入服务名称' }]}
            >
              <Input
                placeholder="请输入服务名称"
                autoComplete="off"
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              name="price"
              label="服务价格"
            >
              <Input
                type="number"
                placeholder="请输入服务价格"
                autoComplete="off"
                min={0}
                step={0.01}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    );
  }

  return (
    <Form
      form={editProductForm}
      layout="vertical"
      autoComplete="off"
    >
      <Row gutter={16}>
        <Col span={24}>
          <Form.Item
            name="name"
            label="商品名称"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input
              placeholder={(isFrame || isFinishedGlasses || isCareSolution || isCareProduct || isContactLens || isEquipment) ? "将根据所选信息自动生成" : "请输入商品名称"}
              readOnly={isFrame || isFinishedGlasses || isCareSolution || isCareProduct || isContactLens || isEquipment}
              style={(isFrame || isFinishedGlasses || isCareSolution || isCareProduct || isContactLens || isEquipment) ? { backgroundColor: '#f5f5f5' } : {}}
              autoComplete="off"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="brandId"
            label="品牌"
            rules={[{ required: true, message: '请选择品牌' }]}
          >
            <Select
              placeholder="请选择品牌"
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
              onChange={() => editProductForm.setFieldValue('seriesName', undefined)}
            />
          </Form.Item>
        </Col>
        {isLens && (
          <Col span={12}>
            <Form.Item
              name="lensType"
              label="镜片类型"
              rules={[{ required: true, message: '请选择或输入镜片类型' }]}
            >
              <AutoComplete
                placeholder="请选择或输入镜片类型"
                options={currentCategoryOptions.lensTypes.map((t) => ({
                  value: t,
                  label: t,
                }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        <Col span={12}>
          <Form.Item
            name="seriesName"
            label="系列（选填）"
          >
            <AutoComplete
              placeholder="有则选，没有可输入"
              options={seriesOptions}
              disabled={!selectedBrandId}
              filterOption={(inputValue, option) =>
                option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
              }
              allowClear
            />
          </Form.Item>
        </Col>
        {isLens && (
          <Col span={12}>
            <Form.Item
              name="refractiveIndex"
              label="折射率"
              rules={[{ required: true, message: '请选择或输入折射率' }]}
            >
              <AutoComplete
                placeholder="请选择或输入折射率"
                options={currentCategoryOptions.refractiveIndexes.map((r) => ({
                  value: r,
                  label: r,
                }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        {isLens && (
          <>
            <Col span={12}>
              <Form.Item
                name="functions"
                label="功能"
              >
                <Select
                  mode="tags"
                  placeholder="请选择或输入功能（可多选）"
                  allowClear
                  showSearch
                  options={currentCategoryOptions.functions.map((f) => ({
                    value: f,
                    label: f,
                  }))}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  tokenSeparators={['、', ',']}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="coating"
                label="膜层"
                rules={[{ required: true, message: '请选择或输入膜层' }]}
              >
                <AutoComplete
                  placeholder="请选择或输入膜层"
                  options={currentCategoryOptions.coatings.map((c) => ({
                    value: c,
                    label: c,
                  }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="asphericDesign"
                label="非球面设计"
              >
                <AutoComplete
                  placeholder="请选择或输入非球面设计"
                  options={currentCategoryOptions.asphericDesigns.map((o) => ({
                    value: o,
                    label: o,
                  }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="material"
                label="材质"
              >
                <AutoComplete
                  placeholder="请选择或输入材质"
                  options={currentCategoryOptions.materials.map((m) => ({
                    value: m,
                    label: m,
                  }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
          </>
        )}
        {!isLens && (
          <Col span={12}>
            <Form.Item
              name="material"
              label={(isCareSolution || isCareProduct || isContactLens || isEquipment) ? '类型（选填）' : '材质（选填）'}
            >
              <AutoComplete
                placeholder={(isCareSolution || isCareProduct || isContactLens || isEquipment) ? '请选择或输入类型' : '请选择或输入材质'}
                options={currentCategoryOptions.materials.map((m) => ({
                  value: m,
                  label: m,
                }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        {isEquipment && (
          <Col span={12}>
            <Form.Item name="model" label="型号（选填）">
              <AutoComplete
                placeholder="请选择或输入型号"
                options={currentCategoryOptions.models.map((m) => ({ value: m, label: m }))}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        {isFinishedGlasses && (
          <Col span={12}>
            <Form.Item
              name="finishedGlassesType"
              label="成品镜类型"
            >
              <AutoComplete
                placeholder="请选择或输入成品镜类型"
                options={[
                  ...FINISHED_GLASSES_TYPES.map((t) => ({
                    value: t.label,  // 使用中文作为value
                    label: t.label,
                  })),
                  ...currentCategoryOptions.finishedGlassesTypes
                    .filter((t) => !FINISHED_GLASSES_TYPES.some((ft) => ft.label === t))
                    .map((t) => ({
                      value: t,
                      label: t,
                    })),
                ]}
                filterOption={(inputValue, option) =>
                  option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                }
                allowClear
              />
            </Form.Item>
          </Col>
        )}
        {/* 护理液、护理产品：输入框 ml 输入框 单位（支/瓶/盒） */}
        {(isCareSolution || isCareProductOnly) && (
          <Col span={12}>
            <Form.Item label="规格" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <Form.Item name="specificationPart1" noStyle>
                  <Input placeholder="如 300" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
                </Form.Item>
                <span style={{ flexShrink: 0, color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>ml</span>
                <Form.Item name="specificationPart2" noStyle>
                  <Input placeholder="如 120" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
                </Form.Item>
                <Form.Item name="specificationUnit" noStyle>
                  <Select
                    placeholder="单位"
                    allowClear
                    options={SPECIFICATION_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    style={{ width: 72, flexShrink: 0 }}
                  />
                </Form.Item>
              </div>
            </Form.Item>
          </Col>
        )}
        {/* 护眼产品：输入框 单位（颗/片/包）装 */}
        {isEyeCare && (
          <Col span={12}>
            <Form.Item label="规格" style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <Form.Item name="specificationPart1" noStyle>
                  <Input placeholder="如 30" autoComplete="off" style={{ flex: 1, minWidth: 0 }} />
                </Form.Item>
                <Form.Item name="specificationUnit" noStyle>
                  <Select
                    placeholder="单位"
                    allowClear
                    options={CARE_PRODUCT_SPEC_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    style={{ width: 72, flexShrink: 0 }}
                  />
                </Form.Item>
                <span style={{ flexShrink: 0, color: 'rgba(0,0,0,0.45)', fontSize: 14 }}>装</span>
              </div>
            </Form.Item>
          </Col>
        )}
        {isContactLens && (
          <>
            <Col span={12}>
              <Form.Item name="design" label="设计（选填）">
                <AutoComplete
                  placeholder="请选择或输入设计"
                  options={currentCategoryOptions.designs.map((d) => ({ value: d, label: d }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contactLensMaterial" label="材质（选填）">
                <AutoComplete
                  placeholder="请选择或输入材质"
                  options={currentCategoryOptions.contactLensMaterials.map((m) => ({ value: m, label: m }))}
                  filterOption={(inputValue, option) =>
                    option!.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                  }
                  allowClear
                />
              </Form.Item>
            </Col>
          </>
        )}
        {(isCareProduct || isContactLens) && (
          <Col span={12}>
            <Form.Item name="validityMonths" label="有效期（个月）">
              <Input
                type="number"
                placeholder="请输入月数"
                autoComplete="off"
                min={0}
                step={1}
                addonAfter="个月"
                className="input-no-spinner"
              />
            </Form.Item>
          </Col>
        )}
        <Col span={12}>
          <Form.Item
            name="manufacturerId"
            label="生产厂家（选填）"
          >
            <Select
              placeholder="请选择生产厂家"
              allowClear
              options={manufacturers.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="price"
            label={isContactLens ? '零售价格（元/片）' : '零售价格'}
          >
            <Input
              type="number"
              placeholder={isContactLens ? '请输入零售价格（元/片）' : '请输入零售价格'}
              autoComplete="off"
              min={0}
              step={0.01}
            />
          </Form.Item>
        </Col>
        {!isCareProduct && !isContactLens && (
          <Col span={24}>
            <Form.Item label="光度范围">
              <Button
                onClick={() => {
                  setEditingProductId(editingProduct.id);
                  setPowerRangeVisible(true);
                }}
              >
                编辑光度范围
              </Button>
            </Form.Item>
          </Col>
        )}
      </Row>
    </Form>
  );
}

// 光度范围表格组件 - 使用原生 div + CSS Grid，性能更优
function PowerRangeTable({
  initialCells,
  templates,
  selectedTemplateId,
  onSave,
  onCancel,
  onTemplateChange,
  onSaveTemplate,
}: {
  initialCells?: string[];
  templates: PowerRangeTemplate[];
  selectedTemplateId?: string;
  onSave: (cells: string[]) => void;
  onCancel: () => void;
  onTemplateChange: (templateId: string | undefined) => void;
  onSaveTemplate: (name: string, cells: string[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set(initialCells || []));
  const [templateName, setTemplateName] = useState('');
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ row: number; col: number } | null>(null);
  const isToggleModeRef = useRef(false);
  const lastUpdateRef = useRef<string>('');

  // 生成柱镜值数组（0 ~ -6.00，步长0.25）
  const cylinderValues = useMemo(() => {
    const values: number[] = [];
    for (let i = 0; i >= -6.00; i -= 0.25) {
      values.push(Math.round(i * 100) / 100);
    }
    return values;
  }, []);

  // 生成球镜值数组（-20.00 ~ +20.00，步长0.25）
  const sphereValues = useMemo(() => {
    const values: number[] = [];
    for (let i = -20.00; i <= 20.00; i += 0.25) {
      values.push(Math.round(i * 100) / 100);
    }
    return values;
  }, []);

  // 事件委托处理 - 在容器上统一处理，性能更好
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('.power-range-cell-item');
    if (!cell) return;

    e.preventDefault();
    const rowIndex = parseInt(cell.getAttribute('data-row') || '0');
    const colValue = parseFloat(cell.getAttribute('data-col') || '0');
    const cellKey = `${rowIndex}_${colValue}`;
    const wasSelected = selectedCells.has(cellKey);

    isDraggingRef.current = true;
    dragStartRef.current = { row: rowIndex, col: colValue };
    isToggleModeRef.current = wasSelected;

    // 立即处理点击
    setSelectedCells((prev) => {
      const newSet = new Set(prev);
      if (wasSelected) {
        newSet.delete(cellKey);
      } else {
        newSet.add(cellKey);
      }
      return newSet;
    });
  }, [selectedCells]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;

    const target = e.target as HTMLElement;
    const cell = target.closest('.power-range-cell-item');
    if (!cell) return;

    const rowIndex = parseInt(cell.getAttribute('data-row') || '0');
    const colValue = parseFloat(cell.getAttribute('data-col') || '0');
    const updateKey = `${dragStartRef.current.row}_${dragStartRef.current.col}_${rowIndex}_${colValue}_${isToggleModeRef.current}`;
    
    // 避免重复更新
    if (lastUpdateRef.current === updateKey) return;
    lastUpdateRef.current = updateKey;

    const start = dragStartRef.current;
    const startColIndex = cylinderValues.indexOf(start.col);
    const endColIndex = cylinderValues.indexOf(colValue);
    if (startColIndex === -1 || endColIndex === -1) return;

    const minRow = Math.min(start.row, rowIndex);
    const maxRow = Math.max(start.row, rowIndex);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);

    setSelectedCells((prev) => {
      const newSet = new Set(prev);
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minColIndex; c <= maxColIndex; c++) {
          const cellKey = `${r}_${cylinderValues[c]}`;
          if (isToggleModeRef.current) {
            newSet.delete(cellKey);
          } else {
            newSet.add(cellKey);
          }
        }
      }
      return newSet;
    });
  }, [cylinderValues]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragStartRef.current = null;
    lastUpdateRef.current = '';
  }, []);

  // 当模板选择变化时，加载模板数据
  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      if (template) {
        setSelectedCells(new Set(template.cells));
      }
    } else if (initialCells) {
      setSelectedCells(new Set(initialCells));
    } else {
      setSelectedCells(new Set());
    }
  }, [selectedTemplateId, templates, initialCells]);

  // 滚动到0.00位置
  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current) {
        const scrollContainer = containerRef.current.querySelector('.power-range-grid-body');
        if (scrollContainer) {
          const rowHeight = 26;
          const targetRowIndex = 80; // 0.00对应的行索引
          const scrollTop = targetRowIndex * rowHeight - 300;
          scrollContainer.scrollTop = Math.max(0, scrollTop);
        }
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // 全局鼠标释放事件
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // 处理保存为模板
  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      message.error('请输入模板名称');
      return;
    }
    onSaveTemplate(templateName.trim(), Array.from(selectedCells));
    setTemplateName('');
    message.success('模板保存成功');
  };

  return (
    <div className="power-range-table-container" ref={containerRef}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select
          placeholder="选择模板"
          allowClear
          style={{ width: 200 }}
          value={selectedTemplateId}
          onChange={(value) => {
            onTemplateChange(value);
          }}
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Input
          placeholder="模板名称"
          style={{ width: 150 }}
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onPressEnter={handleSaveTemplate}
        />
        <Button onClick={handleSaveTemplate}>保存为模板</Button>
      </div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" onClick={() => onSave(Array.from(selectedCells))}>
          保存
        </Button>
      </div>
      <div className="power-range-grid">
        {/* 表头 */}
        <div className="power-range-grid-header">
          <div className="power-range-header-cell power-range-first-col">球镜/柱镜</div>
          {cylinderValues.map((val) => (
            <div key={val} className="power-range-header-cell">
              {val.toFixed(2)}
            </div>
          ))}
        </div>
        {/* 表格主体 */}
        <div className="power-range-grid-body" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}>
          {sphereValues.map((sphere, rowIndex) => (
            <div key={sphere} className="power-range-grid-row">
              <div className="power-range-cell power-range-first-col">
                {sphere >= 0 ? `+${sphere.toFixed(2)}` : sphere.toFixed(2)}
              </div>
              {cylinderValues.map((cyl) => {
                const cellKey = `${rowIndex}_${cyl}`;
                const isSelected = selectedCells.has(cellKey);
                return (
                  <div
                    key={cyl}
                    className={`power-range-cell-item ${isSelected ? 'selected' : ''}`}
                    data-row={rowIndex}
                    data-col={cyl}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
