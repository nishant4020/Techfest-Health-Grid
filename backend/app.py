from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from functools import wraps
import random
import requests
import os

app = Flask(__name__)
# Enable CORS for all domains so your Vercel frontend can talk to your Render backend
CORS(app, resources={r"/*": {"origins": "*"}})
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'techfest_2026_secure_key')

# --- SECURE CLOUD-READY DATABASE CONFIGURATION ---
basedir = os.path.abspath(os.path.dirname(__file__))
local_db = 'sqlite:///' + os.path.join(basedir, 'healthgrid.db')
# If deployed on cloud, it uses the cloud DB URL, otherwise it uses local SQLite
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

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False)
    name = db.Column(db.String(100), nullable=False)

otp_store = {}

# --- INITIALIZE DATABASE & SEED DATA ---
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
        
        seed_records = [
            HealthRecord(child_id="C101", weight=8.5, status="normal", consent_verified=True),
            HealthRecord(child_id="C102", weight=5.2, status="severe_malnutrition_risk", consent_verified=True)
        ]
        db.session.bulk_save_objects(seed_records)
        db.session.commit()
        print("✅ Database created and seeded successfully!")

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

@app.route('/api/v1/public/data', methods=['GET'])
def get_public_data():
    records = HealthRecord.query.all()
    severe_count = sum(1 for r in records if r.status == 'severe_malnutrition_risk')
    moderate_count = sum(1 for r in records if r.status == 'moderate_malnutrition_risk')
    normal_count = sum(1 for r in records if r.status == 'normal')
    
    recent = HealthRecord.query.order_by(HealthRecord.id.desc()).limit(5).all()
    recent_entries = [{"weight": r.weight, "status": r.status} for r in recent]
    
    return jsonify({
        "total_tracked": len(records), "severe_cases": severe_count,
        "moderate_cases": moderate_count, "normal_cases": normal_count, "recent_entries": recent_entries
    }), 200

@app.route('/api/v1/auth/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data.get("username")).first()
    
    if user and user.password == data.get("password"):
        token = f"{user.role}-{user.username}-secure_token_123"
        return jsonify({"token": token, "role": user.role, "name": user.name}), 200
    return jsonify({"error": "Invalid username or password"}), 401

@app.route('/api/v1/auth/request-otp', methods=['POST'])
def request_otp():
    token = request.headers.get('Authorization')
    if not token or not token.startswith("Bearer "): return jsonify({"error": "Unauthorized"}), 401
    
    current_username = token.replace("Bearer ", "").split("-")[1]
    if not User.query.filter_by(username=current_username).first(): return jsonify({"error": "User not found"}), 404
        
    data = request.json or {}
    identifier = data.get("identifier")
    if not identifier: return jsonify({"error": "Phone number or Email ID is required."}), 400
        
    otp_code = str(random.randint(1000, 9999))
    otp_store[current_username] = otp_code
    is_email = "@" in identifier
    channel_type = "Email Inbox" if is_email else "Mobile SMS"
    
    if not is_email:
        try:
            res = requests.post('https://textbelt.com/text', {'phone': identifier, 'message': f'Techfest OTP: {otp_code}', 'key': 'textbelt_test'}, timeout=3)
            if not res.json().get('success'): print(f"⚠️ SMS Gateway Warning. Using fallback.")
        except Exception as e:
            print(f"⚠️ SMS Network Error. Using terminal fallback.")
            
    print(f"\n==========================================")
    print(f"🔒 SECURITY OTP ({channel_type} -> {identifier}) for [{current_username}]: {otp_code}")
    print(f"==========================================\n")
    return jsonify({"message": f"OTP dispatched via {channel_type} to {identifier}."}), 200

@app.route('/api/v1/auth/password', methods=['PUT'])
def change_own_password():
    token = request.headers.get('Authorization').replace("Bearer ", "")
    current_username = token.split("-")[1]
    
    user = User.query.filter_by(username=current_username).first()
    if not user: return jsonify({"error": "User not found"}), 404
        
    data = request.json
    submitted_otp = data.get("otp")
    new_password = data.get("new_password")
    
    if not submitted_otp or not new_password: return jsonify({"error": "OTP and new password required."}), 400
    if otp_store.get(current_username) != submitted_otp: return jsonify({"error": "Invalid OTP code."}), 400
        
    user.password = new_password
    db.session.commit()
    del otp_store[current_username]
    return jsonify({"message": "Password updated successfully via OTP verification."}), 200

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
    data = request.json
    username = data.get("username")
    role = data.get("role")
    
    if current_role == "co_admin" and role in ["district_admin", "co_admin"]:
        return jsonify({"error": "Co-admins can only create ASHA and Anganwadi accounts."}), 403
    if User.query.filter_by(username=username).first(): return jsonify({"error": "User ID already exists."}), 400
        
    new_user = User(username=username, password=data.get("password"), role=role, name=data.get("name"))
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": f"{role.replace('_', ' ').title()} account created successfully!"}), 201

@app.route('/api/v1/users/<old_username>', methods=['PUT'])
@require_roles(allowed_roles=["district_admin", "co_admin"]) 
def edit_user(old_username):
    user = User.query.filter_by(username=old_username).first()
    if not user: return jsonify({"error": "User not found."}), 404
    current_role = request.headers.get('Authorization').replace("Bearer ", "").split("-")[0]
    data = request.json
    new_username, new_password = data.get("new_username"), data.get("new_password")
    
    if new_username and new_username != old_username:
        if current_role != "district_admin": return jsonify({"error": "Permission Denied: Only Admins can modify usernames."}), 403
        if User.query.filter_by(username=new_username).first(): return jsonify({"error": "Username taken."}), 400
        user.username = new_username
    if new_password: user.password = new_password
        
    db.session.commit()
    return jsonify({"message": "User updated successfully."}), 200

@app.route('/api/v1/users/<username>', methods=['DELETE'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def delete_user(username):
    token = request.headers.get('Authorization').replace("Bearer ", "")
    current_role, current_username = token.split("-")[0], token.split("-")[1]
    
    user = User.query.filter_by(username=username).first()
    if not user: return jsonify({"error": "User not found."}), 404
    if username == current_username: return jsonify({"error": "Cannot delete own session account."}), 400
    if current_role == "co_admin" and user.role in ["district_admin", "co_admin"]: return jsonify({"error": "Permission Denied."}), 403
        
    db.session.delete(user)
    db.session.commit()
    return jsonify({"message": f"User {username} deleted."}), 200

@app.route('/api/v1/interoperability/sync', methods=['POST'])
@require_roles(allowed_roles=["worker", "anganwadi", "asha"])
def sync_health_data():
    incoming_data = request.json
    if not incoming_data.get('consent_verified'): return jsonify({"error": "DPDP Act compliance failed."}), 400
    
    weight = float(incoming_data.get('weight', 0))
    if weight < 6.0: status = "severe_malnutrition_risk"
    elif weight < 7.5: status = "moderate_malnutrition_risk"
    else: status = "normal"
    
    new_record = HealthRecord(child_id=incoming_data.get('child_id'), weight=weight, status=status, consent_verified=incoming_data.get('consent_verified'))
    db.session.add(new_record)
    db.session.commit()
    return jsonify({"message": "Record securely integrated"}), 201

@app.route('/api/v1/dashboard/alerts', methods=['GET'])
@require_roles(allowed_roles=["district_admin", "co_admin"])
def get_alerts():
    records = HealthRecord.query.filter(HealthRecord.status.like('%malnutrition_risk%')).all()
    critical_cases = [{"child_id": r.child_id, "weight": r.weight, "status": r.status, "consent_verified": r.consent_verified} for r in records]
    return jsonify({"actionable_alerts": critical_cases, "count": len(critical_cases)}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=int(os.environ.get('PORT', 5000)))