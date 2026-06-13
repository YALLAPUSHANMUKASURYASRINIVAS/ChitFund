# ChitLite - Chit Fund Manager

ChitLite is a modern, responsive, and premium web application designed to manage chit fund groups, streamline collections, handle monthly bidding auctions, and automate payment confirmations. 

Built with a sleek, interactive dark theme and rich custom animations, it provides a comprehensive administrative dashboard for owners and a simplified portal for clients.

---

## 🚀 Key Features

### 👤 Admin / Owner Dashboard
- **Group Management**: Create and configure new chit groups with customizable total value, duration, owner commission, and winner premium fees.
- **Roster Enrollment**: Add members manually or import them in bulk using a CSV spreadsheet template.
- **New Phase Cloning**: Duplicate an existing group's roster to start a new phase with one click.
- **Bidding Auctions**: Hold monthly auctions, select winners, and calculate discount-based dividends.
- **Bues Collection matrix**: View and update a grid-style payment matrix. Mark manual bank/cash payments, and edit remarks.
- **Support Portal**: Receive support queries from clients and write replies.
- **Double-Click Protection**: Automated submission disabling and spinners block duplicate API requests and prevent clone group/duplicate group creations.

### 👥 Client Portal
- **Secure ID Login**: Access the portal using a registered 5-digit Client ID and registered phone number.
- **Multi-Group Overview**: View cards for all registered groups simultaneously showing started dates, contributions, and current month progress.
- **Winner Badges**: Visual indicator badges showing winner status (<span style="color: #10B981; font-weight: bold;">Winner</span> / <span style="color: #EF4444; font-weight: bold;">Not Won Yet</span>).
- **Net Payout Banner**: Displays dynamic calculations of winner payout minus outstanding dues in other registered groups (Net Receivable).
- **Razorpay Checkout**: Seamlessly clear single dues or checkout all outstanding bills in one consolidated bulk payment session.
- **Inquiry Portal**: Submit support questions directly to the chit fund owner and read replies.

---

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (using `pg` client pool)
- **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript
- **Payments**: Razorpay Gateway Integration
- **Alerts**: Twilio API (SMS Alerts), NodeMailer (Email Alerts)

---

## 📁 Project Structure

```
d:\ra\chitfund
├── clean_db.js              # Wipes test auction, payment, and notification records
├── db.js                    # PostgreSQL pool configurations and table initializations
├── package.json             # NPM project manifest
├── server.js                # Core Express server and REST API handlers
├── public/                  # Frontend static files
│   ├── css/
│   │   └── style.css        # Premium custom stylesheet (fonts, variables, animations)
│   ├── js/
│   │   └── app.js           # Client-side routing, controllers, and payment integration
│   ├── index.html           # Main SPA template housing login, owner, and client dashboards
│   └── sample_members.csv   # Downloadable template for bulk member imports
└── test_*.js                # Comprehensive integration test suites
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory and configure the following parameters:

```env
# Server Config
PORT=5000
NODE_ENV=development

# Database Config
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chitfund_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Auth Secret
JWT_SECRET=your_secure_jwt_secret_string
JWT_EXPIRE=7d

# SMS Config (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number

# Payment Config (Razorpay)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

---

## 🗄️ Database Tables Schema

Upon startup, the server automatically checks and initializes the following PostgreSQL tables (managed in `db.js`):
1. **`owners`**: Contains administrative credentials.
2. **`groups`**: Contains group settings, parameters, and current month number.
3. **`members`**: Stores member registrations mapped to group IDs and unique client IDs.
4. **`auctions`**: Stores monthly auction log logs, winners, bid discounts, and payout calculations.
5. **`payments`**: Tracks individual monthly bill installments, billing status (`paid`/`unpaid`), and transaction details.
6. **`notifications`**: Logs all simulated/sent SMS and email alerts.
7. **`queries`**: Stores support questions and administrative replies.

---

## 📥 Installation & Startup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Owner/Admin Account**:
   Ensure PostgreSQL is running and runs:
   ```bash
   node reset_owner.js
   ```
   *Note: This creates a default admin account with username `owner` and password `password123`.*

3. **Start Server**:
   ```bash
   npm start
   ```
   The application will be served locally at **[http://localhost:5000](http://localhost:5000)**.

---

## 🧪 Running Integration Tests

Automated integration test suites are provided to verify API integrity and transaction processes.

1. **Verify Core APIs**:
   ```bash
   npm test
   ```
   *Runs `test_api.js` testing server health, admin auth, group creation, member enroll, and client login.*

2. **Verify Support Queries & Premium Payments**:
   ```bash
   node test_premium_and_queries.js
   ```

3. **Verify Localized Notification Templates**:
   ```bash
   node test_custom_features.js
   ```

4. **Verify Group Deletions & Cascades**:
   ```bash
   node test_delete_group.js
   ```

5. **Verify New Phases & Multi-Membership Operations**:
   ```bash
   node test_new_phases_and_dates.js
   ```
