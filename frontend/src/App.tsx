import { useState, useEffect, type FormEvent } from 'react';

interface HealthRecord { id: number; child_id: string; weight: number; age: number; gender: string; status: string; submitted_by?: string; treatment_notes?: string; treated_by?: string; }
interface UserInfo { username: string; name: string; role: string; password?: string; }
interface PublicStats { total_tracked: number; severe_cases: number; moderate_cases: number; normal_cases: number; recent_entries: { weight: number, status: string, treatment_notes?: string, treated_by?: string }[]; }
interface SystemLog { id: number; timestamp: string; username: string; action: string; details: string; }

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000';

const playUISound = (type: 'success' | 'error' | 'logout' | 'sync' | 'click') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gainNode = ctx.createGain();
    osc.connect(gainNode); gainNode.connect(ctx.destination);
    if (type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(400, ctx.currentTime); gainNode.gain.setValueAtTime(0.02, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05); } 
    else if (type === 'success') { osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, ctx.currentTime); osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.08, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4); } 
    else if (type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime); gainNode.gain.setValueAtTime(0.04, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3); } 
  } catch (e) { console.warn("Audio playback not supported.", e); }
};

export default function App() {
  const [showLoginView, setShowLoginView] = useState(false);
  const [adminTab, setAdminTab] = useState<'alerts' | 'users' | 'records' | 'logs'>('alerts');
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [publicData, setPublicData] = useState<PublicStats | null>(null);
  const [alerts, setAlerts] = useState<HealthRecord[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [allRecords, setAllRecords] = useState<HealthRecord[]>([]); 
  const [logs, setLogs] = useState<SystemLog[]>([]);
  
  const [childId, setChildId] = useState('');
  const [weight, setWeight] = useState('');
  const [ageMonths, setAgeMonths] = useState('');
  const [gender, setGender] = useState('male');
  const [consent, setConsent] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const [showWorkerMenu, setShowWorkerMenu] = useState(false);
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [identifierInput, setIdentifierInput] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [selfNewPassword, setSelfNewPassword] = useState('');
  const [selfPasswordMsg, setSelfPasswordMsg] = useState('');
  
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('anganwadi');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ newUsername: '', newPassword: '' });

  const [treatingRecordId, setTreatingRecordId] = useState<number | null>(null);
  const [treatmentText, setTreatmentText] = useState('');

  const isSuperAdmin = role === 'district_admin';
  const isCoAdmin = role === 'co_admin';
  const isDoctor = role === 'doctor';
  const hasDashboardAccess = isSuperAdmin || isCoAdmin || isDoctor;
  const isWorker = role === 'worker' || role === 'anganwadi' || role === 'asha';

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (!token && !showLoginView) { fetchPublicData(); interval = setInterval(fetchPublicData, 3000); }
    return () => clearInterval(interval);
  }, [token, showLoginView]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (token) {
      if (hasDashboardAccess) {
        if (adminTab === 'alerts') { fetchAlerts(); interval = setInterval(fetchAlerts, 3000); } 
        else if (adminTab === 'users' && (isSuperAdmin || isCoAdmin)) fetchUsers();
        else if (adminTab === 'records') { fetchRecords(); interval = setInterval(fetchRecords, 3000); }
        else if (adminTab === 'logs' && (isSuperAdmin || isCoAdmin)) { fetchLogs(); interval = setInterval(fetchLogs, 3000); }
      } else if (isWorker) {
        fetchRecords(); interval = setInterval(fetchRecords, 3000);
      }
    }
    return () => clearInterval(interval);
  }, [token, role, adminTab, hasDashboardAccess, isWorker, isSuperAdmin, isCoAdmin]);

  const fetchPublicData = async () => { try { const res = await fetch(`${API_BASE}/api/v1/public/data`); if (res.ok) setPublicData(await res.json()); } catch (e) {} };
  const fetchAlerts = async () => { try { const res = await fetch(`${API_BASE}/api/v1/dashboard/alerts`, { headers: { 'Authorization': `Bearer ${token}` } }); if (res.ok) setAlerts((await res.json()).actionable_alerts); } catch (e) {} };
  const fetchUsers = async () => { try { const res = await fetch(`${API_BASE}/api/v1/users`, { headers: { 'Authorization': `Bearer ${token}` } }); if (res.ok) setUsers(await res.json()); } catch (e) {} };
  const fetchRecords = async () => { try { const res = await fetch(`${API_BASE}/api/v1/records`, { headers: { 'Authorization': `Bearer ${token}` } }); if (res.ok) setAllRecords(await res.json()); } catch (e) {} };
  const fetchLogs = async () => { try { const res = await fetch(`${API_BASE}/api/v1/logs`, { headers: { 'Authorization': `Bearer ${token}` } }); if (res.ok) setLogs(await res.json()); } catch (e) {} };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: loginUsername, password: loginPassword }) });
      const data = await res.json();
      if (res.ok) { playUISound('success'); setToken(data.token); setRole(data.role); setUserName(data.name); setShowLoginView(false); setLoginError(''); } 
      else { playUISound('error'); setLoginError(data.error); }
    } catch { setLoginError("Connection failed."); }
  };

  const handleLogout = () => { playUISound('logout'); setToken(null); setRole(null); setShowLoginView(false); fetchPublicData(); };

  const handleDataSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const weightNum = parseFloat(weight);
    const ageNum = parseInt(ageMonths);
    if (!/^[a-zA-Z0-9]{3,15}$/.test(childId)) { playUISound('error'); setSubmitMessage("❌ ID must be 3-15 letters/numbers."); return; }
    if (isNaN(weightNum) || weightNum < 1.0 || weightNum > 30.0) { playUISound('error'); setSubmitMessage("❌ Weight must be 1.0 - 30.0 kg."); return; }
    if (isNaN(ageNum)) { playUISound('error'); setSubmitMessage("❌ Please select a valid age."); return; }
    if (!consent) { playUISound('error'); setSubmitMessage("❌ Guardian consent required."); return; }

    setSubmitMessage("Calculating WHO Z-Score...");
    try {
      const res = await fetch(`${API_BASE}/api/v1/interoperability/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ child_id: childId, weight: weightNum, age_months: ageNum, gender, consent_verified: consent }) });
      if (res.ok) { playUISound('success'); setSubmitMessage(`✅ ${(await res.json()).message}`); setChildId(''); setWeight(''); setAgeMonths(''); setConsent(false); fetchRecords(); } 
      else { playUISound('error'); setSubmitMessage(`❌ ${(await res.json()).error}`); }
    } catch { setSubmitMessage("❌ Connection failed."); }
  };

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault(); setSelfPasswordMsg("Dispatching OTP...");
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/request-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ identifier: identifierInput }) });
      if (res.ok) { playUISound('success'); setSelfPasswordMsg("✅ OTP sent!"); setOtpStep('verify'); } else { playUISound('error'); setSelfPasswordMsg(`❌ ${(await res.json()).error}`); }
    } catch { setSelfPasswordMsg("❌ Connection failed."); }
  };

  const handleVerifyAndChangePassword = async (e: FormEvent) => {
    e.preventDefault(); setSelfPasswordMsg("Verifying OTP...");
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ otp: enteredOtp, new_password: selfNewPassword }) });
      if (res.ok) { playUISound('success'); setSelfPasswordMsg("✅ Password updated!"); setEnteredOtp(''); setSelfNewPassword(''); setIdentifierInput(''); setTimeout(() => { setShowWorkerMenu(false); setOtpStep('request'); setSelfPasswordMsg(''); }, 2000); } 
      else { playUISound('error'); setSelfPasswordMsg(`❌ ${(await res.json()).error}`); }
    } catch { setSelfPasswordMsg("❌ Connection failed."); }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ username: newUserId, password: newUserPassword, name: newUserName, role: newUserRole }) });
      if (res.ok) { playUISound('success'); setNewUserId(''); setNewUserName(''); setNewUserPassword(''); fetchUsers(); } 
    } catch (e) {}
  };

  const handleDeleteUser = async (u: string) => { if (window.confirm(`Delete ${u}?`)) fetch(`${API_BASE}/api/v1/users/${u}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).then(() => fetchUsers()); };
  const handleEditSubmit = async (u: string) => { fetch(`${API_BASE}/api/v1/users/${u}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ new_username: editForm.newUsername, new_password: editForm.newPassword }) }).then(() => { setEditingUserId(null); fetchUsers(); }); };

  const submitTreatment = async (recordId: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/records/${recordId}/treat`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ notes: treatmentText }) });
      if (res.ok) { playUISound('success'); setTreatingRecordId(null); setTreatmentText(''); fetchRecords(); fetchAlerts(); } 
      else { playUISound('error'); alert("Failed to save report."); }
    } catch (e) { alert("Connection failed."); }
  };

  const getRoleAnimationClass = () => {
    if (role === 'district_admin') return 'glow-admin';
    if (role === 'co_admin') return 'glow-coadmin';
    if (role === 'doctor') return 'glow-doctor';
    if (role === 'asha') return 'glow-asha';
    if (role === 'anganwadi') return 'glow-anganwadi';
    return '';
  };

  return (
    <>
      <style>{`
        body { margin: 0; background: linear-gradient(135deg, #064e3b 0%, #022c22 50%, #0f172a 100%); background-attachment: fixed; color: #f1f5f9; font-family: system-ui, sans-serif; min-height: 100vh; }
        * { box-sizing: border-box; }
        .main-container { padding: 40px 20px; max-width: 1100px; margin: 0 auto; width: 100%; }
        .glass-card { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 14px; box-shadow: 0 15px 35px -5px rgba(0, 0, 0, 0.4); color: #f8fafc; overflow: hidden; }
        .table-wrapper { overflow-x: auto; width: 100%; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 24px; }
        .worker-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; align-items: end; margin-top: 16px; }
        .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(52, 211, 153, 0.2); padding-bottom: 20px; margin-bottom: 30px; }
        .input-field { background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; color: white; width: 100%; padding: 12px; border-radius: 8px; font-size: 14px; }
        .btn { padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; border: none; transition: all 0.2s; }
        .btn:hover { filter: brightness(1.15); }
        table th { padding: 16px; color: #cbd5e1; text-align: left; } table td { padding: 16px; border-bottom: 1px solid rgba(51, 65, 85, 0.5); }
        
        @keyframes pulseDoctor { 0% { box-shadow: 0 0 0px rgba(56, 189, 248, 0); } 50% { box-shadow: 0 0 25px rgba(56, 189, 248, 0.4); border-color: #38bdf8; } 100% { box-shadow: 0 0 0px rgba(56, 189, 248, 0); } }
        .glow-doctor { animation: pulseDoctor 3s infinite; border: 1px solid #38bdf8; }
      `}</style>

      {/* --- PUBLIC DASHBOARD WITH DOCTOR NOTES --- */}
      {!token && !showLoginView && (
        <div className="main-container">
          <header className="header-container">
            <div><h1 style={{ margin: 0, color: '#34d399' }}>Public Node</h1><p>DPDP-Compliant Live Health Transparency Dashboard</p></div>
            <button className="btn" onClick={() => setShowLoginView(true)} style={{ backgroundColor: '#10b981', color: 'white' }}>Official Login</button>
          </header>
          
          {publicData ? (
            <>
              <div className="stat-grid">
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #38bdf8' }}><h2 style={{ fontSize: '3rem', margin: 0, color: '#38bdf8' }}>{publicData.total_tracked}</h2><p>Total Profiles</p></div>
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #34d399' }}><h2 style={{ fontSize: '3rem', margin: 0, color: '#34d399' }}>{publicData.normal_cases}</h2><p>Healthy</p></div>
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #f59e0b' }}><h2 style={{ fontSize: '3rem', margin: 0, color: '#f59e0b' }}>{publicData.moderate_cases}</h2><p>Moderate Risk</p></div>
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #ef4444' }}><h2 style={{ fontSize: '3rem', margin: 0, color: '#ef4444' }}>{publicData.severe_cases}</h2><p>Severe Risk</p></div>
              </div>

              <div className="glass-card table-wrapper" style={{ marginTop: '24px' }}>
                <div style={{ padding: '24px', borderBottom: '1px solid rgba(52, 211, 153, 0.2)' }}>
                  <h3 style={{ margin: 0 }}>Recent Anonymized Scans</h3>
                  <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>Child IDs are hidden for DPDP compliance. Medical responses are updated in real-time.</p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'rgba(30,41,59,0.5)' }}><th>Recorded Weight</th><th>Clinical Health Status</th><th>Medical Action Taken</th></tr></thead>
                  <tbody>
                    {publicData.recent_entries.map((e, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold' }}>{e.weight} kg</td>
                        <td>
                          <span style={{ 
                            padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold',
                            backgroundColor: e.status === 'normal' ? 'rgba(52, 211, 153, 0.1)' : e.status === 'moderate_malnutrition_risk' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: e.status === 'normal' ? '#34d399' : e.status === 'moderate_malnutrition_risk' ? '#f59e0b' : '#ef4444' 
                          }}>
                            {e.status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </td>
                        <td>
                          {/* PUBLIC DISPLAY OF DOCTOR'S NOTES */}
                          {e.treatment_notes ? (
                            <span style={{ fontSize: '13px', color: '#cbd5e1' }}><strong style={{ color: '#38bdf8' }}>{e.treated_by}:</strong> {e.treatment_notes}</span>
                          ) : (
                            <span style={{ fontSize: '13px', color: '#64748b' }}>Pending Review / Routine Tracking</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p style={{ textAlign: 'center', color: '#94a3b8' }}>Connecting to Interoperability Grid...</p>}
        </div>
      )}

      {!token && showLoginView && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div className="glass-card" style={{ padding: '30px', width: '100%', maxWidth: '400px' }}>
            <button onClick={() => setShowLoginView(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', marginBottom: '16px' }}>← Back to Public Node</button>
            <h2>Secure Gateway</h2>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input className="input-field" type="text" required placeholder="User ID" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} />
              <input className="input-field" type="password" required placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
              <button className="btn" type="submit" style={{ backgroundColor: '#10b981', color: 'white' }}>Authenticate</button>
            </form>
            {loginError && <p style={{ color: '#f87171', textAlign: 'center', marginTop: '16px' }}>{loginError}</p>}
          </div>
        </div>
      )}

      {token && (
        <div className="main-container">
          <header className={`glass-card header-container ${getRoleAnimationClass()}`} style={{ padding: '24px' }}>
            <div>
              <h1 style={{ margin: 0 }}>Interoperability Node</h1>
              <span>User: <strong>{userName}</strong> | {role?.toUpperCase()}</span>
            </div>
            <button className="btn" onClick={handleLogout} style={{ backgroundColor: '#ef4444', color: 'white' }}>Logout</button>
          </header>

          {isWorker && (
            <>
              <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', position: 'relative' }}>
                <button onClick={() => setShowWorkerMenu(!showWorkerMenu)} className="btn" style={{ position: 'absolute', top: '16px', right: '16px', background: '#334155', color: 'white' }}>Security OTP</button>
                {showWorkerMenu && (
                  <div className="glass-card" style={{ position: 'absolute', right: '16px', top: '64px', padding: '16px', width: '250px', zIndex: 10 }}>
                    <h4 style={{ margin: '0 0 12px 0', color: '#34d399' }}>Update Password</h4>
                    {otpStep === 'request' ? (
                      <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input className="input-field" type="text" required placeholder="Email/Phone" value={identifierInput} onChange={e => setIdentifierInput(e.target.value)} />
                        <button className="btn" type="submit" style={{ background: '#2563eb', color: 'white' }}>Send OTP</button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyAndChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input className="input-field" type="text" required placeholder="4-Digit OTP" value={enteredOtp} onChange={e => setEnteredOtp(e.target.value)} />
                        <input className="input-field" type="password" required placeholder="New Password" value={selfNewPassword} onChange={e => setSelfNewPassword(e.target.value)} />
                        <button className="btn" type="submit" style={{ background: '#10b981', color: 'white' }}>Verify</button>
                      </form>
                    )}
                    {selfPasswordMsg && <div style={{ marginTop: '8px', fontSize: '12px', color: '#cbd5e1' }}>{selfPasswordMsg}</div>}
                  </div>
                )}
                <h2>Enter Health Assessment (WHO LMS Z-Score)</h2>
                <form onSubmit={handleDataSubmit} className="worker-form">
                  <div><label>Child ID</label><input className="input-field" type="text" minLength={3} maxLength={15} required value={childId} onChange={e => setChildId(e.target.value)} /></div>
                  <div><label>Age Profile</label><select className="input-field" required value={ageMonths} onChange={e => setAgeMonths(e.target.value)}><option value="" disabled>Select Age</option><option value="0">0 Months</option><option value="1">1 Month</option><option value="12">1 Year</option><option value="60">5 Years</option></select></div>
                  <div><label>Gender</label><select className="input-field" required value={gender} onChange={e => setGender(e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></div>
                  <div><label>Weight (kg)</label><input className="input-field" type="number" step="0.1" min="1" max="30" required value={weight} onChange={e => setWeight(e.target.value)} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /><label>Consent Verified</label></div>
                  <button className="btn" type="submit" style={{ backgroundColor: '#10b981', color: 'white' }}>Sync Data</button>
                </form>
                {submitMessage && <div style={{ marginTop: '16px', color: '#34d399' }}>{submitMessage}</div>}
              </div>

              <div className="glass-card table-wrapper" style={{ padding: '24px' }}>
                <h3>My Sync History</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: 'rgba(30,41,59,0.9)' }}><th>ID</th><th>Profile</th><th>Weight</th><th>Status</th><th>Medical Action</th></tr></thead>
                  <tbody>
                    {allRecords.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 'bold' }}>{r.child_id}</td>
                        <td>{r.age}m / {r.gender.charAt(0).toUpperCase()}</td>
                        <td>{r.weight} kg</td>
                        <td style={{ color: r.status === 'normal' ? '#34d399' : '#f87171' }}>{r.status.toUpperCase()}</td>
                        <td>{r.treatment_notes ? <span style={{ color: '#38bdf8', fontSize: '12px' }}>Treated by {r.treated_by}</span> : <span style={{ color: '#94a3b8', fontSize: '12px' }}>Pending</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {hasDashboardAccess && (
            <>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => setAdminTab('alerts')} style={{ background: adminTab === 'alerts' ? '#10b981' : 'rgba(30,41,59,0.8)', color: 'white', flex: 1 }}>Alerts</button>
                <button className="btn" onClick={() => setAdminTab('records')} style={{ background: adminTab === 'records' ? '#10b981' : 'rgba(30,41,59,0.8)', color: 'white', flex: 1 }}>Global Records</button>
                {(isSuperAdmin || isCoAdmin) && <button className="btn" onClick={() => setAdminTab('logs')} style={{ background: adminTab === 'logs' ? '#10b981' : 'rgba(30,41,59,0.8)', color: 'white', flex: 1 }}>Audit Trail</button>}
                {(isSuperAdmin || isCoAdmin) && <button className="btn" onClick={() => setAdminTab('users')} style={{ background: adminTab === 'users' ? '#10b981' : 'rgba(30,41,59,0.8)', color: 'white', flex: 1 }}>Directory</button>}
              </div>

              {(adminTab === 'alerts' || adminTab === 'records') && (
                <div className="glass-card table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead><tr style={{ background: 'rgba(30,41,59,0.9)' }}><th>Child ID</th><th>Profile</th><th>Weight</th><th>Reported By</th><th>Status</th><th>Medical Action / Treatment</th></tr></thead>
                    <tbody>
                      {(adminTab === 'alerts' ? alerts : allRecords).map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 'bold' }}>{r.child_id}</td>
                          <td>{r.age}m / {r.gender}</td>
                          <td>{r.weight} kg</td>
                          <td>{r.submitted_by}</td>
                          <td style={{ color: r.status === 'normal' ? '#34d399' : '#f87171', fontWeight: 'bold' }}>{r.status.toUpperCase()}</td>
                          <td>
                            {r.treatment_notes ? (
                              <div style={{ fontSize: '12px' }}><span style={{ color: '#38bdf8', fontWeight: 'bold' }}>Treated by {r.treated_by}:</span> {r.treatment_notes}</div>
                            ) : isDoctor ? (
                              treatingRecordId === r.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <textarea className="input-field" placeholder="Type medical report here..." onChange={e => setTreatmentText(e.target.value)} style={{ minHeight: '60px' }} />
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="btn" onClick={() => submitTreatment(r.id)} style={{ background: '#3b82f6', color: 'white', padding: '6px 12px', fontSize: '12px' }}>Save Report</button>
                                    <button className="btn" onClick={() => setTreatingRecordId(null)} style={{ background: '#64748b', color: 'white', padding: '6px 12px', fontSize: '12px' }}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <button className="btn" onClick={() => setTreatingRecordId(r.id)} style={{ background: '#3b82f6', color: 'white', padding: '8px 12px', fontSize: '12px' }}>Submit Medical Report</button>
                              )
                            ) : (
                              <span style={{ fontSize: '12px', color: '#64748b' }}>Awaiting Doctor</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {adminTab === 'logs' && (isSuperAdmin || isCoAdmin) && (
                <div className="glass-card table-wrapper">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'rgba(30,41,59,0.9)' }}><th>Time</th><th>User ID</th><th>Action</th><th>Details</th></tr></thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.id}>
                          <td style={{ fontSize: '13px', color: '#94a3b8' }}>{l.timestamp}</td>
                          <td style={{ color: '#38bdf8' }}>{l.username}</td>
                          <td><span style={{ padding: '4px', background: 'rgba(167,139,250,0.2)', color: '#a78bfa', borderRadius: '4px' }}>{l.action}</span></td>
                          <td>{l.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {adminTab === 'users' && (isSuperAdmin || isCoAdmin) && (
                <div className="glass-card" style={{ padding: '24px' }}>
                  <h3>Provision User</h3>
                  <form onSubmit={handleCreateUser} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input className="input-field" style={{ flex: 1 }} type="text" required placeholder="User ID" value={newUserId} onChange={e => setNewUserId(e.target.value)} />
                    <input className="input-field" style={{ flex: 1 }} type="text" required placeholder="Name" value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                    <select className="input-field" style={{ flex: 1 }} value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                      <option value="anganwadi">Anganwadi</option><option value="asha">ASHA</option><option value="doctor">Medical Doctor</option><option value="co_admin">Co-Admin</option>
                    </select>
                    <input className="input-field" style={{ flex: 1 }} type="text" required placeholder="Password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} />
                    <button className="btn" type="submit" style={{ backgroundColor: '#10b981', color: 'white' }}>Add User</button>
                  </form>
                  <h3 style={{ marginTop: '24px' }}>Network Directory</h3>
                  <ul style={{ listStyleType: 'none', padding: 0 }}>
                    {users.map((u) => (
                      <li key={u.username} style={{ padding: '16px 0', borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                        {editingUserId === u.username ? (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <input className="input-field" style={{ flex: 1 }} placeholder="New Username" onChange={e => setEditForm({ ...editForm, newUsername: e.target.value })} />
                            <input className="input-field" style={{ flex: 1 }} placeholder="New Password" onChange={e => setEditForm({ ...editForm, newPassword: e.target.value })} />
                            <button className="btn" onClick={() => handleEditSubmit(u.username)} style={{ background: '#2563eb', color: 'white', padding: '8px 16px' }}>Save</button>
                            <button className="btn" onClick={() => setEditingUserId(null)} style={{ background: '#64748b', color: 'white', padding: '8px 16px' }}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div><strong>{u.name}</strong> <code>({u.username})</code> - <span style={{ color: '#38bdf8' }}>{u.role.toUpperCase()}</span></div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn" onClick={() => { setEditingUserId(u.username); setEditForm({ newUsername: '', newPassword: '' }); }} style={{ background: '#f59e0b', color: 'white', padding: '8px 12px' }}>Edit</button>
                              <button className="btn" onClick={() => handleDeleteUser(u.username)} style={{ background: '#ef4444', color: 'white', padding: '8px 12px' }}>Revoke</button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}