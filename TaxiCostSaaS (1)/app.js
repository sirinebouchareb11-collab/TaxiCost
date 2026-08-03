// ===========================================================
// ===== FIREBASE — CONFIG & AUTH =====
// ===========================================================
var firebaseConfig = {
  apiKey: "AIzaSyCp_oczsA7oBYk5ESIZA-UidY46l_hQTJo",
  authDomain: "taxicost-3d79a.firebaseapp.com",
  projectId: "taxicost-3d79a",
  storageBucket: "taxicost-3d79a.firebasestorage.app",
  messagingSenderId: "1062145846303",
  appId: "1:1062145846303:web:a009d54ab90067621bf92a"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var auth = firebase.auth();

var WHATSAPP_NUMBER = '213793270749'; // ← REMPLACE PAR TON VRAI NUMÉRO ex: 213770123456
var PRIX_ABONNEMENT = '500 DA';

function doLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pwd = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !pwd) { errEl.textContent = 'Remplis tous les champs'; return; }
  auth.signInWithEmailAndPassword(email, pwd)
    .catch(function(e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        errEl.textContent = 'Email ou mot de passe incorrect';
      } else { errEl.textContent = 'Erreur : ' + e.message; }
    });
}

function doRegister() {
  var name = document.getElementById('reg-name').value.trim();
  var email = document.getElementById('reg-email').value.trim();
  var pwd = document.getElementById('reg-password').value;
  var errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  if (!name || !email || !pwd) { errEl.textContent = 'Remplis tous les champs'; return; }
  if (pwd.length < 6) { errEl.textContent = 'Mot de passe trop court (min. 6 caractères)'; return; }

  var trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 3);

  auth.createUserWithEmailAndPassword(email, pwd)
    .then(function(cred) {
      return db.collection('users').doc(cred.user.uid).set({
        name: name, email: email, actif: false, trial: true,
        trialEnd: trialEnd.toISOString(), dateInscription: new Date().toISOString()
      });
    })
    .catch(function(e) {
      if (e.code === 'auth/email-already-in-use') errEl.textContent = 'Cet email est déjà utilisé';
      else errEl.textContent = 'Erreur : ' + e.message;
    });
}

function doLogout() { auth.signOut(); }

function openWhatsApp() {
  var user = auth.currentUser;
  var email = user ? user.email : '';
  var msg = encodeURIComponent('Bonjour, je souhaite activer mon abonnement TaxiCost (' + PRIX_ABONNEMENT + ').\nMon email : ' + email);
  window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
}

auth.onAuthStateChanged(function(user) {
  if (!user) { showScreen('s-login'); return; }
  db.collection('users').doc(user.uid).get()
    .then(function(doc) {
      if (!doc.exists) { showScreen('s-pending'); return; }
      var data = doc.data();
      var name = data.name || 'Chauffeur';

      if (data.actif === true) { enterApp(name); return; }

      if (data.trial === true && data.trialEnd) {
        var trialEnd = new Date(data.trialEnd);
        var daysLeft = Math.ceil((trialEnd - new Date()) / 86400000);
        if (daysLeft > 0) { enterApp(name, daysLeft); return; }
        showScreen('s-expired'); return;
      }
      showScreen('s-pending');
    })
    .catch(function() { showScreen('s-pending'); });
});

function enterApp(name, trialDaysLeft) {
  localStorage.setItem('taxicost_driver', name);
  if (trialDaysLeft !== undefined) {
    localStorage.setItem('taxicost_trial_days', trialDaysLeft);
  } else {
    localStorage.removeItem('taxicost_trial_days');
  }
  setDriverLabels(name);
  if (clients.length === 0) addClient();
  updateTrialBars(trialDaysLeft);
  showScreen('s-splash');
  setTimeout(function(){ showScreen('s-main'); }, 1800);
}

function updateTrialBars(trialDaysLeft) {
  var screens = ['main', 'stats', 'history', 'maint', 'settings'];
  if (trialDaysLeft === undefined) {
    var stored = parseInt(localStorage.getItem('taxicost_trial_days'));
    trialDaysLeft = isNaN(stored) ? undefined : stored;
  }
  screens.forEach(function(s) {
    var bar  = document.getElementById('trial-bar-'  + s);
    var fill = document.getElementById('trial-fill-' + s);
    var days = document.getElementById('trial-days-' + s);
    if (!bar || !fill || !days) return;

    if (trialDaysLeft !== undefined && trialDaysLeft > 0) {
      var pct    = Math.min(100, Math.round((trialDaysLeft / 3) * 100));
      var urgent = trialDaysLeft <= 1;
      bar.style.display = 'flex';
      fill.style.width  = pct + '%';
      fill.className    = 'trial-bar-fill' + (urgent ? ' urgent' : '');
      days.textContent  = trialDaysLeft + ' jour' + (trialDaysLeft > 1 ? 's' : '') + ' restant' + (trialDaysLeft > 1 ? 's' : '');
      days.className    = 'trial-bar-days' + (urgent ? ' urgent' : '');
    } else {
      bar.style.display = 'none';
    }
  });
}

// ===========================================================
var clients = [];
var cid = 0;
var currentLang = 'fr-FR';
var activeRecognition = null;
var currentPeriod = 'day';
var currentHistoryPeriod = 'day';

// ===========================================================
// ===== NAVIGATION (5 onglets) =====
// ===========================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

// goTab(id, btn, skipNavUpdate)
// - id : écran cible
// - btn : bouton cliqué dans la bottom-nav (peut être null si appelé depuis la pastille tarif)
// - skipNavUpdate : si true, ne gère pas l'état actif de la bottom-nav (utilisé par la pastille tarif)
function goTab(id, btn, fromPill) {
  showScreen(id);

  if (!fromPill) {
    // Met à jour l'état actif sur TOUTES les bottom-nav (chaque écran a la sienne)
    document.querySelectorAll('.bottom-nav').forEach(function(nav){
      nav.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.remove('active'); });
    });
    if (btn) {
      var navParent = btn.closest('.bottom-nav');
      var index = Array.prototype.indexOf.call(navParent.children, btn);
      document.querySelectorAll('.bottom-nav').forEach(function(nav){
        if (nav.children[index]) nav.children[index].classList.add('active');
      });
    }
  }

  if (id === 's-stats') renderStats();
  if (id === 's-history') renderHistory();
  if (id === 's-main') updateTarifPill();
  if (id === 's-maintenance') { loadMaintenanceIntoInputs(); renderMaintenanceStatus(); }
  if (id === 's-settings') loadSettingsIntoInputs();
}

// ===== LANGUE =====
function setLang(lang) {
  currentLang = lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  localStorage.setItem('taxicost_lang', lang);
  document.getElementById('lang-fr').className = 'lang-btn' + (lang === 'fr' ? ' active' : '');
  document.getElementById('lang-ar').className = 'lang-btn' + (lang === 'ar' ? ' active' : '');
  var hint = document.getElementById('voice-hint');
  if (hint) hint.textContent = lang === 'ar' ? '🎤 للنطق' : '🎤 pour dicter un chiffre';
}

// ===== WELCOME / DRIVER NAME (sauvegarde auto) =====
function updateName() {
  var val = document.getElementById('name-input').value.trim();
  document.getElementById('welcome-msg').innerHTML = val ? 'Bonjour<br>' + val + ' !' : 'Bonjour !<br>Quel est ton prénom ?';
}
function showMain() {
  var name = document.getElementById('name-input').value.trim() || 'Chauffeur';
  localStorage.setItem('taxicost_driver', name);
  setDriverLabels(name);
  if (clients.length === 0) addClient();
  showScreen('s-main');
}
function setDriverLabels(name) {
  ['driver-label','driver-label-stats','driver-label-history','driver-label-maint','driver-label-settings'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.textContent = name;
  });
}

// ===========================================================
// ===== TARIF (auto jour/nuit + override manuel + heures modifiables) =====
// ===========================================================
var manualOverride = null; // null = auto, 'day' ou 'night' = forcé manuellement

function loadTarifDay() {
  var v = parseFloat(localStorage.getItem('taxicost_tarif_day'));
  return isNaN(v) ? 20 : v;
}
function loadTarifNight() {
  var v = parseFloat(localStorage.getItem('taxicost_tarif_night'));
  return isNaN(v) ? 30 : v;
}
function loadNightStart() {
  var v = parseInt(localStorage.getItem('taxicost_night_start'));
  return isNaN(v) ? 20 : v;
}
function loadNightEnd() {
  var v = parseInt(localStorage.getItem('taxicost_night_end'));
  return isNaN(v) ? 6 : v;
}
function isAutoMode() {
  var v = localStorage.getItem('taxicost_tarif_auto');
  return v === null ? true : v === 'true';
}
function isNightTime() {
  var h = new Date().getHours();
  var start = loadNightStart();
  var end = loadNightEnd();
  if (start === end) return false;
  if (start < end) {
    // ex: début 1h, fin 5h (cas rare où la nuit ne traverse pas minuit)
    return h >= start && h < end;
  }
  // cas normal : la nuit traverse minuit (ex: 20h -> 6h)
  return h >= start || h < end;
}

// Détermine quel tarif utiliser MAINTENANT pour la course en cours
function getTarif() {
  if (isAutoMode()) {
    return isNightTime() ? loadTarifNight() : loadTarifDay();
  }
  return manualOverride === 'night' ? loadTarifNight() : loadTarifDay();
}

function getActiveModeLabel() {
  if (isAutoMode()) {
    return isNightTime() ? { icon: '🌙', mode: 'night' } : { icon: '☀️', mode: 'day' };
  }
  return manualOverride === 'night' ? { icon: '🌙', mode: 'night' } : { icon: '☀️', mode: 'day' };
}

function updateTarifPill() {
  var info = getActiveModeLabel();
  var iconEl = document.getElementById('tarif-pill-icon');
  var valEl = document.getElementById('tarif-pill-val');
  if (iconEl) iconEl.textContent = info.icon;
  if (valEl) valEl.textContent = getTarif() + ' DA';
}

// ----- Écran Réglages : charge les valeurs actuelles dans les champs -----
function loadSettingsIntoInputs() {
  document.getElementById('tarif-day-input').value = loadTarifDay();
  document.getElementById('tarif-night-input').value = loadTarifNight();
  document.getElementById('night-start-input').value = loadNightStart();
  document.getElementById('night-end-input').value = loadNightEnd();
  document.getElementById('auto-tarif-toggle').checked = isAutoMode();
  updateHoursSummary();
  toggleManualNote();

  var savedLang = localStorage.getItem('taxicost_lang') || 'fr';
  document.getElementById('lang-fr').className = 'lang-btn' + (savedLang === 'fr' ? ' active' : '');
  document.getElementById('lang-ar').className = 'lang-btn' + (savedLang === 'ar' ? ' active' : '');
}

function updateHoursSummary() {
  var start = loadNightStart();
  var end = loadNightEnd();
  var sub = document.getElementById('auto-toggle-sub');
  if (sub) {
    document.getElementById('hours-summary-day').textContent = end + 'h–' + start + 'h';
    document.getElementById('hours-summary-night').textContent = start + 'h–' + end + 'h';
  }
}

function onAutoToggle() {
  var auto = document.getElementById('auto-tarif-toggle').checked;
  localStorage.setItem('taxicost_tarif_auto', auto);
  if (auto) manualOverride = null;
  else if (manualOverride === null) manualOverride = isNightTime() ? 'night' : 'day';
  toggleManualNote();
  recalcAll();
  updateTarifPill();
}
function toggleManualNote() {
  var note = document.getElementById('manual-active-note');
  var auto = document.getElementById('auto-tarif-toggle').checked;
  note.style.display = auto ? 'none' : 'block';
  if (!auto) {
    document.getElementById('pick-day').classList.toggle('active', manualOverride !== 'night');
    document.getElementById('pick-night').classList.toggle('active', manualOverride === 'night');
  }
}
function pickManualTarif(mode) {
  manualOverride = mode;
  toggleManualNote();
  recalcAll();
  updateTarifPill();
}
function onTarifSettingsChange() {
  var dayVal = parseFloat(document.getElementById('tarif-day-input').value) || 0;
  var nightVal = parseFloat(document.getElementById('tarif-night-input').value) || 0;
  localStorage.setItem('taxicost_tarif_day', dayVal);
  localStorage.setItem('taxicost_tarif_night', nightVal);
  recalcAll();
  updateTarifPill();
}
function onHoursSettingsChange() {
  var start = parseInt(document.getElementById('night-start-input').value);
  var end = parseInt(document.getElementById('night-end-input').value);
  if (isNaN(start)) start = 20;
  if (isNaN(end)) end = 6;
  start = Math.max(0, Math.min(23, start));
  end = Math.max(0, Math.min(23, end));
  localStorage.setItem('taxicost_night_start', start);
  localStorage.setItem('taxicost_night_end', end);
  updateHoursSummary();
  recalcAll();
  updateTarifPill();
}

// ===== CLIENTS =====
function addClient() {
  cid++;
  clients.push({ id: cid, depart: '', arrivee: '' });
  render();
}
function removeClient(id) {
  if (clients.length <= 1) return;
  clients = clients.filter(function(c){ return c.id !== id; });
  render();
}
function onDepart(id, val) {
  var c = clients.find(function(c){ return c.id === id; });
  if (c) { c.depart = val; renderCost(id); updateTotal(); }
}
function onArrivee(id, val) {
  var c = clients.find(function(c){ return c.id === id; });
  if (c) { c.arrivee = val; renderCost(id); updateTotal(); }
}

// ===== CALCUL =====
function calcCost(c) {
  var d = parseFloat(c.depart), a = parseFloat(c.arrivee);
  if (!isNaN(d) && !isNaN(a) && c.depart !== '' && c.arrivee !== '') {
    return Math.max(0, a - d + getTarif());
  }
  return null;
}
function recalcAll() {
  clients.forEach(function(c){ renderCost(c.id); });
  updateTotal();
}
function renderCost(id) {
  var el = document.getElementById('cost-' + id);
  if (!el) return;
  var c = clients.find(function(c){ return c.id === id; });
  if (!c) return;
  var cost = calcCost(c);
  if (cost !== null) { el.textContent = cost + ' DA'; el.className = 'cell-result'; }
  else { el.textContent = '—'; el.className = 'cell-result empty'; }
}
function updateTotal() {
  var total = 0;
  clients.forEach(function(c){ var cost = calcCost(c); if (cost !== null) total += cost; });
  var el = document.getElementById('total-val');
  if (el) el.textContent = total + ' DA';
}

// ===========================================================
// ===== VOIX — reconnaissance avec correction du bug "100" =====
// ===========================================================
function extractNumber(text) {
  if (!text) return null;
  text = text.trim().toLowerCase();
  // Nettoie la ponctuation parasite que Chrome ajoute parfois ("cent." "100," etc.)
  text = text.replace(/[.,!?]/g, '').trim();

  // 1. Cas direct : un chiffre est déjà présent ("100", "1 00" -> "100")
  var digitsOnly = text.replace(/\s+/g, '');
  var match = digitsOnly.match(/\d+/);
  if (match) return parseInt(match[0]);

  // 2. Nombres composés français (ex: "cent" = 100, "cent vingt" = 120, "quatre-vingt-dix" = 90)
  var units = {
    'zéro':0,'un':1,'une':1,'deux':2,'trois':3,'quatre':4,'cinq':5,
    'six':6,'sept':7,'huit':8,'neuf':9,'dix':10,
    'onze':11,'douze':12,'treize':13,'quatorze':14,'quinze':15,'seize':16,
    'dix-sept':17,'dix-huit':18,'dix-neuf':19
  };
  var tens = {
    'vingt':20,'trente':30,'quarante':40,'cinquante':50,
    'soixante':60,'quatre-vingt':80,'quatre vingt':80,'quatre-vingts':80
  };
  var hundreds = { 'cent':100, 'cents':100 };

  // Normalise "quatre-vingt-dix" etc en remplaçant le préfixe composé par un seul jeton
  var normalized = text
    .replace(/quatre[\s-]vingts?[\s-]dix/g, 'quatrevingtdix')
    .replace(/quatre[\s-]vingts?/g, 'quatrevingt')
    .replace(/dix[\s-]sept/g, 'dixsept')
    .replace(/dix[\s-]huit/g, 'dixhuit')
    .replace(/dix[\s-]neuf/g, 'dixneuf');

  var compoundTens = {
    'quatrevingt': 80, 'quatrevingtdix': 90,
    'dixsept': 17, 'dixhuit': 18, 'dixneuf': 19
  };

  var words = normalized.split(/[\s-]+/).filter(Boolean);
  if (words.length > 0) {
    var total = 0;
    var current = 0;
    var matchedAny = false;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (hundreds[w] !== undefined) {
        current = (current === 0 ? 1 : current) * 100;
        total += current;
        current = 0;
        matchedAny = true;
      } else if (compoundTens[w] !== undefined) {
        current += compoundTens[w];
        matchedAny = true;
      } else if (tens[w] !== undefined) {
        current += tens[w];
        matchedAny = true;
      } else if (units[w] !== undefined) {
        current += units[w];
        matchedAny = true;
      }
    }
    total += current;
    if (matchedAny) return total;
  }

  // 3. Mots arabes (un seul mot, pas composé)
  var arabicWords = {
    'صفر':0,'واحد':1,'اثنين':2,'ثلاثة':3,'أربعة':4,
    'خمسة':5,'ستة':6,'سبعة':7,'ثمانية':8,'تسعة':9,
    'عشرة':10,'عشرين':20,'ثلاثين':30,'أربعين':40,
    'خمسين':50,'ستين':60,'سبعين':70,'ثمانين':80,
    'تسعين':90,'مية':100,'مائة':100
  };
  for (var word in arabicWords) {
    if (text.indexOf(word) !== -1) return arabicWords[word];
  }

  return null;
}

var voiceTimeoutId = null;
var voiceRetryDone = false;

function startVoice(clientId, field, isRetry) {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Micro non supporté'); return; }

  if (activeRecognition) {
    try {
      activeRecognition.onresult = null;
      activeRecognition.onerror = null;
      activeRecognition.onend = null;
      activeRecognition.abort();
    } catch(e){}
    activeRecognition = null;
  }
  if (voiceTimeoutId) { clearTimeout(voiceTimeoutId); voiceTimeoutId = null; }

  var btn = document.getElementById('mic-' + clientId + '-' + field);
  if (!btn) return;

  if (!isRetry) voiceRetryDone = false;

  var recognition = new SR();
  recognition.lang = currentLang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;
  activeRecognition = recognition;

  var settled = false;

  function cleanup() {
    settled = true;
    btn.classList.remove('listening');
    if (voiceTimeoutId) { clearTimeout(voiceTimeoutId); voiceTimeoutId = null; }
    activeRecognition = null;
  }

  btn.classList.add('listening');
  showToast(currentLang === 'ar-DZ' ? '🎤 تحدث الآن...' : '🎤 Parle maintenant...');

  voiceTimeoutId = setTimeout(function() {
    if (settled) return;
    try { recognition.abort(); } catch(e){}
    cleanup();
    if (!voiceRetryDone) {
      voiceRetryDone = true;
      showToast(currentLang === 'ar-DZ' ? '🔄 إعادة المحاولة...' : '🔄 Nouvelle tentative...');
      setTimeout(function(){ startVoice(clientId, field, true); }, 300);
    } else {
      showToast(currentLang === 'ar-DZ' ? 'لم يعمل، حاول يدوياً' : 'Micro indisponible, réessaie');
    }
  }, 6000);

  recognition.onresult = function(event) {
    if (settled) return;
    cleanup();
    for (var i = 0; i < event.results[0].length; i++) {
      var num = extractNumber(event.results[0][i].transcript);
      if (num !== null) {
        var input = document.getElementById('input-' + clientId + '-' + field);
        if (input) {
          input.value = num;
          if (field === 'depart') onDepart(clientId, String(num));
          else onArrivee(clientId, String(num));
          showToast('✓ ' + num);
        }
        return;
      }
    }
    showToast(currentLang === 'ar-DZ' ? 'لم أفهم، حاول مجدداً' : 'Pas compris, réessaie');
  };

  recognition.onerror = function(e) {
    if (settled) return;
    cleanup();
    if (e.error === 'not-allowed') {
      showToast('Micro bloqué — autorise l\'accès');
    } else if ((e.error === 'no-speech' || e.error === 'aborted' || e.error === 'network') && !voiceRetryDone) {
      voiceRetryDone = true;
      setTimeout(function(){ startVoice(clientId, field, true); }, 300);
    } else {
      showToast(currentLang === 'ar-DZ' ? 'خطأ، حاول مجدداً' : 'Erreur micro, réessaie');
    }
  };

  recognition.onend = function() {
    if (settled) return;
    cleanup();
  };

  try {
    recognition.start();
  } catch(e) {
    cleanup();
    if (!voiceRetryDone) {
      voiceRetryDone = true;
      setTimeout(function(){ startVoice(clientId, field, true); }, 300);
    }
  }
}

function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2000);
}
function micIcon() {
  return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';
}

// ===== RENDU CLIENTS =====
function render() {
  var list = document.getElementById('clients-list');
  if (!list) return;
  list.innerHTML = clients.map(function(c) {
    var showDel = clients.length > 1;
    return '<div class="client-row">' +
      '<div class="cell-num">' + c.id + '</div>' +
      '<div class="cell-group">' +
        '<div class="cell-field-row">' +
          '<span class="cell-field-label">Départ</span>' +
          '<input class="cell-input" id="input-' + c.id + '-depart" type="number" inputmode="numeric" placeholder="0" value="' + c.depart + '" oninput="onDepart(' + c.id + ',this.value)" min="0">' +
          '<button class="mic-btn" id="mic-' + c.id + '-depart" onclick="startVoice(' + c.id + ',\'depart\')">' + micIcon() + '</button>' +
        '</div>' +
        '<div class="cell-field-row">' +
          '<span class="cell-field-label">Arrivée</span>' +
          '<input class="cell-input" id="input-' + c.id + '-arrivee" type="number" inputmode="numeric" placeholder="0" value="' + c.arrivee + '" oninput="onArrivee(' + c.id + ',this.value)" min="0">' +
          '<button class="mic-btn" id="mic-' + c.id + '-arrivee" onclick="startVoice(' + c.id + ',\'arrivee\')">' + micIcon() + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="cell-right">' +
        '<div class="cell-result empty" id="cost-' + c.id + '">—</div>' +
        (showDel ? '<div class="cell-del" onclick="removeClient(' + c.id + ')">×</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
  recalcAll();
}
function resetAll() {
  clients = []; cid = 0; addClient();
  var el = document.getElementById('total-val');
  if (el) el.textContent = '0 DA';
}

// ===========================================================
// ===== COURSES (historique) =====
// ===========================================================
function loadCourses() {
  var raw = localStorage.getItem('taxicost_courses');
  return raw ? JSON.parse(raw) : [];
}
function saveCourses(arr) {
  localStorage.setItem('taxicost_courses', JSON.stringify(arr));
}

function endCourse() {
  var total = 0, nbClients = 0;
  clients.forEach(function(c){
    var cost = calcCost(c);
    if (cost !== null) { total += cost; nbClients++; }
  });
  if (nbClients === 0) { showToast('⚠️ Renseigne au moins un client'); return; }

  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  playBeep();

  var courses = loadCourses();
  courses.push({ ts: Date.now(), total: total, nbClients: nbClients });
  saveCourses(courses);

  showToast('✓ Course enregistrée : ' + total + ' DA');
  resetAll();
  setTimeout(function(){
    var statsBtn = document.querySelector('#s-main .bottom-nav .nav-btn:nth-child(2)');
    goTab('s-stats', statsBtn);
  }, 350);
}

function playBeep() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

function undoLast() {
  var courses = loadCourses();
  if (courses.length === 0) return;
  var removed = courses.pop();
  saveCourses(courses);
  showToast('↩ Course annulée : ' + removed.total + ' DA');
  renderHistory();
}

function clearStats() {
  if (confirm("Effacer tout l'historique des courses ? Cette action est irréversible.")) {
    localStorage.removeItem('taxicost_courses');
    renderHistory();
  }
}

// ===========================================================
// ===== EXPORT PDF =====
// ===========================================================
function exportPDF() {
  var courses = loadCourses();
  var now = new Date();
  var from;
  var periodLabel;

  if (currentPeriod === 'day') { from = startOfDay(now); periodLabel = 'Journée du ' + now.getDate() + ' ' + MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear(); }
  else if (currentPeriod === 'week') { from = startOfWeek(now); periodLabel = 'Semaine du ' + from.getDate() + ' ' + MONTH_NAMES[from.getMonth()] + ' ' + now.getFullYear(); }
  else { from = startOfMonth(now); periodLabel = capitalize(MONTH_NAMES[now.getMonth()]) + ' ' + now.getFullYear(); }

  var filtered = courses.filter(function(c){ return c.ts >= from.getTime(); }).sort(function(a,b){ return a.ts - b.ts; });

  if (filtered.length === 0) {
    showToast('Aucune course à exporter pour cette période');
    return;
  }

  var totalRevenue = 0, totalClients = 0;
  filtered.forEach(function(c){ totalRevenue += c.total; totalClients += c.nbClients; });
  var fuel = loadFuel();
  var net = totalRevenue - fuel;
  var driverName = localStorage.getItem('taxicost_driver') || 'Chauffeur';

  var rowsHtml = '';
  if (currentPeriod === 'day') {
    rowsHtml = '<table><thead><tr><th>Heure</th><th>Clients</th><th>Montant</th></tr></thead><tbody>';
    filtered.forEach(function(c){
      var d = new Date(c.ts);
      var time = ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
      rowsHtml += '<tr><td>' + time + '</td><td>' + c.nbClients + '</td><td>' + c.total + ' DA</td></tr>';
    });
    rowsHtml += '</tbody></table>';
  } else {
    var byDay = {};
    filtered.forEach(function(c){
      var d = new Date(c.ts);
      var k = dayKey(d);
      if (!byDay[k]) byDay[k] = { date: d, total: 0, courses: 0, clients: 0 };
      byDay[k].total += c.total;
      byDay[k].courses += 1;
      byDay[k].clients += c.nbClients;
    });
    var days = Object.keys(byDay).map(function(k){ return byDay[k]; }).sort(function(a,b){ return a.date - b.date; });
    rowsHtml = '<table><thead><tr><th>Jour</th><th>Courses</th><th>Clients</th><th>Montant</th></tr></thead><tbody>';
    days.forEach(function(d){
      var dname = capitalize(DAY_NAMES[d.date.getDay()]);
      rowsHtml += '<tr><td>' + dname + ' ' + d.date.getDate() + '</td><td>' + d.courses + '</td><td>' + d.clients + '</td><td>' + d.total + ' DA</td></tr>';
    });
    rowsHtml += '</tbody></table>';
  }

  var fullHtml =
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">' +
    '<title>TaxiCost — Rapport</title>' +
    '<style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a2e;padding:24px;margin:0;}' +
      '.pr-header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #FFC107;padding-bottom:16px;margin-bottom:20px;}' +
      '.pr-logo{width:50px;height:50px;background:#FFC107;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '.pr-title{font-size:22px;font-weight:700;}' +
      '.pr-sub{font-size:13px;color:#888;margin-top:2px;}' +
      '.pr-section-title{font-size:14px;font-weight:700;margin:18px 0 8px;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;}' +
      'th{text-align:left;background:#FFF4D6;padding:8px 10px;font-weight:700;}' +
      'td{padding:8px 10px;border-bottom:1px solid #f0e8d0;}' +
      '.pr-totals{margin-top:16px;background:#1a1a2e;color:#fff;border-radius:10px;padding:16px 20px;}' +
      '.pr-totals-row{display:flex;justify-content:space-between;padding:4px 0;font-size:14px;}' +
      '.pr-totals-row.main{font-size:20px;font-weight:700;color:#FFC107;border-top:1px solid rgba(255,255,255,0.2);margin-top:8px;padding-top:10px;}' +
      '.pr-footer{margin-top:24px;font-size:11px;color:#aaa;text-align:center;}' +
      '@media print { @page { margin: 16mm; } }' +
    '</style></head><body>' +
    '<div class="pr-header">' +
      '<div class="pr-logo"><svg width="28" height="28" viewBox="0 0 84 70" fill="none">' +
        '<path d="M14 28 L18 12 Q20 6 27 6 L57 6 Q64 6 66 12 L70 28" fill="#1a1a2e"/>' +
        '<rect x="4" y="28" width="76" height="22" rx="8" fill="#1a1a2e"/>' +
        '<rect x="0" y="44" width="84" height="16" rx="6" fill="#1a1a2e"/>' +
        '<circle cx="16" cy="62" r="8" fill="#FFC107"/><circle cx="16" cy="62" r="3.5" fill="#1a1a2e"/>' +
        '<circle cx="68" cy="62" r="8" fill="#FFC107"/><circle cx="68" cy="62" r="3.5" fill="#1a1a2e"/>' +
        '<rect x="22" y="14" width="18" height="11" rx="3" fill="#FFC107"/><rect x="44" y="14" width="18" height="11" rx="3" fill="#FFC107"/>' +
        '<rect x="33" y="0" width="18" height="8" rx="2" fill="#FFC107"/>' +
      '</svg></div>' +
      '<div><div class="pr-title">TaxiCost — Rapport</div><div class="pr-sub">' + driverName + ' · ' + periodLabel + '</div></div>' +
    '</div>' +
    '<div class="pr-section-title">Détail des courses</div>' +
    rowsHtml +
    '<div class="pr-totals">' +
      '<div class="pr-totals-row"><span>Nombre de courses</span><span>' + filtered.length + '</span></div>' +
      '<div class="pr-totals-row"><span>Nombre de clients</span><span>' + totalClients + '</span></div>' +
      '<div class="pr-totals-row"><span>Revenu brut</span><span>' + totalRevenue + ' DA</span></div>' +
      '<div class="pr-totals-row"><span>Essence</span><span>− ' + fuel + ' DA</span></div>' +
      '<div class="pr-totals-row main"><span>Revenu net</span><span>' + net + ' DA</span></div>' +
    '</div>' +
    '<div class="pr-footer">Généré par TaxiCost le ' + now.toLocaleDateString('fr-FR') + ' à ' + ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2) + '</div>' +
    '<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>' +
    '</body></html>';

  var printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Autorise les pop-ups pour exporter le PDF');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();
}

// ===========================================================
// ===== DATES =====
// ===========================================================
var DAY_NAMES = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
var MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function startOfDay(d){ var x=new Date(d); x.setHours(0,0,0,0); return x; }
function startOfWeek(d){ var x=startOfDay(d); var day=x.getDay(); var diff=(day===0?6:day-1); x.setDate(x.getDate()-diff); return x; }
function startOfMonth(d){ var x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function dayKey(d){ return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

// ===========================================================
// ===== PERIODE STATS & ESSENCE =====
// ===========================================================
function setPeriod(p) {
  currentPeriod = p;
  ['day','week','month'].forEach(function(k){ document.getElementById('period-'+k).classList.toggle('active', k===p); });
  renderStats();
}

function fuelKey() {
  var now = new Date();
  if (currentPeriod === 'day') {
    return 'taxicost_fuel_day_' + dayKey(now);
  } else if (currentPeriod === 'week') {
    return 'taxicost_fuel_week_' + dayKey(startOfWeek(now));
  } else {
    return 'taxicost_fuel_month_' + now.getFullYear() + '-' + now.getMonth();
  }
}
function onFuelChange() {
  var v = parseFloat(document.getElementById('fuel-input').value) || 0;
  localStorage.setItem(fuelKey(), v);
  updateNet();
}
function loadFuel() {
  var v = parseFloat(localStorage.getItem(fuelKey()));
  return isNaN(v) ? 0 : v;
}
function updateNet() {
  var revenue = parseInt(document.getElementById('stat-revenue').textContent) || 0;
  var fuel = loadFuel();
  document.getElementById('net-val').textContent = (revenue - fuel) + ' DA';
}

// ===========================================================
// ===== STATS (écran dédié, sans historique ni undo) =====
// ===========================================================
function renderStats() {
  var courses = loadCourses();
  var now = new Date();
  var from, label, fuelSubLabel, netSubLabel;

  if (currentPeriod === 'day') { from = startOfDay(now); label='Revenu brut du jour'; fuelSubLabel='Coût du jour'; netSubLabel='Brut − essence (jour)'; }
  else if (currentPeriod === 'week') { from = startOfWeek(now); label='Revenu brut de la semaine'; fuelSubLabel='Coût de la semaine'; netSubLabel='Brut − essence (semaine)'; }
  else { from = startOfMonth(now); label='Revenu brut du mois'; fuelSubLabel='Coût du mois'; netSubLabel='Brut − essence (mois)'; }

  var filtered = courses.filter(function(c){ return c.ts >= from.getTime(); });
  var totalRevenue = 0, totalClients = 0;
  filtered.forEach(function(c){ totalRevenue += c.total; totalClients += c.nbClients; });

  document.getElementById('stat-revenue-label').textContent = label;
  document.getElementById('stat-revenue').textContent = totalRevenue + ' DA';
  document.getElementById('stat-courses').textContent = filtered.length;
  document.getElementById('stat-clients').textContent = totalClients;
  document.getElementById('fuel-sub').textContent = fuelSubLabel;
  document.getElementById('fuel-input').value = loadFuel() || '';
  document.getElementById('net-sub').textContent = netSubLabel;
  updateNet();

  document.getElementById('stat-date').textContent =
    capitalize(DAY_NAMES[now.getDay()]) + ' ' + now.getDate() + ' ' + MONTH_NAMES[now.getMonth()] + ' ' + now.getFullYear();

  var chartTitle = document.getElementById('chart-title');
  var chartSvg = document.getElementById('chart-svg');

  if (currentPeriod === 'day') {
    chartTitle.textContent = 'Revenus par heure';
    drawChart(chartSvg, hourlyBuckets(filtered));
  } else {
    var byDay = {};
    filtered.forEach(function(c){
      var d = new Date(c.ts);
      var k = dayKey(d);
      if (!byDay[k]) byDay[k] = { date: d, total: 0 };
      byDay[k].total += c.total;
    });
    var days = Object.keys(byDay).map(function(k){ return byDay[k]; });
    chartTitle.textContent = currentPeriod === 'week' ? 'Revenus par jour (semaine)' : 'Revenus par jour (mois)';
    drawChart(chartSvg, dailyBuckets(days, currentPeriod, now));
  }
}

// ===========================================================
// ===== HISTORIQUE (écran dédié, avec undo + reset) =====
// ===========================================================
function setHistoryPeriod(p) {
  currentHistoryPeriod = p;
  ['day','week','month'].forEach(function(k){ document.getElementById('hperiod-'+k).classList.toggle('active', k===p); });
  renderHistory();
}

function renderHistory() {
  var courses = loadCourses();
  var now = new Date();
  var from;

  if (currentHistoryPeriod === 'day') from = startOfDay(now);
  else if (currentHistoryPeriod === 'week') from = startOfWeek(now);
  else from = startOfMonth(now);

  var filtered = courses.filter(function(c){ return c.ts >= from.getTime(); });

  document.getElementById('undo-btn').disabled = courses.length === 0;

  var historyTitleEl = document.getElementById('history-title');
  var listEl = document.getElementById('history-list');

  if (currentHistoryPeriod === 'day') {
    historyTitleEl.textContent = 'Courses du jour';
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="history-empty">Aucune course pour le moment</div>';
    } else {
      listEl.innerHTML = filtered.slice().reverse().map(function(c){
        var d = new Date(c.ts);
        var time = ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
        return '<div class="history-item">' +
          '<div><div class="history-time">'+time+'</div><div class="history-clients">'+c.nbClients+' client'+(c.nbClients>1?'s':'')+'</div></div>' +
          '<div class="history-amount">'+c.total+' DA</div>' +
        '</div>';
      }).join('');
    }
  } else {
    historyTitleEl.textContent = currentHistoryPeriod === 'week' ? 'Détail par jour (semaine)' : 'Détail par jour (mois)';
    var byDay = {};
    filtered.forEach(function(c){
      var d = new Date(c.ts);
      var k = dayKey(d);
      if (!byDay[k]) byDay[k] = { date: d, total: 0, courses: 0, clients: 0 };
      byDay[k].total += c.total;
      byDay[k].courses += 1;
      byDay[k].clients += c.nbClients;
    });
    var days = Object.keys(byDay).map(function(k){ return byDay[k]; }).sort(function(a,b){ return b.date - a.date; });
    if (days.length === 0) {
      listEl.innerHTML = '<div class="history-empty">Aucune course pour le moment</div>';
    } else {
      listEl.innerHTML = days.map(function(d){
        var dname = DAY_NAMES[d.date.getDay()].slice(0,3);
        return '<div class="day-card">' +
          '<div class="day-badge"><div class="dnum">'+d.date.getDate()+'</div><div class="dname">'+dname+'</div></div>' +
          '<div class="day-info">' +
            '<div class="dcourses">'+d.courses+' course'+(d.courses>1?'s':'')+'</div>' +
            '<div class="dclients">'+d.clients+' client'+(d.clients>1?'s':'')+'</div>' +
          '</div>' +
          '<div class="day-amount">'+d.total+' DA</div>' +
        '</div>';
      }).join('');
    }
  }
}

// ----- buckets pour graphique -----
function hourlyBuckets(filtered) {
  var buckets = {};
  for (var h=6; h<=23; h++) buckets[h] = 0;
  filtered.forEach(function(c){
    var h = new Date(c.ts).getHours();
    if (buckets[h] === undefined) buckets[h] = 0;
    buckets[h] += c.total;
  });
  var keys = Object.keys(buckets).map(Number).sort(function(a,b){return a-b;});
  var labels = keys.map(function(k){ return k+'h'; });
  var values = keys.map(function(k){ return buckets[k]; });
  return { labels: labels, values: values };
}
function dailyBuckets(days, period, refDate) {
  var byKey = {};
  days.forEach(function(d){ byKey[dayKey(d.date)] = d; });

  var allDays = [];

  if (period === 'week') {
    var monday = startOfWeek(refDate);
    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(monday.getDate() + i);
      var k = dayKey(d);
      allDays.push(byKey[k] ? byKey[k] : { date: d, total: 0 });
    }
  } else {
    var first = startOfMonth(refDate);
    var y = first.getFullYear(), m = first.getMonth();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    for (var n = 1; n <= daysInMonth; n++) {
      var d2 = new Date(y, m, n);
      var k2 = dayKey(d2);
      allDays.push(byKey[k2] ? byKey[k2] : { date: d2, total: 0 });
    }
  }

  var labels = allDays.map(function(d){
    return period === 'week' ? DAY_NAMES[d.date.getDay()].slice(0,3) : String(d.date.getDate());
  });
  var values = allDays.map(function(d){ return d.total; });
  return { labels: labels, values: values };
}

// ----- dessin du graphique en barres (SVG) -----
function drawChart(svg, data) {
  var labels = data.labels, values = data.values;
  if (values.length === 0) {
    svg.innerHTML = '<text x="150" y="70" text-anchor="middle" fill="#e6e0cc" font-size="12">Aucune donnée</text>';
    return;
  }
  var max = Math.max.apply(null, values);
  if (max === 0) max = 1;
  var W = 300, H = 140, padBottom = 22, padTop = 10;
  var gap = W / values.length;
  var barW = Math.min(28, gap * 0.55);

  var bars = '';
  values.forEach(function(v, i) {
    var h = (v / max) * (H - padBottom - padTop);
    var x = i * gap + (gap - barW)/2;
    var y = H - padBottom - h;
    var color = (v === max && v > 0) ? '#FFC107' : '#FFE6A3';
    bars += '<rect x="'+x+'" y="'+y+'" width="'+barW+'" height="'+Math.max(h,2)+'" rx="4" fill="'+color+'"/>';
    var labelStep = values.length > 12 ? Math.ceil(values.length/8) : 1;
    if (i % labelStep === 0) {
      bars += '<text x="'+(x+barW/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="9" fill="#9a9a9a">'+labels[i]+'</text>';
    }
  });
  svg.innerHTML = bars;
}

// ===========================================================
// ===== ENTRETIEN VÉHICULE (Assurance / Vidange) =====
// ===========================================================
function saveMaintenance() {
  var data = {
    insuranceDate: document.getElementById('insurance-date').value,
    insuranceDuration: document.getElementById('insurance-duration').value,
    vidangeDate: document.getElementById('vidange-date').value,
    vidangeDuration: document.getElementById('vidange-duration').value
  };
  localStorage.setItem('taxicost_maintenance', JSON.stringify(data));
}

function loadMaintenance() {
  var raw = localStorage.getItem('taxicost_maintenance');
  return raw ? JSON.parse(raw) : { insuranceDate:'', insuranceDuration:'', vidangeDate:'', vidangeDuration:'' };
}

function onMaintenanceChange() {
  saveMaintenance();
  renderMaintenanceStatus();
}

function computeExpiry(dateStr, durationMonths) {
  if (!dateStr || !durationMonths) return null;
  var d = new Date(dateStr);
  d.setMonth(d.getMonth() + parseInt(durationMonths));
  return d;
}

function daysUntil(date) {
  var now = startOfDay(new Date());
  var target = startOfDay(date);
  return Math.round((target - now) / 86400000);
}

function renderMaintenanceCard(prefix) {
  var data = loadMaintenance();
  var dateVal = data[prefix + 'Date'];
  var durationVal = data[prefix + 'Duration'];
  var card = document.getElementById(prefix === 'insurance' ? 'insurance-card' : 'vidange-card');
  var statusEl = document.getElementById(prefix + '-status');
  if (!card || !statusEl) return;

  if (!dateVal || !durationVal) {
    statusEl.textContent = 'Non renseignée';
    card.classList.remove('alert');
    return;
  }

  var expiry = computeExpiry(dateVal, durationVal);
  var days = daysUntil(expiry);
  var expiryStr = expiry.getDate() + ' ' + MONTH_NAMES[expiry.getMonth()] + ' ' + expiry.getFullYear();

  if (days < 0) {
    statusEl.textContent = '⚠️ Expirée depuis ' + Math.abs(days) + ' jour' + (Math.abs(days) > 1 ? 's' : '');
    card.classList.add('alert');
  } else if (days <= 7) {
    statusEl.textContent = '⚠️ Expire dans ' + days + ' jour' + (days > 1 ? 's' : '') + ' (' + expiryStr + ')';
    card.classList.add('alert');
  } else {
    statusEl.textContent = 'Valide jusqu\'au ' + expiryStr;
    card.classList.remove('alert');
  }
}

function renderMaintenanceStatus() {
  renderMaintenanceCard('insurance');
  renderMaintenanceCard('vidange');
}

function checkMaintenanceAlerts() {
  var data = loadMaintenance();
  var alerts = [];

  var insExpiry = computeExpiry(data.insuranceDate, data.insuranceDuration);
  if (insExpiry) {
    var insDays = daysUntil(insExpiry);
    if (insDays >= 0 && insDays <= 7) alerts.push('🛡️ Assurance expire dans ' + insDays + ' jour' + (insDays > 1 ? 's' : ''));
    else if (insDays < 0) alerts.push('🛡️ Assurance expirée !');
  }

  var vidExpiry = computeExpiry(data.vidangeDate, data.vidangeDuration);
  if (vidExpiry) {
    var vidDays = daysUntil(vidExpiry);
    if (vidDays >= 0 && vidDays <= 7) alerts.push('🛢️ Vidange à prévoir dans ' + vidDays + ' jour' + (vidDays > 1 ? 's' : ''));
    else if (vidDays < 0) alerts.push('🛢️ Vidange en retard !');
  }

  if (alerts.length > 0) {
    showToast(alerts.join(' · '));
  }
}

function loadMaintenanceIntoInputs() {
  var data = loadMaintenance();
  document.getElementById('insurance-date').value = data.insuranceDate || '';
  document.getElementById('insurance-duration').value = data.insuranceDuration || '';
  document.getElementById('vidange-date').value = data.vidangeDate || '';
  document.getElementById('vidange-duration').value = data.vidangeDuration || '';
}

// ===========================================================
// ===== NOTIFICATIONS ANDROID (rappels assurance/vidange) =====
// ===========================================================
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications non supportées sur ce navigateur');
    return;
  }
  Notification.requestPermission().then(function(perm) {
    updateNotifButton();
    if (perm === 'granted') {
      showToast('✓ Rappels activés');
      scheduleMaintenanceChecks();
    } else {
      showToast('Notifications refusées — active-les dans les paramètres Chrome');
    }
  });
}

function updateNotifButton() {
  var btn = document.getElementById('notif-btn');
  if (!btn || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    btn.textContent = '🔔 Rappels activés';
    btn.classList.add('granted');
  } else {
    btn.textContent = '🔔 Activer les rappels sur le téléphone';
    btn.classList.remove('granted');
  }
}

function sendNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(function(reg) {
      reg.showNotification(title, {
        body: body,
        icon: 'icon-192.png',
        badge: 'icon-192.png',
        tag: tag, // évite les doublons si on rouvre l'app le même jour
        renotify: false
      });
    });
  }
}

// Vérifie chaque échéance et envoie une notif à 7j, 3j, 1j avant (une seule fois par seuil et par jour)
function scheduleMaintenanceChecks() {
  var data = loadMaintenance();
  var today = dayKey(new Date());

  checkAndNotify('insurance', '🛡️ Assurance', data.insuranceDate, data.insuranceDuration, today);
  checkAndNotify('vidange', '🛢️ Vidange', data.vidangeDate, data.vidangeDuration, today);
}

function checkAndNotify(prefix, label, dateStr, duration, today) {
  var expiry = computeExpiry(dateStr, duration);
  if (!expiry) return;
  var days = daysUntil(expiry);

  if (days !== 7 && days !== 3 && days !== 1 && days !== 0) return;

  var sentKey = 'taxicost_notif_' + prefix + '_' + days + '_' + today;
  if (localStorage.getItem(sentKey)) return; // déjà envoyée aujourd'hui pour ce seuil

  var msg;
  if (days === 0) msg = label + ' expire AUJOURD\'HUI !';
  else msg = label + ' expire dans ' + days + ' jour' + (days > 1 ? 's' : '');

  sendNotification('TaxiCost — Rappel', msg, prefix + '-' + days);
  localStorage.setItem(sentKey, '1');
}

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// ===== INIT =====
(function init() {
  var savedDriver = localStorage.getItem('taxicost_driver');
  if (savedDriver) {
    document.getElementById('name-input').value = savedDriver;
    updateName();
    setDriverLabels(savedDriver);
  }

  var savedLang = localStorage.getItem('taxicost_lang') || 'fr';
  setLang(savedLang);

  if (!isAutoMode()) {
    manualOverride = isNightTime() ? 'night' : 'day';
  }
  updateTarifPill();
  render();

updateNotifButton();
  setTimeout(function() {
    checkMaintenanceAlerts();
    if ('Notification' in window && Notification.permission === 'granted') {
      scheduleMaintenanceChecks();
    }
  }, 1500);

  // Revérifie une fois par jour si l'app reste ouverte longtemps
  setInterval(function() {
    if ('Notification' in window && Notification.permission === 'granted') {
      scheduleMaintenanceChecks();
    }
  }, 6 * 60 * 60 * 1000); // toutes les 6h

  // Vérifie toutes les 5 minutes si on doit basculer jour/nuit automatiquement
  setInterval(function() {
    if (isAutoMode()) { recalcAll(); updateTarifPill(); }
  }, 5 * 60 * 1000);
})();
