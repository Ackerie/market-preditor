import { createRoot } from "react-dom/client";
import { initializeNativeApi } from "@workspace/auth-web";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);

async function startApp() {
  try {
    await initializeNativeApi(import.meta.env.VITE_API_BASE_URL);
  } catch (error) {
    console.error("Unable to initialize the native API connection.", error);
    rootElement.textContent =
      "Unable to connect to the app services. Check the native app configuration and try again.";
    return;
  }

  root.render(<App />);
}

void startApp();
