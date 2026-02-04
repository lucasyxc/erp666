import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import ProductPage from './pages/Product';
import InventoryPage from './pages/Inventory';
import PurchasePage from './pages/Purchase';
import SalesPage from './pages/Sales';
import { authStorage } from './utils/storage';

const theme = {
  token: {
    colorPrimary: '#0d4f8b',
    colorSuccess: '#52c41a',
    borderRadius: 6,
  },
};

function App() {
  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <AntdApp>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route path="product" element={<ProductPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="purchase" element={<PurchasePage />} />
            <Route path="sales" element={<SalesPage />} />
            <Route index element={<Navigate to="/product" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
