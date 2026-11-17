import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell.tsx";
import { CareScreen } from "./components/CareScreen.tsx";
import { MonitorScreen } from "./components/MonitorScreen.tsx";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<MonitorScreen />} />
        <Route path="care" element={<CareScreen />} />
      </Route>
    </Routes>
  );
}
