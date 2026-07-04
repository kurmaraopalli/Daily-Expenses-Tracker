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

## ☁️ Cross-Device GitHub Storage Sync

SpendWise includes an optional, serverless syncing mechanism that backs up your data to a private GitHub repository. This allows you to sync your expenses between mobile and desktop securely, without relying on third-party cloud database subscriptions.

### Setup Instructions

1. **Create a Private Repository for Data**:
   - Go to your GitHub account and create a new **Private Repository** (e.g., name it `spendwise-data`).

2. **Generate a GitHub Personal Access Token (PAT)**:
   - Go to GitHub **Settings** > **Developer Settings** > **Personal Access Tokens** > **Tokens (classic)**.
   - Click **Generate new token (classic)**.
   - Give it a name (e.g., `SpendWise Sync`) and select the **`repo`** scope (this is required to write the JSON file to your private repository).
   - Click **Generate token** and copy it safely.

3. **Configure SpendWise**:
   - Open SpendWise (on your mobile or desktop browser).
   - Click the **Local Mode** status badge at the top of the sidebar navigation.
   - Fill in:
     - **GitHub Username**: Your GitHub account username.
     - **Repository Name**: The name of the private repository you created in Step 1 (e.g. `spendwise-data`).
     - **Personal Access Token**: Paste the token you generated in Step 2.
     - **File Path**: The file name inside your repository (defaults to `data.json`).
   - Click **Connect & Sync**.

The app will test the connection. If successful, your status badge will turn green and read **Synced**. Every time you add, delete, or modify an expense or category, it will automatically push an updated JSON payload to your private repository, instantly syncing with your other devices when they launch!

## 💻 Running as a Standalone Desktop Application

You can run SpendWise as a standalone desktop application in two ways depending on your preference:

### Option 1: PWA Installation (Browser-Native / Mobile-Friendly)
SpendWise is fully configured as a **Progressive Web App (PWA)**:
1. Open the application in **Google Chrome** or **Microsoft Edge** (either locally or on your deployed Pages link).
2. Look at the right side of the URL address bar; you will see an **Install Icon** (a small computer monitor with a downward arrow).
3. Click it and select **Install**.
SpendWise will close the browser tab and launch as a standalone desktop window, complete with an offline cache (so it starts instantly even without internet) and a launch shortcut added to your system's desktop and taskbar.

*This also works on mobile devices! Open the hosted link in Safari (iOS) or Chrome (Android) and choose **"Add to Home Screen"**.*

### Option 2: Standalone Python Desktop Window
We have provided a native window launcher `desktop.py` that utilizes your system's native GUI webview frame:
1. Open your terminal in the directory.
2. Install the lightweight native window engine:
   ```bash
   pip install pywebview
   ```
3. Run the desktop application launcher:
   ```bash
   python desktop.py
   ```
This launches a custom standalone window (`1200x800px`) dedicated strictly to SpendWise.

#### 📦 Compile into a single `.exe` file (Optional):
If you want to package the app into a double-clickable Windows Executable (`.exe`) that runs without a command console:
1. Install PyInstaller:
   ```bash
   pip install pyinstaller
   ```
2. Build the executable:
   ```bash
   pyinstaller --noconsole --onefile desktop.py
   ```
The compiled standalone executable will be available inside the `dist/` folder.
