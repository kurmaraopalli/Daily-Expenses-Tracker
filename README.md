# 📊 Serverless Daily Expenses Tracker

A privacy-first, zero-overhead daily expenses web application designed to run entirely in the web browser. Hostable for free on **GitHub Pages**.

## ✨ Key Features

*   **智能 Bill Scraping**: Upload receipt images to extract date, merchant, and total costs using client-side OCR or secure LLM API integrations.
*   **Manual Entry**: Clean fallback form fields for quick, customized manual entry logs.
*   **Drag-and-Drop Budgeting**: Interactive workspace to drag transactions into **Needs** or **Wants** classifications.
*   **2-Year Data Storage**: Uses browser-native **IndexedDB** instead of LocalStorage to handle up to 2 years of data without lag.
*   **100% Serverless**: No databases, backend microservices, or cloud subscription fees required.

## 🛠️ Tech Stack

*   **Frontend**: React (Vite) + TypeScript
*   **Styling**: Tailwind CSS + Shadcn UI
*   **Storage**: IndexedDB (via `localforage`)
*   **Interactivity**: `@hello-pangea/dnd` (Drag and Drop)
*   **Deployment**: GitHub Pages via GitHub Actions CI/CD

## 🚀 Quick Start & Installation

### Prerequisites
*   Node.js (v18 or higher)
*   npm or yarn

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd YOUR_REPO_NAME
   ```

2. **Install project dependencies:**
   ```bash
   npm install
   ```

3. **Launch local development environment:**
   ```bash
   npm run dev
   ```

4. **Build production-ready assets:**
   ```bash
   npm run build
   ```

## 📦 Deployment to GitHub Pages

1. Update the `base` configuration inside your `vite.config.ts` file:
   ```typescript
   export default defineConfig({
     base: '/YOUR_REPO_NAME/',
     // other configs...
   })
   ```
2. Commit your code modifications and push changes directly to your `main` branch.
3. The integrated GitHub Actions pipeline (`.github/workflows/deploy.yml`) builds and deploys your application automatically to the `gh-pages` branch.
