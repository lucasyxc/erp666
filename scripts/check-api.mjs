#!/usr/bin/env node
/**
 * 前后端通讯一键检测脚本
 * 使用当前登录账户的 Token，依次触发所有 ERP API（模拟测试数据）。
 *
 * 使用前：
 * 1. 在前端登录后，浏览器控制台执行: localStorage.getItem('access_token') 复制 token
 * 2. 设置环境变量并运行:
 *    Windows: set TOKEN=你的token && set ERP_API_BASE=http://127.0.0.1:8001 && node scripts/check-api.mjs
 *    Linux/Mac: TOKEN=你的token ERP_API_BASE=http://127.0.0.1:8001 node scripts/check-api.mjs
 *
 * 说明：因后端暂无「删除销售单」接口，清理阶段删除客户可能失败；可用 manage.py clear_org_data <机构id> 清空该机构全部数据。
 */

const BASE = process.env.ERP_API_BASE || process.env.VITE_ERP_API_BASE || 'http://127.0.0.1:8001';
const TOKEN = process.env.TOKEN || process.env.ACCESS_TOKEN;

if (!TOKEN) {
  console.error('请设置环境变量 TOKEN（登录后从 localStorage.getItem("access_token") 获取）');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

async function req(method, path, body = null) {
  const url = path.startsWith('http') ? path : `${BASE.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { ok: res.ok, status: res.status, data, text };
}

function ok(name, r) {
  if (r.ok) {
    console.log(`  [OK] ${name}`);
    return true;
  }
  console.error(`  [FAIL] ${name} (${r.status}) ${r.data?.error || r.text?.slice(0, 80) || ''}`);
  return false;
}

// 测试过程中产生的 id，用于后续请求
const ids = {};

async function run() {
  console.log('API 基础地址:', BASE);
  console.log('开始检测前后端通讯...\n');

  let passed = 0;
  let failed = 0;

  // ---------- 只读 GET ----------
  const getTests = [
    ['GET 商品字段选项(镜片)', 'GET', '/api/erp/product-field-options/?category_name=镜片'],
    ['GET 商品列表', 'GET', '/api/erp/products/'],
    ['GET 类别列表', 'GET', '/api/erp/categories/'],
    ['GET 品牌列表', 'GET', '/api/erp/brands/'],
    ['GET 供应商列表', 'GET', '/api/erp/suppliers/'],
    ['GET 厂家列表', 'GET', '/api/erp/manufacturers/'],
    ['GET 系列列表', 'GET', '/api/erp/series/'],
    ['GET 光度范围模板', 'GET', '/api/erp/power-range-templates/'],
    ['GET 价目册', 'GET', '/api/erp/price-catalogs/'],
    ['GET 采购价', 'GET', '/api/erp/purchase-prices/'],
    ['GET 采购单列表', 'GET', '/api/erp/purchase-list-orders/'],
    ['GET 库存预警配置', 'GET', '/api/erp/stock-alert-configs/'],
    ['GET 预警已采购', 'GET', '/api/erp/stock-alert-purchased/'],
    ['GET 客户列表', 'GET', '/api/erp/customers/'],
    ['GET 验光记录', 'GET', '/api/erp/refraction-records/'],
    ['GET 销售单列表', 'GET', '/api/erp/sales-orders/'],
    ['GET 销售出库记录', 'GET', '/api/erp/sales-outbound/'],
    ['GET 销售定制单', 'GET', '/api/erp/sales-custom/'],
  ];

  for (const [name, method, path] of getTests) {
    const r = await req(method, path);
    if (ok(name, r)) passed++; else failed++;
  }

  // ---------- 创建测试数据（按依赖顺序）----------
  console.log('\n--- 创建测试数据 ---');

  let r = await req('POST', '/api/erp/categories/create/', { name: '_检测用类别_' });
  if (ok('POST 创建类别', r) && r.data?.id) {
    ids.categoryId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/brands/create/', { name: '_检测用品牌_' });
  if (ok('POST 创建品牌', r) && r.data?.id) {
    ids.brandId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/suppliers/create/', { name: '_检测用供应商_' });
  if (ok('POST 创建供应商', r) && r.data?.id) {
    ids.supplierId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/manufacturers/create/', { name: '_检测用厂家_' });
  if (ok('POST 创建厂家', r) && r.data?.id) {
    ids.manufacturerId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/products/', {
    category_name: '_检测用类别_',
    brand_name: '_检测用品牌_',
    name: '_检测用商品_',
  });
  if (ok('POST 创建商品', r) && r.data?.id) {
    ids.productId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/series/create/', { brand_id: parseInt(ids.brandId, 10), name: '_检测用系列_' });
  if (ok('POST 创建系列', r) && r.data?.id) {
    ids.seriesId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/power-range-templates/create/', { name: '_检测用光度模板_', cells: [] });
  if (ok('POST 创建光度模板', r) && r.data?.id) {
    ids.templateId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/price-catalogs/create/', { name: '_检测用价目册_', productIds: [String(ids.productId)] });
  if (ok('POST 创建价目册', r) && r.data?.id) {
    ids.catalogId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/purchase-prices/set/', { product_id: ids.productId, price: 99.9 });
  if (ok('POST 设置采购价', r)) passed++; else failed++;

  r = await req('POST', '/api/erp/purchase-list-orders/create/', {
    orderNo: 'CG' + Date.now().toString().slice(-8),
    productId: ids.productId,
    productName: '_检测用商品_',
    rows: [{ degree: '—', quantity: 1, unitPrice: 99.9 }],
  });
  if (ok('POST 创建采购单', r) && r.data?.id) {
    ids.purchaseOrderId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/stock-alert-configs/set/', {
    productId: ids.productId,
    type: 'simple',
    threshold: 5,
  });
  if (ok('POST 设置库存预警', r)) passed++; else failed++;

  r = await req('POST', '/api/erp/stock-alert-purchased/add/', { productIds: [String(ids.productId)] });
  if (ok('POST 预警已采购追加', r)) passed++; else failed++;

  r = await req('POST', '/api/erp/customers/create/', { name: '_检测用客户_', phone: '13800000000' });
  if (ok('POST 创建客户', r) && r.data?.id) {
    ids.customerId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/refraction-records/create/', {
    customerId: ids.customerId,
    rows: [{ eye: 'right', sphere: '-1.00', cylinder: '', axis: '', correctedVA: '', addPower: '', prismHoriz: '', prismHorizDelta: '', prismVert: '', prismVertDelta: '' }],
  });
  if (ok('POST 创建验光记录', r) && r.data?.id) {
    ids.refractionId = r.data.id;
    passed++;
  } else failed++;

  r = await req('POST', '/api/erp/sales-orders/create/', {
    date: new Date().toISOString().slice(0, 10),
    customerId: ids.customerId,
    customerName: '_检测用客户_',
    items: [{ productId: String(ids.productId), productName: '_检测用商品_', specDisplay: '—', quantity: 1, salesPrice: 199 }],
  });
  if (ok('POST 创建销售单', r) && r.data?.id) {
    ids.salesOrderId = r.data.id;
    passed++;
  } else failed++;

  // ---------- PUT/更新 ----------
  if (ids.categoryId) {
    r = await req('PUT', `/api/erp/categories/${ids.categoryId}/`, { name: '_检测用类别_已更新_' });
    if (ok('PUT 更新类别', r)) passed++; else failed++;
  }
  if (ids.customerId) {
    r = await req('PUT', `/api/erp/customers/${ids.customerId}/`, { name: '_检测用客户_已更新_' });
    if (ok('PUT 更新客户', r)) passed++; else failed++;
  }
  if (ids.productId) {
    r = await req('PUT', `/api/erp/products/${ids.productId}/`, { in_stock: true });
    if (ok('PUT 更新商品(部分)', r)) passed++; else failed++;
  }

  // ---------- DELETE（清理检测数据，可选）----------
  console.log('\n--- 清理检测数据 ---');
  if (ids.refractionId) {
    r = await req('DELETE', `/api/erp/refraction-records/${ids.refractionId}/delete/`);
    if (ok('DELETE 验光记录', r)) passed++; else failed++;
  }
  if (ids.customerId) {
    r = await req('DELETE', `/api/erp/customers/${ids.customerId}/delete/`);
    if (ok('DELETE 客户', r)) passed++; else failed++;
  }
  if (ids.purchaseOrderId) {
    r = await req('DELETE', `/api/erp/purchase-list-orders/${ids.purchaseOrderId}/delete/`);
    if (ok('DELETE 采购单', r)) passed++; else failed++;
  }
  if (ids.productId) {
    r = await req('DELETE', `/api/erp/products/${ids.productId}/delete/`);
    if (ok('DELETE 商品', r)) passed++; else failed++;
  }
  if (ids.productId) {
    r = await req('DELETE', `/api/erp/stock-alert-configs/${ids.productId}/remove/`);
    if (ok('DELETE 库存预警', r)) passed++; else failed++;
  }
  if (ids.catalogId) {
    r = await req('DELETE', `/api/erp/price-catalogs/${ids.catalogId}/delete/`);
    if (ok('DELETE 价目册', r)) passed++; else failed++;
  }
  if (ids.templateId) {
    r = await req('DELETE', `/api/erp/power-range-templates/${ids.templateId}/delete/`);
    if (ok('DELETE 光度模板', r)) passed++; else failed++;
  }
  if (ids.seriesId) {
    r = await req('DELETE', `/api/erp/series/${ids.seriesId}/delete/`);
    if (ok('DELETE 系列', r)) passed++; else failed++;
  }
  if (ids.categoryId) {
    r = await req('DELETE', `/api/erp/categories/${ids.categoryId}/delete/`);
    if (ok('DELETE 类别', r)) passed++; else failed++;
  }
  if (ids.brandId) {
    r = await req('DELETE', `/api/erp/brands/${ids.brandId}/delete/`);
    if (ok('DELETE 品牌', r)) passed++; else failed++;
  }
  if (ids.supplierId) {
    r = await req('DELETE', `/api/erp/suppliers/${ids.supplierId}/delete/`);
    if (ok('DELETE 供应商', r)) passed++; else failed++;
  }
  if (ids.manufacturerId) {
    r = await req('DELETE', `/api/erp/manufacturers/${ids.manufacturerId}/delete/`);
    if (ok('DELETE 厂家', r)) passed++; else failed++;
  }

  console.log('\n--- 汇总 ---');
  console.log(`通过: ${passed}  失败: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
