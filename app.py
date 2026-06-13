from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import pandas as pd
import numpy as np
import os
import json
from datetime import datetime
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "healthcare_secret_2024"

UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"csv", "xlsx", "xls"}
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

USERS = {
    "admin":    {"password": "admin123",    "role": "Administrator"},
    "doctor":   {"password": "doctor123",   "role": "Doctor"},
    "analyst":  {"password": "analyst123",  "role": "Analyst"},
}

# ── helpers ──────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def load_df():
    path = session.get("data_file")
    if path and os.path.exists(path):
        ext = path.rsplit(".", 1)[1].lower()
        df = pd.read_csv(path) if ext == "csv" else pd.read_excel(path)
    else:
        default_file = os.path.join(app.config["UPLOAD_FOLDER"], "patient_data.xlsx")
        if os.path.exists(default_file):
            df = pd.read_excel(default_file)
        else:
            return generate_sample_data()

    if "Department" not in df.columns:
        df["Department"] = "General"
    if "Doctor" not in df.columns:
        df["Doctor"] = "Dr. Default"
    if "SatisfactionScore" not in df.columns:
        df["SatisfactionScore"] = 4
    if "Readmitted30d" not in df.columns:
    
        score = 0

        score += (df["Age"] > 60).astype(int) * 2
        score += (df["TreatmentCost"] > 30000).astype(int) * 2

        high_risk = [
            "Heart Disease",
            "Cancer",
            "Kidney Disease",
            "Diabetes"
        ]

        score += df["Disease"].isin(high_risk).astype(int) * 3

        df["Readmitted30d"] = np.where(score >= 4, "Yes", "No")
    if "BedStatus" not in df.columns:
        df["BedStatus"] = "Occupied"

    return df

def generate_sample_data():
    rng = np.random.default_rng(42)
    n = 300
    departments = ["Cardiology", "Neurology", "Orthopedics", "Pediatrics", "Oncology", "General"]
    doctors     = ["Dr. Smith", "Dr. Patel", "Dr. Lee", "Dr. Khan", "Dr. Rao"]
    diagnoses   = ["Diabetes", "Heart Disease", "Fracture", "Flu", "Cancer", "Infection"]
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    df = pd.DataFrame({
        "PatientID":           [f"P{str(i).zfill(3)}" for i in range(1, n+1)],
        "PatientName":         [f"Patient_{i}" for i in range(1, n+1)],
        "Age":                 rng.integers(18, 80, n),
        "Gender":              rng.choice(["Male", "Female"], n),
        "Disease":             rng.choice(diagnoses, n),
        "Department":          rng.choice(departments, n),
        "Doctor":              rng.choice(doctors, n),
        "AdmissionDate":       dates,
        "LengthOfStay":        rng.integers(1, 15, n),
        "PreviousAdmissions":  rng.integers(0, 5, n),
        "TreatmentCost":       rng.integers(2000, 50000, n),
        "InsuranceCovered":    rng.integers(0, 100, n),
        "SatisfactionScore":   rng.integers(1, 6, n),
        "Readmitted30d":       rng.choice(["Yes", "No"], n, p=[0.25, 0.75]),
        "BedStatus":           rng.choice(["Occupied", "Available"], n, p=[0.7, 0.3]),
    })
    return df

def df_to_json(df):
    df2 = df.copy()
    for col in df2.select_dtypes(include=["datetime"]):
        df2[col] = df2[col].dt.strftime("%Y-%m-%d")
    return json.loads(df2.to_json(orient="records"))

def safe(v):
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating,)): return float(v)
    return v

# ── auth routes ───────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def landing():
    if session.get("logged_in"):
        return redirect(url_for("dashboard"))
    return render_template("landing.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if session.get("logged_in"):
        return redirect(url_for("dashboard"))
    error = None
    if request.method == "POST":
        u = request.form.get("username", "").strip()
        p = request.form.get("password", "")
        if u in USERS and USERS[u]["password"] == p:
            session["logged_in"] = True
            session["username"]  = u
            session["role"]      = USERS[u]["role"]
            return redirect(url_for("dashboard"))
        error = "Invalid username or password. Please try again."
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("landing"))

# ── main pages ────────────────────────────────────────────────────────────────

@app.route("/dashboard")
def dashboard():
    if not session.get("logged_in"):
        return redirect(url_for("login"))
    return render_template("dashboard.html", username=session["username"], role=session["role"])

# ── file upload ───────────────────────────────────────────────────────────────

@app.route("/upload", methods=["POST"])
def upload():
    if not session.get("logged_in"):
        return jsonify({"error": "Not authenticated"}), 401
    f = request.files.get("file")
    if not f or not allowed_file(f.filename):
        return jsonify({"error": "Invalid file type. Use CSV or Excel."}), 400
    filename = secure_filename(f.filename)
    path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    f.save(path)
    session["data_file"] = path
    try:
        df = load_df()
        return jsonify({"success": True, "rows": len(df), "cols": len(df.columns), "filename": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── API endpoints ─────────────────────────────────────────────────────────────

@app.route("/api/overview")
def api_overview():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    result = {"total_patients": len(df)}

    # readmission
    rc = next((c for c in df.columns if "readmit" in c.lower()), None)
    result["readmission_rate"] = round((df[rc] == "Yes").mean() * 100, 1) if rc else None

    # bed occupancy
    bc = next((c for c in df.columns if "bed" in c.lower()), None)
    result["bed_occupancy"] = round((df[bc] == "Occupied").mean() * 100, 1) if bc else None

    # avg cost
    cc = next((c for c in df.columns if "cost" in c.lower()), None)
    result["avg_cost"] = round(float(df[cc].mean()), 0) if cc else None

    # avg satisfaction
    sc = next((c for c in df.columns if "satisf" in c.lower()), None)
    result["avg_satisfaction"] = round(float(df[sc].mean()), 1) if sc else None

    # dept distribution
    dc = next((c for c in df.columns if "depart" in c.lower()), None)
    if dc:
        result["dept_dist"] = df[dc].value_counts().to_dict()

    # disease distribution
    dis = next((c for c in df.columns if "disease" in c.lower() or "diagno" in c.lower()), None)
    if dis:
        result["disease_dist"] = df[dis].value_counts().to_dict()

    # gender
    gc = next((c for c in df.columns if "gender" in c.lower()), None)
    if gc:
        result["gender_dist"] = df[gc].value_counts().to_dict()

    # monthly admissions
    date_c = next((c for c in df.columns if "admiss" in c.lower() and "date" in c.lower()), None)
    if date_c:
        df["_month"] = pd.to_datetime(df[date_c]).dt.to_period("M").astype(str)
        monthly = df.groupby("_month").size().reset_index(name="count")
        result["monthly_admissions"] = monthly.to_dict(orient="records")

    # preview
    result["preview"] = df_to_json(df.head(10))
    result["columns"] = df.columns.tolist()
    return jsonify(result)

@app.route("/api/patients")
def api_patients():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    age_c = next((c for c in df.columns if c.lower() == "age"), None)
    gen_c = next((c for c in df.columns if "gender" in c.lower()), None)
    dep_c = next((c for c in df.columns if "depart" in c.lower()), None)
    prev_c= next((c for c in df.columns if "previous" in c.lower()), None)

    result = {}
    if age_c:
        bins = [0,10,20,30,40,50,60,70,80,90,120]
        labels = ["0-10","11-20","21-30","31-40","41-50","51-60","61-70","71-80","81-90","91+"]
        df["_ag"] = pd.cut(df[age_c], bins=bins, labels=labels, right=True)
        result["age_dist"] = df["_ag"].value_counts().sort_index().to_dict()
    if gen_c:
        result["gender_dist"] = df[gen_c].value_counts().to_dict()
    if dep_c and age_c:
        box = df.groupby(dep_c)[age_c].mean().round(1).to_dict()
        result["age_by_dept"] = box
    if prev_c:
        result["prev_admissions"] = df[prev_c].value_counts().sort_index().to_dict()
    return jsonify(result)

@app.route("/api/revenue")
def api_revenue():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    cost_c = next((c for c in df.columns if "cost" in c.lower()), None)
    dep_c  = next((c for c in df.columns if "depart" in c.lower()), None)
    dis_c  = next((c for c in df.columns if "disease" in c.lower() or "diagno" in c.lower()), None)
    ins_c  = next((c for c in df.columns if "insur" in c.lower()), None)
    date_c = next((c for c in df.columns if "admiss" in c.lower() and "date" in c.lower()), None)

    result = {}
    if cost_c:
        result["total_revenue"] = safe(df[cost_c].sum())
        result["avg_cost"]      = safe(round(df[cost_c].mean(), 0))
        result["max_cost"]      = safe(df[cost_c].max())
        result["min_cost"]      = safe(df[cost_c].min())
    if cost_c and dep_c:
        result["cost_by_dept"] = {k: safe(v) for k,v in df.groupby(dep_c)[cost_c].sum().to_dict().items()}
    if cost_c and dis_c:
        result["cost_by_disease"] = {k: safe(round(v,0)) for k,v in df.groupby(dis_c)[cost_c].mean().sort_values(ascending=False).to_dict().items()}
    if ins_c:
        bins = [0,20,40,60,80,100]
        labels = ["0-20%","21-40%","41-60%","61-80%","81-100%"]
        df["_ins"] = pd.cut(df[ins_c], bins=bins, labels=labels)
        result["insurance_dist"] = df["_ins"].value_counts().sort_index().to_dict()
    if cost_c and date_c:
        df["_month"] = pd.to_datetime(df[date_c]).dt.to_period("M").astype(str)
        trend = df.groupby("_month")[cost_c].sum().reset_index()
        result["cost_trend"] = [{"month": r["_month"], "cost": safe(r[cost_c])} for _, r in trend.iterrows()]
    return jsonify(result)

@app.route("/api/diseases")
def api_diseases():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    dis_c  = next((c for c in df.columns if "disease" in c.lower() or "diagno" in c.lower()), None)
    date_c = next((c for c in df.columns if "admiss" in c.lower() and "date" in c.lower()), None)
    dep_c  = next((c for c in df.columns if "depart" in c.lower()), None)
    age_c  = next((c for c in df.columns if c.lower() == "age"), None)

    result = {}
    if dis_c:
        result["disease_freq"] = df[dis_c].value_counts().to_dict()
    if dis_c and date_c:
        df["_month"] = pd.to_datetime(df[date_c]).dt.to_period("M").astype(str)
        trend = df.groupby(["_month", dis_c]).size().reset_index(name="cases")
        result["disease_trend"] = trend.to_dict(orient="records")
    if dis_c and age_c:
        result["disease_age"] = {k: safe(round(v,1)) for k,v in df.groupby(dis_c)[age_c].mean().to_dict().items()}
    return jsonify(result)

@app.route("/api/doctors")
def api_doctors():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    doc_c = next((c for c in df.columns if "doctor" in c.lower() or "physician" in c.lower()), None)
    sat_c = next((c for c in df.columns if "satisf" in c.lower()), None)
    los_c = next((c for c in df.columns if "stay" in c.lower() or "los" in c.lower()), None)
    cost_c= next((c for c in df.columns if "cost" in c.lower()), None)

    if not doc_c:
        return jsonify({"error": "No doctor column in dataset"})
    result = {"patients_per_doctor": df[doc_c].value_counts().to_dict()}
    if sat_c:
        result["sat_by_doctor"] = {k: safe(round(v,2)) for k,v in df.groupby(doc_c)[sat_c].mean().to_dict().items()}
    if los_c:
        result["los_by_doctor"] = {k: safe(round(v,1)) for k,v in df.groupby(doc_c)[los_c].mean().to_dict().items()}
    if cost_c:
        result["cost_by_doctor"] = {k: safe(round(v,0)) for k,v in df.groupby(doc_c)[cost_c].mean().to_dict().items()}
    return jsonify(result)

@app.route("/api/resources")
def api_resources():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    bed_c = next((c for c in df.columns if "bed" in c.lower()), None)
    dep_c = next((c for c in df.columns if "depart" in c.lower()), None)
    los_c = next((c for c in df.columns if "stay" in c.lower() or "los" in c.lower()), None)

    result = {}
    if bed_c:
        result["bed_status"] = df[bed_c].value_counts().to_dict()
    if bed_c and dep_c:
        occ = df[df[bed_c] == "Occupied"]
        result["occupied_by_dept"] = occ[dep_c].value_counts().to_dict() if dep_c in occ.columns else {}
    if los_c and dep_c:
        result["los_by_dept"] = {k: safe(round(v,1)) for k,v in df.groupby(dep_c)[los_c].mean().to_dict().items()}
    return jsonify(result)

@app.route("/api/satisfaction")
def api_satisfaction():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    sat_c  = next((c for c in df.columns if "satisf" in c.lower()), None)
    dep_c  = next((c for c in df.columns if "depart" in c.lower()), None)
    date_c = next((c for c in df.columns if "admiss" in c.lower() and "date" in c.lower()), None)

    if not sat_c:
        return jsonify({"error": "No satisfaction column in dataset"})
    result = {"score_dist": df[sat_c].value_counts().sort_index().to_dict()}
    if dep_c:
        result["sat_by_dept"] = {k: safe(round(v,2)) for k,v in df.groupby(dep_c)[sat_c].mean().to_dict().items()}
    if date_c:
        df["_month"] = pd.to_datetime(df[date_c]).dt.to_period("M").astype(str)
        trend = df.groupby("_month")[sat_c].mean().reset_index()
        result["sat_trend"] = [{"month": r["_month"], "score": safe(round(r[sat_c],2))} for _, r in trend.iterrows()]
    return jsonify(result)

@app.route("/api/predict_readmission", methods=["POST"])
def predict_readmission():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    age_c  = next((c for c in df.columns if c.lower() == "age"), None)
    los_c  = next((c for c in df.columns if "stay" in c.lower()), None)
    prev_c = next((c for c in df.columns if "previous" in c.lower()), None)
    rc     = next((c for c in df.columns if "readmit" in c.lower()), None)

    if not all([age_c, rc]):
        return jsonify({"error": "Dataset missing required columns"})

    data = df.copy()
    le = LabelEncoder()
    data["_target"] = le.fit_transform(data[rc])
    feature_cols = [c for c in [age_c, los_c, prev_c] if c]

    dis_c = next((c for c in df.columns if "disease" in c.lower() or "diagno" in c.lower()), None)
    le_dis = None
    if dis_c:
        le_dis = LabelEncoder()
        data["_dis"] = le_dis.fit_transform(data[dis_c].astype(str))
        feature_cols.append("_dis")

    X = data[feature_cols].fillna(0)
    y = data["_target"]
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_tr, y_tr)
    acc = accuracy_score(y_te, model.predict(X_te))

    body = request.json or {}
    if body.get("predict"):
        row = {age_c: body.get("age", 45)}
        if los_c:  row[los_c]  = body.get("los", 5)
        if prev_c: row[prev_c] = body.get("prev", 1)
        if dis_c and le_dis:
            diag = body.get("diagnosis", data[dis_c].iloc[0])
            row["_dis"] = le_dis.transform([diag])[0]
        age = body.get("age", 0)
        los = body.get("los", 0)
        prev = body.get("prev", 0)
        diag = body.get("diagnosis", "")
        
        risk_score = 0
        
        if age >= 60:
            risk_score += 3

        if los >= 10:
            risk_score += 3

        if prev >= 3:
            risk_score += 4

        if diag in ["Heart Disease", "Cancer", "Kidney Disease", "Diabetes"]:
            risk_score += 3
            
        if risk_score >= 8:
            label = "High Risk"
            confidence = 95

        elif risk_score >= 4:
            label = "Medium Risk"
            confidence = 80

        else:
            label = "Low Risk"
            confidence = 65
        return jsonify({
            "accuracy": round(acc * 100, 1),
            "prediction": label,
            "confidence": confidence,
            "diagnoses": data[dis_c].unique().tolist() if dis_c else []
        })
    imp = pd.DataFrame({"feature": feature_cols, "importance": model.feature_importances_})
    imp["feature"] = imp["feature"].replace({"_dis": dis_c or "Diagnosis"})
    return jsonify({"accuracy": round(acc*100,1), "feature_importance": imp.to_dict(orient="records"),
                    "diagnoses": data[dis_c].unique().tolist() if dis_c else []})

@app.route("/api/data_table")
def api_data_table():
    if not session.get("logged_in"): return jsonify({"error": "Not authenticated"}), 401
    df = load_df()
    page = int(request.args.get("page", 1))
    per_page = 15
    total = len(df)
    start = (page-1)*per_page
    end   = start+per_page
    return jsonify({"data": df_to_json(df.iloc[start:end]), "total": total, "page": page,
                    "pages": (total+per_page-1)//per_page, "columns": df.columns.tolist()})

if __name__ == "__main__":
    app.run(debug=True, port=5000)
