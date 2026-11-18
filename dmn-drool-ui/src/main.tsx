import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// No StrictMode: its double mount would load the heavy editor iframe twice in dev.
createRoot(document.getElementById("root")!).render(<App />);
