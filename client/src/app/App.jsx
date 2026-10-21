import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router';
import SiteLayout from '../components/layout/SiteLayout.jsx';
import HomePage from '../pages/HomePage.jsx';
import RoomsPage from '../pages/RoomsPage.jsx';
import RestaurantPage from '../pages/RestaurantPage.jsx';
import ContactPage from '../pages/ContactPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import AdminLoginPage from '../pages/AdminLoginPage.jsx';
import AdminDashboardPage from '../pages/AdminDashboardPage.jsx';
import AdminAuthProvider from './AdminAuthContext.jsx';
import AdminGuard from '../components/admin/AdminGuard.jsx';
import AdminLayout from '../components/admin/AdminLayout.jsx';
import AdminRoomsPage from '../pages/AdminRoomsPage.jsx';
import AdminRoomEditorPage from '../pages/AdminRoomEditorPage.jsx';
import AdminRestaurantPage from '../pages/AdminRestaurantPage.jsx';
import AdminMenuEditorPage from '../pages/AdminMenuEditorPage.jsx';

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="rooms" element={<RoomsPage />} />
        <Route path="restaurant" element={<RestaurantPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route element={<AdminAuthProvider />}>
        <Route path="admin/login" element={<AdminLoginPage />} />
        <Route element={<AdminGuard />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="rooms" element={<AdminRoomsPage />} />
            <Route path="rooms/new" element={<AdminRoomEditorPage />} />
            <Route path="rooms/:id/edit" element={<AdminRoomEditorPage />} />
            <Route path="restaurant" element={<AdminRestaurantPage key="categories" />} />
            <Route path="restaurant/items" element={<AdminRestaurantPage key="items" kind="items" />} />
            <Route path="restaurant/categories/new" element={<AdminMenuEditorPage key="category-new" kind="categories" />} />
            <Route path="restaurant/categories/:id/edit" element={<AdminMenuEditorPage key="category-edit" kind="categories" />} />
            <Route path="restaurant/items/new" element={<AdminMenuEditorPage key="item-new" kind="items" />} />
            <Route path="restaurant/items/:id/edit" element={<AdminMenuEditorPage key="item-edit" kind="items" />} />
          </Route>
        </Route>
      </Route>
    </>,
  ),
);

export default function App() {
  return <RouterProvider router={router} />;
}
