'use strict';
const STORAGE_KEY = 'seo-ghost.profile.v1';
const form = document.querySelector('#profile-form');
const fields = ['name','website','phone','country','city','businessType','mapsUrl','services','priorityService','areas','hours','emergency','notes'];
let profile = null;
let dirty = false;
let toastTimer;
function notify(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}
function lines(value) { return [...new Set(String(value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))]; }
function safeUrl(value) {
  if (!value) return '';
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Website and Maps links must start with https:// or http://.');
  return url.href;
}
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('This file does not contain a valid business profile.');
  const result = {};
  for (const key of fields) {
    if (key === 'emergency') { result[key] = raw[key] === true; continue; }
    if (raw[key] != null && typeof raw[key] !== 'string') throw new Error('Some profile fields have an invalid format.');
    result[key] = (raw[key] || '').trim();
    const max = form.elements[key].maxLength;
    if (max > 0 && result[key].length > max) throw new Error('A profile field exceeds its allowed length.');
  }
  if (!result.name || !result.country || !result.city || !lines(result.services).length || !lines(result.areas).length) throw new Error('Add a business name, country, city, at least one service, and one target area.');
  result.website = safeUrl(result.website); result.mapsUrl = safeUrl(result.mapsUrl);
  if (!['service-area','hybrid','storefront'].includes(result.businessType)) throw new Error('Choose a valid business type.');
  result.services = lines(result.services).join('\n'); result.areas = lines(result.areas).join('\n');
  if (result.priorityService && !lines(result.services).some(s => s.toLowerCase() === result.priorityService.toLowerCase())) throw new Error('Your priority service must match a service in your list.');
  result.updatedAt = typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : new Date().toISOString();
  return result;
}
function readForm() {
  const data = {};
  for (const key of fields) data[key] = key === 'emergency' ? form.elements[key].checked : form.elements[key].value;
  return normalize(data);
}
function populate() {
  form.reset();
  if (profile) for (const key of fields) {
    if (key === 'emergency') form.elements[key].checked = profile[key];
    else form.elements[key].value = profile[key];
  }
  dirty = false;
  document.querySelector('#edit-status').textContent = 'Saved locally in this browser.';
}
function setView(view) {
  if (view !== 'profile' && dirty && !confirm('Leave without saving your changes?')) return;
  if (window.gbpCanLeave && !window.gbpCanLeave(view)) return;
  document.querySelector('#overview').hidden = view !== 'overview';
  document.querySelector('#profile').hidden = view !== 'profile';
  document.querySelector('#gbp').hidden = view !== 'gbp';
  document.querySelectorAll('.nav').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  document.querySelector('#crumb').textContent = view === 'gbp' ? 'GBP agent' : view === 'profile' ? 'Business profile' : 'Overview';
  document.querySelector('#page-title').textContent = view === 'gbp' ? 'A better profile. A clearer plan.' : view === 'profile' ? 'Let’s get to know your business.' : profile ? 'Your growth starts with a clear plan.' : 'Your next chapter starts here.';
  document.querySelector('#page-description').textContent = view === 'gbp' ? 'Audit your listing, prepare improvements, and review every change.' : view === 'profile' ? 'A few real details today. Better decisions in every session ahead.' : 'Give Ghost the facts. Build your local growth plan one step at a time.';
  document.querySelector('#edit-profile').hidden = view !== 'overview';
  if (view === 'profile' || dirty) populate();
  if (view === 'gbp' && window.refreshGBP) window.refreshGBP();
  window.scrollTo({top:0,behavior:'instant'});
}
function element(tag, text, className) {
  const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el;
}
function render() {
  const p = profile || {};
  const requirements = ['name','website','phone','country','city','services','areas','hours','priorityService','mapsUrl'];
  const ready = Math.round(requirements.filter(key => p[key]).length / requirements.length * 100);
  document.querySelector('#readiness').replaceChildren(document.createTextNode(String(ready)),element('small','%'));
  document.querySelector('#readiness-bar').style.width = ready + '%';
  document.querySelector('#readiness-note').textContent = ready === 100 ? 'Your business essentials are complete' : `${requirements.filter(key => p[key]).length} of 10 business essentials added`;
  document.querySelector('#service-count').textContent = lines(p.services).length;
  document.querySelector('#area-count').textContent = lines(p.areas).length;
  document.querySelector('#business-name').textContent = p.name || 'A home for your business.';
  document.querySelector('#business-summary').textContent = profile ? `${p.city}, ${p.country} · ${p.businessType === 'service-area' ? 'Service-area plumbing business' : p.businessType === 'hybrid' ? 'Storefront & service-area business' : 'Storefront business'}` : 'Add your plumbing business to give every future recommendation the right context.';
  document.querySelector('#profile-badge').textContent = profile ? 'PROFILE SAVED' : 'NOT SET UP';
  document.querySelector('#profile-card-button').replaceChildren(document.createTextNode(profile ? 'Edit business profile' : 'Create business profile'),element('span','→'));
  document.querySelector('#edit-profile').replaceChildren(document.createTextNode(profile ? 'Edit business profile' : 'Set up your business'),element('span','↗'));
  document.querySelector('#last-saved').textContent = profile ? `Saved ${new Date(p.updatedAt).toLocaleString()} · In this browser` : 'Your profile stays in this browser.';
  const details = document.querySelector('#business-details'); details.replaceChildren();
  if (profile) for (const [label,value] of [['Website',p.website],['Phone',p.phone],['Focus',p.priorityService],['Areas',lines(p.areas).join(', ')],['Hours',p.hours],['Emergency',p.emergency ? 'Available (hours as listed)' : 'Not specified as available']]) {
    if (!value) continue;
    const row = element('div'); row.append(element('dt',label)); const dd = element('dd');
    if (label === 'Website') { const a = element('a',value); a.href = value; a.target = '_blank'; a.rel = 'noopener noreferrer'; dd.append(a); } else dd.textContent = value;
    row.append(dd); details.append(row);
  }
  const chips = document.querySelector('#service-chips'); chips.replaceChildren();
  lines(p.services).slice(0,6).forEach(s => chips.append(element('span',s,'chip')));
  if (lines(p.services).length > 6) chips.append(element('span',`+${lines(p.services).length-6} more`,'chip'));
  const moves = [];
  if (!profile) moves.push(['Create your business profile','Add your name, location, services, and service areas. These facts guide every next step.','START HERE'],['Choose a service worth growing','Pick a service your team delivers well and wants more bookings for.','BUSINESS FOCUS'],['Prepare your website for inspection','Have your website address ready. Session 02 will inspect real pages and identify opportunities.','NEXT SESSION']);
  else {
    if (!p.website) moves.push(['Add your website','Save the real website address so the next session can inspect its pages.','PROFILE DETAIL']);
    if (!p.priorityService) moves.push(['Choose your priority service','Select one service from your list that you want to grow first.','BUSINESS FOCUS']);
    if (!p.phone || !p.hours) moves.push(['Complete your contact details','Add your customer phone number and business hours to the profile.','PROFILE DETAIL']);
    if (!p.mapsUrl) moves.push(['Add your Google Maps profile link','Keep your listing reference alongside your business facts. This does not connect your account.','PROFILE DETAIL']);
    moves.push(['Run your GBP audit','Open GBP agent, capture your current listing, and check the highest-priority opportunities.','GBP AGENT'],['Prepare your search data','Have owner access to Search Console and your Business Profile ready for future connections.','LATER SESSION'],['Define a qualified plumbing lead','Decide which inquiries and bookings count as success, and where your team records them.','BUSINESS FOCUS']);
  }
  const actions = document.querySelector('#actions'); actions.replaceChildren();
  moves.slice(0,3).forEach(([title,description,tag],i) => { const row = element('article',null,'action'); row.append(element('span',String(i+1).padStart(2,'0'),'action-number')); const body=element('div'); body.append(element('h3',title),element('p',description),element('span',tag,'tag')); row.append(body); actions.append(row); });
  document.querySelector('#export').disabled = !profile;
  if (window.renderGBPConnection) window.renderGBPConnection();
}
form.addEventListener('input',() => { dirty = true; document.querySelector('#edit-status').textContent = 'You have unsaved changes.'; });
form.addEventListener('submit',event => {
  event.preventDefault();
  try { const next = readForm(); next.updatedAt = new Date().toISOString(); localStorage.setItem(STORAGE_KEY,JSON.stringify(next)); profile = next; dirty = false; render(); setView('overview'); notify('Business profile saved. Your foundation is ready.'); }
  catch (error) { notify(error.message || 'Your profile could not be saved. Please try again.'); }
});
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => { if (button.classList.contains('active')) return; setView(button.dataset.view); }));
document.querySelector('#edit-profile').addEventListener('click',() => setView('profile'));
document.querySelector('#profile-card-button').addEventListener('click',() => setView('profile'));
document.querySelector('#cancel-edit').addEventListener('click',() => setView('overview'));
document.querySelector('#export').addEventListener('click',() => {
  if (!profile) return;
  const blob = new Blob([JSON.stringify({app:'SEO Ghost',version:1,profile},null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = element('a'); a.href=url; a.download='seo-ghost-profile.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); notify('Your saved profile backup is ready.');
});
document.querySelector('#import').addEventListener('click',() => document.querySelector('#import-file').click());
document.querySelector('#import-file').addEventListener('change',async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 100000) throw new Error('This backup is too large. Choose a SEO Ghost profile export.');
    const backup = JSON.parse(await file.text());
    if (backup.app !== 'SEO Ghost' || backup.version !== 1) throw new Error('Choose a valid SEO Ghost version 1 profile backup.');
    const next = normalize(backup.profile);
    if ((profile || dirty) && !confirm('Replace your current profile and any unsaved edits with this backup?')) return;
    next.updatedAt = new Date().toISOString(); localStorage.setItem(STORAGE_KEY,JSON.stringify(next)); profile=next; populate(); render(); notify('Profile imported and saved.');
  } catch (error) { notify(error instanceof SyntaxError ? 'This file is not valid JSON. Choose a SEO Ghost profile export.' : error.message); }
  finally { event.target.value=''; }
});
window.addEventListener('beforeunload',event => { if (dirty) { event.preventDefault(); event.returnValue=''; } });
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) profile=normalize(JSON.parse(saved)); }
catch { notify('Your saved profile could not be loaded. You can import a backup or create a new profile.'); }
render();
