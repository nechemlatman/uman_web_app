import { developmentSingleton } from "./app/development-singleton";
import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { I18n } from "./i18n/provider";
import { SessionProvider } from "./app/session";
import { EventProvider } from "./app/event";
import { Shell } from "./app/shell";
import { Login, EventSelection } from "./features/auth";
import { RouteError } from "./components/route-error";
import { Loading } from "./components/states";
import "./design-system/tokens.css";
import "./design-system/styles.css";
const Operations = lazy(() => import("./features/operations"));
const Entity = lazy(() => import("./features/entity"));
const Availability = lazy(() => import("./features/availability"));
const CreateEvent = lazy(() => import("./features/create-event"));
const Settings = lazy(() => import("./features/settings"));
document.documentElement.dataset.theme =
  localStorage.getItem("uman.theme") || "light";
const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      gcTime: 60000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false, networkMode: "always" },
  },
});
const router = createBrowserRouter([
  { path: "/", errorElement: <RouteError />, element: <Login /> },
  {
    path: "/events",
    errorElement: <RouteError />,
    element: <EventSelection />,
  },
  {
    path: "/e/:eventId",
    errorElement: <RouteError />,
    element: (
      <EventProvider>
        <Shell />
      </EventProvider>
    ),
    children: [
      { index: true, element: <Operations /> },
      ...["schedule", "alerts", "activity", "search"].map((path) => ({
        path,
        element: <Operations />,
      })),
      { path: "availability", element: <Availability /> },
      { path: "settings", element: <Settings /> },
      { path: ":kind", element: <Entity /> },
      { path: ":kind/:id", element: <Entity /> },
      { path: ":kind/:id/edit", element: <Entity /> },
    ],
  },
  {
    path: "/events/new",
    errorElement: <RouteError />,
    element: <CreateEvent />,
  },
  { path: "*", element: <EventSelection /> },
]);
developmentSingleton("react-root", () =>
  createRoot(document.getElementById("root")!),
).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <I18n>
        <SessionProvider>
          <Suspense fallback={<Loading />}>
            <RouterProvider router={router} />
          </Suspense>
        </SessionProvider>
      </I18n>
    </QueryClientProvider>
  </React.StrictMode>,
);
// Retire the prototype cache; authenticated operational data must never be cached by a worker.
if ("serviceWorker" in navigator)
  void navigator.serviceWorker.getRegistrations().then((rs) => {
    for (const r of rs) void r.unregister();
  });
