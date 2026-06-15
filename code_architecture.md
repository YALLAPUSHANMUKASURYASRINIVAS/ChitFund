# ChitLite - Code Architecture Document

This document describes the codebase architecture, file directory structure, and key execution flows of the ChitLite application.

---

## 1. Directory Structure

The repository is structured as a light-weight monolithic Express application with a decoupled database utility:

```
d:\ra\chitfund/
│
├── .env                         # Server environment secrets (not committed to git)
├── backendenv                   # Environment variable template
├── render.yaml                  # Render deployment configuration
├── db.js                        # PostgreSQL Client Connection & Table Initialization
├── server.js                    # Express Application, Route Handlers, APIs
├── reset_owner.js               # Seed script to reset/create owner accounts
├── clean_db.js                  # Maintenance script to clear transactions/logs
├── run_local.bat                # Windows setup script for fresh checkouts
│
├── public/                      # Static client assets
│   ├── index.html               # Main SPA DOM structure
│   ├── css/
│   │   └── style.css            # Dark mode UI styles, grid-layouts, and animations
│   ├── js/
│   │   └── app.js               # Frontend router, state manager, API client, Razorpay SDK
│   └── sample_members.csv       # Spreadsheet template for importing members
│
└── scratch/                     # Developer tools and local validation scripts
    ├── check_notif_errors.js    # Utility to query and log email delivery failures
    └── test_*.js                # Integration test suites for specific scenarios
```

---

## 2. Component Layering

### A. Database Layer (`db.js`)
* Configures a PostgreSQL connection pool (`pg.Pool`) using `DATABASE_URL`.
* Uses the Supabase cloud connection pooler address on port `5432` with connection limits optimized for free-tier servers.
* Automatically executes raw SQL DLL statements on system startup to establish tables, constraints, and indexes.

### B. Controller & Routing Layer (`server.js`)
* Serves the static assets folder `public/` using Express.
* Implements REST API endpoints categorized by role:
  * **Public APIs**: Client Auth (`/api/client/login`), Razorpay Webhooks (`/api/payments/webhook`).
  * **Admin APIs**: Auth (`/api/owner/login`), Group management (`/api/groups`), Member management (`/api/members`), Bidding (`/api/auctions`), Matrix view (`/api/matrix`).
  * **Client APIs**: Dues list (`/api/client/dues`), Bulk payment session initiation (`/api/payments/create-order`), Query submissions (`/api/queries`).
* Uses a custom `authenticateToken` JWT middleware to verify that incoming administrative requests have valid headers.

### C. Client Single-Page Application (SPA) (`public/js/app.js` & `index.html`)
* The client dashboard does not use heavy frameworks (like React or Vue) to minimize build steps. Instead, it utilizes standard Vanilla ES6 JavaScript:
  * **State Object**: Maintains `authToken`, `clientId`, `role`, and active group context.
  * **Client-Side Routing**: An `app.showView(viewName)` router toggles CSS `.d-none` utilities on major sections (`#view-landing`, `#view-owner-dashboard`, `#view-user-dashboard`) to switch displays without reloading the page.
  * **DOM Syncing**: Elements are updated programmatically via standard Javascript templates when fetching resources from the backend.
  * **Razorpay Checkout SDK**: Uses Razorpay's standard checkout script. When a client clicks pay, the frontend initiates a backend order, opens the Razorpay popup, and listens for the completion handler.

---

## 3. Key Execution Flows

### A. Group Creation to Monthly Auction Cycle
```
[Admin Creates Group]
        │
        ▼ (Inserts to GROUPS table, status='active', month=1)
[Enroll Members / CSV Upload]
        │
        ▼ (Inserts to MEMBERS table)
[Hold Auction (Enter bid discount)]
        │
        ▼ (Inserts to AUCTIONS table; calculates dividends)
[Generate Monthly Payment Bills]
        │
        ▼ (Inserts to PAYMENTS table for all members, status='unpaid')
[Collect Payments (Manual Cash / Razorpay Online)]
        │
        ▼ (Updates PAYMENTS table status='paid')
[Advance Phase / Close Month]
        │
        ▼ (Updates GROUPS table current_month = current_month + 1)
```

---

## 4. Key APIs and Endpoints

| Endpoint | Method | Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/owner/login` | POST | Public | Authenticates owner credentials and returns JWT token |
| `/api/client/login` | POST | Public | Validates Client ID + Phone, returns access token |
| `/api/groups` | GET/POST | Admin | Lists or creates chit groups |
| `/api/groups/:id/members` | GET | Admin | Retrieves the member roster for a group |
| `/api/members/bulk` | POST | Admin | Imports multiple members via CSV file |
| `/api/auctions` | POST | Admin | Submits bid details for a month, records winner, generates dues |
| `/api/matrix/:groupId` | GET | Admin | Generates grid data of billing statuses across all months |
| `/api/payments/manual` | POST | Admin | Marks a specific monthly installment bill as paid (Cash/Bank) |
| `/api/client/dues` | GET | Client | Retrieves unpaid dues, calculates Net Payout for winner |
| `/api/payments/create-order`| POST | Client | Requests Razorpay Order ID for checkout |
| `/api/payments/verify` | POST | Client | Validates cryptographic signature of online checkouts |
