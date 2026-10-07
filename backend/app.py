from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
from datetime import datetime
import random
import requests
import os
import csv
import math

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'techfest_2026_secure_key')

basedir = os.path.abspath(os.path.dirname(__file__))
local_db = 'sqlite:///' + os.path.join(basedir, 'healthgrid.db')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', local_db)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- 1. GLOBAL WHO DATA DICTIONARY ---
WHO_DATA = {
    'male': { 0: {"L": 0.3487, "M": 3.3464, "S": 0.14602}, 1: {"L": 0.2036, "M": 4.47, "S": 0.13374}, 12: {"L": -0.0784, "M": 9.6432, "S": 0.10620}, 60: {"L": -0.0205, "M": 18.3315, "S": 0.11977} },
    'female': { 0: {"L": 0.3809, "M": 3.2322, "S": 0.14171}, 1: {"L": 0.2526, "M": 4.19, "S": 0.13251}, 12: {"L": -0.0402, "M": 8.9481, "S": 0.11059}, 60: {"L": -0.0461, "M": 18.2543, "S": 0.13098} }
}

def load_who_csv():
    csv_path = os.path.join(basedir, 'who_growth_data.csv')
    if os.path.exists(csv_path):
        try:
            with open(csv_path, mode='r') as file:
                reader = csv.DictReader(file)
                for row in reader:
                    gender = row['Gender'].lower().strip()
                    month = int(row['Month'])
                    if gender not in WHO_DATA: WHO_DATA[gender] = {}
                    WHO_DATA[gender][month] = {"L": float(row['L']), "M": float(row['M']), "S": float(row['S'])}
            print("✅ WHO Growth Data loaded from CSV successfully!")
        except Exception as e: print(f"⚠️ CSV Read Error: {e}. Using fallback demo data.")
    else: print("⚠️ WARNING: who_growth_data.csv not found! Using safe fallback demo data.")

load_who_csv()

def calculate_who_z_score(weight_kg, age_months, gender):
    gender = gender.lower()
    if gender not in WHO_DATA or age_months not in WHO_DATA[gender]: raise ValueError(f"No WHO reference data found for {gender} at {age_months} months.")
    ref = WHO_DATA[gender][age_months]
    L, M, S = ref["L"], ref["M"], ref["S"]
    if L == 0: return math.log(weight_kg / M) / S
    return (((weight_kg / M) ** L) - 1) / (L * S)

# --- DATABASE MODELS ---
class HealthRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.String(50), nullable=False)
    age_months = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(10), nullable=False)
    weight = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), nullable=False)
    consent_verified = db.Column(db.Boolean, nullable=False)
    submitted_by = db.Column(db.String(50), nullable=False)
    # NEW MEDICAL COLUMNS
    treatment_notes = db.Column(db.String(500), nullable=True)
    treated_by = db.Column(db.String(50), nullable=True)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(100), nullable=False)

class SystemLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.String(50), default=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    username = db.Column(db.String(50), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.String(255), nullable=True)

otp_store = {}

def log_action(username, action, details=""):
    try:
        db.session.add(SystemLog(username=username, action=action, details=details))
        db.session.commit()
    except Exception as e: print(f"Logging error: {e}")

# --- INITIALIZE DB & SEED DATA ---
with app.app_context():
    db.create_all()
    if not User.query.first():
        db.session.bulk_save_objects([
            User(username="anganwadi_01", password="password123", role="anganwadi", name="Anganwadi Center A"),
            User(username="asha_01", password="password123", role="asha", name="ASHA Worker 1"),
            User(username="admin_01", password="admin123", role="district_admin", name="District Health Admin"),
            User(username="co_admin_01", password="admin123", role="co_admin", name="Block Level Co-Admin"),
            # NEW DOCTOR USER
            User(username="doctor_01", password="password123", role="doctor", name="Dr. Sharma (Pediatrician)")
        ])
        db.session.commit()
        
        db.session.bulk_save_objects([
            HealthRecord(child_id="C101", age_months=12, gender="male", weight=9.6, status="normal", consent_verified=True, submitted_by="asha_01"),
            HealthRecord(child_id="C102", age_months=12, gender="female", weight=5.2, status="severe_malnutrition_risk", consent_verified=True, submitted_by="anganwadi_01")
        ])
        db.session.commit()
        log_action("system", "INITIALIZE", "Database seeded with Doctor role activated")
        print("✅ Database created and seeded successfully!")

def require_roles(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.headers.get('Authorization')
            if not token or not token.startswith("Bearer "): return jsonify({"error": "Unauthorized"}), 401
            parts = token.replace("Bearer ", "").split("-")
            if len(parts) >= 1 and parts[0] in allowed_roles: return f(*args, **kwargs)
            return jsonify({"error": "Insufficient decision rights"}), 403
        return decorated_function
    return decorator

# --- API ENDPOINTS ---
@app.route('/api/v1/public/data', methods=['GET'])
def get_public_data():
    records = HealthRecord.query.all()
    recent = HealthRecord.query.order_by(HealthRecord.id.desc()).limit(5).all()
    return jsonify({
        "total_tracked": len(records),
        "severe_cases": sum(1 for r in records if r.status == 'severe_malnutrition_risk'),
        "moderate_cases": sum(1 for r in records if r.status == 'moderate_malnutrition_risk'),
        "normal_cases": sum(1 for r in records if r.status == 'normal'),
        "recent_entries": [{"weight": r.weight, "status": r.status} for r in recent]
    }), 200

@app.route('/api/v1/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get("username")).first()
    if user and user.password == data.get("password"):
        log_action(user.username, "LOGIN", "User authenticated successfully")
        return jsonify({"token": f"{user.role}-{user.username}-secure_token_123", "role": user.role, "name": user.name}), 200
    if user: log_action(user.username, "LOGIN_FAILED", "Failed login attempt")
    return jsonify({"error": "Invalid username or password"}), 401

@app.route('/api/v1/auth/request-otp', methods=['POST'])
def request_otp():
    token = request.headers.get('Authorization', '')
    if not token or not token.startswith("Bearer "): return jsonify({"error": "Unauthorized"}), 401
    current_username = token.replace("Bearer ", "").split("-")[1]
    
    identifier = (request.json or {}).get("identifier")
    if not identifier: return jsonify({"error": "Phone/Email required."}), 400
        
    otp_code = str(random.randint(1000, 9999))
    otp_store[current_username] = otp_code
    log_action(current_username, "REQUEST_OTP", f"OTP dispatched")
    print(f"\n🔒 SECURITY OTP for [{current_username}]: {otp_code}\n")
    return jsonify({"message": f"OTP dispatched to {identifier}."}), 200

@app.route('/api/v1/auth/password', methods=['PUT'])
def change_own_password():
    token = request.headers.get('Authorization', '')
    if not token or not token.startswith("Bearer "): return jsonify({"error": "Unauthorized"}), 401
    current_username = token.replace("Bearer ", "").split("-")[1]
    
    user = User.query.filter_by(username=current_username).first()
    data = request.json
    if otp_store.get(current_username) != data.get("otp"): 
        log_action(current_username, "OTP_FAILED", "Invalid OTP entered")
        return jsonify({"error": "Invalid OTP code."}), 400
        
    user.password = data.get("new_password")
    db.session.commit()
    del otp_store[current_username]
    log_action(current_username, "UPDATE_PASSWORD", "Password successfully changed via OTP")
    return jsonify({"message": "Password updated successfully."}), 200

@app.route('/api/v1/users', methods=['GET', 'POST'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def handle_users():
    current_role, current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0:2]
    
    if request.method == 'GET':
        users = User.query.all()
        user_list = [{"username": u.username, "name": u.name, "role": u.role, **({"password": u.password} if current_role == "district_admin" else {})} for u in users]
        return jsonify(user_list), 200
        
    data = request.json
    username, role = data.get("username"), data.get("role")
    if current_role == "co_admin" and role in ["district_admin", "co_admin"]: return jsonify({"error": "Permission Denied."}), 403
    if User.query.filter_by(username=username).first(): return jsonify({"error": "User ID already exists."}), 400
        
    db.session.add(User(username=username, password=data.get("password"), role=role, name=data.get("name")))
    db.session.commit()
    log_action(current_username, "CREATE_USER", f"Provisioned {role} account: {username}")
    return jsonify({"message": "Account created successfully!"}), 201

@app.route('/api/v1/users/<username>', methods=['PUT', 'DELETE'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def modify_user(username):
    current_role, current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0:2]
    user = User.query.filter_by(username=username).first()
    if not user: return jsonify({"error": "User not found."}), 404
    
    if request.method == 'DELETE':
        if username == current_username: return jsonify({"error": "Cannot delete own session account."}), 400
        if current_role == "co_admin" and user.role in ["district_admin", "co_admin"]: return jsonify({"error": "Permission Denied."}), 403
        db.session.delete(user)
        db.session.commit()
        log_action(current_username, "DELETE_USER", f"Revoked account: {username}")
        return jsonify({"message": f"User {username} deleted."}), 200
        
    data = request.json
    if data.get("new_username") and data.get("new_username") != username:
        if current_role != "district_admin": return jsonify({"error": "Only Admins can modify usernames."}), 403
        user.username = data.get("new_username")
    if data.get("new_password"): user.password = data.get("new_password")
    
    db.session.commit()
    log_action(current_username, "EDIT_USER", f"Modified account details for: {username}")
    return jsonify({"message": "User updated successfully."}), 200

@app.route('/api/v1/interoperability/sync', methods=['POST'])
@require_roles(allowed_roles=["worker", "anganwadi", "asha"])
def sync_health_data():
    current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[1]
    incoming_data = request.json
    
    child_id = str(incoming_data.get('child_id', '')).strip()
    if len(child_id) < 3 or len(child_id) > 15 or not child_id.isalnum():
        return jsonify({"error": "Invalid Child ID. Use 3-15 letters/numbers."}), 400
        
    try:
        weight = float(incoming_data.get('weight', 0))
        age_months = int(incoming_data.get('age_months', 0))
        gender = str(incoming_data.get('gender', 'male'))
        if weight < 1.0 or weight > 30.0: raise ValueError("Weight must be between 1.0 and 30.0 kg")
        if age_months < 0 or age_months > 60: raise ValueError("Age must be between 0 and 60 months")
    except ValueError as e: return jsonify({"error": str(e)}), 400

    if not incoming_data.get('consent_verified'): return jsonify({"error": "DPDP Act compliance failed. Consent required."}), 400
    
    try:
        z_score = calculate_who_z_score(weight, age_months, gender)
        if z_score <= -3.0: status = "severe_malnutrition_risk"
        elif -3.0 < z_score <= -2.0: status = "moderate_malnutrition_risk"
        elif z_score >= 3.0: status = "obesity_risk"
        else: status = "normal"
    except ValueError as e: return jsonify({"error": str(e)}), 400
    
    new_record = HealthRecord(
        child_id=child_id, age_months=age_months, gender=gender, 
        weight=weight, status=status, consent_verified=True, submitted_by=current_username
    )
    db.session.add(new_record)
    db.session.commit()
    
    log_action(current_username, "SYNC_RECORD", f"Logged {status} (Z:{z_score}) for ID: {child_id}")
    return jsonify({"message": f"Record integrated. Z-Score: {z_score}"}), 201

# NEW ROUTE: Doctors submitting medical reports
@app.route('/api/v1/records/<int:record_id>/treat', methods=['PUT'])
@require_roles(allowed_roles=["doctor"])
def submit_treatment(record_id):
    current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[1]
    record = HealthRecord.query.get(record_id)
    if not record: return jsonify({"error": "Record not found"}), 404
    
    data = request.json
    notes = data.get("notes")
    if not notes: return jsonify({"error": "Treatment notes required."}), 400
    
    user = User.query.filter_by(username=current_username).first()
    
    record.treatment_notes = notes
    record.treated_by = user.name
    db.session.commit()
    
    log_action(current_username, "TREATMENT_SUBMITTED", f"Doctor {user.name} submitted report for Child {record.child_id}")
    return jsonify({"message": "Medical report saved securely."}), 200

@app.route('/api/v1/records', methods=['GET'])
def get_all_records():
    token = request.headers.get('Authorization')
    if not token or not token.startswith("Bearer "): return jsonify({"error": "Unauthorized"}), 401
    token_val = token.replace("Bearer ", "")
    current_role, current_username = token_val.split("-")[0], token_val.split("-")[1]
    
    # Doctors and Admins see all records
    if current_role in ["district_admin", "co_admin", "doctor"]:
        records = HealthRecord.query.order_by(HealthRecord.id.desc()).all()
    else:
        records = HealthRecord.query.filter_by(submitted_by=current_username).order_by(HealthRecord.id.desc()).all()
        
    result = [{"id": r.id, "child_id": r.child_id, "age": r.age_months, "gender": r.gender, "weight": r.weight, "status": r.status, "submitted_by": r.submitted_by, "treatment_notes": r.treatment_notes, "treated_by": r.treated_by} for r in records]
    return jsonify(result), 200

@app.route('/api/v1/dashboard/alerts', methods=['GET'])
@require_roles(allowed_roles=["district_admin", "co_admin", "doctor"])
def get_alerts():
    records = HealthRecord.query.filter(HealthRecord.status.like('%malnutrition_risk%')).order_by(HealthRecord.id.desc()).all()
    critical_cases = [{"id": r.id, "child_id": r.child_id, "age": r.age_months, "gender": r.gender, "weight": r.weight, "status": r.status, "submitted_by": r.submitted_by, "treatment_notes": r.treatment_notes, "treated_by": r.treated_by} for r in records]
    return jsonify({"actionable_alerts": critical_cases, "count": len(critical_cases)}), 200

@app.route('/api/v1/logs', methods=['GET'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def get_logs():
    logs = SystemLog.query.order_by(SystemLog.id.desc()).limit(100).all()
    result = [{"id": l.id, "timestamp": l.timestamp, "username": l.username, "action": l.action, "details": l.details} for l in logs]
    return jsonify(result), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=int(os.environ.get('PORT', 5000)))