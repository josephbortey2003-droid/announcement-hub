"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bell, Building2, Check, ChevronDown, CircleAlert,
  Clock3, CreditCard, GraduationCap, KeyRound, LayoutList, Megaphone,
  MessageSquareText, MoreHorizontal, Plus, Radio, Search, Send, ShieldCheck,
  Smartphone, Users, WalletCards, X
} from "lucide-react";

type Portal = "creator" | "authority" | "member";
type View = "announcements" | "people" | "authorities" | "departments" | "delivery" | "billing";

const portals = [
  { id:"creator" as Portal, icon:Building2, eyebrow:"ORGANIZATION OWNER", title:"Create or manage a space", description:"Set up the organization, verify members, assign authority and manage delivery costs." },
  { id:"authority" as Portal, icon:ShieldCheck, eyebrow:"AUTHORIZED LEADER", title:"Publish official updates", description:"Send announcements to the people and departments within your assigned scope." },
  { id:"member" as Portal, icon:GraduationCap, eyebrow:"MEMBER · STAFF · STUDENT", title:"Enter your organization", description:"Read verified updates and receive urgent notices when you are offline." },
];

const announcements = [
  { tag:"All staff", title:"Quarterly town hall — venue update", body:"Tomorrow’s town hall will now take place at the Main Auditorium. Please arrive by 9:45 AM.", author:"Office of the Vice Chancellor", time:"18 min ago", delivery:"1,284 reached", sms:"126 by SMS", tone:"violet" },
  { tag:"Computer Science · Level 300", title:"Database Systems lecture moved online", body:"Today’s 2:00 PM lecture will be held online. The meeting link is available in your course portal.", author:"Dr. Naa Mensah", time:"1 hr ago", delivery:"186 reached", sms:"31 by SMS", tone:"blue" },
  { tag:"Finance Office", title:"September payroll documents", body:"Department administrators should submit outstanding payroll documents before 4:00 PM Friday.", author:"Finance Directorate", time:"Yesterday", delivery:"42 reached", sms:"4 by SMS", tone:"amber" },
];

const viewMeta: Record<View,{title:string;description:string}> = {
  announcements:{title:"Announcements",description:"Create, monitor and review official updates"},
  people:{title:"People",description:"Manage membership, invitations and contact verification"},
  authorities:{title:"Authorities",description:"Assign publishing levels and audience scope"},
  departments:{title:"Departments",description:"Organize audiences by department, office or class"},
  delivery:{title:"Delivery log",description:"Track in-app, WhatsApp and SMS delivery outcomes"},
  billing:{title:"Messaging credits",description:"Understand and control offline delivery costs"},
};

function Mark({ compact=false }:{compact?:boolean}) {
  return <div className="brand-mark" aria-label="Announcement Hub"><span className="mark-icon"><Radio size={compact?17:20}/></span>{!compact&&<span className="mark-word">Announcement <b>Hub</b></span>}</div>;
}

function Welcome({onEnter}:{onEnter:(p:Portal)=>void}) {
  const [selected,setSelected] = useState<Portal>("creator");
  const current = portals.find(p=>p.id===selected)!;
  return <main className="welcome-shell">
    <nav className="welcome-nav"><Mark/><span>Secure organizational access</span></nav>
    <section className="welcome-intro">
      <p className="eyebrow">OFFICIAL COMMUNICATIONS, ONE SOURCE</p>
      <h1>Reach the right people.<br/>Know who received it.</h1>
      <p>Verified announcements for organizations that cannot afford to leave anyone uninformed.</p>
    </section>
    <section className="entry-layout">
      <div className="role-list" aria-label="Choose how to continue">
        {portals.map(p=>{const Icon=p.icon;return <button key={p.id} className={`role-row ${selected===p.id?"active":""}`} onClick={()=>setSelected(p.id)}>
          <span className="role-icon"><Icon size={20}/></span><span><small>{p.eyebrow}</small><strong>{p.title}</strong><em>{p.description}</em></span><ArrowRight size={18}/>
        </button>})}
      </div>
      <section className="access-panel">
        <div className="access-heading"><span className="access-icon"><current.icon size={22}/></span><div><p>SECURE ACCESS</p><h2>{selected==="creator"?"Create or sign in":selected==="authority"?"Authority sign in":"Member sign in"}</h2></div></div>
        <p className="access-help">{selected==="creator"?"Use the verified email or phone number registered to the space owner.":"Enter the code supplied by your organization."}</p>
        <label><span>{selected==="creator"?"Work email or phone":"Organization code"}</span><input placeholder={selected==="creator"?"name@organization.com":"e.g. PU-LEGON-24"}/></label>
        <button className="primary-action" onClick={()=>onEnter(selected)}>Continue <ArrowRight size={17}/></button>
        <p className="access-note"><KeyRound size={15}/> First-time credentials are sent to your verified email or phone.</p>
      </section>
    </section>
    <footer className="trust-row"><span><ShieldCheck size={16}/> Verified membership</span><span><Smartphone size={16}/> Offline delivery</span><span><Users size={16}/> Scoped authority</span></footer>
  </main>;
}

const navItems:{id:View;label:string;icon:any;badge?:string}[] = [
  {id:"announcements",label:"Announcements",icon:Megaphone,badge:"8"},
  {id:"people",label:"People",icon:Users},
  {id:"authorities",label:"Authorities",icon:ShieldCheck},
  {id:"departments",label:"Departments",icon:Building2},
  {id:"delivery",label:"Delivery log",icon:MessageSquareText},
  {id:"billing",label:"Credits & billing",icon:WalletCards},
];

function Sidebar({view,setView,onExit}:{view:View;setView:(v:View)=>void;onExit:()=>void}) {
  return <aside className="sidebar">
    <div className="sidebar-brand"><Mark compact/><span>Announcement Hub</span></div>
    <button className="org-switcher"><span className="org-avatar">PU</span><span><strong>Pentecost University</strong><small>PU-LEGON-24</small></span><ChevronDown size={15}/></button>
    <nav aria-label="Workspace navigation">
      <p>WORKSPACE</p>
      {navItems.slice(0,4).map(item=><NavButton key={item.id} item={item} active={view===item.id} onClick={()=>setView(item.id)}/>) }
      <p>OPERATIONS</p>
      {navItems.slice(4).map(item=><NavButton key={item.id} item={item} active={view===item.id} onClick={()=>setView(item.id)}/>) }
    </nav>
    <div className="sidebar-bottom"><button className="switch-button" onClick={onExit}><ArrowLeft size={17}/> Switch portal</button><div className="user-row"><span>JB</span><div><strong>Joseph Bortey</strong><small>Space creator</small></div><MoreHorizontal size={17}/></div></div>
  </aside>;
}

function NavButton({item,active,onClick}:{item:{label:string;icon:any;badge?:string};active:boolean;onClick:()=>void}) {
  const Icon=item.icon; return <button className={`nav-item ${active?"active":""}`} onClick={onClick} aria-current={active?"page":undefined}><Icon size={18}/><span>{item.label}</span>{item.badge&&<b>{item.badge}</b>}</button>;
}

function PageHeader({view,onCompose}:{view:View;onCompose:()=>void}) {
  return <header className="page-header"><div><p>SPACE / {viewMeta[view].title.toUpperCase()}</p><h1>{viewMeta[view].title}</h1><span>{viewMeta[view].description}</span></div><div className="header-actions"><button className="icon-button" aria-label="Search"><Search size={19}/></button><button className="icon-button" aria-label="Notifications"><Bell size={19}/><i/></button>{view==="announcements"&&<button className="primary-action" onClick={onCompose}><Plus size={18}/> New announcement</button>}</div></header>;
}

function AnnouncementsView({setView}:{setView:(v:View)=>void}) {
  return <>
    <section className="summary-strip">
      <div className="summary-main"><span>DELIVERY TODAY</span><strong>1,284</strong><p>of 1,420 members reached</p><div className="progress"><i/></div><small>99.2% delivery rate</small></div>
      <button className="summary-stat"><Users size={20}/><span><small>ACTIVE MEMBERS</small><strong>1,420</strong><em>38 added this month</em></span><ArrowRight size={17}/></button>
      <button className="summary-stat" onClick={()=>setView("billing")}><WalletCards size={20}/><span><small>SMS CREDIT</small><strong>GH₵ 284.60</strong><em>Estimated 1,423 messages</em></span><ArrowRight size={17}/></button>
    </section>
    <button className="delivery-route" onClick={()=>setView("delivery")}>
      <span className="route-heading"><small>LATEST ANNOUNCEMENT</small><strong>Delivery status</strong><em>Quarterly town hall — venue update</em></span>
      <span className="route-steps"><i className="done"/><span><b>In-app</b><small>1,420 sent</small></span><i className="done"/><span><b>WhatsApp</b><small>214 delivered</small></span><i/><span><b>SMS fallback</b><small>126 queued</small></span></span><ArrowRight size={18}/>
    </button>
    <section className="feed-section"><div className="section-heading"><div><h2>Recent announcements</h2><p>Official updates across the organization</p></div><button>View all <ArrowRight size={15}/></button></div><div className="announcement-list">{announcements.map(item=><article className="announcement" key={item.title}><div className={`announcement-mark ${item.tone}`}><Megaphone size={18}/></div><div><span className={`tag ${item.tone}`}>{item.tag}</span><h3>{item.title}</h3><p>{item.body}</p><footer><span>{item.author}</span><span><Clock3 size={13}/>{item.time}</span><span className="success"><Check size={13}/>{item.delivery}</span><span><MessageSquareText size={13}/>{item.sms}</span></footer></div><button className="more-button" aria-label="More actions"><MoreHorizontal size={18}/></button></article>)}</div></section>
  </>;
}

const people=[
  ["AM","Ama Mensah","Staff · Finance","Verified","Online"],
  ["KA","Kwame Asante","Lecturer · Computer Science","Verified","2h ago"],
  ["EA","Esi Agyeman","Student · Level 300","Needs phone","Yesterday"],
  ["YD","Yaw Danso","Staff · Registry","Verified","Online"],
];

function PeopleView(){return <section className="workspace-card"><div className="card-toolbar"><div><h2>Member directory</h2><p>1,420 active members · 22 need verification</p></div><button className="primary-action"><Plus size={17}/> Add people</button></div><div className="filter-row"><div><Search size={17}/><input placeholder="Search by name, department or contact"/></div><button>All members <ChevronDown size={15}/></button></div><div className="data-table"><div className="table-row table-head"><span>MEMBER</span><span>ROLE & GROUP</span><span>CONTACT</span><span>LAST ACTIVE</span><span/></div>{people.map(p=><div className="table-row" key={p[1]}><span className="person"><i>{p[0]}</i><b>{p[1]}</b></span><span>{p[2]}</span><span className={p[3]==="Verified"?"status-ok":"status-warn"}>{p[3]}</span><span>{p[4]}</span><button><MoreHorizontal size={18}/></button></div>)}</div></section>}

function AuthoritiesView(){return <section className="two-column"><div className="workspace-card"><div className="card-toolbar"><div><h2>Authority levels</h2><p>Higher levels can reach the levels beneath them</p></div><button className="primary-action"><Plus size={17}/> Assign authority</button></div><div className="authority-stack">{[["01","Space owner","All audiences · all settings","1 person"],["02","Executive authority","Organization-wide except owner","4 people"],["03","Department authority","Assigned departments only","18 people"],["04","Publisher","Assigned classes or teams","64 people"]].map(a=><button key={a[0]}><i>{a[0]}</i><span><strong>{a[1]}</strong><small>{a[2]}</small></span><b>{a[3]}</b><ArrowRight size={17}/></button>)}</div></div><aside className="info-panel"><ShieldCheck size={22}/><h3>Effective permission</h3><p>A person can publish only when both their hierarchy level and assigned audience scope permit it.</p><a>Review permission model <ArrowRight size={14}/></a></aside></section>}

function DepartmentsView(){return <section className="workspace-card"><div className="card-toolbar"><div><h2>Audience structure</h2><p>Departments, offices and classes used for targeting</p></div><button className="primary-action"><Plus size={17}/> Add group</button></div><div className="group-grid">{[["CS","Computer Science","342 members","8 publishers"],["FN","Finance Office","42 members","3 publishers"],["RG","Registry","28 members","4 publishers"],["L3","Level 300","186 members","12 publishers"]].map(g=><button key={g[0]}><i>{g[0]}</i><span><strong>{g[1]}</strong><small>{g[2]} · {g[3]}</small></span><ArrowRight size={17}/></button>)}</div></section>}

function DeliveryView(){return <section className="workspace-card"><div className="card-toolbar"><div><h2>Delivery log</h2><p>Channel outcomes for the last 30 days</p></div><button>Export report</button></div><div className="delivery-list">{announcements.map((a,i)=><article key={a.title}><div><span className="status-dot"/><strong>{a.title}</strong><small>{a.time} · {a.tag}</small></div><dl><div><dt>IN-APP</dt><dd>{[1158,155,38][i]} delivered</dd></div><div><dt>WHATSAPP</dt><dd>{[214,62,12][i]} delivered</dd></div><div><dt>SMS FALLBACK</dt><dd>{[126,31,4][i]} sent</dd></div><div><dt>FAILED</dt><dd>{[10,0,0][i]}</dd></div></dl><button><ArrowRight size={17}/></button></article>)}</div></section>}

function BillingView({onAddCredit}:{onAddCredit:()=>void}){return <section className="billing-layout"><div className="credit-panel"><span>CURRENT SMS CREDIT</span><strong>GH₵ 284.60</strong><p>Approximately 1,423 standard SMS messages</p><button className="primary-action" onClick={onAddCredit}><CreditCard size={17}/> Add credit</button></div><div className="workspace-card"><div className="card-toolbar"><div><h2>Cost controls</h2><p>SMS is used only after other channels do not reach a member</p></div></div><div className="setting-row"><span><strong>Fallback delay</strong><small>Wait before sending an unread announcement by SMS</small></span><button>5 minutes <ChevronDown size={15}/></button></div><div className="setting-row"><span><strong>Low balance alert</strong><small>Notify the space owner before delivery is interrupted</small></span><button>GH₵ 50.00 <ChevronDown size={15}/></button></div><div className="cost-note"><CircleAlert size={18}/><p>The composer shows the estimated fallback cost before every announcement is sent. Actual cost depends on unread recipients and message length.</p></div></div></section>}

function Workspace({onExit}:{onExit:()=>void}) {
  const [view,setView]=useState<View>("announcements");
  const [composer,setComposer]=useState(false),[creditModal,setCreditModal]=useState(false),[creditAmount,setCreditAmount]=useState(100),[sent,setSent]=useState(false),[audience,setAudience]=useState("Everyone in the organization"),[message,setMessage]=useState("");
  const estimatedSms=useMemo(()=>audience.startsWith("Everyone")?126:audience.startsWith("Computer")?31:18,[audience]);
  const send=()=>{if(!message.trim())return;setComposer(false);setMessage("");setSent(true);window.setTimeout(()=>setSent(false),3500)};
  return <main className="app-shell"><Sidebar view={view} setView={setView} onExit={onExit}/><section className="content-shell"><PageHeader view={view} onCompose={()=>setComposer(true)}/>{view==="announcements"&&<AnnouncementsView setView={setView}/>} {view==="people"&&<PeopleView/>}{view==="authorities"&&<AuthoritiesView/>}{view==="departments"&&<DepartmentsView/>}{view==="delivery"&&<DeliveryView/>}{view==="billing"&&<BillingView onAddCredit={()=>setCreditModal(true)}/>}</section>
    {composer&&<div className="modal-backdrop" onMouseDown={()=>setComposer(false)}><section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title" onMouseDown={e=>e.stopPropagation()}><header><div><p>NEW OFFICIAL UPDATE</p><h2 id="composer-title">Create announcement</h2></div><button onClick={()=>setComposer(false)} aria-label="Close"><X size={20}/></button></header><label><span>Audience</span><select value={audience} onChange={e=>setAudience(e.target.value)}><option>Everyone in the organization</option><option>Computer Science · Level 300</option><option>Department heads</option><option>Finance Office</option></select></label><label><span>Announcement</span><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Write a clear, official announcement…" autoFocus/></label><div className="sms-estimate"><MessageSquareText size={18}/><span><strong>Estimated SMS fallback</strong><small>{estimatedSms} potentially offline members × GH₵0.20</small></span><b>GH₵ {(estimatedSms*.2).toFixed(2)}</b></div><footer><button className="secondary" onClick={()=>setComposer(false)}>Save draft</button><button className="primary-action" disabled={!message.trim()} onClick={send}><Send size={16}/> Send announcement</button></footer></section></div>}
    {creditModal&&<div className="modal-backdrop" onMouseDown={()=>setCreditModal(false)}><section className="composer credit-composer" role="dialog" aria-modal="true" aria-labelledby="credit-title" onMouseDown={e=>e.stopPropagation()}><header><div><p>SMS DELIVERY CREDIT</p><h2 id="credit-title">Add messaging credit</h2></div><button onClick={()=>setCreditModal(false)} aria-label="Close"><X size={20}/></button></header><p className="modal-explainer">Credit pays only for SMS messages used when in-app and WhatsApp delivery do not reach a member.</p><div className="amount-options">{[50,100,250,500].map(amount=><button className={creditAmount===amount?"active":""} onClick={()=>setCreditAmount(amount)} key={amount}>GH₵ {amount}</button>)}</div><div className="credit-summary"><span><small>SELECTED AMOUNT</small><strong>GH₵ {creditAmount.toFixed(2)}</strong></span><span><small>ESTIMATED CAPACITY</small><strong>{(creditAmount/0.2).toLocaleString()} SMS</strong></span></div><div className="cost-note"><CircleAlert size={18}/><p>A payment provider will be connected before launch. No charge is made in this prototype.</p></div><footer><button className="secondary" onClick={()=>setCreditModal(false)}>Cancel</button><button className="primary-action" disabled>Continue to payment</button></footer></section></div>}
    {sent&&<div className="toast"><Check size={17}/><span><strong>Announcement sent</strong><small>Delivery tracking has started.</small></span></div>}
  </main>;
}

export default function Home(){const [workspace,setWorkspace]=useState(false);return workspace?<Workspace onExit={()=>setWorkspace(false)}/>:<Welcome onEnter={()=>setWorkspace(true)}/>}
