import { useEffect, useRef, useState } from 'react'
import './Dashboard.css'

const statusNames = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', in_use: 'In use', completed: 'Returned', available: 'Available', reserved: 'Reserved', maintenance: 'Maintenance', archived: 'Archived' }
const date = value => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const dayKey = value => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const localTime = value => { const d = new Date(value); return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
const emptyEquipment = { name: '', assetCode: '', category: 'Electronics', location: '', description: '', instructions: '', status: 'available' }

async function api(path, body, method = 'POST', signal) {
  const response = await fetch(`/api/lab${path}`, {
    method: body === undefined ? 'GET' : method, credentials: 'same-origin', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  })
  const data = await response.json().catch(() => ({ message: 'Cannot reach the server. Check your connection.' }))
  if (!response.ok) { const error = new Error(data.message || 'Request failed.'); error.status = response.status; throw error }
  return data
}

function Symbol({ name = 'equipment', size = 20 }) {
  const paths = {
    equipment: 'M3 4h18v12H3zM8 21h8M12 16v5M6 11l3-4 4 6 3-4 2 2',
    dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    bookings: 'M5 4h14v17H5zM9 2h6v4H9zM8 10h8M8 14h8M8 18h5',
    calendar: 'M3 5h18v16H3zM7 2v6M17 2v6M3 10h18M7 14h2M13 14h2M7 18h2',
    users: 'M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 21v-3a7 7 0 0 1 14 0v3M18 4a4 4 0 0 1 0 8M19 15a5 5 0 0 1 3 5',
    reports: 'M4 3h16v18H4zM8 17v-4M12 17V8M16 17v-7',
    settings: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21a8 8 0 0 1 16 0',
    flask: 'M9 3h6M10 3v7l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M8 15h8',
    arrow: 'M4 12h16M14 6l6 6-6 6', plus: 'M12 5v14M5 12h14', search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0M15 15l6 6',
    logout: 'M9 3H3v18h6M9 12h12M16 7l5 5-5 5', close: 'M6 6l12 12M6 18L18 6',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 6v6l4 2', check: 'M4 12l5 5L20 6',
    location: 'M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0M14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    microscope: 'M10 3l5 3-4 7-5-3zM13 10a6 6 0 0 1 2 11H3M5 15h9M8 15v6',
    refresh: 'M20 7a9 9 0 1 0 1 9M20 3v5h-5', download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5'
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.equipment} /></svg>
}
function Badge({ status, overdue }) { return <span className={`ws-badge ${overdue ? 'overdue' : status}`}>{overdue ? 'Overdue' : statusNames[status] || status}</span> }
function Empty({ title, children }) { return <div className="ws-empty"><Symbol name="flask" size={32} /><h3>{title}</h3><p>{children}</p></div> }

function Modal({ title, children, onClose, busy }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className="ws-dialog" aria-labelledby="dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="ws-dialog-head"><h2 id="dialog-title">{title}</h2><button className="ws-icon-button" onClick={onClose} disabled={busy} aria-label="Close dialog"><Symbol name="close" /></button></div>
    {children}
  </dialog>
}

function EquipmentCard({ item, admin, onOpen, onEdit }) {
  return <article className="ws-equipment-card">
    <button className={`ws-equipment-visual category-${item.category.toLowerCase().replace(/[^a-z]/g, '')}`} onClick={() => onOpen(item)} aria-label={`View ${item.name}`}>
      <div className="ws-orbit" /><Symbol name={item.category === 'Microscopy' ? 'microscope' : item.category === 'Chemistry' || item.category === 'Life sciences' ? 'flask' : 'equipment'} size={64} />
      <span className="ws-asset-code">{item.assetCode}</span>{item.sample && <span className="ws-sample">SAMPLE</span>}
    </button>
    <div className="ws-equipment-body"><div className="ws-card-meta"><span>{item.category}</span><Badge status={item.availability} /></div><h3>{item.name}</h3><p className="ws-location"><Symbol name="location" size={14} />{item.location}</p><p className="ws-description">{item.description || 'Contact the lab administrator for more information.'}</p>
      <div className="ws-card-actions"><button className="ws-button secondary" onClick={() => onOpen(item)}>{admin ? 'View schedule' : 'Details & booking'}<Symbol name="arrow" size={16} /></button>{admin && <button className="ws-text-button" onClick={() => onEdit(item)}>Edit</button>}</div>
    </div>
  </article>
}

function BookingList({ bookings, admin, onAction, compact = false }) {
  if (!bookings.length) return <Empty title="No bookings here yet">Your booking activity will appear here.</Empty>
  return <div className="ws-booking-list">{bookings.map(b => <article className="ws-booking-row" key={b._id}>
    <div className="ws-booking-icon"><Symbol name="equipment" size={22} /></div>
    <div className="ws-booking-main"><div className="ws-row-title"><h3>{b.equipment.name}</h3><Badge status={b.status} overdue={b.overdue} /></div>
      <p>{date(b.start)} — {date(b.end)}</p><p className="ws-muted">{admin ? `${b.user.name || b.user.email} · ${b.user.registrationNumber || b.user.email || 'Administrator'}` : b.equipment.location}</p>
      {!compact && <><p className="ws-purpose">{b.purpose}</p>{b.note && <p className="ws-review-note">Review note: {b.note}</p>}<span className="ws-reference">REF {b._id.slice(-8).toUpperCase()} · {b.equipment.assetCode}</span></>}
    </div>
    {!compact && <div className="ws-row-actions">
      {admin && b.status === 'pending' && <><button className="ws-button small" onClick={() => onAction(b, 'approve')}>Approve</button><button className="ws-button secondary small" onClick={() => onAction(b, 'reject')}>Reject</button></>}
      {admin && b.status === 'approved' && <button className="ws-button small" disabled={new Date(b.start) > new Date() || new Date(b.end) <= new Date()} title="Available during the approved booking time" onClick={() => onAction(b, 'checkout')}>Check out</button>}
      {admin && b.status === 'in_use' && <button className="ws-button small" onClick={() => onAction(b, 'return')}>Record return</button>}
      {['pending', 'approved'].includes(b.status) && <button className="ws-text-button danger" onClick={() => onAction(b, 'cancel')}>Cancel</button>}
    </div>}
  </article>)}</div>
}

function exportBookings(bookings) {
  const cell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`
  const rows = [['Reference', 'Equipment', 'Asset code', 'Student', 'Email', 'Start', 'End', 'Status', 'Purpose', 'Review note'], ...bookings.map(b => [b._id, b.equipment.name, b.equipment.assetCode, b.user.name, b.user.email, b.start, b.end, b.status, b.purpose, b.note])]
  const blob = new Blob(['\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = `lab-track-bookings-${dayKey(new Date())}.csv`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function Dashboard({ user, onLogout, loggingOut, logoutError, onExpired, onProfile }) {
  const admin = user.role === 'admin'
  const navigation = [['overview', 'dashboard', 'Overview'], ['equipment', 'equipment', 'Equipment'], ['bookings', 'bookings', admin ? 'Booking requests' : 'My bookings'], ['calendar', 'calendar', 'Schedule'], ...(admin ? [['members', 'users', 'Members'], ['reports', 'reports', 'Reports']] : []), ['account', 'settings', 'My account']]
  const initialPage = () => navigation.some(n => n[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'overview'
  const [page, setPage] = useState(initialPage)
  const [equipment, setEquipment] = useState([])
  const [bookings, setBookings] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [bookingFilter, setBookingFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [modalError, setModalError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(emptyEquipment)
  const [slot, setSlot] = useState({ start: '', end: '', purpose: '' })
  const [note, setNote] = useState('')
  const [calendarDay, setCalendarDay] = useState(dayKey(new Date()))
  const [profile, setProfile] = useState({ name: user.name, registrationNumber: user.registrationNumber })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirm: '' })

  useEffect(() => {
    function changed() { setPage(initialPage()) }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
    // Navigation is determined by the authenticated role, which stays fixed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin])
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const [items, requests, people] = await Promise.all([api('/equipment', undefined, undefined, controller.signal), api('/bookings', undefined, undefined, controller.signal), admin ? api('/members', undefined, undefined, controller.signal) : Promise.resolve({ members: [] })])
        if (!controller.signal.aborted) { setEquipment(items.equipment); setBookings(requests.bookings); setMembers(people.members); setError('') }
      } catch (err) { if (!controller.signal.aborted) { if (err.status === 401) onExpired(); else setError(err.message) } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    load()
    const timer = setInterval(load, 30000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [admin, reload, onExpired])

  const navigate = target => { location.hash = target; setPage(target); setNotice('') }
  const open = value => { setModalError(''); setNote(''); setModal(value) }
  const edit = item => { setDraft(item || { ...emptyEquipment }); open({ type: 'edit', item }) }
  const inspect = item => { const start = new Date(Date.now() + 3600000); start.setMinutes(0, 0, 0); setSlot({ start: localTime(start), end: localTime(new Date(+start + 3600000)), purpose: '' }); open({ type: 'detail', item }) }
  async function mutation(work, success, close = true) {
    setBusy(true); setModalError(''); setError(''); setNotice('')
    try { await work(); setNotice(success); if (close) setModal(null); setReload(n => n + 1) }
    catch (err) { if (err.status === 401) onExpired(); else if (modal) setModalError(err.message); else setError(err.message) }
    finally { setBusy(false) }
  }
  const activeEquipment = equipment.filter(e => e.status !== 'archived')
  const pending = bookings.filter(b => b.status === 'pending')
  const inUse = bookings.filter(b => b.status === 'in_use')
  const upcoming = bookings.filter(b => ['approved', 'in_use'].includes(b.status) && (new Date(b.end) > new Date() || b.status === 'in_use')).sort((a, b) => new Date(a.start) - new Date(b.start))
  const filteredItems = equipment.filter(e => (statusFilter === 'all' ? e.status !== 'archived' : e.availability === statusFilter) && (category === 'all' || e.category === category) && `${e.name} ${e.assetCode} ${e.location}`.toLowerCase().includes(search.toLowerCase()))
  const filteredBookings = bookings.filter(b => (bookingFilter === 'all' || (bookingFilter === 'overdue' ? b.overdue : b.status === bookingFilter)) && `${b.equipment.name} ${b.user.name} ${b.user.email} ${b.equipment.assetCode}`.toLowerCase().includes(search.toLowerCase()))
  const calendarStart = new Date(`${calendarDay}T00:00:00`)
  const calendarEnd = new Date(calendarStart); calendarEnd.setDate(calendarEnd.getDate() + 1)
  const scheduled = bookings.filter(b => ['approved', 'in_use'].includes(b.status) && new Date(b.start) < calendarEnd && new Date(b.end) > calendarStart).sort((a, b) => new Date(a.start) - new Date(b.start))
  const title = navigation.find(n => n[0] === page)?.[2] || 'Overview'

  return <div className="workspace">
    <aside className="ws-sidebar"><a className="ws-brand" href="#overview"><span><Symbol name="flask" size={25} /></span>Lab <strong>Track</strong></a><div className="ws-workspace-label">{admin ? 'ADMIN WORKSPACE' : 'STUDENT WORKSPACE'}</div>
      <nav aria-label="Main navigation">{navigation.map(([key, icon, label]) => <a href={`#${key}`} key={key} aria-current={page === key ? 'page' : undefined} onClick={() => { setSearch(''); setNotice('') }}><Symbol name={icon} /><span>{label}</span>{key === 'bookings' && pending.length > 0 && <b>{pending.length}</b>}</a>)}</nav>
      <div className="ws-sidebar-note"><Symbol name="flask" size={27} /><h3>A little curiosity.<br />A lot of possibility.</h3><p>Your next discovery starts here.</p></div>
      <button className="ws-profile-shortcut" onClick={() => navigate('account')}><span className="ws-avatar">{(user.name || user.email).slice(0, 1).toUpperCase()}</span><span><strong>{user.name || 'My account'}</strong><small>{admin ? 'Administrator' : 'Student'}</small></span></button>
      <button className="ws-logout" onClick={onLogout} disabled={loggingOut}><Symbol name="logout" size={17} />{loggingOut ? 'Logging out…' : 'Log out'}</button>
    </aside>
    <div className="ws-main"><header className="ws-topbar"><div><span className="ws-breadcrumb">Workspace <span>/</span> {title}</span><h1>{title}</h1></div><div className="ws-topbar-right"><span className="ws-today">{new Date().toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span><button className="ws-icon-button" onClick={() => setReload(n => n + 1)} aria-label="Refresh data"><Symbol name="refresh" /></button><span className="ws-avatar small">{(user.name || user.email).slice(0, 1).toUpperCase()}</span></div></header>
      <main className="ws-content">
        {(error || logoutError) && <div className="ws-alert error" role="alert">{error || logoutError}<button onClick={() => setReload(n => n + 1)}>Retry</button></div>}
        {notice && <div className="ws-alert" role="status"><Symbol name="check" size={18} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
        {loading ? <div className="ws-loading" role="status"><span className="loading-ring" />Loading your workspace…</div> : <>
        {page === 'overview' && <>
          <section className="ws-hero"><div><span className="ws-kicker">{admin ? 'EVERYTHING IN ITS PLACE' : 'MAKE ROOM FOR YOUR NEXT IDEA'}</span><h2>{admin ? 'A better day in the lab.' : `Welcome back, ${(user.name || 'researcher').split(' ')[0]}.`}</h2><p>{admin ? 'Keep equipment ready, requests moving, and your lab connected.' : 'Find the right equipment. Reserve your time. Get back to discovery.'}</p><button className="ws-button" onClick={() => { if (admin) setBookingFilter('pending'); navigate(admin ? 'bookings' : 'equipment') }}>{admin ? 'Review requests' : 'Explore equipment'}<Symbol name="arrow" size={17} /></button></div><div className="ws-hero-art" aria-hidden="true"><div /><Symbol name="microscope" size={114} /></div></section>
          <section className="ws-stat-grid" aria-label="Workspace statistics">{[
            [admin ? 'Equipment in inventory' : 'Equipment to explore', activeEquipment.length, 'equipment', 'Across your campus labs'],
            ['Pending requests', pending.length, 'clock', admin ? 'Waiting for your review' : 'Awaiting administrator approval'],
            [admin ? 'Currently checked out' : 'Upcoming & active', admin ? inUse.length : upcoming.length, 'calendar', admin ? `${inUse.filter(b => b.overdue).length} overdue returns` : 'Your confirmed lab time'],
            [admin ? 'In maintenance' : 'Completed bookings', admin ? equipment.filter(e => e.status === 'maintenance').length : bookings.filter(b => b.status === 'completed').length, 'check', admin ? 'Temporarily unavailable' : 'Equipment safely returned']
          ].map(([label, value, icon, hint]) => <article className="ws-stat" key={label}><div><span>{label}</span><Symbol name={icon} size={19} /></div><strong>{value.toString().padStart(2, '0')}</strong><small>{hint}</small></article>)}</section>
          <div className="ws-section-heading"><div><span className="ws-kicker">{admin ? 'KEEP THINGS MOVING' : 'YOUR NEXT LAB SESSION'}</span><h2>{admin ? 'Recent requests' : 'Upcoming bookings'}</h2></div><button className="ws-text-button" onClick={() => navigate('bookings')}>View all <Symbol name="arrow" size={16} /></button></div>
          <section className="ws-panel"><BookingList bookings={(admin ? pending : upcoming).slice(0, 3)} admin={admin} compact onAction={(b, action) => open({ type: 'action', booking: b, action })} /></section>
          <div className="ws-section-heading"><div><span className="ws-kicker">READY FOR DISCOVERY</span><h2>Explore the lab</h2></div><button className="ws-text-button" onClick={() => navigate('equipment')}>All equipment <Symbol name="arrow" size={16} /></button></div>
          <div className="ws-equipment-grid">{activeEquipment.slice(0, 3).map(item => <EquipmentCard key={item._id} item={item} admin={admin} onOpen={inspect} onEdit={edit} />)}</div>{!activeEquipment.length && <Empty title="Your inventory is ready to grow">{admin ? 'Add your first piece of equipment to get started.' : 'Your lab administrator will add equipment here.'}</Empty>}
        </>}
        {page === 'equipment' && <>
          <div className="ws-section-heading first"><div><h2>Find your next instrument.</h2><p>Browse individual assets, check schedules, and plan your lab time.</p></div>{admin && <button className="ws-button" onClick={() => edit(null)}><Symbol name="plus" size={18} />Add equipment</button>}</div>
          <div className="ws-toolbar"><label className="ws-search"><Symbol name="search" size={18} /><input aria-label="Search equipment" placeholder="Search equipment, asset code, or lab…" value={search} onChange={e => setSearch(e.target.value)} /></label><select aria-label="Filter category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{[...new Set(equipment.map(e => e.category))].sort().map(c => <option key={c}>{c}</option>)}</select><select aria-label="Filter availability" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All active equipment</option>{['available', 'reserved', 'in_use', 'maintenance', ...(admin ? ['archived'] : [])].map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select></div>
          <p className="ws-results">{filteredItems.length} items · Availability is shown for right now. Check each item's schedule for future bookings.</p>
          <div className="ws-equipment-grid">{filteredItems.map(item => <EquipmentCard key={item._id} item={item} admin={admin} onOpen={inspect} onEdit={edit} />)}</div>{!filteredItems.length && <Empty title="No matching equipment">Try another search or filter.{admin && <button className="ws-button" onClick={() => edit(null)}>Add equipment</button>}</Empty>}
        </>}
        {page === 'bookings' && <>
          <div className="ws-section-heading first"><div><h2>{admin ? 'From request to return.' : 'Your time in the lab.'}</h2><p>{admin ? 'Review requests, check out equipment, and record safe returns.' : 'Follow your requests and manage your upcoming sessions.'}</p></div>{!admin && <button className="ws-button" onClick={() => navigate('equipment')}><Symbol name="plus" size={17} />New booking</button>}</div>
          <div className="ws-filter-tabs">{['all', 'pending', 'approved', 'in_use', 'completed', 'rejected', 'cancelled', ...(admin ? ['overdue'] : [])].map(s => <button key={s} aria-pressed={bookingFilter === s} onClick={() => setBookingFilter(s)}>{s === 'all' ? 'All bookings' : s === 'overdue' ? 'Overdue' : statusNames[s]}</button>)}</div>
          <label className="ws-search standalone"><Symbol name="search" size={18} /><input aria-label="Search bookings" placeholder={admin ? 'Search equipment or student…' : 'Search your equipment…'} value={search} onChange={e => setSearch(e.target.value)} /></label>
          <section className="ws-panel"><BookingList bookings={filteredBookings} admin={admin} onAction={(b, action) => open({ type: 'action', booking: b, action })} /></section>
        </>}
        {page === 'calendar' && <>
          <div className="ws-section-heading first"><div><h2>A clear view of your day.</h2><p>{admin ? 'Approved sessions across the lab.' : 'Your approved and active sessions.'} Times use your device's local timezone.</p></div><label className="ws-date-picker">Select date<input type="date" value={calendarDay} required onChange={e => { if (e.target.value) setCalendarDay(e.target.value) }} /></label></div>
          <div className="ws-week-strip">{Array.from({ length: 7 }, (_, index) => { const d = new Date(calendarStart); d.setDate(d.getDate() - d.getDay() + index); return <button key={index} aria-pressed={dayKey(d) === calendarDay} onClick={() => setCalendarDay(dayKey(d))}><span>{d.toLocaleDateString([], { weekday: 'short' })}</span><strong>{d.getDate()}</strong></button> })}</div>
          <section className="ws-panel"><BookingList bookings={scheduled} admin={admin} onAction={(b, action) => open({ type: 'action', booking: b, action })} /></section>
        </>}
        {page === 'members' && admin && <>
          <div className="ws-section-heading first"><div><h2>Your lab community.</h2><p>{members.length} registered members. Account roles are assigned through registration.</p></div></div><label className="ws-search standalone"><Symbol name="search" size={18} /><input aria-label="Search members" placeholder="Search name, email, registration number…" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <div className="ws-panel ws-table-wrap"><table><thead><tr><th>Member</th><th>Email</th><th>Registration no.</th><th>Role</th></tr></thead><tbody>{members.filter(m => `${m.name} ${m.email} ${m.registrationNumber}`.toLowerCase().includes(search.toLowerCase())).map(m => <tr key={m._id}><td><strong>{m.name || 'Name not provided'}</strong></td><td>{m.email}</td><td>{m.registrationNumber || '—'}</td><td><span className="ws-badge approved">{m.role}</span></td></tr>)}</tbody></table></div>
        </>}
        {page === 'reports' && admin && <>
          <div className="ws-section-heading first"><div><h2>The story behind the activity.</h2><p>Live totals from all recorded bookings, including archived equipment.</p></div><button className="ws-button" onClick={() => exportBookings(bookings)} disabled={!bookings.length}><Symbol name="download" size={18} />Export bookings CSV</button></div>
          <div className="ws-report-grid"><section className="ws-panel ws-report"><h3>Booking outcomes</h3>{['pending', 'approved', 'in_use', 'completed', 'rejected', 'cancelled'].map(s => { const count = bookings.filter(b => b.status === s).length; return <div className="ws-report-line" key={s}><span>{statusNames[s]}</span><strong>{count}</strong><meter min="0" max={Math.max(bookings.length, 1)} value={count}>{count}</meter></div> })}</section><section className="ws-panel ws-report"><h3>Most requested equipment</h3>{equipment.map(e => ({ ...e, count: bookings.filter(b => b.equipment._id === e._id).length })).sort((a, b) => b.count - a.count).slice(0, 6).map(e => <div className="ws-report-line" key={e._id}><span>{e.name}</span><strong>{e.count}</strong><meter min="0" max={Math.max(bookings.length, 1)} value={e.count}>{e.count}</meter></div>)}{!equipment.length && <p>No equipment yet.</p>}</section></div>
          <section className="ws-panel ws-report"><h3>Returns needing attention</h3><BookingList bookings={inUse.filter(b => b.overdue)} admin={admin} onAction={(b, action) => open({ type: 'action', booking: b, action })} /></section>
        </>}
        {page === 'account' && <>
          <div className="ws-section-heading first"><div><h2>Make yourself at home.</h2><p>Keep your profile current and your account secure.</p></div></div><div className="ws-account-grid">
            <form className="ws-panel ws-form" onSubmit={event => { event.preventDefault(); mutation(async () => { const result = await api('/profile', profile, 'PATCH'); onProfile(result.user) }, 'Profile updated.', false) }}><h3>Profile details</h3><label>Full name<input required maxLength={100} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label><label>Email<input value={user.email} readOnly /></label>{!admin && <label>Registration number<input required maxLength={50} value={profile.registrationNumber} onChange={e => setProfile({ ...profile, registrationNumber: e.target.value })} /></label>}<p className="ws-muted">Role: {admin ? 'Administrator' : 'Student'}</p><button className="ws-button" disabled={busy}>Save profile</button></form>
            <form className="ws-panel ws-form" onSubmit={event => { event.preventDefault(); if (passwords.newPassword !== passwords.confirm) { setError('New passwords do not match.'); return } mutation(async () => { await api('/password', passwords); onExpired('Password updated. Please log in again.') }, 'Password updated.', false) }}><h3>Change password</h3><p className="ws-muted">Changing your password signs you out on every device.</p><label>Current password<input type="password" autoComplete="current-password" required value={passwords.currentPassword} onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })} /></label><label>New password<input type="password" autoComplete="new-password" required minLength={8} value={passwords.newPassword} onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })} /></label><label>Confirm new password<input type="password" autoComplete="new-password" required minLength={8} value={passwords.confirm} onChange={e => setPasswords({ ...passwords, confirm: e.target.value })} /></label><button className="ws-button secondary" disabled={busy}>Update password</button></form>
          </div>
        </>}
        </>}
        <footer className="ws-footer"><span>Lab Track · University lab workspace</span><span>All times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}</span></footer>
      </main>
    </div>

    {modal && <Modal title={modal.type === 'edit' ? modal.item ? 'Edit equipment' : 'Add equipment' : modal.type === 'detail' ? modal.item.name : ({ approve: 'Approve booking', reject: 'Reject booking', cancel: 'Cancel booking', checkout: 'Check out equipment', return: 'Record equipment return' }[modal.action])} onClose={() => setModal(null)} busy={busy}>
      {modalError && <div className="ws-alert error" role="alert">{modalError}</div>}
      {modal.type === 'edit' && <form className="ws-form" onSubmit={event => { event.preventDefault(); mutation(() => api(modal.item ? `/equipment/${modal.item._id}` : '/equipment', draft, modal.item ? 'PATCH' : 'POST'), 'Equipment saved.') }}>
        <div className="ws-form-grid"><label>Equipment name<input required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Asset code<input required maxLength={50} value={draft.assetCode} onChange={e => setDraft({ ...draft, assetCode: e.target.value })} /></label><label>Category<input required maxLength={60} list="category-options" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} /><datalist id="category-options">{['Electronics', 'Microscopy', 'Life sciences', 'Chemistry', 'Physics'].map(c => <option key={c}>{c}</option>)}</datalist></label><label>Lab / location<input required maxLength={120} value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label></div>
        <label>Description<textarea maxLength={2000} rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label>Use & safety instructions<textarea maxLength={2000} rows={3} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} /></label>
        {modal.item && <label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}>{['available', 'maintenance', 'archived'].map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select></label>}<p className="ws-muted">One record = one physical item. Archiving preserves booking history. Resolve active bookings before maintenance or archiving.</p><button className="ws-button" disabled={busy}>{busy ? 'Saving…' : 'Save equipment'}</button>
      </form>}
      {modal.type === 'detail' && <div className="ws-detail"><div className="ws-detail-meta"><Badge status={modal.item.availability} /><span>{modal.item.assetCode}</span>{modal.item.sample && <span className="ws-badge">Sample equipment</span>}</div><p className="ws-location"><Symbol name="location" size={16} />{modal.item.location}</p><p>{modal.item.description}</p>{modal.item.instructions && <div className="ws-instructions"><h3>Before you begin</h3><p>{modal.item.instructions}</p></div>}
        <h3>Reserved time</h3>{modal.item.schedule.length ? <ul className="ws-reservations">{modal.item.schedule.map((s, i) => <li key={i}><Symbol name="clock" size={15} /><span>{date(s.start)} — {date(s.end)}{s.status === 'in_use' && ' · In use'}</span></li>)}</ul> : <p className="ws-muted">No upcoming approved bookings. Availability is checked again when you submit.</p>}
        {!admin && modal.item.status === 'available' && <form className="ws-form ws-booking-form" onSubmit={event => { event.preventDefault(); mutation(() => api('/bookings', { equipmentId: modal.item._id, start: new Date(slot.start).toISOString(), end: new Date(slot.end).toISOString(), purpose: slot.purpose }), 'Your booking request has been sent for approval.') }}><h3>Request your time</h3><div className="ws-form-grid"><label>Start time<input type="datetime-local" required min={localTime(new Date())} value={slot.start} onChange={e => setSlot({ ...slot, start: e.target.value })} /></label><label>End time<input type="datetime-local" required min={slot.start} value={slot.end} onChange={e => setSlot({ ...slot, end: e.target.value })} /></label></div><label>Purpose / course<textarea required maxLength={1000} rows={3} placeholder="Tell us what you’ll be working on…" value={slot.purpose} onChange={e => setSlot({ ...slot, purpose: e.target.value })} /></label><p className="ws-muted">Up to 8 hours per booking, within the next 90 days. Your slot is confirmed only after administrator approval.</p><button className="ws-button" disabled={busy}>{busy ? 'Sending…' : 'Request booking'}<Symbol name="arrow" size={16} /></button></form>}
        {!admin && modal.item.status !== 'available' && <p className="ws-alert">This item is currently unavailable for booking.</p>}
      </div>}
      {modal.type === 'action' && <form className="ws-form" onSubmit={event => { event.preventDefault(); mutation(() => api(`/bookings/${modal.booking._id}/action`, { action: modal.action, note }), 'Booking updated.') }}><h3>{modal.booking.equipment.name}</h3><p>{date(modal.booking.start)} — {date(modal.booking.end)}</p><p className="ws-muted">{modal.booking.purpose}</p><p>{{ approve: 'Approve this request and reserve the equipment for this time?', reject: 'Tell the student why this request cannot be approved.', cancel: 'Cancel this booking? The reserved time will be released.', checkout: 'Confirm that this equipment has been handed to the student.', return: 'Confirm that the equipment has been returned to the lab.' }[modal.action]}</p>{['reject', 'cancel'].includes(modal.action) && <label>{modal.action === 'reject' ? 'Reason (required)' : 'Reason (optional)'}<textarea rows={3} required={modal.action === 'reject'} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>}<div className="ws-dialog-actions"><button className="ws-button secondary" type="button" onClick={() => setModal(null)} disabled={busy}>Go back</button><button className="ws-button" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button></div></form>}
    </Modal>}
  </div>
}
