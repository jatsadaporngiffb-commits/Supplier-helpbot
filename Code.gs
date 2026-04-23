// ============================================================
//  SUPPLIER HELP BOT — Google Apps Script (Code.gs)
//  สร้างโดย: CPRAM Inspection Body
//  คำอธิบาย: Web App ที่ทำหน้าที่ทั้ง serve หน้าเว็บ Chatbot
//            และบันทึกคำถาม/ตอบลง Google Sheets
// ============================================================

const SHEET_ID   = '1J6R2RkD9G4gSWBUjRA4oFBK0BdGA6l3xiXejDDAfhVg';
const LOG_SHEET  = 'ChatLog';
const DASH_SHEET = 'Dashboard';

// ------------------------------------------------------------
// doGet — serve หน้าเว็บ Chatbot หรือรับ log ผ่าน GET
// ------------------------------------------------------------
function doGet(e) {
  const action = e.parameter.action;

  // บันทึกคำถามผ่าน GET (จาก browser no-cors)
  if (action === 'log') {
    const q = e.parameter.q || '';
    const a = e.parameter.a || '';
    const s = e.parameter.s || 'Web';
    if (q) saveLog(q, a, s);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // serve หน้า HTML Chatbot
  return HtmlService
    .createHtmlOutput(getChatbotHTML())
    .setTitle('Supplier Help Bot — CPRAM')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ------------------------------------------------------------
// doPost — รับ log จาก POST request
// ------------------------------------------------------------
function doPost(e) {
  try {
    let q, a, s;
    if (e.postData && e.postData.type === 'application/json') {
      const d = JSON.parse(e.postData.contents);
      q = d.question; a = d.answer; s = d.source;
    } else {
      q = e.parameter.q; a = e.parameter.a; s = e.parameter.s;
    }
    if (q) saveLog(q, a || '', s || 'Web');
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', msg: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ------------------------------------------------------------
// saveLog — บันทึกข้อมูลลง Google Sheets
// ------------------------------------------------------------
function saveLog(question, answer, source) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  let   sheet = ss.getSheetByName(LOG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    const hdr = sheet.getRange('A1:G1');
    sheet.appendRow(['Timestamp', 'Date', 'Hour', 'Question', 'Answer', 'Source', 'WeekDay']);
    hdr.setBackground('#185FA5').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(4, 320);
    sheet.setColumnWidth(5, 320);
  }

  const now     = new Date();
  const tz      = 'Asia/Bangkok';
  const ts      = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
  const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const hourStr = Utilities.formatDate(now, tz, 'HH');
  const wdStr   = Utilities.formatDate(now, tz, 'EEEE');
  const cleanA  = answer.replace(/<[^>]*>/g, '').substring(0, 400);

  sheet.appendRow([ts, dateStr, hourStr, question, cleanA, source || 'Web', wdStr]);
}

// ------------------------------------------------------------
// buildDashboard — สรุปสถิติ (เรียกด้วย Trigger รายวัน)
// ------------------------------------------------------------
function buildDashboard() {
  const ss       = SpreadsheetApp.openById(SHEET_ID);
  const logSheet = ss.getSheetByName(LOG_SHEET);
  if (!logSheet) return;

  let dash = ss.getSheetByName(DASH_SHEET);
  if (!dash) dash = ss.insertSheet(DASH_SHEET);
  else dash.clearContents();

  const data = logSheet.getDataRange().getValues();
  const rows = data.slice(1).filter(r => r[0]);

  // นับรายวัน
  const byDate    = {};
  const byHour    = {};
  const byKeyword = {};
  const KEYWORDS  = ['ลืมรหัส', 'เอกสาร', 'นัดหมาย', 'car', 'ผล', 'ติดต่อ', 'สถานะ', 'ลิงก์', 'เพิ่มผู้ใช้'];

  rows.forEach(r => {
    const date = String(r[1]);
    const hour = String(r[2]).padStart(2, '0');
    const q    = String(r[3]).toLowerCase();
    byDate[date] = (byDate[date] || 0) + 1;
    byHour[hour] = (byHour[hour] || 0) + 1;
    KEYWORDS.forEach(kw => { if (q.includes(kw)) byKeyword[kw] = (byKeyword[kw] || 0) + 1; });
  });

  // หัว Dashboard
  dash.getRange('A1').setValue('📊 Supplier Help Bot — Dashboard').setFontSize(14).setFontWeight('bold');
  dash.getRange('A2').setValue('อัปเดต: ' + new Date().toLocaleString('th-TH'));
  dash.getRange('A4').setValue('คำถามทั้งหมด');
  dash.getRange('B4').setValue(rows.length);

  // ตาราง: คำถามรายวัน
  dash.getRange('A6:B6').setValues([['วันที่', 'จำนวนคำถาม']]).setBackground('#185FA5').setFontColor('#ffffff').setFontWeight('bold');
  let r = 7;
  Object.entries(byDate).sort().forEach(([d, c]) => {
    dash.getRange(r, 1).setValue(d);
    dash.getRange(r, 2).setValue(c);
    r++;
  });

  // ตาราง: รายชั่วโมง
  dash.getRange('D6:E6').setValues([['ช่วงเวลา (ชม.)', 'จำนวน']]).setBackground('#185FA5').setFontColor('#ffffff').setFontWeight('bold');
  let hr = 7;
  Object.entries(byHour).sort().forEach(([h, c]) => {
    dash.getRange(hr, 4).setValue(h + ':00');
    dash.getRange(hr, 5).setValue(c);
    hr++;
  });

  // ตาราง: Keyword ยอดนิยม
  dash.getRange('G6:H6').setValues([['หัวข้อยอดนิยม', 'ครั้ง']]).setBackground('#185FA5').setFontColor('#ffffff').setFontWeight('bold');
  let kr = 7;
  Object.entries(byKeyword).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => {
    dash.getRange(kr, 7).setValue(k);
    dash.getRange(kr, 8).setValue(c);
    kr++;
  });

  SpreadsheetApp.flush();
  Logger.log('Dashboard updated: ' + rows.length + ' rows processed.');
}

// ------------------------------------------------------------
// getChatbotHTML — คืน HTML ทั้งหน้าของ Chatbot
// ------------------------------------------------------------
function getChatbotHTML() {
  return `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Supplier Help Bot — CPRAM</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --blue1: #E6F1FB; --blue2: #B5D4F4; --blue3: #378ADD;
    --blue4: #185FA5; --blue5: #0C447C; --blue6: #042C53;
    --gray1: #F4F6F8; --gray2: #E2E6EA; --gray3: #6C7A8A;
    --teal1: #E1F5EE; --teal2: #1D9E75; --teal3: #0F6E56;
    --white: #ffffff;
  }
  html, body { height: 100%; font-family: 'Segoe UI', 'Noto Sans Thai', sans-serif; background: var(--gray1); }

  /* ── LAYOUT ── */
  .page { display: flex; flex-direction: column; height: 100vh; max-width: 860px; margin: 0 auto; }

  /* ── HEADER ── */
  .header {
    background: linear-gradient(135deg, var(--blue5) 0%, var(--blue4) 60%, var(--blue3) 100%);
    padding: 14px 20px; display: flex; align-items: center; gap: 14px; flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(24,95,165,0.3);
  }
  .logo-wrap {
    width: 46px; height: 46px; border-radius: 50%;
    background: rgba(255,255,255,0.15);
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .logo-wrap svg { width: 26px; height: 26px; fill: white; }
  .header-info { flex: 1; }
  .header-title { color: white; font-size: 17px; font-weight: 600; letter-spacing: .3px; }
  .header-sub { color: var(--blue2); font-size: 12px; margin-top: 2px; }
  .online-badge {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.12); border-radius: 20px;
    padding: 5px 12px; font-size: 12px; color: white;
  }
  .online-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

  /* ── MESSAGES ── */
  .messages {
    flex: 1; overflow-y: auto; padding: 20px 16px;
    display: flex; flex-direction: column; gap: 14px;
    background: var(--gray1);
  }
  .messages::-webkit-scrollbar { width: 4px; }
  .messages::-webkit-scrollbar-thumb { background: var(--gray2); border-radius: 4px; }

  .msg { display: flex; gap: 10px; align-items: flex-end; max-width: 82%; }
  .msg.user { align-self: flex-end; flex-direction: row-reverse; }
  .msg.bot  { align-self: flex-start; }

  .avatar {
    width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600;
  }
  .bot  .avatar { background: var(--blue4); color: white; }
  .user .avatar { background: var(--gray2); color: var(--gray3); font-size: 11px; }

  .bubble {
    padding: 11px 15px; font-size: 14px; line-height: 1.6;
    box-shadow: 0 1px 3px rgba(0,0,0,.08);
  }
  .bot  .bubble {
    background: var(--white); color: #1a2533;
    border-radius: 18px 18px 18px 4px;
    border: 1px solid var(--gray2);
  }
  .user .bubble {
    background: var(--blue4); color: white;
    border-radius: 18px 18px 4px 18px;
  }
  .bubble a { color: var(--blue3); }
  .user .bubble a { color: var(--blue2); }

  /* ── QUICK BUTTONS ── */
  .quick-btns { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
  .qbtn {
    border: 1.5px solid var(--blue3); background: var(--blue1);
    color: var(--blue5); font-size: 12px; padding: 6px 12px;
    border-radius: 20px; cursor: pointer; transition: all .15s;
    font-family: inherit;
  }
  .qbtn:hover { background: var(--blue3); color: white; }

  /* ── TYPING ── */
  .typing { display: flex; gap: 5px; align-items: center; padding: 11px 15px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gray3); animation: bounce 1.2s infinite; }
  .dot:nth-child(2){animation-delay:.2s} .dot:nth-child(3){animation-delay:.4s}
  @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}

  /* ── CHIPS ── */
  .chip {
    display: inline-block; background: var(--teal1); color: var(--teal3);
    font-size: 11px; padding: 2px 9px; border-radius: 10px;
    margin-bottom: 6px; font-weight: 600;
  }
  .saved { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--teal2); margin-top: 5px; }
  .saved::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--teal2); }

  /* ── INPUT AREA ── */
  .input-area {
    padding: 12px 16px; background: var(--white);
    border-top: 1px solid var(--gray2);
    display: flex; gap: 10px; align-items: center; flex-shrink: 0;
  }
  .input-area input {
    flex: 1; padding: 10px 16px;
    border: 1.5px solid var(--gray2); border-radius: 24px;
    font-size: 14px; font-family: inherit;
    background: var(--gray1); color: #1a2533; outline: none;
    transition: border-color .2s;
  }
  .input-area input:focus { border-color: var(--blue3); background: white; }
  .send-btn {
    width: 40px; height: 40px; border-radius: 50%;
    background: var(--blue4); border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background .15s; box-shadow: 0 2px 6px rgba(24,95,165,.4);
  }
  .send-btn:hover { background: var(--blue3); }
  .send-btn svg { width: 18px; height: 18px; fill: white; }

  /* ── FOOTER ── */
  .footer {
    padding: 7px 16px; background: var(--blue6);
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0;
  }
  .footer span { font-size: 11px; color: var(--blue2); }
  .footer strong { color: white; }

  /* ── DATE DIVIDER ── */
  .date-div { text-align: center; font-size: 11px; color: var(--gray3); margin: 4px 0; }
  .date-div span { background: var(--gray2); padding: 3px 12px; border-radius: 10px; }

  /* ── RESPONSIVE ── */
  @media(max-width:600px){ .msg{max-width:92%} .header-title{font-size:15px} }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="logo-wrap">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
    </div>
    <div class="header-info">
      <div class="header-title">Supplier Help Bot</div>
      <div class="header-sub">CPRAM Web Audit Supplier Online — ระบบตอบคำถามอัตโนมัติ</div>
    </div>
    <div class="online-badge"><div class="online-dot"></div>Online</div>
  </div>

  <!-- MESSAGES -->
  <div class="messages" id="msgBox"></div>

  <!-- INPUT -->
  <div class="input-area">
    <input type="text" id="userInput" placeholder="พิมพ์คำถามของคุณที่นี่..." autocomplete="off"
      onkeydown="if(event.key==='Enter')sendMsg()" />
    <button class="send-btn" onclick="sendMsg()" title="ส่ง">
      <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
    </button>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>© 2026 CPRAM Inspection Body</span>
    <span>คำถามทั้งหมด: <strong id="qCount">0</strong></span>
  </div>
</div>

<script>
// ── ข้อมูล Q&A ──────────────────────────────────────────────
const QA = [
  {k:['ลิงก์','เข้าระบบ','url','website','เว็บ','ที่ไหน','auditsupplier'],
   a:'เข้าใช้งานระบบได้ที่ 🔗 <a href="http://app.cpram.co.th/auditsupplier" target="_blank">http://app.cpram.co.th/auditsupplier</a><br>รองรับ <strong>Smart phone, PC และ Notebook</strong> ครับ'},
  {k:['ลืมรหัสผ่าน','password','รหัสผ่าน','เข้าไม่ได้','login ไม่ได้'],
   a:'หากลืมรหัสผ่าน ให้กดที่คำว่า <strong>"ลืมรหัสผ่าน"</strong> ในหน้า Login<br>ระบบจะส่งรหัสผ่านใหม่ไปยังอีเมลที่ลงทะเบียนไว้โดยอัตโนมัติครับ'},
  {k:['เปลี่ยนรหัส','แก้ไขรหัส','change password'],
   a:'เปลี่ยนรหัสผ่านได้ที่เมนู <strong>"ข้อมูลส่วนตัว"</strong><br>⚠️ หลังแก้ไขแล้วต้องกด <strong>บันทึก</strong> ทุกครั้งครับ'},
  {k:['เพิ่มผู้ใช้','ลบผู้ใช้','จัดการผู้ใช้','supplier admin','admin','user'],
   a:'ผู้ใช้ระดับ <strong>Supplier Admin</strong> เท่านั้นที่สามารถเพิ่ม/ลบผู้ใช้งานได้<br>เมนู: <strong>"จัดการผู้ใช้งาน"</strong><br>⚠️ ชื่อ Username ต้องกรอกเป็น <strong>ภาษาอังกฤษ</strong> เท่านั้น'},
  {k:['ขั้นตอน','flow','กี่ขั้น','ทั้งหมด','กระบวนการ'],
   a:'กระบวนการ Audit Online มีทั้งหมด <strong>8 ขั้นตอน</strong>:<br>1️⃣ แจ้งวันนัดหมาย<br>2️⃣ ตอบยืนยันการเข้า Audit<br>3️⃣ เข้าตรวจประเมิน<br>4️⃣ เซ็นรับทราบบน Tablet<br>5️⃣ แจ้งผลการตรวจทาง Web<br>6️⃣ ยืนยันรับทราบผลทาง Web<br>7️⃣ ตอบกลับการแก้ไข (CAR)<br>8️⃣ อนุมัติปิดประเด็น'},
  {k:['นัดหมาย','ยืนยันนัด','เลื่อนนัด','appointment'],
   a:'ไปที่เมนู <strong>"การนัดหมาย"</strong><br>• <strong>ยืนยัน:</strong> กดยืนยันตามวัน เวลา สถานที่<br>• <strong>เลื่อนนัด:</strong> เลือกช่วงวันที่ต้องการ → ระบุเหตุผล → กดบันทึก'},
  {k:['เอกสาร','แนบ','gmp','haccp','process flow','supplier assessment','มาตรฐาน','iso','brc'],
   a:'ต้องเตรียม <strong>4 ประเภทเอกสาร</strong> แนบที่เมนู <strong>"แผนการเข้าตรวจ"</strong>:<br>📌 เอกสารรับรองสถานที่ผลิต (GMP/HACCP/BRC/ISO)<br>📌 มาตรฐานสินค้า (ผลวิเคราะห์คุณภาพ/ความปลอดภัย)<br>📌 ขั้นตอนกระบวนการผลิต (Process Flow)<br>📌 Supplier Assessment'},
  {k:['car','แก้ไข','ข้อบกพร่อง','ตอบกลับ','corrective','due date','หลักฐาน'],
   a:'วิธีตอบกลับ CAR:<br>1️⃣ เข้าไปที่หัวข้อปัญหาที่พบ<br>2️⃣ กรอก <strong>"วิธีการแก้ไข"</strong><br>3️⃣ ระบุ <strong>Due Date</strong> (วันที่จะแก้ไขเสร็จ)<br>4️⃣ แนบไฟล์หลักฐาน (.jpg หรือ .png)<br>5️⃣ กดบันทึกและส่ง<br>⏳ รอ Auditor อนุมัติปิดประเด็น'},
  {k:['หลักฐาน','ไฟล์','รูปภาพ','jpg','png'],
   a:'แนบหลักฐานได้เฉพาะไฟล์ <strong>.jpg</strong> หรือ <strong>.png</strong> เท่านั้นครับ'},
  {k:['ผลการตรวจ','ดูผล','สรุปผล','ยืนยันผล','รับทราบ'],
   a:'ดูและยืนยันผลได้ที่เมนู <strong>"สรุปผลการเข้าตรวจ"</strong><br>กดเครื่องหมาย ≡ เพื่อยืนยันรับทราบผลจาก Auditor ครับ'},
  {k:['สถานะ','รอเข้าตรวจ','รอยืนยัน','รอซัพ','เสร็จสิ้น'],
   a:'ความหมายสถานะในระบบ:<br>🔵 <strong>รอเข้าตรวจ</strong> — รอรับการตรวจจาก Auditor<br>🟡 <strong>รอยืนยันผล</strong> — รอ Auditor ยืนยันผล<br>🟠 <strong>รอซัพพลายเออร์รับทราบ</strong> — กรุณากดรับทราบก่อน<br>🟢 <strong>เสร็จสิ้น</strong> — ดำเนินการครบทุกขั้นตอน'},
  {k:['ติดต่อ','contact','โทร','อีเมล','email','ปัญหา','แจ้งปัญหา'],
   a:'ติดต่อผู้ดูแลระบบได้ที่:<br>📧 CPRAMInspectionBody@cpram.co.th<br>📧 sirinankaewp@cpram.co.th<br>📧 nakarinsaku@cpram.co.th<br>📧 chetsadaphonbun@cpram.co.th<br>📞 02-2599-1744 ต่อ 1502<br>📱 083-490-1145'},
  {k:['อุปกรณ์','โทรศัพท์','มือถือ','smartphone','notebook','pc','คอม'],
   a:'ระบบรองรับ <strong>Smart phone, PC และ Notebook</strong> ทุกชนิดครับ เพียงใช้เบราว์เซอร์เปิดลิงก์ที่ให้ไว้'}
];

const QUICK = [
  {label:'🔗 ลิงก์เข้าระบบ',  q:'เข้าระบบได้ที่ไหน?'},
  {label:'🔑 ลืมรหัสผ่าน',    q:'ลืมรหัสผ่านต้องทำอย่างไร?'},
  {label:'📋 ขั้นตอน Audit',  q:'ขั้นตอน Audit มีกี่ขั้นตอน?'},
  {label:'📄 เอกสารที่ต้องแนบ', q:'ต้องเตรียมเอกสารอะไรบ้าง?'},
  {label:'✅ ตอบกลับ CAR',    q:'ตอบกลับ CAR ต้องทำอย่างไร?'},
  {label:'📞 ติดต่อเจ้าหน้าที่', q:'ติดต่อผู้ดูแลระบบได้อย่างไร?'}
];

// ── State ───────────────────────────────────────────────────
let qCount = 0;
const SCRIPT_URL = window.location.href.split('?')[0]; // URL ของ Web App นี้เอง

// ── Helpers ─────────────────────────────────────────────────
function getAnswer(q) {
  const low = q.toLowerCase();
  for (const item of QA) {
    if (item.k.some(k => low.includes(k))) return item.a;
  }
  return null;
}

function addMsg(role, html, showSaved = false) {
  const box = document.getElementById('msgBox');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  const av = document.createElement('div');
  av.className = 'avatar';
  av.textContent = role === 'bot' ? 'SB' : 'คุณ';
  const bub = document.createElement('div');
  bub.className = 'bubble';
  bub.innerHTML = html;
  if (showSaved) {
    const s = document.createElement('div');
    s.className = 'saved'; s.textContent = 'บันทึกคำถามแล้ว';
    bub.appendChild(s);
  }
  div.appendChild(av); div.appendChild(bub);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function showTyping() {
  const box = document.getElementById('msgBox');
  const div = document.createElement('div');
  div.className = 'msg bot'; div.id = 'typing';
  div.innerHTML = '<div class="avatar">SB</div><div class="bubble"><div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>';
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}

// ── บันทึกลง Google Sheets ผ่าน URL ของ Script เอง ─────────
function saveToSheet(question, answer) {
  try {
    const clean = answer.replace(/<[^>]*>/g, '').substring(0, 400);
    const url = SCRIPT_URL + '?action=log&q=' + encodeURIComponent(question) + '&a=' + encodeURIComponent(clean) + '&s=Web';
    fetch(url, { method: 'GET', mode: 'no-cors' }).catch(() => {});
  } catch (e) {}
}

// ── เรียก Claude API หากไม่พบใน Q&A ────────────────────────
async function callClaude(question) {
  const sys = \`คุณคือ Supplier Help Bot ของ CPRAM ตอบคำถามเกี่ยวกับระบบ Web Audit Supplier Online เท่านั้น ตอบภาษาไทย กระชับ ชัดเจน ใช้ emoji ช่วยอ่าน

ข้อมูลสำคัญ:
- URL ระบบ: http://app.cpram.co.th/auditsupplier
- รองรับ: Smart phone, PC, Notebook
- ลืมรหัสผ่าน: กด "ลืมรหัสผ่าน" ระบบส่งไปอีเมล
- เปลี่ยนรหัส: เมนู "ข้อมูลส่วนตัว"
- Supplier Admin เพิ่ม/ลบผู้ใช้ที่ "จัดการผู้ใช้งาน" (Username ต้องเป็นอังกฤษ)
- ขั้นตอน Audit: 8 ขั้น (แจ้งนัด → ยืนยัน → ตรวจ → เซ็น Tablet → แจ้งผล Web → ยืนยันผล Web → ตอบ CAR → อนุมัติปิดประเด็น)
- เอกสาร 4 ประเภท: รับรองสถานที่ผลิต (GMP/HACCP/BRC/ISO), มาตรฐานสินค้า, Process Flow, Supplier Assessment
- ตอบ CAR: วิธีแก้ไข + Due Date + แนบหลักฐาน (.jpg/.png)
- ยืนยันผล: เมนู "สรุปผลการเข้าตรวจ"
- ติดต่อ: CPRAMInspectionBody@cpram.co.th หรือ 02-2599-1744 ต่อ 1502\`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      system: sys, messages: [{ role: 'user', content: question }]
    })
  });
  const d = await res.json();
  return d.content?.[0]?.text || 'ขออภัยครับ ไม่สามารถตอบได้ในขณะนี้';
}

// ── Main process ─────────────────────────────────────────────
async function processQuestion(q) {
  addMsg('user', q);
  showTyping();
  qCount++;
  document.getElementById('qCount').textContent = qCount;

  let ans = getAnswer(q);
  if (!ans) {
    try { ans = await callClaude(q); }
    catch { ans = 'ขออภัยครับ ไม่สามารถตอบได้ในขณะนี้<br>📞 กรุณาติดต่อ 083-490-1145'; }
  }

  document.getElementById('typing')?.remove();
  addMsg('bot', ans, true);
  saveToSheet(q, ans);
}

function askQ(q) { processQuestion(q); }
function sendMsg() {
  const inp = document.getElementById('userInput');
  const q = inp.value.trim();
  if (!q) return;
  inp.value = '';
  processQuestion(q);
}

// ── Welcome message ──────────────────────────────────────────
window.addEventListener('load', () => {
  const btns = QUICK.map(b =>
    '<button class="qbtn" onclick="askQ(\\'' + b.q.replace(/'/g,"\\'") + '\\')">' + b.label + '</button>'
  ).join('');

  addMsg('bot',
    '<div class="chip">ยินดีต้อนรับ</div><br>' +
    'สวัสดีครับ ผมคือ <strong>Supplier Help Bot</strong> พร้อมช่วยตอบทุกคำถามเกี่ยวกับ ' +
    '<strong>CPRAM Web Audit Supplier Online</strong><br><br>' +
    'สามารถถามได้เลย หรือเลือกหัวข้อด้านล่าง:' +
    '<div class="quick-btns">' + btns + '</div>'
  );
});
</script>
</body>
</html>`;
}
