import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import { LogoutOutlined, AppstoreOutlined, ShoppingCartOutlined, InboxOutlined, DollarOutlined } from '@ant-design/icons';
import { authStorage } from '../utils/storage';
import './index.css';

const { Header, Content, Sider } = Layout;

const SIDEBAR_WIDTH = 220;

const sideMenuItems = [
  {
    key: '/product',
    icon: <AppstoreOutlined />,
    label: '商品信息管理',
  },
  {
    key: '/purchase',
    icon: <ShoppingCartOutlined />,
    label: '采购管理',
  },
  {
    key: '/inventory',
    icon: <InboxOutlined />,
    label: '库存管理',
  },
  {
    key: '/sales',
    icon: <DollarOutlined />,
    label: '销售管理',
  },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    authStorage.logout();
    navigate('/login', { replace: true });
  };

  const selectedKey =
    location.pathname.startsWith('/product')
      ? '/product'
      : location.pathname.startsWith('/inventory')
        ? '/inventory'
        : location.pathname.startsWith('/purchase')
          ? '/purchase'
          : location.pathname.startsWith('/sales')
            ? '/sales'
            : sideMenuItems[0]?.key;

  return (
    <Layout className="main-layout">
      <Header className="main-header">
        <div className="main-header-inner">
          <h1 className="main-title">眼科诊所进销存管理系统</h1>
          <div className="main-header-actions">
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              className="logout-btn"
            >
              退出登录
            </Button>
          </div>
        </div>
      </Header>
      <Layout className="main-body-with-side">
        <Sider width={SIDEBAR_WIDTH} className="main-sider" theme="light">
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            items={sideMenuItems}
            onClick={({ key }) => navigate(key)}
            className="main-side-menu"
          />
        </Sider>
        <Content className="main-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
