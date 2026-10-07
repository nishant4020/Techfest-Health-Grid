from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
from datetime import datetime
import random
import requests
import os

app = Flask(__name__)
# Allow cross-origin requests from Vercel frontend
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'techfest_2026_secure_key')

# Database configuration (Cloud fallback to Local SQLite)
basedir = os.path.abspath(os.path.dirname(__file__))
local_db = 'sqlite:///' + os.path.join(basedir, 'healthgrid.db')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', local_db)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- DATABASE MODELS ---
class HealthRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    child_id = db.Column(db.String(50), nullable=False)
    weight = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(50), nullable=False)
    consent_verified = db.Column(db.Boolean, nullable=False)
    submitted_by = db.Column(db.String(50), nullable=False)

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

# --- SECURITY AUDIT LOGGER ---
def log_action(username, action, details=""):
    try:
        new_log = SystemLog(username=username, action=action, details=details)
        db.session.add(new_log)
        db.session.commit()
    except Exception as e:
        print(f"Logging error: {e}")

# --- INITIALIZE DB & SEED DEFAULT USERS ---
with app.app_context():
    db.create_all()
    if not User.query.first():
        seed_users = [
            User(username="anganwadi_01", password="password123", role="anganwadi", name="Anganwadi Center A"),
            User(username="asha_01", password="password123", role="asha", name="ASHA Worker 1"),
            User(username="admin_01", password="admin123", role="district_admin", name="District Health Admin"),
            User(username="co_admin_01", password="admin123", role="co_admin", name="Block Level Co-Admin")
        ]
        db.session.bulk_save_objects(seed_users)
        db.session.commit()
        log_action("system", "INITIALIZE", "Database seeded and system activated")
        print("✅ Database created and seeded successfully!")

# --- ROLE-BASED ACCESS CONTROL (RBAC) ---
def require_roles(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.headers.get('Authorization')
            if not token or not token.startswith("Bearer "): 
                return jsonify({"error": "Unauthorized"}), 401
            token_value = token.replace("Bearer ", "")
            parts = token_value.split("-")
            if len(parts) >= 1 and parts[0] in allowed_roles:
                return f(*args, **kwargs)
            return jsonify({"error": "Insufficient decision rights"}), 403
        return decorated_function
    return decorator

# --- API ROUTES ---
@app.route('/api/v1/public/data', methods=['GET'])
def get_public_data():
    records = HealthRecord.query.all()
    severe_count = sum(1 for r in records if r.status == 'severe_malnutrition_risk')
    moderate_count = sum(1 for r in records if r.status == 'moderate_malnutrition_risk')
    normal_count = sum(1 for r in records if r.status == 'normal')
    recent = HealthRecord.query.order_by(HealthRecord.id.desc()).limit(5).all()
    recent_entries = [{"weight": r.weight, "status": r.status} for r in recent]
    return jsonify({"total_tracked": len(records), "severe_cases": severe_count, "moderate_cases": moderate_count, "normal_cases": normal_count, "recent_entries": recent_entries}), 200

@app.route('/api/v1/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get("username")).first()
    if user and user.password == data.get("password"):
        token = f"{user.role}-{user.username}-secure_token_123"
        log_action(user.username, "LOGIN", "User authenticated successfully")
        return jsonify({"token": token, "role": user.role, "name": user.name}), 200
    if user: log_action(user.username, "LOGIN_FAILED", "Failed login attempt")
    return jsonify({"error": "Invalid username or password"}), 401

@app.route('/api/v1/auth/request-otp', methods=['POST'])
def request_otp():
    token = request.headers.get('Authorization')
    if not token or not token.startswith("Bearer "): return jsonify({"error": "Unauthorized"}), 401
    current_username = token.replace("Bearer ", "").split("-")[1]
    if not User.query.filter_by(username=current_username).first(): return jsonify({"error": "User not found"}), 404
        
    data = request.json or {}
    identifier = data.get("identifier")
    if not identifier: return jsonify({"error": "Phone/Email required."}), 400
        
    otp_code = str(random.randint(1000, 9999))
    otp_store[current_username] = otp_code
    channel_type = "Email Inbox" if "@" in identifier else "Mobile SMS"
    
    log_action(current_username, "REQUEST_OTP", f"OTP dispatched to {channel_type}")
    print(f"\n🔒 SECURITY OTP ({channel_type} -> {identifier}) for [{current_username}]: {otp_code}\n")
    return jsonify({"message": f"OTP dispatched via {channel_type} to {identifier}."}), 200

@app.route('/api/v1/auth/password', methods=['PUT'])
def change_own_password():
    current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[1]
    user = User.query.filter_by(username=current_username).first()
    data = request.json
    submitted_otp, new_password = data.get("otp"), data.get("new_password")
    
    if otp_store.get(current_username) != submitted_otp: 
        log_action(current_username, "OTP_FAILED", "Invalid OTP entered")
        return jsonify({"error": "Invalid OTP code."}), 400
        
    user.password = new_password
    db.session.commit()
    del otp_store[current_username]
    log_action(current_username, "UPDATE_PASSWORD", "Password successfully changed via OTP")
    return jsonify({"message": "Password updated successfully."}), 200

@app.route('/api/v1/users', methods=['GET'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def get_users():
    current_role = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0]
    users = User.query.all()
    user_list = []
    for u in users:
        user_info = {"username": u.username, "name": u.name, "role": u.role}
        if current_role == "district_admin": user_info["password"] = u.password
        user_list.append(user_info)
    return jsonify(user_list), 200

@app.route('/api/v1/users', methods=['POST'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def add_user():
    current_role = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0]
    current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[1]
    data = request.json
    username, role = data.get("username"), data.get("role")
    
    if current_role == "co_admin" and role in ["district_admin", "co_admin"]: return jsonify({"error": "Permission Denied."}), 403
    if User.query.filter_by(username=username).first(): return jsonify({"error": "User ID already exists."}), 400
        
    new_user = User(username=username, password=data.get("password"), role=role, name=data.get("name"))
    db.session.add(new_user)
    db.session.commit()
    log_action(current_username, "CREATE_USER", f"Provisioned {role} account: {username}")
    return jsonify({"message": "Account created successfully!"}), 201

@app.route('/api/v1/users/<old_username>', methods=['PUT'])
@require_roles(allowed_roles=["district_admin", "co_admin"]) 
def edit_user(old_username):
    user = User.query.filter_by(username=old_username).first()
    current_role = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0]
    current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[1]
    data = request.json
    new_username, new_password = data.get("new_username"), data.get("new_password")
    
    if new_username and new_username != old_username:
        if current_role != "district_admin": return jsonify({"error": "Only Admins can modify usernames."}), 403
        user.username = new_username
    if new_password: user.password = new_password
        
    db.session.commit()
    log_action(current_username, "EDIT_USER", f"Modified account details for: {old_username}")
    return jsonify({"message": "User updated successfully."}), 200

@app.route('/api/v1/users/<username>', methods=['DELETE'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def delete_user(username):
    current_role, current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0:2]
    user = User.query.filter_by(username=username).first()
    if username == current_username: return jsonify({"error": "Cannot delete own session account."}), 400
    if current_role == "co_admin" and user.role in ["district_admin", "co_admin"]: return jsonify({"error": "Permission Denied."}), 403
        
    db.session.delete(user)
    db.session.commit()
    log_action(current_username, "DELETE_USER", f"Revoked account: {username}")
    return jsonify({"message": f"User {username} deleted."}), 200

@app.route('/api/v1/interoperability/sync', methods=['POST'])
@require_roles(allowed_roles=["worker", "anganwadi", "asha"])
def sync_health_data():
    current_username = request.headers.get('Authorization').replace("Bearer ", "").split("-")[1]
    incoming_data = request.json
    
    # 1. Input Validation: Child ID
    child_id = str(incoming_data.get('child_id', '')).strip()
    if len(child_id) < 3 or len(child_id) > 15 or not child_id.isalnum():
        log_action(current_username, "SYNC_BLOCKED", "Failed validation: Invalid Child ID format")
        return jsonify({"error": "Invalid Child ID. Use 3-15 letters/numbers only."}), 400
        
    # 2. Input Validation: Weight
    try:
        weight = float(incoming_data.get('weight', 0))
        if weight < 1.0 or weight > 30.0:
            log_action(current_username, "SYNC_BLOCKED", f"Failed validation: Unrealistic weight ({weight}kg)")
            return jsonify({"error": "Invalid weight. Must be between 1.0 kg and 30.0 kg."}), 400
    except ValueError:
        return jsonify({"error": "Weight must be a valid number."}), 400

    # 3. Input Validation: DPDP Consent
    if not incoming_data.get('consent_verified'): 
        log_action(current_username, "SYNC_BLOCKED", "Failed validation: No DPDP consent")
        return jsonify({"error": "DPDP Act compliance failed. Consent required."}), 400
    
    if weight < 6.0: status = "severe_malnutrition_risk"
    elif weight < 7.5: status = "moderate_malnutrition_risk"
    else: status = "normal"
    
    new_record = HealthRecord(child_id=child_id, weight=weight, status=status, consent_verified=True, submitted_by=current_username)
    db.session.add(new_record)
    db.session.commit()
    log_action(current_username, "SYNC_RECORD", f"Logged {status} for Child ID: {child_id}")
    return jsonify({"message": "Record securely integrated"}), 201

@app.route('/api/v1/records', methods=['GET'])
def get_all_records():
    token_val = request.headers.get('Authorization').replace("Bearer ", "")
    current_role, current_username = token_val.split("-")[0], token_val.split("-")[1]
    
    if current_role in ["district_admin", "co_admin"]:
        records = HealthRecord.query.order_by(HealthRecord.id.desc()).all()
    else:
        records = HealthRecord.query.filter_by(submitted_by=current_username).order_by(HealthRecord.id.desc()).all()
        
    result = [{"child_id": r.child_id, "weight": r.weight, "status": r.status, "submitted_by": r.submitted_by} for r in records]
    return jsonify(result), 200

@app.route('/api/v1/dashboard/alerts', methods=['GET'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def get_alerts():
    records = HealthRecord.query.filter(HealthRecord.status.like('%malnutrition_risk%')).order_by(HealthRecord.id.desc()).all()
    critical_cases = [{"child_id": r.child_id, "weight": r.weight, "status": r.status, "submitted_by": r.submitted_by} for r in records]
    return jsonify({"actionable_alerts": critical_cases, "count": len(critical_cases)}), 200

@app.route('/api/v1/logs', methods=['GET'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def get_logs():
    logs = SystemLog.query.order_by(SystemLog.id.desc()).limit(100).all()
    result = [{"id": l.id, "timestamp": l.timestamp, "username": l.username, "action": l.action, "details": l.details} for l in logs]
    return jsonify(result), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=int(os.environ.get('PORT', 5000)))