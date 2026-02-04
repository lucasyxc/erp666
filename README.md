# 眼科诊所进销存管理系统

分步式开发中。第一阶段：登录页 + 新建商品页。

## 功能说明

### 登录页面 (`/login`)
- 演示模式：任意账号、密码均可登录
- 登录成功后跳转至「新建商品」页

### 新建商品页面 (`/product`)
- **新建品牌**：维护品牌名称
- **新建供应商**：维护供应商名称、联系人、电话、地址
- **新建生产厂家**：维护厂家名称、联系人、电话、地址
- **新建系列**（可选）：按品牌创建系列，用于商品关联
- **新建商品名称**：
  - 商品名称（必填）
  - 类别（必选）：镜片、镜架、成品眼镜、护理液、护眼产品、角膜接触镜、服务、器械类
  - 品牌（必选）
  - 系列（选填，有则选无则不选）
  - 生产厂家（选填）

类别相关参数与规格后续逐步完善。

## 技术栈

- React 19 + TypeScript
- Vite 5
- Ant Design 6
- React Router 7
- 本地 localStorage 持久化（暂无后端）

## 启动与构建

```bash
npm install
npm run dev    # 开发 http://localhost:5173
npm run build  # 生产构建
npm run preview # 预览构建产物
```

## 项目结构

```
src/
├── components/   # 通用组件（如 ProtectedRoute）
├── layouts/      # 布局（MainLayout）
├── pages/        # 页面（Login, Product）
├── types/        # 类型与常量（类别等）
├── utils/        # 工具（storage）
├── App.tsx       # 路由与主题
└── main.tsx      # 入口
```
