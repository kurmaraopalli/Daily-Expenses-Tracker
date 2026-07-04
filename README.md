# 📊 Serverless Daily Expenses Tracker

SpendWise is a privacy-first, zero-overhead daily expenses tracker designed to run entirely in your web browser. Hosted for free, with all data processed and persisted locally.

## ✨ Core Features

*   **📷 Smart Receipt OCR Scanner**: Drag and drop receipt images to extract the merchant, date, and total transaction amount using client-side `Tesseract.js` (processed 100% locally).
*   **🏷️ Drag-and-Drop Budgeting**: Drag expense logs across Needs, Wants, and Savings columns to re-classify transactions in real-time.
*   **📊 Rich Analytical Charts**: View category breakdowns (doughnut chart) and spending trends (line chart) using interactive `Chart.js` integrations.
*   **💰 Monthly Budget Targets**: Set a monthly budget goal with clear, color-coded visual indicator gauges and proactive notification toasts.
*   **⏳ Recurring Expenses Planner**: Schedule weekly, monthly, or annual subscription transactions (e.g. Netflix, housing rent) that auto-post on their due dates.
*   **🛡️ Privacy First (IndexedDB)**: Direct browser database storage using browser-native **IndexedDB** handling up to 2 years of local data without lag.
*   **📂 Data Import & Export**: Export your complete historical data as a structured JSON file to ensure you never lose a backup, or restore from an existing JSON backup.
*   **100% Serverless**: Zero backend APIs, no subscription fees, and no third-party database syncing.

## 🛠️ Architecture & Tech Stack

*   **Structure**: Semantic HTML5 markup
*   **Styling**: Pure modern CSS3 using CSS variables, custom grid/flexbox layouts, responsive design, and glassmorphic card elements
*   **Interactivity & Logic**: Pure Vanilla Javascript (ES6+)
*   **Storage**: Browser-native `IndexedDB`
*   **CDNs**:
    *   `Chart.js` (Visualizations)
    *   `Lucide Icons` (Modern UI iconography)
    *   `Tesseract.js` (Local OCR processing engine)

## 🚀 Getting Started

Since SpendWise is completely serverless and runs entirely in the browser, there are **no installation commands, compilation, or server setups required**.

### Running Locally
1. Clone this repository to your local system:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Daily-Expenses-Tracker.git
   cd Daily-Expenses-Tracker
   ```
2. Simply double-click `index.html` to open the application directly in any modern web browser, or serve it using a lightweight local server extension (like Live Server in VS Code).

## 📂 Deployment to GitHub Pages

To host SpendWise for free on GitHub Pages:
1. Push this directory to a public repository on GitHub.
2. Navigate to your repository's **Settings** > **Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Set the branch to `main` (or whichever branch holds your code) and the folder to `/` (root), then click **Save**.
5. Your application will be live at `https://YOUR_USERNAME.github.io/Daily-Expenses-Tracker/` within minutes!
