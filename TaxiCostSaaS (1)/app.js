// ===========================================================
// ===== SUPABASE — CONFIG & AUTH =====
// ===========================================================
var SUPABASE_URL = 'https://idqhakkbqdmysfgbyzwb.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlkcWhha2ticWRteXNmZ2J5endiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDk2NTMsImV4cCI6MjEwNDgyNTY1M30.MADG5VX49WNFkI4KBj8-lCnPjAAOcFhN_iJUj7fITsU';

// 'supabase' est le nom global fourni par le script CDN — on nomme notre client différemment pour éviter tout conflit
var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Ton numéro WhatsApp (format international sans le +)
var WHATSAPP_NUMBER = '213793270749'; // ← REMPLACE PAR TON VRAI NUMÉRO ex: 213770123456
var PRIX_ABONNEMENT = '500 DA';

// ----- Connexion -----
function doLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pwd = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!email || !pwd) { errEl.textContent = 'Remplis tous les champs'; return; }

  supabaseClient.auth.signInWithPassword({ email: email, password: pwd })
    .then(function(res) {
      if (res.error) {
        errEl.textContent = 'Email ou mot de passe incorrect';
      }
    });
}

// ----- Inscription avec essai gratuit 3 jours -----
function doRegister() {
  var name = document.getElementById('reg-name').value.trim();
  var email = document.getElementById('reg-email').value.trim();
  var pwd = document.getElementById('reg-password').value;
  var errEl = document.getElementById('reg-error');
  errEl.textContent = '';
  errEl.style.color = '';
  if (!name || !email || !pwd) { errEl.textContent = 'Remplis tous les champs'; return; }
  if (pwd.length < 6) { errEl.textContent = 'Mot de passe trop court (min. 6 caractères)'; return; }

  // Le trigger SQL "on_auth_user_created" crée automatiquement la ligne subscriptions
  // (avec trial_end = now() + 3 jours) à partir de raw_user_meta_data.name
  supabaseClient.auth.signUp({
    email: email,
    password: pwd,
    options: { data: { name: name } }
  }).then(function(res) {
    if (res.error) {
      if (res.error.message && res.error.message.toLowerCase().indexOf('already registered') !== -1) {
        errEl.textContent = 'Cet email est déjà utilisé';
      } else {
        errEl.textContent = 'Erreur : ' + res.error.message;
      }
      return;
    }
    // Si "Confirm email" est désactivé dans Supabase, une session est créée immédiatement
    // et onAuthStateChange ci-dessous prend le relais automatiquement.
    if (res.data && res.data.session) {
      return;
    }
    // Sinon, la confirmation par email est requise : on informe clairement l'utilisateur
    errEl.style.color = '#16a34a';
    errEl.textContent = 'Compte créé ! Vérifie ton email (et les spams), clique sur le lien de confirmation, puis reviens te connecter.';
  });
}

// ----- Mot de passe oublié -----
function doForgotPassword() {
  var email = document.getElementById('forgot-email').value.trim();
  var errEl = document.getElementById('forgot-error');
  errEl.style.color = '';
  errEl.textContent = '';

  if (!email) { errEl.style.color = '#dc2626'; errEl.textContent = 'Entre ton email'; return; }

  supabaseClient.auth.resetPasswordForEmail(email)
    .then(function(res) {
      if (res.error) {
        errEl.style.color = '#dc2626';
        errEl.textContent = 'Erreur : ' + res.error.message;
      } else {
        errEl.style.color = '#16a34a';
        errEl.textContent = 'Email envoyé ! Vérifie ta boîte de réception (et les spams).';
      }
    });
}

// ----- Déconnexion -----
function doLogout() {
  appData = { courses: [], fuel: {}, maintenance: {}, settings: {} };
  clients = []; cid = 0;
  supabaseClient.auth.signOut();
}

// ----- Référence courte pour faire correspondre un virement CCP à un compte -----
function shortRef(uid) {
  return uid ? uid.slice(0, 8).toUpperCase() : '';
}

// Affiche la référence de l'utilisateur connecté sur les écrans pending/expired
function updateRefLabels() {
  supabaseClient.auth.getUser().then(function(res) {
    var user = res.data && res.data.user;
    if (!user) return;
    var ref = shortRef(user.id);
    var elP = document.getElementById('ref-pending');
    var elE = document.getElementById('ref-expired');
    if (elP) elP.textContent = ref;
    if (elE) elE.textContent = ref;
  });
}

// ----- Choix de formule + WhatsApp -----
function subscribeToPlan(plan) {
  supabaseClient.auth.getUser().then(function(res) {
    var user = res.data && res.data.user;
    if (!user) return;
    var ref = shortRef(user.id);
    var planLabel = plan === 'yearly' ? '1 an' : '1 mois';
    var price = plan === 'yearly' ? '5000 DA' : PRIX_ABONNEMENT;

    // Enregistre la formule choisie dans Supabase (aide à la v\u00e9rification c\u00f4t\u00e9 admin)
    supabaseClient.from('subscriptions').update({ requested_plan: plan }).eq('user_id', user.id).then(function(){});

    var msg = encodeURIComponent(
      'Bonjour, je souhaite activer mon abonnement TaxiCost.\n' +
      'Formule : ' + planLabel + ' (' + price + ')\n' +
      'Référence : ' + ref + '\n' +
      'Email : ' + user.email
    );
    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + msg, '_blank');
  });
}

// ----- Écoute le statut d'authentification en temps réel -----
supabaseClient.auth.onAuthStateChange(function(event, session) {
  if (!session) {
    showScreen('s-login');
    return;
  }
  var user = session.user;

  supabaseClient
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()
    .then(function(res) {
      if (res.error || !res.data) { showScreen('s-pending'); updateRefLabels(); return; }
      var data = res.data;
      var name = data.name || 'Chauffeur';

      // 1. Abonnement payant actif — on vérifie aussi la date de fin (30 jours / 1 an)
      if (data.status === 'active') {
        if (data.subscription_end) {
          var subEnd = new Date(data.subscription_end);
          var nowActive = new Date();
          if (subEnd > nowActive) {
            enterApp(name);
            return;
          }
          // Abonnement expiré → retour à l'écran de paiement
          showScreen('s-expired');
          updateRefLabels();
          return;
        }
        // Pas de date de fin enregistrée (compte activé manuellement à l'ancienne) → accès illimité
        enterApp(name);
        return;
      }

      // 2. Essai gratuit encore valide
      if (data.status === 'trial' && data.trial_end) {
        var trialEnd = new Date(data.trial_end);
        var now = new Date();
        var daysLeft = Math.ceil((trialEnd - now) / 86400000);
        if (daysLeft > 0) {
          enterApp(name, daysLeft);
          return;
        }
        // Essai expiré → écran abonnement
        showScreen('s-expired');
        updateRefLabels();
        return;
      }

      // 3. Pas actif, pas d'essai → en attente
      showScreen('s-pending');
      updateRefLabels();
    });
});

function enterApp(name, trialDaysLeft) {
  supabaseClient.auth.getUser().then(function(res) {
    var user = res.data && res.data.user;
    if (!user) return;
    supabaseClient.from('app_data').select('*').eq('user_id', user.id).single().then(function(res2) {
      if (res2.data) {
        appData.courses = res2.data.courses || [];
        appData.fuel = res2.data.fuel || {};
        appData.maintenance = res2.data.maintenance || {};
        appData.settings = res2.data.settings || {};
      }
      finishEnterApp(name, trialDaysLeft);
    });
  });
}

function finishEnterApp(name, trialDaysLeft) {
  if (trialDaysLeft !== undefined && trialDaysLeft > 0) {
    localStorage.setItem('taxicost_trial_days', trialDaysLeft);
  } else {
    localStorage.removeItem('taxicost_trial_days');
  }
  setDriverLabels(name);

  // Applique le thème (mode sombre/clair) synchronisé
  applyTheme();
  localStorage.setItem('taxicost_theme_cache', isDarkMode() ? 'dark' : 'light');

  // Applique la langue (interface + reconnaissance vocale) et les tarifs synchronisés
  currentLang = getUiLang() === 'ar' ? 'ar-DZ' : 'fr-FR';
  applyTranslations();
  if (!isAutoMode()) {
    manualOverride = isNightTime() ? 'night' : 'day';
  }
  updateTarifPill();

  var restored = loadCurrentCourse();
  if (restored) {
    clients = restored.clients;
    cid = restored.cid;
  }
  if (clients.length === 0) addClient();
  render();
  showScreen('s-splash');
  setTimeout(function(){
    showScreen('s-main');
    updateTrialBars(trialDaysLeft);
    updateNotifButton();
    setTimeout(function() {
      checkMaintenanceAlerts();
      if ('Notification' in window && Notification.permission === 'granted') {
        scheduleMaintenanceChecks();
        if (isPrayerNotifEnabled()) schedulePrayerNotifications();
      }
    }, 1500);
  }, 1800);
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
// ===== DONNÉES APP (historique, réglages, entretien) — synchronisées via Supabase =====
// ===========================================================
var appData = { courses: [], fuel: {}, maintenance: {}, settings: {} };

// ===== MODE SOMBRE =====
function isDarkMode() {
  return appData.settings.darkMode === true;
}
function applyTheme() {
  var dark = isDarkMode();
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1a1a2e' : '#FFC107');
}
function toggleDarkMode(checked) {
  appData.settings.darkMode = checked;
  persistAppData();
  localStorage.setItem('taxicost_theme_cache', checked ? 'dark' : 'light');
  applyTheme();
}
// Peinture instantanée avant même le chargement des données Supabase, pour éviter un flash
(function paintCachedTheme() {
  var cached = localStorage.getItem('taxicost_theme_cache');
  if (cached === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
})();

var persistTimeoutId = null;

function persistAppData() {
  if (persistTimeoutId) clearTimeout(persistTimeoutId);
  persistTimeoutId = setTimeout(function() {
    supabaseClient.auth.getUser().then(function(res) {
      var user = res.data && res.data.user;
      if (!user) return;
      supabaseClient.from('app_data').update({
        courses: appData.courses,
        fuel: appData.fuel,
        maintenance: appData.maintenance,
        settings: appData.settings,
        updated_at: new Date().toISOString()
      }).eq('user_id', user.id).then(function(res2) {
        if (res2.error) console.error('Erreur de sauvegarde des données:', res2.error);
      });
    });
  }, 500);
}

// ===========================================================
// ===== TRADUCTIONS (FR / AR) =====
// ===========================================================
var I18N = {
  fr: {
    nav_course: 'Course', nav_stats: 'Stats', nav_history: 'Historique', nav_maint: 'Entretien', nav_settings: 'Réglages',
    title_stats: 'Statistiques', title_history: 'Historique', title_maint: 'Entretien', title_settings: 'Réglages',
    trial_label: '🎁 Essai gratuit',
    period_day: 'Jour', period_week: 'Semaine', period_month: 'Mois',
    login_subtitle: 'Connectez-vous pour continuer', ph_email: 'Email', ph_password: 'Mot de passe',
    login_btn: 'Se connecter', forgot_link: 'Mot de passe oublié ?', to_register: "Pas encore de compte ? S'inscrire",
    forgot_title: 'Mot de passe oublié', forgot_subtitle: "Entre ton email, on t'enverra un lien pour le réinitialiser.",
    send_link: 'Envoyer le lien', back_to_login: 'Retour à la connexion',
    register_title: 'Créer un compte', register_subtitle: 'Inscription gratuite · Abonnement 500 DA/mois',
    ph_name: 'Votre prénom', ph_password_hint: 'Mot de passe (min. 6 caractères)',
    register_btn: "S'inscrire", to_login: 'Déjà un compte ? Se connecter',
    pending_title: 'Compte en attente',
    pending_msg1: 'Votre compte a été créé !',
    pending_msg2: 'Choisis ta formule, envoie le montant par CCP ou virement en indiquant bien ta référence',
    pending_msg3: 'puis contacte-nous sur WhatsApp pour confirmer.',
    plan_monthly: '📅 1 mois — 500 DA', plan_yearly: '🗓️ 1 an — 5000 DA',
    pending_note: 'Une fois votre paiement confirmé, votre accès sera activé sous 24h.', logout: 'Se déconnecter',
    expired_title: 'Essai terminé',
    expired_msg1: 'Ton essai gratuit ou ton abonnement est terminé.',
    expired_note: 'Une fois votre paiement confirmé, votre accès sera rétabli sous 24h.',
    current_course: 'Course en cours', voice_hint: '🎤 pour dicter un chiffre', new_client: 'Nouveau client',
    total_course: 'Total course', end_course: '✓ Terminer la course', cancel_clear: 'Annuler / Vider',
    revenue_gross: 'Revenu brut', revenue_gross_day: 'Revenu brut du jour', revenue_gross_week: 'Revenu brut de la semaine', revenue_gross_month: 'Revenu brut du mois',
    courses_label: 'Courses', clients_label: 'Clients',
    fuel: 'Essence', fuel_sub_day: 'Coût du jour', fuel_sub_week: 'Coût de la semaine', fuel_sub_month: 'Coût du mois',
    revenue_net: 'Revenu net', net_sub: 'Brut − essence', net_sub_day: 'Brut − essence (jour)',
    net_sub_week: 'Brut − essence (semaine)', net_sub_month: 'Brut − essence (mois)',
    chart_hourly: 'Revenus par heure', chart_daily_week: 'Revenus par jour (semaine)', chart_daily_month: 'Revenus par jour (mois)',
    export_pdf: 'Exporter en PDF',
    undo_last: '↩ Annuler la dernière course', history_today: 'Courses du jour',
    history_week: 'Détail par jour (semaine)', history_month: 'Détail par jour (mois)',
    no_course_yet: 'Aucune course pour le moment', clear_history: "Réinitialiser tout l'historique",
    enable_reminders: '🔔 Activer les rappels sur le téléphone', reminders_on: '🔔 Rappels activés',
    insurance: 'Assurance', not_set: 'Non renseignée', payment_date: 'Date de paiement',
    duration_months: 'Durée (mois)', oil_change: 'Vidange', oil_change_date: 'Date de la vidange',
    app_language: "Langue de l'app", auto_tarif: 'Tarif automatique', day_short: 'Jour', night_short: 'Nuit',
    tarif_day: 'Tarif jour', fixed_amount: 'Montant fixe', tarif_night: 'Tarif nuit',
    night_start: 'Début nuit', night_end: 'Fin nuit',
    manual_mode_note: 'Mode manuel actif — choisis le tarif à utiliser pour la course en cours :',
    prayer_label: '🕌 Rappels de prière', prayer_sub: '10 min avant chaque prière',
    prayer_wilaya: 'Wilaya', prayer_wilaya_sub: 'Utilisée pour calculer les horaires',
    dark_mode_label: '🌗 Mode sombre', dark_mode_sub: 'Fond bleu nuit', account: 'Compte',
    depart: 'Départ', arrivee: 'Arrivée',
    client_singular: 'client', client_plural: 'clients', course_singular: 'course', course_plural: 'courses',
    toast_min_client: '⚠️ Renseigne au moins un client', toast_course_saved: '✓ Course enregistrée :',
    toast_course_cancelled: '↩ Course annulée :', confirm_clear_history: "Effacer tout l'historique des courses ? Cette action est irréversible.",
    toast_no_export: 'Aucune course à exporter pour cette période', toast_popup_blocked: 'Autorise les pop-ups pour exporter le PDF',
    toast_notif_on: '✓ Rappels activés', toast_notif_denied: 'Notifications refusées — active-les dans les paramètres Chrome',
    toast_notif_unsupported: 'Notifications non supportées sur ce navigateur',
    pdf_report_title: 'TaxiCost — Rapport', pdf_day_of: 'Journée du', pdf_week_of: 'Semaine du',
    pdf_hour: 'Heure', pdf_day: 'Jour', pdf_clients: 'Clients', pdf_amount: 'Montant', pdf_courses: 'Courses',
    pdf_detail: 'Détail des courses', pdf_nb_courses: 'Nombre de courses', pdf_nb_clients: 'Nombre de clients',
    pdf_gross: 'Revenu brut', pdf_fuel: 'Essence', pdf_net: 'Revenu net', pdf_generated: 'Généré par TaxiCost le',
    expired_since: 'Expirée depuis', expires_in: 'Expire dans', valid_until: "Valide jusqu'au",
    insurance_expires_in: 'Assurance expire dans', insurance_expired_notif: 'Assurance expirée !',
    oil_expires_in: 'Vidange à prévoir dans', oil_late: 'Vidange en retard !',
    day_word: 'jour', days_word: 'jours', expires_today: "expire AUJOURD'HUI !", reminder_title: 'TaxiCost — Rappel',
    day_names: ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
    month_names: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  },
  ar: {
    nav_course: 'كورسة', nav_stats: 'إحصائيات', nav_history: 'تاريخ', nav_maint: 'صيانة', nav_settings: 'إعدادات',
    title_stats: 'الإحصائيات', title_history: 'التاريخ', title_maint: 'الصيانة', title_settings: 'الإعدادات',
    trial_label: '🎁 تجربة مجانية',
    period_day: 'يوم', period_week: 'أسبوع', period_month: 'شهر',
    login_subtitle: 'سجل الدخول للمتابعة', ph_email: 'البريد الإلكتروني', ph_password: 'كلمة المرور',
    login_btn: 'تسجيل الدخول', forgot_link: 'نسيت كلمة المرور؟', to_register: 'ما عندكش حساب؟ سجل',
    forgot_title: 'نسيت كلمة المرور', forgot_subtitle: 'دخل الإيميل ديالك، نبعتولك رابط باش تبدلها.',
    send_link: 'ابعث الرابط', back_to_login: 'رجوع لتسجيل الدخول',
    register_title: 'إنشاء حساب', register_subtitle: 'تسجيل مجاني · اشتراك 500 دج/شهر',
    ph_name: 'الاسم', ph_password_hint: 'كلمة المرور (6 خانات على الأقل)',
    register_btn: 'سجل', to_login: 'عندك حساب؟ سجل الدخول',
    pending_title: 'الحساب في الانتظار',
    pending_msg1: 'تم إنشاء حسابك!',
    pending_msg2: 'اختر الصيغة، ابعث المبلغ عبر CCP أو تحويل بنكي مع ذكر الرجعة ديالك',
    pending_msg3: 'وبعدها تواصل معنا عبر واتساب.',
    plan_monthly: '📅 شهر — 500 دج', plan_yearly: '🗓️ عام كامل — 5000 دج',
    pending_note: 'بمجرد تأكيد الدفع، سيتم تفعيل حسابك خلال 24 ساعة.', logout: 'تسجيل الخروج',
    expired_title: 'انتهت التجربة',
    expired_msg1: 'انتهت تجربتك المجانية أو اشتراكك.',
    expired_note: 'بمجرد تأكيد الدفع، سيتم استعادة حسابك خلال 24 ساعة.',
    current_course: 'الكورسة الحالية', voice_hint: '🎤 لنطق رقم', new_client: 'زبون جديد',
    total_course: 'مجموع الكورسة', end_course: '✓ إنهاء الكورسة', cancel_clear: 'إلغاء / تفريغ',
    revenue_gross: 'الربح الخام', revenue_gross_day: 'الربح الخام لليوم', revenue_gross_week: 'الربح الخام للأسبوع', revenue_gross_month: 'الربح الخام للشهر', courses_label: 'الكورسات', clients_label: 'الزبائن',
    fuel: 'الأسانس', fuel_sub_day: 'تكلفة اليوم', fuel_sub_week: 'تكلفة الأسبوع', fuel_sub_month: 'تكلفة الشهر',
    revenue_net: 'الربح الصافي', net_sub: 'الخام − الأسانس', net_sub_day: 'الخام − الأسانس (اليوم)',
    net_sub_week: 'الخام − الأسانس (الأسبوع)', net_sub_month: 'الخام − الأسانس (الشهر)',
    chart_hourly: 'الأرباح حسب الساعة', chart_daily_week: 'الأرباح حسب اليوم (الأسبوع)', chart_daily_month: 'الأرباح حسب اليوم (الشهر)',
    export_pdf: 'تصدير PDF',
    undo_last: '↩ إلغاء آخر كورسة', history_today: 'كورسات اليوم',
    history_week: 'التفاصيل حسب اليوم (الأسبوع)', history_month: 'التفاصيل حسب اليوم (الشهر)',
    no_course_yet: 'ما كاين حتى كورسة لحد الآن', clear_history: 'تصفير كل التاريخ',
    enable_reminders: '🔔 فعّل التذكيرات على الهاتف', reminders_on: '🔔 التذكيرات مفعّلة',
    insurance: 'التأمين', not_set: 'غير محدد', payment_date: 'تاريخ الخلاص',
    duration_months: 'المدة (أشهر)', oil_change: 'الفيدانج', oil_change_date: 'تاريخ الفيدانج',
    app_language: 'لغة التطبيق', auto_tarif: 'التسعيرة التلقائية', day_short: 'نهار', night_short: 'ليل',
    tarif_day: 'تسعيرة النهار', fixed_amount: 'مبلغ ثابت', tarif_night: 'تسعيرة الليل',
    night_start: 'بداية الليل', night_end: 'نهاية الليل',
    manual_mode_note: 'الوضع اليدوي مفعّل — اختر التسعيرة لهاد الكورسة:',
    prayer_label: '🕌 تذكير الصلاة', prayer_sub: '10 دقايق قبل كل صلاة',
    prayer_wilaya: 'الولاية', prayer_wilaya_sub: 'تستعمل لحساب أوقات الصلاة',
    dark_mode_label: '🌗 الوضع الليلي', dark_mode_sub: 'خلفية كحلة', account: 'الحساب',
    depart: 'انطلاق', arrivee: 'وصول',
    client_singular: 'زبون', client_plural: 'زبائن', course_singular: 'كورسة', course_plural: 'كورسات',
    toast_min_client: '⚠️ دخل على الأقل زبون واحد', toast_course_saved: '✓ تسجلت الكورسة:',
    toast_course_cancelled: '↩ تلغات الكورسة:', confirm_clear_history: 'تصفية كل تاريخ الكورسات؟ هاد العملية ما ترجعش.',
    toast_no_export: 'ما كاين حتى كورسة نصدرها لهاد المدة', toast_popup_blocked: 'خلي المتصفح يفتح نافذة منبثقة باش تصدر PDF',
    toast_notif_on: '✓ التذكيرات مفعّلة', toast_notif_denied: 'رفضت التنبيهات — فعّلها من إعدادات المتصفح',
    toast_notif_unsupported: 'التنبيهات ما تخدمش فهاد المتصفح',
    pdf_report_title: 'TaxiCost — التقرير', pdf_day_of: 'يوم', pdf_week_of: 'أسبوع',
    pdf_hour: 'الساعة', pdf_day: 'اليوم', pdf_clients: 'الزبائن', pdf_amount: 'المبلغ', pdf_courses: 'الكورسات',
    pdf_detail: 'تفاصيل الكورسات', pdf_nb_courses: 'عدد الكورسات', pdf_nb_clients: 'عدد الزبائن',
    pdf_gross: 'الربح الخام', pdf_fuel: 'الأسانس', pdf_net: 'الربح الصافي', pdf_generated: 'أنشأه TaxiCost في',
    expired_since: 'منتهية من', expires_in: 'تنتهي في', valid_until: 'صالحة حتى',
    insurance_expires_in: 'التأمين ينتهي في', insurance_expired_notif: 'التأمين منتهي!',
    oil_expires_in: 'الفيدانج قريب في', oil_late: 'الفيدانج متأخر!',
    day_word: 'يوم', days_word: 'أيام', expires_today: 'تنتهي اليوم!', reminder_title: 'TaxiCost — تذكير',
    day_names: ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
    month_names: ['جانفي','فيفري','مارس','أفريل','ماي','جوان','جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  }
};

function getUiLang() {
  return (appData.settings && appData.settings.uiLang) || 'fr';
}

function t(key) {
  var lang = getUiLang();
  var dict = I18N[lang] || I18N.fr;
  return dict[key] !== undefined ? dict[key] : (I18N.fr[key] !== undefined ? I18N.fr[key] : key);
}

function applyTranslations() {
  var lang = getUiLang();
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });

  document.getElementById('lang-fr').className = 'lang-btn' + (lang === 'fr' ? ' active' : '');
  document.getElementById('lang-ar').className = 'lang-btn' + (lang === 'ar' ? ' active' : '');

  updateAuthMessages();
  updateRefLabels();

  // Rafraîchit les libellés de la liste des wilayas et les parties générées en JS
  var sel = document.getElementById('prayer-wilaya-select');
  if (sel) { sel.innerHTML = ''; populateWilayaSelect(); }

  render();
  if (document.getElementById('s-stats').classList.contains('active')) renderStats();
  if (document.getElementById('s-history').classList.contains('active')) renderHistory();
  updateTotal();
}

function updateAuthMessages() {
  var pEl = document.getElementById('pending-msg-text');
  if (pEl) {
    pEl.innerHTML = t('pending_msg1') + '<br><br>' + t('pending_msg2') + ' <strong id="ref-pending">...</strong>، ' + t('pending_msg3');
  }
  var eEl = document.getElementById('expired-msg-text');
  if (eEl) {
    eEl.innerHTML = t('expired_msg1') + '<br><br>' + t('pending_msg2') + ' <strong id="ref-expired">...</strong>، ' + t('pending_msg3');
  }
}

function setUiLang(lang) {
  appData.settings.uiLang = lang;
  currentLang = lang === 'ar' ? 'ar-DZ' : 'fr-FR';
  persistAppData();
  applyTranslations();
}

var clients = [];
var cid = 0;
var currentLang = 'fr-FR';
var activeRecognition = null;
var currentPeriod = 'day';      // période pour l'onglet Stats
var currentHistoryPeriod = 'day'; // période pour l'onglet Historique

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
// (gérée par setUiLang() / applyTranslations(), voir en haut du fichier)


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
var currentDriverName = 'Chauffeur';
function setDriverLabels(name) {
  currentDriverName = name || 'Chauffeur';
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
  var v = parseFloat(appData.settings.tarifDay);
  return isNaN(v) ? 20 : v;
}
function loadTarifNight() {
  var v = parseFloat(appData.settings.tarifNight);
  return isNaN(v) ? 30 : v;
}
function loadNightStart() {
  var v = parseInt(appData.settings.nightStart);
  return isNaN(v) ? 20 : v;
}
function loadNightEnd() {
  var v = parseInt(appData.settings.nightEnd);
  return isNaN(v) ? 6 : v;
}
function isAutoMode() {
  var v = appData.settings.tarifAuto;
  return v === undefined ? true : v === true;
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

  var savedLang = getUiLang();
  document.getElementById('lang-fr').className = 'lang-btn' + (savedLang === 'fr' ? ' active' : '');
  document.getElementById('lang-ar').className = 'lang-btn' + (savedLang === 'ar' ? ' active' : '');

  var prayerToggle = document.getElementById('prayer-notif-toggle');
  if (prayerToggle) prayerToggle.checked = isPrayerNotifEnabled();

  populateWilayaSelect();

  var darkToggle = document.getElementById('dark-mode-toggle');
  if (darkToggle) darkToggle.checked = isDarkMode();
}

function populateWilayaSelect() {
  var sel = document.getElementById('prayer-wilaya-select');
  if (!sel) return;
  var current = getPrayerWilaya();
  var uiLang = getUiLang();
  if (sel.options.length === 0) {
    sel.innerHTML = WILAYAS.map(function(w) {
      return '<option value="' + w.fr + '">' + (uiLang === 'ar' ? w.ar : w.fr) + '</option>';
    }).join('');
  }
  sel.value = current;
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
  appData.settings.tarifAuto = auto;
  persistAppData();
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
  appData.settings.tarifDay = dayVal;
  appData.settings.tarifNight = nightVal;
  persistAppData();
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
  appData.settings.nightStart = start;
  appData.settings.nightEnd = end;
  persistAppData();
  updateHoursSummary();
  recalcAll();
  updateTarifPill();
}

// ===== CLIENTS =====
// La course en cours (clients pas encore terminés) est sauvegardée en direct
// dans localStorage, pour ne rien perdre si le téléphone ferme l'app,
// verrouille l'écran, ou que le chauffeur répond à un appel.
function saveCurrentCourse() {
  try {
    localStorage.setItem('taxicost_current_course', JSON.stringify({ clients: clients, cid: cid }));
  } catch (e) {}
}
function loadCurrentCourse() {
  try {
    var raw = localStorage.getItem('taxicost_current_course');
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.clients) && parsed.clients.length > 0) return parsed;
  } catch (e) {}
  return null;
}
function clearCurrentCourse() {
  localStorage.removeItem('taxicost_current_course');
}

function addClient() {
  cid++;
  clients.push({ id: cid, depart: '', arrivee: '' });
  render();
  saveCurrentCourse();
}
function removeClient(id) {
  if (clients.length <= 1) return;
  clients = clients.filter(function(c){ return c.id !== id; });
  render();
  saveCurrentCourse();
}
function onDepart(id, val) {
  var c = clients.find(function(c){ return c.id === id; });
  if (c) { c.depart = val; renderCost(id); updateTotal(); saveCurrentCourse(); }
}
function onArrivee(id, val) {
  var c = clients.find(function(c){ return c.id === id; });
  if (c) { c.arrivee = val; renderCost(id); updateTotal(); saveCurrentCourse(); }
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
  var toastEl = document.getElementById('toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(function(){ toastEl.classList.remove('show'); }, 2000);
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
          '<span class="cell-field-label">' + t('depart') + '</span>' +
          '<input class="cell-input" id="input-' + c.id + '-depart" type="number" inputmode="numeric" placeholder="0" value="' + c.depart + '" oninput="onDepart(' + c.id + ',this.value)" min="0">' +
          '<button class="mic-btn" id="mic-' + c.id + '-depart" onclick="startVoice(' + c.id + ',\'depart\')">' + micIcon() + '</button>' +
        '</div>' +
        '<div class="cell-field-row">' +
          '<span class="cell-field-label">' + t('arrivee') + '</span>' +
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
  return appData.courses || [];
}
function saveCourses(arr) {
  appData.courses = arr;
  persistAppData();
}

function endCourse() {
  var total = 0, nbClients = 0;
  clients.forEach(function(c){
    var cost = calcCost(c);
    if (cost !== null) { total += cost; nbClients++; }
  });
  if (nbClients === 0) { showToast(t('toast_min_client')); return; }

  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  playBeep();

  var courses = loadCourses();
  courses.push({ ts: Date.now(), total: total, nbClients: nbClients });
  saveCourses(courses);

  showToast(t('toast_course_saved') + ' ' + total + ' DA');
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
  showToast(t('toast_course_cancelled') + ' ' + removed.total + ' DA');
  renderHistory();
}

function clearStats() {
  if (confirm(t('confirm_clear_history'))) {
    appData.courses = [];
    persistAppData();
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
  var lang = getUiLang();
  var isAr = lang === 'ar';

  if (currentPeriod === 'day') { from = startOfDay(now); periodLabel = t('pdf_day_of') + ' ' + now.getDate() + ' ' + MONTH_NAMES()[now.getMonth()] + ' ' + now.getFullYear(); }
  else if (currentPeriod === 'week') { from = startOfWeek(now); periodLabel = t('pdf_week_of') + ' ' + from.getDate() + ' ' + MONTH_NAMES()[from.getMonth()] + ' ' + now.getFullYear(); }
  else { from = startOfMonth(now); periodLabel = capitalize(MONTH_NAMES()[now.getMonth()]) + ' ' + now.getFullYear(); }

  var filtered = courses.filter(function(c){ return c.ts >= from.getTime(); }).sort(function(a,b){ return a.ts - b.ts; });

  if (filtered.length === 0) {
    showToast(t('toast_no_export'));
    return;
  }

  var totalRevenue = 0, totalClients = 0;
  filtered.forEach(function(c){ totalRevenue += c.total; totalClients += c.nbClients; });
  var fuel = loadFuel();
  var net = totalRevenue - fuel;
  var driverName = currentDriverName || 'Chauffeur';

  var rowsHtml = '';
  if (currentPeriod === 'day') {
    rowsHtml = '<table><thead><tr><th>' + t('pdf_hour') + '</th><th>' + t('pdf_clients') + '</th><th>' + t('pdf_amount') + '</th></tr></thead><tbody>';
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
    rowsHtml = '<table><thead><tr><th>' + t('pdf_day') + '</th><th>' + t('pdf_courses') + '</th><th>' + t('pdf_clients') + '</th><th>' + t('pdf_amount') + '</th></tr></thead><tbody>';
    days.forEach(function(d){
      var dname = capitalize(DAY_NAMES()[d.date.getDay()]);
      rowsHtml += '<tr><td>' + dname + ' ' + d.date.getDate() + '</td><td>' + d.courses + '</td><td>' + d.clients + '</td><td>' + d.total + ' DA</td></tr>';
    });
    rowsHtml += '</tbody></table>';
  }

  var dirAttr = isAr ? ' dir="rtl"' : '';
  var textAlign = isAr ? 'right' : 'left';
  var dateLocale = isAr ? 'ar-DZ' : 'fr-FR';

  var fullHtml =
    '<!DOCTYPE html><html lang="' + lang + '"' + dirAttr + '><head><meta charset="UTF-8">' +
    '<title>' + t('pdf_report_title') + '</title>' +
    '<style>' +
      'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1a2e;padding:24px;margin:0;}' +
      '.pr-header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #FFC107;padding-bottom:16px;margin-bottom:20px;}' +
      '.pr-logo{width:50px;height:50px;background:#FFC107;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '.pr-title{font-size:22px;font-weight:700;}' +
      '.pr-sub{font-size:13px;color:#888;margin-top:2px;}' +
      '.pr-section-title{font-size:14px;font-weight:700;margin:18px 0 8px;}' +
      'table{width:100%;border-collapse:collapse;font-size:13px;}' +
      'th{text-align:' + textAlign + ';background:#FFF4D6;padding:8px 10px;font-weight:700;}' +
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
      '<div><div class="pr-title">' + t('pdf_report_title') + '</div><div class="pr-sub">' + driverName + ' · ' + periodLabel + '</div></div>' +
    '</div>' +
    '<div class="pr-section-title">' + t('pdf_detail') + '</div>' +
    rowsHtml +
    '<div class="pr-totals">' +
      '<div class="pr-totals-row"><span>' + t('pdf_nb_courses') + '</span><span>' + filtered.length + '</span></div>' +
      '<div class="pr-totals-row"><span>' + t('pdf_nb_clients') + '</span><span>' + totalClients + '</span></div>' +
      '<div class="pr-totals-row"><span>' + t('pdf_gross') + '</span><span>' + totalRevenue + ' DA</span></div>' +
      '<div class="pr-totals-row"><span>' + t('pdf_fuel') + '</span><span>− ' + fuel + ' DA</span></div>' +
      '<div class="pr-totals-row main"><span>' + t('pdf_net') + '</span><span>' + net + ' DA</span></div>' +
    '</div>' +
    '<div class="pr-footer">' + t('pdf_generated') + ' ' + now.toLocaleDateString(dateLocale) + ' ' + (isAr ? '' : 'à ') + ('0'+now.getHours()).slice(-2) + ':' + ('0'+now.getMinutes()).slice(-2) + '</div>' +
    '<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>' +
    '</body></html>';

  var printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast(t('toast_popup_blocked'));
    return;
  }
  printWindow.document.open();
  printWindow.document.write(fullHtml);
  printWindow.document.close();
}

// ===========================================================
// ===== DATES =====
// ===========================================================
function DAY_NAMES() { return t('day_names'); }
function MONTH_NAMES() { return t('month_names'); }

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
  appData.fuel[fuelKey()] = v;
  persistAppData();
  updateNet();
}
function loadFuel() {
  var v = parseFloat(appData.fuel[fuelKey()]);
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

  if (currentPeriod === 'day') { from = startOfDay(now); label = t('revenue_gross_day'); fuelSubLabel = t('fuel_sub_day'); netSubLabel = t('net_sub_day'); }
  else if (currentPeriod === 'week') { from = startOfWeek(now); label = t('revenue_gross_week'); fuelSubLabel = t('fuel_sub_week'); netSubLabel = t('net_sub_week'); }
  else { from = startOfMonth(now); label = t('revenue_gross_month'); fuelSubLabel = t('fuel_sub_month'); netSubLabel = t('net_sub_month'); }

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
    capitalize(DAY_NAMES()[now.getDay()]) + ' ' + now.getDate() + ' ' + MONTH_NAMES()[now.getMonth()] + ' ' + now.getFullYear();

  var chartTitle = document.getElementById('chart-title');
  var chartSvg = document.getElementById('chart-svg');

  if (currentPeriod === 'day') {
    chartTitle.textContent = t('chart_hourly');
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
    chartTitle.textContent = currentPeriod === 'week' ? t('chart_daily_week') : t('chart_daily_month');
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

function clientsLabel(count) {
  if (getUiLang() === 'ar') return count + ' ' + t('client_plural');
  return count + ' ' + t('client_singular') + (count > 1 ? 's' : '');
}
function coursesLabel(count) {
  if (getUiLang() === 'ar') return count + ' ' + t('course_plural');
  return count + ' ' + t('course_singular') + (count > 1 ? 's' : '');
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
    historyTitleEl.textContent = t('history_today');
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="history-empty">' + t('no_course_yet') + '</div>';
    } else {
      listEl.innerHTML = filtered.slice().reverse().map(function(c){
        var d = new Date(c.ts);
        var time = ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
        return '<div class="history-item">' +
          '<div><div class="history-time">'+time+'</div><div class="history-clients">'+clientsLabel(c.nbClients)+'</div></div>' +
          '<div class="history-amount">'+c.total+' DA</div>' +
        '</div>';
      }).join('');
    }
  } else {
    historyTitleEl.textContent = currentHistoryPeriod === 'week' ? t('history_week') : t('history_month');
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
      listEl.innerHTML = '<div class="history-empty">' + t('no_course_yet') + '</div>';
    } else {
      listEl.innerHTML = days.map(function(d){
        var dname = DAY_NAMES()[d.date.getDay()].slice(0,3);
        return '<div class="day-card">' +
          '<div class="day-badge"><div class="dnum">'+d.date.getDate()+'</div><div class="dname">'+dname+'</div></div>' +
          '<div class="day-info">' +
            '<div class="dcourses">'+coursesLabel(d.courses)+'</div>' +
            '<div class="dclients">'+clientsLabel(d.clients)+'</div>' +
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
    return period === 'week' ? DAY_NAMES()[d.date.getDay()].slice(0,3) : String(d.date.getDate());
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
  appData.maintenance = data;
  persistAppData();
}

function loadMaintenance() {
  var d = appData.maintenance || {};
  return {
    insuranceDate: d.insuranceDate || '',
    insuranceDuration: d.insuranceDuration || '',
    vidangeDate: d.vidangeDate || '',
    vidangeDuration: d.vidangeDuration || ''
  };
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

function daysLabel(n) {
  if (getUiLang() === 'ar') return n + ' ' + t('days_word');
  return n + ' ' + t('day_word') + (n > 1 ? 's' : '');
}

function renderMaintenanceCard(prefix) {
  var data = loadMaintenance();
  var dateVal = data[prefix + 'Date'];
  var durationVal = data[prefix + 'Duration'];
  var card = document.getElementById(prefix === 'insurance' ? 'insurance-card' : 'vidange-card');
  var statusEl = document.getElementById(prefix + '-status');
  if (!card || !statusEl) return;

  if (!dateVal || !durationVal) {
    statusEl.textContent = t('not_set');
    card.classList.remove('alert');
    return;
  }

  var expiry = computeExpiry(dateVal, durationVal);
  var days = daysUntil(expiry);
  var expiryStr = expiry.getDate() + ' ' + MONTH_NAMES()[expiry.getMonth()] + ' ' + expiry.getFullYear();

  if (days < 0) {
    statusEl.textContent = '⚠️ ' + t('expired_since') + ' ' + daysLabel(Math.abs(days));
    card.classList.add('alert');
  } else if (days <= 7) {
    statusEl.textContent = '⚠️ ' + t('expires_in') + ' ' + daysLabel(days) + ' (' + expiryStr + ')';
    card.classList.add('alert');
  } else {
    statusEl.textContent = t('valid_until') + ' ' + expiryStr;
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
    if (insDays >= 0 && insDays <= 7) alerts.push('🛡️ ' + t('insurance_expires_in') + ' ' + daysLabel(insDays));
    else if (insDays < 0) alerts.push('🛡️ ' + t('insurance_expired_notif'));
  }

  var vidExpiry = computeExpiry(data.vidangeDate, data.vidangeDuration);
  if (vidExpiry) {
    var vidDays = daysUntil(vidExpiry);
    if (vidDays >= 0 && vidDays <= 7) alerts.push('🛢️ ' + t('oil_expires_in') + ' ' + daysLabel(vidDays));
    else if (vidDays < 0) alerts.push('🛢️ ' + t('oil_late'));
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
// ===== NOTIFICATIONS — HORAIRES DE PRIÈRE (Oran, Algérie) =====
// ===========================================================
var WILAYAS = [
  { fr: 'Adrar', ar: 'أدرار' }, { fr: 'Chlef', ar: 'الشلف' }, { fr: 'Laghouat', ar: 'الأغواط' },
  { fr: 'Oum El Bouaghi', ar: 'أم البواقي' }, { fr: 'Batna', ar: 'باتنة' }, { fr: 'Béjaïa', ar: 'بجاية' },
  { fr: 'Biskra', ar: 'بسكرة' }, { fr: 'Béchar', ar: 'بشار' }, { fr: 'Blida', ar: 'البليدة' },
  { fr: 'Bouira', ar: 'البويرة' }, { fr: 'Tamanrasset', ar: 'تمنراست' }, { fr: 'Tébessa', ar: 'تبسة' },
  { fr: 'Tlemcen', ar: 'تلمسان' }, { fr: 'Tiaret', ar: 'تيارت' }, { fr: 'Tizi Ouzou', ar: 'تيزي وزو' },
  { fr: 'Alger', ar: 'الجزائر' }, { fr: 'Djelfa', ar: 'الجلفة' }, { fr: 'Jijel', ar: 'جيجل' },
  { fr: 'Sétif', ar: 'سطيف' }, { fr: 'Saïda', ar: 'سعيدة' }, { fr: 'Skikda', ar: 'سكيكدة' },
  { fr: 'Sidi Bel Abbès', ar: 'سيدي بلعباس' }, { fr: 'Annaba', ar: 'عنابة' }, { fr: 'Guelma', ar: 'قالمة' },
  { fr: 'Constantine', ar: 'قسنطينة' }, { fr: 'Médéa', ar: 'المدية' }, { fr: 'Mostaganem', ar: 'مستغانم' },
  { fr: "M'Sila", ar: 'المسيلة' }, { fr: 'Mascara', ar: 'معسكر' }, { fr: 'Ouargla', ar: 'ورقلة' },
  { fr: 'Oran', ar: 'وهران' }, { fr: 'El Bayadh', ar: 'البيض' }, { fr: 'Illizi', ar: 'إليزي' },
  { fr: 'Bordj Bou Arréridj', ar: 'برج بوعريريج' }, { fr: 'Boumerdès', ar: 'بومرداس' }, { fr: 'El Tarf', ar: 'الطارف' },
  { fr: 'Tindouf', ar: 'تندوف' }, { fr: 'Tissemsilt', ar: 'تيسمسيلت' }, { fr: 'El Oued', ar: 'الوادي' },
  { fr: 'Khenchela', ar: 'خنشلة' }, { fr: 'Souk Ahras', ar: 'سوق أهراس' }, { fr: 'Tipaza', ar: 'تيبازة' },
  { fr: 'Mila', ar: 'ميلة' }, { fr: 'Aïn Defla', ar: 'عين الدفلى' }, { fr: 'Naâma', ar: 'النعامة' },
  { fr: 'Aïn Témouchent', ar: 'عين تموشنت' }, { fr: 'Ghardaïa', ar: 'غرداية' }, { fr: 'Relizane', ar: 'غليزان' },
  { fr: 'Timimoun', ar: 'تيميمون' }, { fr: 'Bordj Badji Mokhtar', ar: 'برج باجي مختار' }, { fr: 'Ouled Djellal', ar: 'أولاد جلال' },
  { fr: 'Béni Abbès', ar: 'بني عباس' }, { fr: 'In Salah', ar: 'عين صالح' }, { fr: 'In Guezzam', ar: 'عين قزام' },
  { fr: 'Touggourt', ar: 'تقرت' }, { fr: 'Djanet', ar: 'جانت' }, { fr: "El M'Ghair", ar: 'المغير' },
  { fr: 'El Meniaa', ar: 'المنيعة' }
];
var PRAYER_COUNTRY = 'Algeria';
var PRAYER_METHOD = 3; // Muslim World League (peut différer de quelques minutes du calendrier officiel algérien)
var PRAYER_ADVANCE_MIN = 10;
var prayerTimeoutIds = [];

function isPrayerNotifEnabled() {
  return appData.settings.prayerEnabled === true;
}

function clearPrayerTimeouts() {
  prayerTimeoutIds.forEach(function(id){ clearTimeout(id); });
  prayerTimeoutIds = [];
}

function togglePrayerNotif(enabled) {
  appData.settings.prayerEnabled = enabled;
  persistAppData();
  if (!enabled) { clearPrayerTimeouts(); return; }

  if (!('Notification' in window)) { showToast(t('toast_notif_unsupported')); return; }
  if (Notification.permission === 'granted') {
    schedulePrayerNotifications();
  } else {
    Notification.requestPermission().then(function(perm) {
      updateNotifButton();
      if (perm === 'granted') {
        schedulePrayerNotifications();
      } else {
        showToast(t('toast_notif_denied'));
        appData.settings.prayerEnabled = false;
        persistAppData();
        var toggleEl = document.getElementById('prayer-notif-toggle');
        if (toggleEl) toggleEl.checked = false;
      }
    });
  }
}

function getPrayerWilaya() {
  return appData.settings.prayerWilaya || 'Oran';
}

function fetchPrayerTimes(callback) {
  var wilaya = getPrayerWilaya();
  var todayKey = dayKey(new Date());
  var cacheKey = 'taxicost_prayer_cache_' + wilaya;
  var cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (parsed.day === todayKey) { callback(parsed.timings); return; }
    } catch(e) {}
  }
  var url = 'https://api.aladhan.com/v1/timingsByCity?city=' + encodeURIComponent(wilaya) +
    '&country=' + encodeURIComponent(PRAYER_COUNTRY) + '&method=' + PRAYER_METHOD;
  fetch(url).then(function(r){ return r.json(); }).then(function(data) {
    if (data && data.data && data.data.timings) {
      localStorage.setItem(cacheKey, JSON.stringify({ day: todayKey, timings: data.data.timings }));
      callback(data.data.timings);
    }
  }).catch(function() {
    // Silencieux : pas grave de rater un jour de rappels si l'API est indisponible
  });
}

function onPrayerWilayaChange(val) {
  appData.settings.prayerWilaya = val;
  persistAppData();
  if (isPrayerNotifEnabled() && Notification.permission === 'granted') {
    schedulePrayerNotifications();
  }
}

function schedulePrayerNotifications() {
  clearPrayerTimeouts();
  fetchPrayerTimes(function(timings) {
    var prayers = [
      { key: 'Fajr', label: 'Fajr' },
      { key: 'Dhuhr', label: 'Dhuhr' },
      { key: 'Asr', label: 'Asr' },
      { key: 'Maghrib', label: 'Maghrib' },
      { key: 'Isha', label: 'Isha' }
    ];
    var now = new Date();
    var today = dayKey(now);
    prayers.forEach(function(p) {
      var timeStr = timings[p.key];
      if (!timeStr) return;
      var parts = timeStr.split(':');
      var prayerDate = new Date();
      prayerDate.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
      var notifyAt = new Date(prayerDate.getTime() - PRAYER_ADVANCE_MIN * 60000);
      var delay = notifyAt.getTime() - now.getTime();
      if (delay > 0) {
        var id = setTimeout(function() {
          sendNotification('🕌 Prière bientôt', p.label + ' dans ' + PRAYER_ADVANCE_MIN + ' minutes (' + timeStr + ')', 'prayer-' + p.key + '-' + today);
        }, delay);
        prayerTimeoutIds.push(id);
      }
    });
  });
}


function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast(t('toast_notif_unsupported'));
    return;
  }
  Notification.requestPermission().then(function(perm) {
    updateNotifButton();
    if (perm === 'granted') {
      showToast(t('toast_notif_on'));
      scheduleMaintenanceChecks();
    } else {
      showToast(t('toast_notif_denied'));
    }
  });
}

function updateNotifButton() {
  var btn = document.getElementById('notif-btn');
  if (!btn || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    btn.textContent = t('reminders_on');
    btn.classList.add('granted');
  } else {
    btn.textContent = t('enable_reminders');
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

  checkAndNotify('insurance', '🛡️ ' + t('insurance'), data.insuranceDate, data.insuranceDuration, today);
  checkAndNotify('vidange', '🛢️ ' + t('oil_change'), data.vidangeDate, data.vidangeDuration, today);
}

function checkAndNotify(prefix, label, dateStr, duration, today) {
  var expiry = computeExpiry(dateStr, duration);
  if (!expiry) return;
  var days = daysUntil(expiry);

  if (days !== 7 && days !== 3 && days !== 1 && days !== 0) return;

  var sentKey = 'taxicost_notif_' + prefix + '_' + days + '_' + today;
  if (localStorage.getItem(sentKey)) return; // déjà envoyée aujourd'hui pour ce seuil

  var msg;
  if (days === 0) msg = label + ' ' + t('expires_today');
  else msg = label + ' ' + t('expires_in') + ' ' + daysLabel(days);

  sendNotification(t('reminder_title'), msg, prefix + '-' + days);
  localStorage.setItem(sentKey, '1');
}

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// ===== INIT =====
(function init() {
  // Le nom du chauffeur, la langue, les tarifs et l'historique sont chargés
  // depuis Supabase (table app_data) une fois connecté, via enterApp()/finishEnterApp().
  // Rien à charger localement ici.

  updateNotifButton();

  // Revérifie une fois par jour si l'app reste ouverte longtemps
  setInterval(function() {
    if ('Notification' in window && Notification.permission === 'granted') {
      scheduleMaintenanceChecks();
      if (isPrayerNotifEnabled()) schedulePrayerNotifications();
    }
  }, 6 * 60 * 60 * 1000); // toutes les 6h

  // Vérifie toutes les 5 minutes si on doit basculer jour/nuit automatiquement
  setInterval(function() {
    if (isAutoMode()) { recalcAll(); updateTarifPill(); }
  }, 5 * 60 * 1000);
})();
