import { lazy, Suspense } from 'react';
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router';

const SiteLayout = lazy(() => import('../components/layout/SiteLayout.jsx'));
const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const RoomsPage = lazy(() => import('../pages/RoomsPage.jsx'));
const RestaurantPage = lazy(() => import('../pages/RestaurantPage.jsx'));
const ContactPage = lazy(() => import('../pages/ContactPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));
const AdminLoginPage = lazy(() => import('../pages/AdminLoginPage.jsx'));
const AdminDashboardPage = lazy(() => import('../pages/AdminDashboardPage.jsx'));
const AdminAuthProvider = lazy(() => import('./AdminAuthContext.jsx'));
const AdminGuard = lazy(() => import('../components/admin/AdminGuard.jsx'));
const AdminLayout = lazy(() => import('../components/admin/AdminLayout.jsx'));
const AdminRoomsPage = lazy(() => import('../pages/AdminRoomsPage.jsx'));
const AdminRoomEditorPage = lazy(() => import('../pages/AdminRoomEditorPage.jsx'));
const AdminRestaurantPage = lazy(() => import('../pages/AdminRestaurantPage.jsx'));
const AdminMenuEditorPage = lazy(() => import('../pages/AdminMenuEditorPage.jsx'));
const AdminSettingsPage = lazy(() => import('../pages/AdminSettingsPage.jsx'));

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
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>
        </Route>
      </Route>
    </>,
  ),
);

export default function App() {
  return (
    <Suspense fallback={<main className="page-container py-12" role="status">Loading page…</main>}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
