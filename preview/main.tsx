import React from "react";
import { createRoot } from "react-dom/client";
import Home from "@/app/page";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import "@/app/globals.css";

const path = window.location.pathname.replace(/\/+$/, "");
const Page = path.endsWith("/privacy")
  ? PrivacyPage
  : path.endsWith("/terms")
    ? TermsPage
    : Home;

document.title = path.endsWith("/privacy")
  ? "Privacy Policy | Announcement Hub"
  : path.endsWith("/terms")
    ? "Terms and Conditions | Announcement Hub"
    : "Announcement Hub Preview";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
