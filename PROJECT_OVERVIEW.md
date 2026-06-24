# Vault: Automated Personal Finance Tracker & M-Pesa Sync

Vault is a modern, privacy-focused mobile application built with **React Native** and **Expo** designed to automate expense tracking. 

The core value of Vault is solving the "input friction" of budgeting by reading transaction receipts directly from your phone's SMS inbox (specifically M-Pesa logs) and converting them into structured financial insights.

---

## 🎯 Core Features

### 1. Automated M-Pesa SMS Syncing
Instead of manually typing in every daily transaction, Vault securely accesses your device's SMS inbox:
*   **Permissions**: Requests standard Android SMS read permissions (`READ_SMS`).
*   **Filtering**: Queries and scans logs for messages from the sender `MPESA` or `M-PESA`.
*   **RegEx Parsing**: Feeds raw text messages into a JavaScript parser in [App.js](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/App.js) to extract:
    *   **Transaction ID** (e.g., `QHG52SDF9G`)
    *   **Amount** (e.g., `Ksh 1,500.00`)
    *   **Direction** (Income vs Expense, based on tags like `"received from"`, `"paid to"`, or `"sent to"`)
    *   **Title/Recipient** (e.g., "Safaricom Supermarket" or "Jane Doe")
*   **Duplicate Prevention**: Keeps a unique index of transaction IDs in local memory and filters out duplicate messages during sync.

### 2. Expenditure Charts & Breakdown Analytics
Displays real-time financial tracking inside the dashboard:
*   **Vertical Bar Graph**: Visualizes the percentage of total monthly spending allocated to each category (Shopping, Bills, Subscriptions, Dining, etc.) side-by-side.
*   **Horizontal Progress Indicators**: Lists raw expenditure numbers alongside percentage-filled progress bars.
*   **Dynamic Update Loop**: The analytics update automatically when transactions are synced, manually added, or deleted.

### 3. State Management & Data Persistence
*   **Local State**: Managed reactively inside the `App` component in [App.js](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/App.js).
*   **Storage**: Synchronizes all transaction history to the device using `@react-native-async-storage/async-storage`. Data remains fully persistent when the app is closed or restarted.
*   **Calculations**: Dynamically computes **Total Balance**, **Income**, and **Expenses** relative to a starting balance offset, maintaining accuracy to the cent.

### 4. Interactive Notifications Manager
Powered by `expo-notifications` to keep the user engaged:
*   **Instant Confirmation Alerts**: Shows a push notification indicating a transaction has been successfully recorded.
*   **Sync Summaries**: Generates a notification outlining the number of new M-Pesa SMS statements imported.
*   **Budget reminders**: Configures a daily recurring alarm at 8:00 PM reminding the user to review their spending.

---

## 🛠️ System Architecture & Codebase

```mermaid
graph TD
    subgraph JavaScript Thread (App.js)
        JS[App Component] <--> ST[AsyncStorage]
        JS -->|Render| UI[UI Layout & Custom Charts]
        UI -->|Sync SMS Action| BR[JS Native Bridge]
    end

    subgraph Native Thread (Kotlin Android)
        BR <-->|SmsModule.getSmsList| NSM[SmsModule.kt]
        NSM -->|Query ContentResolver| DB[(Android SMS Database)]
    end
    
    subgraph Device Hardware
        DB -.->|Triggers when| SMS[M-Pesa SMS Received]
    end
```

The application relies on three core codebase files:
1.  **Configuration**: [app.json](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/app.json) defines the app credentials, bundle properties, and native permissions.
2.  **Kotlin Native Module**: 
    - [SmsModule.kt](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/android/app/src/main/java/com/usersapp/SmsModule.kt) queries the Android OS database.
    - [SmsPackage.kt](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/android/app/src/main/java/com/usersapp/SmsPackage.kt) registers the module.
    - Manually registered inside the native entrypoint [MainApplication.kt](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/android/app/src/main/java/com/usersapp/MainApplication.kt).
3.  **Application Entrypoint**: [App.js](file:///C:/Users/user/Desktop/React%20Native%20Projects/users-app/App.js) ties state, forms, charts, parser utilities, and notifications together.

---

## 🔒 Security & Privacy Notice
*   **100% Client-Side**: All parsing, storage, and analytics are performed locally on the user's phone. No SMS logs or transactional values are sent to external databases or servers.
