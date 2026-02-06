# 🧾 Technical Documentation

---

## 1. Overview

Short reference for integrations, data flows, packages, and quick extension notes.

### Data Sources

- **Mautic**: Fetched via API; cached under `modules/.temp_pages`. Contains campaigns, segments (with contact totals), contacts, emails, and per-email reports.  
- **DropCowboy (RVM)**: Retrieved via SFTP, parsed, and stored as JSON in `backend/data/campaigns` for per-record reporting.  
- **Vicidial**: Agent and call-center stats collected by the Vicidialer service (login, pause, active state, calls, totals).

### Packages (Key Ones)

- **Backend:** `@prisma/client`, `axios`, `ssh2-sftp-client`, `nodemailer`, `bcryptjs`, `jsonwebtoken`, `express`, `winston`, `zod`, `node-cron`
- **Frontend:** `react`, `vite`, `tailwindcss`, `axios`, `zustand`, `react-router-dom`, `recharts`, `react-toastify`

### Modules & Responsibilities

- **DropCowboy:** SFTP ingestion → parse → save JSON → expose campaign endpoints and metrics.  
- **Mautic:** Scheduled/on-demand `axios` calls → ingest campaigns, segments, contacts, email delivery/open/click reports.  
- **Vicidialer:** Collect and aggregate per-agent and global telephony statistics for dashboards.

### Roles, Pages & Permissions

- Pages and settings can be assigned to dynamic roles at runtime.  
- Roles control access to SMTP, SFTP, Vicidial credentials, and AI assistant features.

### AI Assistant

- In-app assistant provides guided actions (e.g., show email stats, active campaigns, compare clients).  
- Uses existing data endpoints to answer user queries.

### SMTP & Templates

- System can send emails via SMTP using stored templates for notifications and campaigns.

### Security & Operations

- Keep SFTP/API credentials in environment variables and encrypt when possible.  
- Use Prisma migrations (`backend/prisma`) and `prisma generate` after schema changes.

### Short-Term Enhancements

- Add SMS via Mautic (send + receive stats)  
- Improve RVM indexing and search  
- Add audit logs for dynamic role changes

### Data Locations (Quick)

- Mautic cache: `modules/.temp_pages`  
- RVM JSON: `backend/data/campaigns`  
- Prisma schemas: `backend/prisma`

---

## 2. Backend Architecture

The backend is built with **Node.js** and **Express.js**, serving a RESTful API to the frontend. It handles business logic, data processing, and communication with external services. It uses **Prisma** as its ORM for database interactions, supporting both PostgreSQL and MySQL.

### 2.1. Core Modules

#### **2.1.1. DropCowboy (Ringless Voicemail)**

- **Purpose:** Handles data ingestion for DropCowboy, a ringless voicemail service.  
- **Functionality:** Connects to a client-provided **SFTP server** to download campaign report files (JSON). Parses and stores campaign statistics in the database.  
- **Implementation:** `SftpService` manages SFTP connection, file downloading, and parsing, preventing duplicate imports.

#### **2.1.2. Mautic (Marketing Automation)**

- **Purpose:** Integrates with Mautic, an open-source marketing automation platform.  
- **Functionality:** Fetches data from the Mautic API:
  - Campaigns  
  - Segments (contact lists)  
  - Emails and performance metrics (sends, opens, clicks, bounces)  
  - Detailed email reports  
- **Implementation:** `mauticAPI.js` uses **Axios** with retry and backoff logic for optimized data sync.

#### **2.1.3. Vicidial (Call Center)**

- **Purpose:** Integrates with Vicidial to fetch agent and call center statistics.  
- **Functionality:** Retrieves:
  - Agent login, logout, pause states  
  - Call counts and status metrics  
- **Implementation:** `vicidial.service.js` wraps Vicidial API with dynamic credential injection.

---

### 2.2. Core Services

#### **2.2.1. Dynamic Roles & Permissions**

- **Purpose:** Provide flexible access control.  
- **Functionality:** Admins can manage roles and permissions that dictate page and action-level access.  
- **Implementation:** Defined in `backend/routes/roles.js`; roles stored as JSON schema objects in DB.

#### **2.2.2. Email Notifications (SMTP)**

- **Purpose:** Send system notifications via email.  
- **Functionality:** Handles registration, role changes, sync completion alerts.  
- **Implementation:** Uses **Nodemailer** via `EmailNotificationService`. SMTP credentials and templates stored in DB.

---

### 2.3. Backend Dependencies

#### **Production**
`@prisma/client`, `axios`, `bcryptjs`, `cors`, `dotenv`, `express`, `helmet`, `jsonwebtoken`, `nodemailer`, `node-cron`, `ssh2-sftp-client`, `winston`, `zod`

#### **Development**
`nodemon`, `prisma`

---

## 3. Frontend Architecture

Frontend built using **React + Vite**, styled with **Tailwind CSS** for responsive and fast UI rendering.

### 3.1. Core Libraries

`react`, `react-router-dom`, `zustand`, `axios`, `recharts`, `tailwindcss`, `react-toastify`

### 3.2. Frontend Dependencies

#### **Production**
`axios`, `lucide-react`, `recharts`, `react-select`, `zustand`

#### **Development**
`vite`, `eslint`, `tailwindcss`, `autoprefixer`

---

# 📘 Mautic Email Performance – Endpoint Documentation

This section describes all **Mautic API endpoints** used in the application to gather **email performance metrics** such as opens, clicks, bounces, and unsubscribe rates.

---

## 🔐 Authentication

All endpoints use **Basic Auth**.

```http
Authorization: Basic <base64(username:password)>
Accept: application/json
```

```
auth: { username: "your_username", password: "your_password" }
Base URL: https://client_name.autovationpro.com/api
```

---

### 📊 1. Sent / Delivered Count

**Purpose:**  
Retrieve total number of emails sent and their overall statistics.

**Endpoint:**
```
GET /emails/{emailId}
```

**Key Fields Returned**

| **Field Name**   | **Description**                          |
|------------------|------------------------------------------|
| `sentCount`      | Number of emails sent                    |
| `readCount`      | Number of emails opened                  |
| `clickedCount`   | Total clicks across all links             |
| `bounced`        | Number of failed deliveries              |
| `unsubscribed`   | Number of unsubscribes                   |

---

### 👁️ 2. Opened / Read Emails

**Purpose:**  
Fetch all recipients who opened (read) the email.

**Endpoint:**
```
GET /stats/email_stats?where[0][col]=email_id&where[0][val]={emailId}&where[1][col]=is_read&where[1][val]=1
```

**Table:**  
`email_stats`

**Logic:**  
Filters records where `is_read = 1`.

**Used For:**  
- Open Count  
- **Formula:** `Open Rate = (Opened / Sent) × 100`

---

### 🔗 3. Clicked Links

**Purpose:**  
Retrieve all tracked link clicks for a specific email.

**Endpoint:**
```
GET /stats/channel_url_trackables?where[0][col]=channel_id&where[0][val]={emailId}
```

**Table:**  
`channel_url_trackables`

**Key Fields**

| **Field Name**   | **Description**                                  |
|------------------|--------------------------------------------------|
| `redirect_id`    | Internal ID of each tracked link                 |
| `hits`           | Total number of clicks                           |
| `unique_hits`    | Number of unique contacts who clicked            |

**Used For:**  
- Click Count  
- Unique Click Count
- **Formula:** `Click Rate = (Unique Clicks / Sent) × 100`

**To Get Actual URLs:**
```
GET /redirects/{redirect_id}
```

---

### ❌ 4. Bounced Emails

**Purpose:**  
Find all email delivery failures.

**Endpoint:**
```
GET /stats/email_stats?where[0][col]=email_id&where[0][val]={emailId}&where[1][col]=is_failed&where[1][val]=1
```

**Table:**  
`email_stats`

**Logic:**  
Filters records where `is_failed = 1`.

**Used For:**  
- Bounce Count  
- **Formula:** `Bounce Rate = (Bounced / Sent) × 100`

---

### 🚫 5. Unsubscribed Contacts

**Purpose:**  
Retrieve contacts who unsubscribed from a specific email.

**Endpoint:**
```
GET /stats/lead_event_log?where[0][col]=bundle&where[0][val]=email&where[1][col]=object_id&where[1][val]={emailId}&where[2][col]=action&where[2][val]=unsubscribed
```

**Table:**  
`lead_event_log`

**Logic:**  
Filters events where:
- `bundle = email`  
- `object_id = {emailId}`  
- `action = unsubscribed`

**Used For:**  
- Unsubscribe Count  
- **Formula:** `Unsubscribe Rate = (Unsubscribed / Sent) × 100`

---

### 📈 6. Calculated Rates Summary

| **Metric**         | **Formula**                          | **Data Source**                       |
|--------------------|--------------------------------------|---------------------------------------|
| **Open Rate**       | `(Opened / Sent) × 100`              | `/emails/{id}`, `/stats/email_stats`  |
| **Click Rate**      | `(Unique Clicks / Sent) × 100`       | `/stats/channel_url_trackables`       |
| **Bounce Rate**     | `(Bounced / Sent) × 100`             | `/stats/email_stats`                  |
| **Unsubscribe Rate**| `(Unsubscribed / Sent) × 100`        | `/stats/lead_event_log`               |

---

### 🧩 7. Example API Flow (per email)

| **Step** | **Metric** | **Endpoint** |
|-----------|-------------|--------------|
| 1️⃣ | Sent count, readCount, clickCount, unsubscribed (overview) | `/emails/{emailId}` |
| 2️⃣ | Open details | `/stats/email_stats?is_read=1` |
| 3️⃣ | Click details (tracked links) | `/stats/channel_url_trackables` |
| 4️⃣ | Bounce details | `/stats/email_stats?is_failed=1` |
| 5️⃣ | Unsubscribe details | `/stats/lead_event_log?action=unsubscribed` |

---

### 🧾 8. Example Consolidated Output

| **Metric**         | **Example Value** | **Source** |
|--------------------|------------------|-------------|
| Sent              | 962              | `/emails/138` |
| Opens             | 127              | `/stats/email_stats?is_read=1` |
| Clicks            | 119              | `/stats/channel_url_trackables` |
| Bounces           | 0                | `/stats/email_stats?is_failed=1` |
| Unsubscribes      | 0                | `/stats/lead_event_log?action=unsubscribed` |
| **Open Rate**     | **13.2%**        | Computed |
| **Click Rate**    | **12.4%**        | Computed |
| **Unsubscribe Rate** | **0%**         | Computed |

---

### 🧠 Notes

- **`email_stats` table** → stores send, open, fail events  
- **`channel_url_trackables` table** → stores click tracking per link  
- **`lead_event_log` table** → stores user actions like unsubscribes  
- **`page_redirects` table** → resolves redirect IDs to actual link URLs  

---

# 💬 Mautic SMS Performance Endpoints

This section lists the external Mautic API endpoints used to fetch **SMS campaigns** and **message statistics**.

---

### 📤 1. SMS Campaigns

**Purpose:**  
Retrieve all available SMS campaigns from Mautic for a client.

**Endpoint:**  
```
GET /smses
```


**Key Fields Returned**

| **Field Name** | **Description** |
|-----------------|-----------------|
| `id` | Unique SMS campaign ID in Mautic |
| `name` | Name of the SMS campaign |
| `message` | SMS content text |
| `isPublished` | Whether the SMS is active or archived |
| `dateAdded` | Creation timestamp |

**Used For:**  
Listing SMS campaigns, syncing metadata to `MauticSms` table.

---

### 📈 2. SMS Message Statistics

**Purpose:**  
Fetch delivery statistics for an individual SMS campaign.

**Endpoint:**  
```
GET /stats/sms_message_stats?where[0][col]=sms_id&where[0][val]={smsId}
```


**Table:**  
`sms_message_stats`

**Key Fields**

| **Field Name** | **Description** |
|-----------------|-----------------|
| `lead_id` | Contact ID the SMS was sent to |
| `date_sent` | When the SMS was sent |
| `is_failed` | 1 if delivery failed, otherwise 0 |

**Used For:**  
Calculating sent and failed counts for each SMS campaign.  
Data stored in `MauticSmsStat` table.

---

### 🧾 3. Contact SMS Replies / Activity

**Purpose:**  
Retrieve all reply messages or interactions for a specific contact.

**Endpoint:**  
```
GET /contacts/{contactId}/activity
```


**Key Fields Returned**

| **Field Name** | **Description** |
|-----------------|-----------------|
| `event` | Activity type (`sms_reply`, `sms.sent`, etc.) |
| `details` | Contains `stat.sms_id` and message payload |
| `timestamp` | Time of the event |

**Used For:**  
- Identifying replies from contacts (`event = "sms_reply"`)  
- Associating replies with campaign IDs  
- Tracking two-way SMS engagement

---

📍 **Summary**

| **Metric** | **Endpoint** | **Stored Table** |
|-------------|--------------|------------------|
| SMS Campaigns | `/smses` | `MauticSms` |
| SMS Stats | `/stats/sms_message_stats` | `MauticSmsStat` |
| Contact Activity (Replies) | `/contacts/{id}/activity` | Parsed into `MauticSmsStat` / logs |

---

**Last Updated:** February 6, 2026
