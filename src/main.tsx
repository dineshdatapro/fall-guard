import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App.tsx";
import { EventStoreProvider } from "./services/EventStoreProvider.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <EventStoreProvider>
        <App />
      </EventStoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
