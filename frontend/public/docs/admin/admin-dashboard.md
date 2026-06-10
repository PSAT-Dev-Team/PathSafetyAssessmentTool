# 7. Admin Dashboard — Usage Tracking

The Admin Dashboard lets you monitor PSAT usage across all profiles without being physically present at the machine.

---

## Table of Contents

- [7.1 Accessing the Dashboard](#71-accessing-the-dashboard)
- [7.2 Summary Cards](#72-summary-cards)
- [7.3 Daily Login Chart](#73-daily-login-chart)
- [7.4 All Accounts Table](#74-all-accounts-table)
- [7.5 Remote Access](#75-remote-access)
- [7.6 Raw Data Access](#76-raw-data-access)

---

### 7.1 Accessing the Dashboard

1. Log in to any profile on the device (or navigate to the PSAT URL on the network).
2. Navigate to the **Projects** page (Home).
3. Click **Admin Dashboard** in the lower section of the left-hand sidebar.
4. The dashboard loads immediately with live data — no separate admin password is required.

To refresh the data at any time, click the **⟳ Refresh** button at the top right of the dashboard.

### 7.2 Summary Cards

The top of the dashboard shows three summary cards:

| Card | What it shows |
|---|---|
| **Total Accounts Created** | Number of profiles registered on this installation |
| **Logins Today** | Successful sign-in events recorded since midnight UTC |
| **Total Logins (All Time)** | Cumulative login count across all profiles since installation |

### 7.3 Daily Login Chart

The bar chart shows login frequency over a rolling window.

- Use the tabs above the chart to switch between **7d / 14d / 30d / 90d** views.
- Each bar represents one calendar day.
- Hover over a bar to see the exact login count for that day.

### 7.4 All Accounts Table

The table below the chart lists every profile on this installation:

| Column | Description |
|---|---|
| **Name** | Profile display name |
| **Division** | Team or department entered at account creation |
| **Projects** | Number of projects currently saved under this profile |
| **Logins** | Total number of times this account has signed in (all time) |
| **Created** | Date the profile was first created |
| **Last Active** | Date of the most recent login for this profile |

### 7.5 Remote Access

If PSAT is deployed on a shared server or behind a VPN, open a browser on any machine that can reach the PSAT address and navigate to `/admin` (e.g. `http://<server>:<port>/admin`).

The dashboard loads without a separate admin login. Restrict network access via firewall or VPN to control who can view it.

### 7.6 Raw Data Access

All login events are stored in a SQLite database on the server:

```
profiles/telemetry.sqlite3
```

This file can be queried directly with any SQLite client (e.g. **DB Browser for SQLite**) for custom reports.

- **Relevant table:** `activity_events`
- **Filter for logins:** `WHERE event_type = 'profile_login'`
