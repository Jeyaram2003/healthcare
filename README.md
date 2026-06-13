# 🏥 MedInsight Pro – Healthcare Analytics Dashboard

A professional full-stack healthcare analytics dashboard built with **Flask + HTML/CSS/JS**.

---

## 📁 Project Structure

```
healthcare_dashboard/
│
├── app.py                  ← Flask backend (all API routes)
├── requirements.txt        ← Python dependencies
├── uploads/                ← Uploaded files stored here (auto-created)
│
├── templates/
│   ├── landing.html        ← Landing / Home page
│   ├── login.html          ← Login page
│   └── dashboard.html      ← Main dashboard
│
└── static/
    ├── css/
    │   └── style.css       ← Complete stylesheet (dark theme)
    └── js/
        ├── dashboard.js    ← Chart rendering + API calls
        └── landing.js      ← Landing page animations
```

---

## ⚙️ Setup & Run

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the server

```bash
python app.py
```

### 3. Open in browser

```
http://localhost:5000
```

---

## 🔐 Demo Login Credentials

| Role          | Username  | Password    |
|---------------|-----------|-------------|
| Administrator | admin     | admin123    |
| Doctor        | doctor    | doctor123   |
| Analyst       | analyst   | analyst123  |

---

## 📊 Dashboard Modules

| Module                     | Description                                            |
|----------------------------|--------------------------------------------------------|
| 📊 Overview                | KPIs: patients, readmission, bed occupancy, cost       |
| 👥 Patient Analytics       | Age distribution, gender, previous admissions          |
| 💰 Revenue Analytics       | Revenue by dept, cost by disease, insurance trends     |
| 📈 Disease Trends          | Frequency, age correlation, time trends                |
| 🩺 Doctor Analytics        | Caseload, satisfaction, avg length of stay             |
| 🛏️ Resource Utilization    | Bed occupancy, dept-wise capacity                      |
| 😊 Patient Satisfaction    | Score distribution, dept comparison, trend over time   |
| 🤖 Readmission AI          | Random Forest prediction with confidence score         |
| 📋 Data Table              | Paginated full data viewer                             |

---

## 📁 Supported Upload Formats

- **CSV** (.csv)
- **Excel** (.xlsx, .xls)

The dashboard auto-detects column names (case-insensitive) so it works with any healthcare dataset.

---

## 🎨 Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Python / Flask                      |
| Frontend  | HTML5, CSS3, Vanilla JavaScript     |
| Charts    | Chart.js v4                         |
| Icons     | Font Awesome 6                      |
| Fonts     | Google Fonts (Inter)                |
| ML        | scikit-learn (Random Forest)        |
| Data      | pandas + numpy                      |

---

*Built for College Internship Project – 2024*
