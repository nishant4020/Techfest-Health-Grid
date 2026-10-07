import { useState, useEffect, FormEvent } from 'react';

interface HealthRecord { child_id: string; weight: number; status: string; consent_verified: boolean; }
interface UserInfo { username: string; name: string; role: string; password?: string; }
interface PublicStats { total_tracked: number; severe_cases: number; moderate_cases: number; normal_cases: number; recent_entries: { weight: number, status: string }[]; }

// Dynamically use the Cloud URL if deployed, or localhost if testing
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5000';

const playUISound = (type: 'success' | 'error' | 'logout' | 'sync' | 'click') => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (type === 'click') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(400, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.02, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'success') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, ctx.currentTime); osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'error') {
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.04, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'sync') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(440, ctx.currentTime); osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.06, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'logout') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(440, ctx.currentTime); osc.frequency.setValueAtTime(329.63, ctx.currentTime + 0.15);
      gainNode.gain.setValueAtTime(0.08, ctx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) { console.warn("Audio playback not supported.", e); }
};

export default function App() {
  const [showLoginView, setShowLoginView] = useState(false);
  const [adminTab, setAdminTab] = useState<'alerts' | 'users'>('alerts');

  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [publicData, setPublicData] = useState<PublicStats | null>(null);
  const [alerts, setAlerts] = useState<HealthRecord[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  
  const [childId, setChildId] = useState('');
  const [weight, setWeight] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const [showWorkerMenu, setShowWorkerMenu] = useState(false);
  const [identifierInput, setIdentifierInput] = useState('');
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [selfNewPassword, setSelfNewPassword] = useState('');
  const [selfPasswordMsg, setSelfPasswordMsg] = useState('');

  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('anganwadi');
  const [userMsg, setUserMsg] = useState('');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ newUsername: '', newPassword: '' });

  const isSuperAdmin = role === 'district_admin';
  const isCoAdmin = role === 'co_admin';
  const hasDashboardAccess = isSuperAdmin || isCoAdmin;
  const isWorker = role === 'worker' || role === 'anganwadi' || role === 'asha';

  const fetchPublicData = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/public/data`);
      if (response.ok) setPublicData(await response.json());
    } catch (error) { console.error("Error:", error); }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/dashboard/alerts`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) { const data = await response.json(); setAlerts(data.actionable_alerts); }
    } catch (err) { console.error(err); }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/users`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) setUsers(await response.json());
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!token && !showLoginView) { fetchPublicData(); interval = setInterval(fetchPublicData, 3000); }
    return () => clearInterval(interval);
  }, [token, showLoginView]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (token && hasDashboardAccess) {
      if (adminTab === 'alerts') { fetchAlerts(); interval = setInterval(fetchAlerts, 3000); } 
      else if (adminTab === 'users') { fetchUsers(); }
    }
    return () => clearInterval(interval);
  }, [token, role, adminTab, hasDashboardAccess]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault(); setLoginError('');
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await response.json();
      if (response.ok) { playUISound('success'); setToken(data.token); setRole(data.role); setUserName(data.name); setShowLoginView(false); } 
      else { playUISound('error'); setLoginError(data.error); }
    } catch { playUISound('error'); setLoginError("Connection failed to server."); }
  };

  const handleLogout = () => {
    playUISound('logout');
    setToken(null); setRole(null); setUserName(null); setLoginUsername(''); setLoginPassword(''); setShowPassword(false);
    setShowWorkerMenu(false); setOtpStep('request'); setIdentifierInput(''); setShowLoginView(false); fetchPublicData(); 
  };

  const handleDataSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSubmitMessage("Syncing data...");
    try {
      const response = await fetch(`${API_BASE}/api/v1/interoperability/sync`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ child_id: childId, weight: parseFloat(weight), consent_verified: consent })
      });
      if (response.ok) { playUISound('sync'); setSubmitMessage("✅ Data synced securely!"); setChildId(''); setWeight(''); setConsent(false); } 
      else { playUISound('error'); const res = await response.json(); setSubmitMessage(`❌ Error: ${res.error}`); }
    } catch { playUISound('error'); setSubmitMessage("❌ Connection failed."); }
  };

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault(); setSelfPasswordMsg("Dispatching OTP...");
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/request-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ identifier: identifierInput })
      });
      const result = await response.json();
      if (response.ok) { playUISound('success'); setSelfPasswordMsg("✅ OTP sent! Check terminal/inbox."); setOtpStep('verify'); } 
      else { playUISound('error'); setSelfPasswordMsg(`❌ ${result.error}`); }
    } catch { playUISound('error'); setSelfPasswordMsg("❌ Connection failed."); }
  };

  const handleVerifyAndChangePassword = async (e: FormEvent) => {
    e.preventDefault(); setSelfPasswordMsg("Verifying OTP...");
    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/password`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ otp: enteredOtp, new_password: selfNewPassword })
      });
      const result = await response.json();
      if (response.ok) {
        playUISound('success'); setSelfPasswordMsg("✅ Password updated successfully!");
        setEnteredOtp(''); setSelfNewPassword(''); setIdentifierInput('');
        setTimeout(() => { setShowWorkerMenu(false); setOtpStep('request'); setSelfPasswordMsg(''); }, 2000);
      } else { playUISound('error'); setSelfPasswordMsg(`❌ ${result.error}`); }
    } catch { playUISound('error'); setSelfPasswordMsg("❌ Connection failed."); }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault(); setUserMsg("Creating account...");
    try {
      const response = await fetch(`${API_BASE}/api/v1/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username: newUserId, password: newUserPassword, name: newUserName, role: newUserRole })
      });
      const result = await response.json();
      if (response.ok) { playUISound('success'); setUserMsg(`✅ ${result.message}`); setNewUserId(''); setNewUserName(''); setNewUserPassword(''); fetchUsers(); } 
      else { playUISound('error'); setUserMsg(`❌ ${result.error}`); }
    } catch { playUISound('error'); setUserMsg("❌ Connection failed."); }
  };

  const handleDeleteUser = async (usernameToDelete: string) => {
    if (!window.confirm(`Permanently remove account: ${usernameToDelete}?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/v1/users/${usernameToDelete}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) { playUISound('logout'); fetchUsers(); } 
      else { playUISound('error'); const result = await response.json(); alert(`Error: ${result.error}`); }
    } catch { playUISound('error'); alert("Connection failed."); }
  };

  const handleEditSubmit = async (oldUsername: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/v1/users/${oldUsername}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ new_username: editForm.newUsername, new_password: editForm.newPassword })
      });
      if (response.ok) { playUISound('success'); setEditingUserId(null); fetchUsers(); } 
      else { playUISound('error'); const result = await response.json(); alert(`Error: ${result.error}`); }
    } catch { playUISound('error'); alert("Connection failed."); }
  };

  const EyeIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
  const EyeOffIcon = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>);

  const getRoleAnimationClass = () => {
    if (role === 'district_admin') return 'glow-admin';
    if (role === 'co_admin') return 'glow-coadmin';
    if (role === 'asha') return 'glow-asha';
    if (role === 'anganwadi') return 'glow-anganwadi';
    return '';
  };

  return (
    <>
      <style>{`
        body { margin: 0; background: linear-gradient(135deg, #064e3b 0%, #022c22 50%, #0f172a 100%); background-attachment: fixed; color: #f1f5f9; overflow-x: hidden; font-family: 'Segoe UI', system-ui, sans-serif; min-height: 100vh; }
        * { box-sizing: border-box; }
        .main-container { padding: 40px 20px; max-width: 1100px; margin: 0 auto; width: 100%; }
        .glass-card { background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 14px; box-shadow: 0 15px 35px -5px rgba(0, 0, 0, 0.4); color: #f8fafc; }
        .table-wrapper { overflow-x: auto; width: 100%; -webkit-overflow-scrolling: touch; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 32px; }
        .admin-layout { display: grid; grid-template-columns: 1fr 2fr; gap: 24px; }
        .worker-form { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 16px; align-items: end; margin-top: 16px; }
        .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid rgba(52, 211, 153, 0.2); padding-bottom: 20px; margin-bottom: 30px; }
        .input-field { transition: all 0.2s; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; color: white; outline: none; width: 100%; padding: 12px; border-radius: 8px; }
        .input-field:focus { border-color: #34d399; box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.2); }
        .btn { transition: all 0.2s; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 12px -2px rgba(52, 211, 153, 0.3); filter: brightness(1.15); }
        .fade-in { animation: fadeIn 0.8s ease-out forwards; }
        .slide-up { animation: slideUp 0.6s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blinkLive { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        .live-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; animation: blinkLive 1.5s infinite; }
        @keyframes pulseAdmin { 0% { box-shadow: 0 0 0px rgba(52, 211, 153, 0); } 50% { box-shadow: 0 0 25px rgba(52, 211, 153, 0.4); border-color: #34d399; } 100% { box-shadow: 0 0 0px rgba(52, 211, 153, 0); } }
        @keyframes pulseCoAdmin { 0% { box-shadow: 0 0 0px rgba(167, 139, 250, 0); } 50% { box-shadow: 0 0 25px rgba(167, 139, 250, 0.4); border-color: #a78bfa; } 100% { box-shadow: 0 0 0px rgba(167, 139, 250, 0); } }
        @keyframes pulseAsha { 0% { box-shadow: 0 0 0px rgba(52, 211, 153, 0); } 50% { box-shadow: 0 0 25px rgba(52, 211, 153, 0.4); border-color: #34d399; } 100% { box-shadow: 0 0 0px rgba(52, 211, 153, 0); } }
        @keyframes pulseAnganwadi { 0% { box-shadow: 0 0 0px rgba(251, 146, 60, 0); } 50% { box-shadow: 0 0 25px rgba(251, 146, 60, 0.4); border-color: #fb923c; } 100% { box-shadow: 0 0 0px rgba(251, 146, 60, 0); } }
        .glow-admin { animation: pulseAdmin 3s infinite; border: 1px solid #34d399; }
        .glow-coadmin { animation: pulseCoAdmin 3s infinite; border: 1px solid #a78bfa; }
        .glow-asha { animation: pulseAsha 3s infinite; border: 1px solid #34d399; }
        .glow-anganwadi { animation: pulseAnganwadi 3s infinite; border: 1px solid #fb923c; }
        @media (max-width: 850px) {
          .main-container { padding: 16px; } .admin-layout { grid-template-columns: 1fr; } .worker-form { grid-template-columns: 1fr; }
          .header-container { flex-direction: column; align-items: flex-start; gap: 16px; } .header-container .btn { width: 100%; }
          .admin-tabs { display: grid !important; grid-template-columns: 1fr; gap: 8px; }
          .user-list-item { flex-direction: column; align-items: flex-start !important; gap: 12px; }
          .user-list-actions { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .user-list-actions button { width: 100%; } h1 { font-size: 1.5rem !important; }
        }
      `}</style>

      {/* --- PUBLIC DASHBOARD --- */}
      {!token && !showLoginView && (
        <div className="main-container fade-in">
          <header className="header-container">
            <div>
              <h1 style={{ margin: 0, background: '-webkit-linear-gradient(45deg, #34d399, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '2rem' }}>Techfest 2026: Public Node</h1>
              <p style={{ color: '#94a3b8', margin: '8px 0 0 0', fontWeight: '500' }}>DPDP-Compliant Anonymized Health Transparency</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                <span className="live-dot" style={{ backgroundColor: '#34d399', boxShadow: '0 0 8px #34d399' }}></span>
                <span style={{ color: '#34d399', fontSize: '13px', fontWeight: 'bold' }}>Live Sync Active</span>
              </div>
            </div>
            <button className="btn" onClick={() => { playUISound('click'); setShowLoginView(true); }} style={{ backgroundColor: '#10b981', color: 'white', border: 'none' }}>
              Official Login
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
            </button>
          </header>

          {publicData ? (
            <div className="slide-up">
               <div className="stat-grid">
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #38bdf8' }}>
                  <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '3rem' }}>{publicData.total_tracked}</h2><p style={{ margin: '8px 0 0 0', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>Total Tracked</p>
                </div>
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #34d399' }}>
                  <h2 style={{ margin: 0, color: '#34d399', fontSize: '3rem' }}>{publicData.normal_cases}</h2><p style={{ margin: '8px 0 0 0', color: '#34d399', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>Healthy Status</p>
                </div>
                <div className="glass-card" style={{ padding: '30px', textAlign: 'center', borderTop: '4px solid #f87171' }}>
                  <h2 style={{ margin: 0, color: '#f87171', fontSize: '3rem' }}>{publicData.severe_cases + publicData.moderate_cases}</h2><p style={{ margin: '8px 0 0 0', color: '#f87171', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '12px' }}>At-Risk Alerts</p>
                </div>
              </div>
              <div className="glass-card" style={{ padding: '24px' }}>
                <h3 style={{ marginTop: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>Live Anonymized Interventions</h3>
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                  {publicData.recent_entries.map((entry, idx) => (
                    <li key={idx} style={{ padding: '16px', borderBottom: idx === publicData.recent_entries.length -1 ? 'none' : '1px solid rgba(51, 65, 85, 0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '15px' }}>Weight: <strong style={{ fontSize: '18px', color: '#e2e8f0' }}>{entry.weight} kg</strong></span>
                      <span style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', backgroundColor: entry.status === 'normal' ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: entry.status === 'normal' ? '#34d399' : '#f87171' }}>{entry.status.replace(/_/g, ' ').toUpperCase()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : <p style={{ textAlign: 'center', color: '#94a3b8' }}>Establishing secure connection to health grid...</p>}
        </div>
      )}

      {/* --- LOGIN SCREEN --- */}
      {!token && showLoginView && (
        <div className="fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #064e3b 0%, #022c22 50%, #0f172a 100%)', padding: '16px' }}>
          <div className="slide-up glass-card" style={{ padding: '30px', width: '100%', maxWidth: '400px' }}>
            <button className="btn" onClick={() => { playUISound('click'); setShowLoginView(false); }} style={{ background: 'none', border: 'none', color: '#94a3b8', boxShadow: 'none', padding: 0, justifyContent: 'flex-start', marginBottom: '24px', fontSize: '14px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Back to Portal</button>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <div style={{ background: '#10b981', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>
              <h2 style={{ margin: '0', color: '#f8fafc', fontSize: '24px' }}>Secure Gateway</h2><p style={{ margin: '8px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>Authorized personnel only</p>
            </div>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div><label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '6px' }}>System User ID</label><input className="input-field" type="text" required placeholder="Enter your ID" value={loginUsername} onChange={e => { playUISound('click'); setLoginUsername(e.target.value); }} /></div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '6px' }}>Access Password</label>
                <div style={{ position: 'relative' }}>
                  <input className="input-field" type={showPassword ? "text" : "password"} required placeholder="Enter password" value={loginPassword} onChange={e => { playUISound('click'); setLoginPassword(e.target.value); }} style={{ paddingRight: '45px' }} />
                  <button type="button" onClick={() => { playUISound('click'); setShowPassword(!showPassword); }} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center' }}>{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button>
                </div>
              </div>
              <button className="btn" type="submit" onClick={() => playUISound('click')} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', marginTop: '8px', fontSize: '16px' }}>Authenticate</button>
            </form>
            {loginError && <div className="slide-up" style={{ backgroundColor: 'rgba(248, 113, 113, 0.2)', color: '#f87171', padding: '12px', borderRadius: '8px', textAlign: 'center', marginTop: '16px', fontSize: '14px', fontWeight: '500', border: '1px solid rgba(248, 113, 113, 0.4)' }}>{loginError}</div>}
          </div>
        </div>
      )}

      {/* --- SECURE DASHBOARD --- */}
      {token && (
        <div className="main-container fade-in">
          <header className={`glass-card header-container ${getRoleAnimationClass()}`} style={{ padding: '24px' }}>
            <div>
              <h1 style={{ margin: 0, color: '#f8fafc', fontSize: '1.5rem' }}>Interoperability Node</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontSize: '14px' }}>User: <strong>{userName}</strong></span>
                <span style={{ padding: '4px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', backgroundColor: 'rgba(52, 211, 153, 0.2)', color: '#34d399' }}>{role?.replace(/_/g, ' ').toUpperCase()}</span>
                {hasDashboardAccess && adminTab === 'alerts' && (<span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#475569' }}>|</span><span className="live-dot" style={{ backgroundColor: '#f87171', boxShadow: '0 0 8px #f87171' }}></span><span style={{ color: '#f87171', fontSize: '11px', fontWeight: 'bold' }}>Live</span></span>)}
              </div>
            </div>
            <button className="btn" onClick={handleLogout} style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Logout</button>
          </header>

          {/* WORKER VIEW */}
          {isWorker && (
            <div className="slide-up glass-card" style={{ padding: '24px', borderTop: role === 'asha' ? '4px solid #34d399' : '4px solid #fb923c', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
                <button onClick={() => { playUISound('click'); setShowWorkerMenu(!showWorkerMenu); }} style={{ background: 'rgba(30, 41, 59, 0.8)', border: '1px solid #334155', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#cbd5e1' }} title="Worker Security Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></button>
                {showWorkerMenu && (
                  <div className="fade-in glass-card" style={{ position: 'absolute', right: '0', top: '45px', width: '290px', padding: '16px', zIndex: 10, boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#34d399', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>Security: Phone/Email OTP Update</h4>
                    {otpStep === 'request' ? (
                      <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#cbd5e1' }}>Phone Number or Email ID</label>
                        <input className="input-field" type="text" required placeholder="e.g. user@gov.in or 9876543210" value={identifierInput} onChange={e => { playUISound('click'); setIdentifierInput(e.target.value); }} style={{ padding: '8px', fontSize: '12px' }} />
                        <button className="btn" type="submit" onClick={() => playUISound('click')} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '10px', fontSize: '12px', marginTop: '4px' }}>Send OTP</button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyAndChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#cbd5e1' }}>Enter 4-Digit OTP</label><input className="input-field" type="text" maxLength={4} required placeholder="e.g. 4821" value={enteredOtp} onChange={e => { playUISound('click'); setEnteredOtp(e.target.value); }} style={{ padding: '8px', fontSize: '13px', textAlign: 'center', letterSpacing: '4px' }} />
                        <label style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '4px' }}>New Password</label><input className="input-field" type="password" required placeholder="New password" value={selfNewPassword} onChange={e => { playUISound('click'); setSelfNewPassword(e.target.value); }} style={{ padding: '8px', fontSize: '13px' }} />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <button className="btn" type="submit" onClick={() => playUISound('click')} style={{ flex: 1, backgroundColor: '#10b981', color: 'white', border: 'none', padding: '8px', fontSize: '12px' }}>Verify & Save</button>
                          <button className="btn" type="button" onClick={() => { playUISound('click'); setOtpStep('request'); setSelfPasswordMsg(''); }} style={{ backgroundColor: '#64748b', color: 'white', border: 'none', padding: '8px', fontSize: '12px' }}>Back</button>
                        </div>
                      </form>
                    )}
                    {selfPasswordMsg && <div className="fade-in" style={{ marginTop: '8px', padding: '6px', borderRadius: '4px', fontSize: '11px', backgroundColor: selfPasswordMsg.includes('✅') ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: selfPasswordMsg.includes('✅') ? '#34d399' : '#f87171' }}>{selfPasswordMsg}</div>}
                  </div>
                )}
              </div>
              <h2 style={{ marginTop: 0, color: '#f8fafc', fontSize: '1.2rem' }}>Enter Health Assessment</h2>
              <form onSubmit={handleDataSubmit} className="worker-form">
                <div><label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '6px' }}>Registered Child ID</label><input className="input-field" type="text" required value={childId} onChange={e => { playUISound('click'); setChildId(e.target.value); }} placeholder="e.g. C501" /></div>
                <div><label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#cbd5e1', marginBottom: '6px' }}>Weight (kg)</label><input className="input-field" type="number" step="0.1" required value={weight} onChange={e => { playUISound('click'); setWeight(e.target.value); }} placeholder="0.0" /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', height: '45px' }}><input type="checkbox" id="consent" checked={consent} onChange={e => { playUISound('click'); setConsent(e.target.checked); }} style={{ width: '20px', height: '20px', accentColor: '#34d399', cursor: 'pointer' }}/><label htmlFor="consent" style={{ fontSize: '14px', fontWeight: '600', color: '#cbd5e1', cursor: 'pointer' }}>Consent Verified</label></div>
                <button className="btn" type="submit" onClick={() => playUISound('click')} style={{ backgroundColor: '#10b981', color: 'white', border: 'none', height: '45px' }}>Sync Data</button>
              </form>
              {submitMessage && <div className="fade-in" style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', fontWeight: '500', fontSize: '14px', backgroundColor: submitMessage.includes('✅') ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: submitMessage.includes('✅') ? '#34d399' : '#f87171', border: `1px solid ${submitMessage.includes('✅') ? 'rgba(52, 211, 153, 0.4)' : 'rgba(248, 113, 113, 0.4)'}` }}>{submitMessage}</div>}
            </div>
          )}

          {/* ADMIN VIEW */}
          {hasDashboardAccess && (
            <div className="slide-up">
              <div className="admin-tabs" style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <button className="btn" onClick={() => { playUISound('click'); setAdminTab('alerts'); }} style={{ backgroundColor: adminTab === 'alerts' ? '#10b981' : 'rgba(30, 41, 59, 0.8)', color: adminTab === 'alerts' ? 'white' : '#cbd5e1', border: adminTab === 'alerts' ? 'none' : '1px solid #334155', flex: 1 }}>Early Warning Alerts</button>
                <button className="btn" onClick={() => { playUISound('click'); setAdminTab('users'); }} style={{ backgroundColor: adminTab === 'users' ? '#10b981' : 'rgba(30, 41, 59, 0.8)', color: adminTab === 'users' ? 'white' : '#cbd5e1', border: adminTab === 'users' ? 'none' : '1px solid #334155', flex: 1 }}>System Users</button>
              </div>

              {adminTab === 'alerts' && (
                <div className="fade-in">
                  <div className="glass-card" style={{ padding: '16px', marginBottom: '16px', backgroundColor: 'rgba(248, 113, 113, 0.15)', border: '1px solid rgba(248, 113, 113, 0.3)', borderLeft: '6px solid #f87171' }}>
                    <h3 style={{ color: '#f87171', margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Escalations Pending: {alerts.length}</h3>
                  </div>
                  <div className="glass-card table-wrapper" style={{ padding: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '400px' }}>
                      <thead><tr style={{ backgroundColor: 'rgba(30, 41, 59, 0.9)', borderBottom: '2px solid rgba(52, 211, 153, 0.2)' }}><th style={{ padding: '16px', color: '#cbd5e1' }}>Child ID</th><th style={{ padding: '16px', color: '#cbd5e1' }}>Weight</th><th style={{ padding: '16px', color: '#cbd5e1' }}>Status</th></tr></thead>
                      <tbody>
                        {alerts.map((a, i) => (
                          <tr key={a.child_id} style={{ borderBottom: i === alerts.length -1 ? 'none' : '1px solid rgba(51, 65, 85, 0.5)' }}>
                            <td style={{ padding: '16px', fontWeight: 'bold', color: '#f8fafc' }}>{a.child_id}</td><td style={{ padding: '16px', color: '#cbd5e1' }}>{a.weight} kg</td>
                            <td style={{ padding: '16px', color: '#f87171', fontWeight: 'bold' }}><span style={{ padding: '4px 8px', backgroundColor: 'rgba(248, 113, 113, 0.2)', borderRadius: '4px', fontSize: '12px' }}>{a.status.replace(/_/g, ' ').toUpperCase()}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {adminTab === 'users' && (
                <div className="fade-in admin-layout">
                  <div className="glass-card" style={{ padding: '24px', height: 'fit-content' }}>
                    <h3 style={{ marginTop: 0, color: '#f8fafc', borderBottom: '1px solid rgba(52, 211, 153, 0.2)', paddingBottom: '12px', fontSize: '1.1rem' }}>Provision Account</h3>
                    <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                      <input className="input-field" type="text" placeholder="User ID (e.g. asha_01)" required value={newUserId} onChange={e => { playUISound('click'); setNewUserId(e.target.value); }} />
                      <input className="input-field" type="text" placeholder="Full Name / Facility" required value={newUserName} onChange={e => { playUISound('click'); setNewUserName(e.target.value); }} />
                      <select className="input-field" value={newUserRole} onChange={e => { playUISound('click'); setNewUserRole(e.target.value); }} style={{ backgroundColor: '#1e293b' }}><option value="anganwadi">Anganwadi Worker</option><option value="asha">ASHA Worker</option>{isSuperAdmin && <option value="co_admin">Co-Admin Manager</option>}{isSuperAdmin && <option value="district_admin">District Super Admin</option>}</select>
                      <input className="input-field" type="text" placeholder="Temporary Password" required value={newUserPassword} onChange={e => { playUISound('click'); setNewUserPassword(e.target.value); }} />
                      <button className="btn" type="submit" onClick={() => playUISound('click')} style={{ backgroundColor: '#10b981', color: 'white', border: 'none' }}>Provision User</button>
                    </form>
                    {userMsg && <div className="fade-in" style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', backgroundColor: userMsg.includes('✅') ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: userMsg.includes('✅') ? '#34d399' : '#f87171' }}>{userMsg}</div>}
                  </div>
                  <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ marginTop: 0, color: '#f8fafc', borderBottom: '1px solid rgba(52, 211, 153, 0.2)', paddingBottom: '12px', fontSize: '1.1rem' }}>Network Directory</h3>
                    <ul style={{ listStyleType: 'none', padding: 0, margin: 0, marginTop: '16px' }}>
                      {users.map((u, i) => (
                        <li key={u.username} style={{ padding: '16px 0', borderBottom: i === users.length -1 ? 'none' : '1px solid rgba(51, 65, 85, 0.5)' }}>
                          {editingUserId === u.username ? (
                            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: 'rgba(30, 41, 59, 0.9)', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                              <div><div style={{ fontSize: '15px', fontWeight: 'bold', color: '#f8fafc' }}>Editing: {u.name}</div><div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>Role: <span style={{ padding: '2px 6px', backgroundColor: 'rgba(52, 211, 153, 0.2)', borderRadius: '4px', fontWeight: 'bold', color: '#34d399' }}>{u.role.replace(/_/g, ' ').toUpperCase()}</span></div></div>
                              {isSuperAdmin && (<div><label style={{ fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>User ID (Admin Only)</label><input className="input-field" type="text" value={editForm.newUsername} onChange={(e) => { playUISound('click'); setEditForm({...editForm, newUsername: e.target.value}); }} /></div>)}
                              <div><label style={{ fontSize: '12px', fontWeight: 'bold', color: '#cbd5e1', display: 'block', marginBottom: '4px' }}>New Password</label><input className="input-field" type="text" value={editForm.newPassword} onChange={(e) => { playUISound('click'); setEditForm({...editForm, newPassword: e.target.value}); }} placeholder="New Password" /></div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}><button className="btn" onClick={() => { playUISound('click'); handleEditSubmit(u.username); }} style={{ backgroundColor: '#2563eb', color: 'white', border: 'none' }}>Save</button><button className="btn" onClick={() => { playUISound('click'); setEditingUserId(null); }} style={{ backgroundColor: '#64748b', color: 'white', border: 'none' }}>Cancel</button></div>
                            </div>
                          ) : (
                            <div className="user-list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#f8fafc' }}>{u.name}</div>
                                <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>ID: <code style={{ backgroundColor: 'rgba(30, 41, 59, 0.8)', padding: '2px 6px', borderRadius: '4px', color: '#e2e8f0' }}>{u.username}</code><span style={{ padding: '2px 8px', backgroundColor: u.role.includes('admin') ? 'rgba(56, 189, 248, 0.2)' : 'rgba(244, 114, 182, 0.2)', color: u.role.includes('admin') ? '#38bdf8' : '#f472b6', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }}>{u.role.replace(/_/g, ' ').toUpperCase()}</span></div>
                                {isSuperAdmin && <div style={{ color: '#fbbf24', fontSize: '12px', marginTop: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Password: {u.password}</div>}
                              </div>
                              <div className="user-list-actions" style={{ display: 'flex', gap: '8px' }}>
                                {isSuperAdmin && <button className="btn" onClick={() => { playUISound('click'); setEditingUserId(u.username); setEditForm({ newUsername: u.username, newPassword: u.password || '' }); }} style={{ padding: '8px 12px', backgroundColor: '#f59e0b', color: 'white', border: 'none', fontSize: '12px' }}>Edit</button>}
                                {isCoAdmin && <button className="btn" onClick={() => { playUISound('click'); setEditingUserId(u.username); setEditForm({ newUsername: u.username, newPassword: u.password || '' }); }} style={{ padding: '8px 12px', backgroundColor: '#f59e0b', color: 'white', border: 'none', fontSize: '12px' }}>Change Pwd</button>}
                                {(isSuperAdmin || (u.role !== 'district_admin' && u.role !== 'co_admin')) && <button className="btn" onClick={() => { playUISound('click'); handleDeleteUser(u.username); }} style={{ padding: '8px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', fontSize: '12px' }}>Revoke</button>}
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}