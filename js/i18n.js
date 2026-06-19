/* ──────────────────────────────────────────────────────────────────────────
 * URBN lightweight i18n — static-site friendly, zero dependencies.
 *
 * Usage in HTML:
 *   <h1 data-i18n="hero.h1">English fallback</h1>
 *   <input data-i18n-placeholder="form.email.ph" placeholder="you@company.com">
 *   <button data-i18n-aria="nav.menu">Menu</button>
 *   <p data-i18n-html="legal.notice">English <a href=...>fallback</a></p>
 *
 * English is the SOURCE/FALLBACK: the text written in the HTML is the English
 * copy and is also what shows if a key/translation is missing. Translating is
 * additive — untranslated keys simply keep their English fallback.
 *
 * Language resolution: stored manual choice (localStorage 'urbn_lang')
 *   → browser language (navigator.language, first 2 chars) → 'en'.
 * No IP geolocation. Switching language stores the choice and reloads so chrome
 * (injected nav/footer) and page content re-render consistently.
 * ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var LANGS = [
    ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'],
    ['es', 'Español'], ['it', 'Italiano'], ['nl', 'Nederlands']
  ];
  var SUPPORTED = LANGS.map(function (l) { return l[0]; });
  var KEY = 'urbn_lang';

  function stored() {
    try { var v = localStorage.getItem(KEY); return SUPPORTED.indexOf(v) >= 0 ? v : null; }
    catch (e) { return null; }
  }
  function detect() {
    var n = ((navigator.language || navigator.userLanguage || 'en') + '').slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(n) >= 0 ? n : 'en';
  }
  function getLang() { return stored() || detect() || 'en'; }
  function setLang(l) {
    if (SUPPORTED.indexOf(l) < 0) l = 'en';
    try { localStorage.setItem(KEY, l); } catch (e) {}
    location.reload();
  }

  // ── Dictionary: key -> { en, fr, de, es, it, nl } ─────────────────────────
  // English is authoritative. Brand names (URBN, Heirstone), product names
  // (Stay vs Go, Market Scan), city/market names and currencies are NOT keyed.
  var T = {
    // Navigation
    'nav.offices':   { en: 'Offices', fr: 'Bureaux', de: 'Büros', es: 'Oficinas', it: 'Uffici', nl: 'Kantoren' },
    'nav.listSpace': { en: 'List Your Space', fr: 'Proposer un espace', de: 'Fläche anbieten', es: 'Publicar tu espacio', it: 'Pubblica spazio', nl: 'Ruimte aanbieden' },
    'nav.tools':     { en: 'Tools', fr: 'Outils', de: 'Tools', es: 'Herramientas', it: 'Strumenti', nl: 'Hulpmiddelen' },
    'nav.insights':  { en: 'Insights', fr: 'Analyses', de: 'Einblicke', es: 'Análisis', it: 'Approfondimenti', nl: 'Inzichten' },
    'nav.saved':     { en: 'Saved Properties', fr: 'Biens enregistrés', de: 'Gespeicherte Objekte', es: 'Inmuebles guardados', it: 'Immobili salvati', nl: 'Opgeslagen panden' },
    'nav.pricing':   { en: 'Pricing', fr: 'Tarifs', de: 'Preise', es: 'Precios', it: 'Prezzi', nl: 'Prijzen' },
    'nav.contact':   { en: 'Contact', fr: 'Contact', de: 'Kontakt', es: 'Contacto', it: 'Contatti', nl: 'Contact' },
    'nav.signIn':    { en: 'Sign In', fr: 'Se connecter', de: 'Anmelden', es: 'Iniciar sesión', it: 'Accedi', nl: 'Inloggen' },
    'nav.signUp':    { en: 'Sign Up', fr: "S'inscrire", de: 'Registrieren', es: 'Registrarse', it: 'Registrati', nl: 'Aanmelden' },
    'nav.dashboard': { en: 'Dashboard', fr: 'Tableau de bord', de: 'Dashboard', es: 'Panel', it: 'Dashboard', nl: 'Dashboard' },
    'nav.account':   { en: 'Account', fr: 'Compte', de: 'Konto', es: 'Cuenta', it: 'Account', nl: 'Account' },
    'nav.signOut':   { en: 'Sign Out', fr: 'Se déconnecter', de: 'Abmelden', es: 'Cerrar sesión', it: 'Esci', nl: 'Uitloggen' },
    'nav.menu':      { en: 'Menu', fr: 'Menu', de: 'Menü', es: 'Menú', it: 'Menu', nl: 'Menu' },

    // Footer
    'footer.platform':      { en: 'Platform', fr: 'Plateforme', de: 'Plattform', es: 'Plataforma', it: 'Piattaforma', nl: 'Platform' },
    'footer.browseOffices': { en: 'Browse Offices', fr: 'Parcourir les bureaux', de: 'Büros durchsuchen', es: 'Explorar oficinas', it: 'Esplora uffici', nl: 'Kantoren bekijken' },
    'footer.markets':       { en: 'Markets', fr: 'Marchés', de: 'Märkte', es: 'Mercados', it: 'Mercati', nl: 'Markten' },
    'footer.buildings':     { en: 'Buildings', fr: 'Immeubles', de: 'Gebäude', es: 'Edificios', it: 'Edifici', nl: 'Gebouwen' },
    'footer.districts':     { en: 'Districts', fr: 'Quartiers', de: 'Bezirke', es: 'Distritos', it: 'Distretti', nl: 'Wijken' },
    'footer.officesByCity': { en: 'Offices by city', fr: 'Bureaux par ville', de: 'Büros nach Stadt', es: 'Oficinas por ciudad', it: 'Uffici per città', nl: 'Kantoren per stad' },
    'footer.company':       { en: 'Company', fr: 'Entreprise', de: 'Unternehmen', es: 'Empresa', it: 'Azienda', nl: 'Bedrijf' },
    'footer.listBuilding':  { en: 'List Your Building', fr: 'Référencer votre immeuble', de: 'Gebäude anbieten', es: 'Publicar tu edificio', it: 'Pubblica il tuo edificio', nl: 'Uw gebouw aanbieden' },
    'footer.legal':         { en: 'Legal', fr: 'Mentions légales', de: 'Rechtliches', es: 'Legal', it: 'Note legali', nl: 'Juridisch' },
    'footer.terms':         { en: 'Terms of Use', fr: "Conditions d'utilisation", de: 'Nutzungsbedingungen', es: 'Términos de uso', it: "Termini d'uso", nl: 'Gebruiksvoorwaarden' },
    'footer.privacy':       { en: 'Privacy Policy', fr: 'Politique de confidentialité', de: 'Datenschutzerklärung', es: 'Política de privacidad', it: 'Informativa sulla privacy', nl: 'Privacybeleid' },
    'footer.cookies':       { en: 'Cookie Policy', fr: 'Politique relative aux cookies', de: 'Cookie-Richtlinie', es: 'Política de cookies', it: 'Informativa sui cookie', nl: 'Cookiebeleid' },
    'footer.dataRequests':  { en: 'Data & privacy requests', fr: 'Demandes de données et confidentialité', de: 'Daten- und Datenschutzanfragen', es: 'Solicitudes de datos y privacidad', it: 'Richieste su dati e privacy', nl: 'Gegevens- en privacyverzoeken' },
    'footer.commission':    { en: 'Commission Agreement', fr: 'Accord de commission', de: 'Provisionsvereinbarung', es: 'Acuerdo de comisión', it: 'Accordo di commissione', nl: 'Commissieovereenkomst' },
    'footer.brandDesc':     { en: 'Premium office discovery for corporate occupiers entering Africa & MENA. Verified listings. Protected introductions.', fr: 'Recherche de bureaux premium pour les occupants entreprises sur les marchés Afrique et MENA. Annonces vérifiées. Mises en relation protégées.', de: 'Premium-Bürosuche für Unternehmensnutzer in Afrika und MENA. Geprüfte Angebote. Geschützte Vermittlungen.', es: 'Búsqueda de oficinas premium para empresas ocupantes en África y MENA. Anuncios verificados. Presentaciones protegidas.', it: 'Ricerca di uffici premium per aziende occupanti in Africa e MENA. Annunci verificati. Presentazioni protette.', nl: 'Premium kantoorzoektocht voor zakelijke gebruikers in Afrika en MENA. Geverifieerde aanbiedingen. Beschermde introducties.' },
    'footer.cookieSettings':{ en: 'Cookie settings', fr: 'Paramètres des cookies', de: 'Cookie-Einstellungen', es: 'Configuración de cookies', it: 'Impostazioni cookie', nl: 'Cookie-instellingen' },
    'footer.intel':         { en: 'Corporate Office Intelligence', fr: "Intelligence sur l'immobilier de bureau", de: 'Corporate Office Intelligence', es: 'Inteligencia de oficinas corporativas', it: 'Intelligence sugli uffici aziendali', nl: 'Corporate Office Intelligence' },

    // Cookie consent banner
    'consent.title':   { en: 'Cookies & privacy.', fr: 'Cookies et confidentialité.', de: 'Cookies & Datenschutz.', es: 'Cookies y privacidad.', it: 'Cookie e privacy.', nl: 'Cookies & privacy.' },
    'consent.body':    { en: 'URBN uses necessary cookies and local storage for sign-in, preferences and core service operation. We do not run analytics, marketing or tracking cookies.', fr: "URBN utilise des cookies nécessaires et le stockage local pour la connexion, les préférences et le fonctionnement du service. Nous n'utilisons pas de cookies d'analyse, de marketing ou de suivi.", de: 'URBN verwendet notwendige Cookies und lokalen Speicher für Anmeldung, Einstellungen und den Kernbetrieb. Wir setzen keine Analyse-, Marketing- oder Tracking-Cookies ein.', es: 'URBN utiliza cookies necesarias y almacenamiento local para el inicio de sesión, las preferencias y el funcionamiento del servicio. No usamos cookies de análisis, marketing ni seguimiento.', it: "URBN utilizza cookie necessari e l'archiviazione locale per l'accesso, le preferenze e il funzionamento del servizio. Non usiamo cookie di analisi, marketing o tracciamento.", nl: 'URBN gebruikt noodzakelijke cookies en lokale opslag voor inloggen, voorkeuren en de kernwerking. We gebruiken geen analyse-, marketing- of trackingcookies.' },
    'consent.see':     { en: 'See our', fr: 'Consultez notre', de: 'Siehe unsere', es: 'Consulta nuestra', it: 'Consulta la nostra', nl: 'Zie ons' },
    'consent.manage':  { en: 'Manage preferences', fr: 'Gérer les préférences', de: 'Einstellungen verwalten', es: 'Gestionar preferencias', it: 'Gestisci preferenze', nl: 'Voorkeuren beheren' },
    'consent.save':    { en: 'Save preferences', fr: 'Enregistrer les préférences', de: 'Einstellungen speichern', es: 'Guardar preferencias', it: 'Salva preferenze', nl: 'Voorkeuren opslaan' },
    'consent.accept':  { en: 'Accept necessary', fr: 'Accepter les nécessaires', de: 'Notwendige akzeptieren', es: 'Aceptar las necesarias', it: 'Accetta i necessari', nl: 'Noodzakelijke accepteren' },
    'consent.necessary':   { en: 'Necessary', fr: 'Nécessaires', de: 'Notwendig', es: 'Necesarias', it: 'Necessari', nl: 'Noodzakelijk' },
    'consent.necessaryD':  { en: 'always on (sign-in, preferences, security)', fr: 'toujours actifs (connexion, préférences, sécurité)', de: 'immer aktiv (Anmeldung, Einstellungen, Sicherheit)', es: 'siempre activas (inicio de sesión, preferencias, seguridad)', it: 'sempre attivi (accesso, preferenze, sicurezza)', nl: 'altijd aan (inloggen, voorkeuren, beveiliging)' },
    'consent.analytics':   { en: 'Analytics', fr: 'Analyse', de: 'Analyse', es: 'Análisis', it: 'Analisi', nl: 'Analyse' },
    'consent.marketing':   { en: 'Marketing', fr: 'Marketing', de: 'Marketing', es: 'Marketing', it: 'Marketing', nl: 'Marketing' },
    'consent.notInUse':    { en: 'not currently in use', fr: 'non utilisé actuellement', de: 'derzeit nicht in Gebrauch', es: 'no se usa actualmente', it: 'attualmente non in uso', nl: 'momenteel niet in gebruik' },

    // Common CTAs / labels
    'cta.requestScan':   { en: 'Request a Market Scan', fr: 'Demander un Market Scan', de: 'Market Scan anfordern', es: 'Solicitar un Market Scan', it: 'Richiedi un Market Scan', nl: 'Vraag een Market Scan aan' },
    'cta.browseOffices': { en: 'Browse offices', fr: 'Parcourir les bureaux', de: 'Büros durchsuchen', es: 'Explorar oficinas', it: 'Esplora uffici', nl: 'Kantoren bekijken' },
    'cta.requestAccess': { en: 'Request Access', fr: "Demander l'accès", de: 'Zugang anfordern', es: 'Solicitar acceso', it: 'Richiedi accesso', nl: 'Toegang aanvragen' },
    'cta.getStarted':    { en: 'Get started', fr: 'Commencer', de: 'Loslegen', es: 'Empezar', it: 'Inizia', nl: 'Aan de slag' },
    'cta.learnMore':     { en: 'Learn more', fr: 'En savoir plus', de: 'Mehr erfahren', es: 'Saber más', it: 'Scopri di più', nl: 'Meer informatie' },

    // Locked / access-gated states
    'locked.unit':    { en: 'Unit size & pricing on upgrade', fr: 'Surface et tarifs après mise à niveau', de: 'Flächengröße & Preise nach Upgrade', es: 'Superficie y precios al mejorar el plan', it: 'Superficie e prezzi con upgrade', nl: 'Oppervlakte & prijzen na upgrade' },
    'locked.details': { en: 'Request full details', fr: 'Demander les détails complets', de: 'Vollständige Details anfordern', es: 'Solicitar los detalles completos', it: 'Richiedi i dettagli completi', nl: 'Volledige details aanvragen' },
    'locked.identity':{ en: 'Building identity protected', fr: "Identité de l'immeuble protégée", de: 'Gebäudeidentität geschützt', es: 'Identidad del edificio protegida', it: "Identità dell'edificio protetta", nl: 'Identiteit van het gebouw beschermd' },

    // Forms (shared)
    'form.email':        { en: 'Email Address', fr: 'Adresse e-mail', de: 'E-Mail-Adresse', es: 'Correo electrónico', it: 'Indirizzo e-mail', nl: 'E-mailadres' },
    'form.corpEmail':    { en: 'Corporate Email', fr: 'E-mail professionnel', de: 'Geschäftliche E-Mail', es: 'Correo corporativo', it: 'E-mail aziendale', nl: 'Zakelijk e-mailadres' },
    'form.company':      { en: 'Company Name', fr: "Nom de l'entreprise", de: 'Firmenname', es: 'Nombre de la empresa', it: "Nome dell'azienda", nl: 'Bedrijfsnaam' },
    'form.name':         { en: 'Your Name', fr: 'Votre nom', de: 'Ihr Name', es: 'Tu nombre', it: 'Il tuo nome', nl: 'Uw naam' },
    'form.message':      { en: 'Message', fr: 'Message', de: 'Nachricht', es: 'Mensaje', it: 'Messaggio', nl: 'Bericht' },
    'form.submit':       { en: 'Submit', fr: 'Envoyer', de: 'Absenden', es: 'Enviar', it: 'Invia', nl: 'Verzenden' },
    'form.optional':     { en: 'optional', fr: 'facultatif', de: 'optional', es: 'opcional', it: 'facoltativo', nl: 'optioneel' },
    'form.errEmail':     { en: 'Enter a valid corporate email address.', fr: 'Saisissez une adresse e-mail professionnelle valide.', de: 'Geben Sie eine gültige geschäftliche E-Mail-Adresse ein.', es: 'Introduce un correo corporativo válido.', it: "Inserisci un'e-mail aziendale valida.", nl: 'Voer een geldig zakelijk e-mailadres in.' },
    'form.errRequired':  { en: 'Please complete the highlighted fields.', fr: 'Veuillez remplir les champs en surbrillance.', de: 'Bitte füllen Sie die markierten Felder aus.', es: 'Completa los campos resaltados.', it: 'Completa i campi evidenziati.', nl: 'Vul de gemarkeerde velden in.' },
    'form.success':      { en: 'Request received', fr: 'Demande reçue', de: 'Anfrage erhalten', es: 'Solicitud recibida', it: 'Richiesta ricevuta', nl: 'Verzoek ontvangen' },

    // Legal pages — review notice
    'legal.reviewNotice': { en: 'This translation is provided for convenience. The English version is authoritative and final legal wording is subject to review by qualified counsel.', fr: 'Cette traduction est fournie à titre indicatif. La version anglaise fait foi et la formulation juridique définitive est soumise à l’examen d’un conseil qualifié.', de: 'Diese Übersetzung dient nur der Übersicht. Maßgeblich ist die englische Fassung; die endgültige rechtliche Formulierung bedarf der Prüfung durch qualifizierte Rechtsberatung.', es: 'Esta traducción se ofrece solo por comodidad. La versión en inglés prevalece y la redacción legal definitiva está sujeta a revisión por asesoría jurídica cualificada.', it: 'Questa traduzione è fornita solo per comodità. La versione in inglese fa fede e la formulazione legale definitiva è soggetta a revisione da parte di un consulente qualificato.', nl: 'Deze vertaling is alleen ter informatie. De Engelse versie is bindend en de definitieve juridische tekst is onderhevig aan toetsing door gekwalificeerde juristen.' },

    // Homepage
    'home.heroEyebrow': { en: 'Corporate Office Intelligence · Africa & MENA', fr: 'Intelligence immobilière de bureau · Afrique et MENA', de: 'Corporate Office Intelligence · Afrika & MENA', es: 'Inteligencia de oficinas corporativas · África y MENA', it: 'Intelligence sugli uffici aziendali · Africa e MENA', nl: 'Corporate Office Intelligence · Afrika & MENA' },
    'home.heroH1':  { en: 'Find Office Space in<br><em>Opaque Markets</em><br>Before You Land.', fr: "Trouvez des bureaux sur<br><em>des marchés opaques</em><br>avant même d'arriver.", de: 'Finden Sie Büroflächen in<br><em>undurchsichtigen Märkten</em><br>bevor Sie landen.', es: 'Encuentre oficinas en<br><em>mercados opacos</em><br>antes de aterrizar.', it: 'Trova uffici in<br><em>mercati opachi</em><br>prima di arrivare.', nl: 'Vind kantoorruimte in<br><em>ondoorzichtige markten</em><br>voordat u aankomt.' },
    'home.heroSub': { en: 'Verified Grade A supply for corporate occupiers and expansion teams across Africa and MENA.', fr: "Une offre Grade A vérifiée pour les entreprises occupantes et les équipes d'expansion en Afrique et MENA.", de: 'Geprüftes Grade-A-Angebot für Unternehmensnutzer und Expansionsteams in Afrika und MENA.', es: 'Oferta Grade A verificada para empresas ocupantes y equipos de expansión en África y MENA.', it: 'Offerta Grade A verificata per aziende occupanti e team di espansione in Africa e MENA.', nl: 'Geverifieerd Grade A-aanbod voor zakelijke gebruikers en expansieteams in Afrika en MENA.' },
    'home.coverageTitle': { en: 'Coverage across Africa & MENA', fr: 'Couverture en Afrique et MENA', de: 'Abdeckung in Afrika & MENA', es: 'Cobertura en África y MENA', it: 'Copertura in Africa e MENA', nl: 'Dekking in Afrika & MENA' },
    'home.waysTitle': { en: 'Three ways to start', fr: 'Trois façons de commencer', de: 'Drei Wege zum Einstieg', es: 'Tres formas de empezar', it: 'Tre modi per iniziare', nl: 'Drie manieren om te starten' },
    'home.waysSub':   { en: 'Verified at source. Identity protected. We only introduce you to space that is actually available.', fr: 'Vérifié à la source. Identité protégée. Nous ne vous présentons que des espaces réellement disponibles.', de: 'An der Quelle geprüft. Identität geschützt. Wir vermitteln nur tatsächlich verfügbare Flächen.', es: 'Verificado en origen. Identidad protegida. Solo le presentamos espacios realmente disponibles.', it: 'Verificato alla fonte. Identità protetta. Ti presentiamo solo spazi realmente disponibili.', nl: 'Geverifieerd bij de bron. Identiteit beschermd. We introduceren alleen ruimte die echt beschikbaar is.' },
    'home.card1Tag':  { en: 'Demand-led', fr: 'Axé sur la demande', de: 'Nachfragegesteuert', es: 'Orientado a la demanda', it: 'Guidato dalla domanda', nl: 'Vraaggestuurd' },
    'home.card1Body': { en: 'Tell us your market, size and timeline. We return a verified shortlist in 48 hours. No portal trawling.', fr: 'Indiquez votre marché, votre taille et votre calendrier. Nous renvoyons une liste restreinte vérifiée en 48 heures. Sans recherche sur des portails.', de: 'Nennen Sie uns Markt, Größe und Zeitplan. Wir liefern in 48 Stunden eine geprüfte Auswahl. Kein Durchforsten von Portalen.', es: 'Indícanos tu mercado, tamaño y plazos. Devolvemos una lista verificada en 48 horas. Sin rastrear portales.', it: 'Indica mercato, dimensioni e tempistiche. Restituiamo una rosa verificata in 48 ore. Senza setacciare i portali.', nl: 'Geef uw markt, grootte en tijdlijn door. Wij leveren binnen 48 uur een geverifieerde shortlist. Geen portalen doorzoeken.' },
    'home.card2Tag':  { en: 'Decision tool', fr: 'Outil de décision', de: 'Entscheidungstool', es: 'Herramienta de decisión', it: 'Strumento decisionale', nl: 'Beslistool' },
    'home.card2Title':{ en: 'Stay vs Go analysis', fr: 'Analyse Stay vs Go', de: 'Stay-vs-Go-Analyse', es: 'Análisis Stay vs Go', it: 'Analisi Stay vs Go', nl: 'Stay vs Go-analyse' },
    'home.card2Body': { en: 'Compare staying put, fitting out a lease, taking fitted space, or coworking. Upfront CAPEX and total cost over term.', fr: "Comparez le maintien sur place, l'aménagement d'un bail, un espace déjà aménagé ou le coworking. CAPEX initial et coût total sur la durée.", de: 'Vergleichen Sie Verbleib, Ausbau einer Mietfläche, bereits ausgebaute Flächen oder Coworking. Anfangs-CAPEX und Gesamtkosten über die Laufzeit.', es: 'Compara quedarte, acondicionar un alquiler, tomar espacio ya equipado o coworking. CAPEX inicial y coste total durante el plazo.', it: "Confronta il restare, l'allestimento di un contratto, uno spazio già attrezzato o il coworking. CAPEX iniziale e costo totale nel periodo.", nl: 'Vergelijk blijven, een huur inrichten, ingerichte ruimte nemen of coworking. CAPEX vooraf en totale kosten over de looptijd.' },
    'home.card3Tag':  { en: 'Supply-side', fr: "Côté offre", de: 'Angebotsseite', es: 'Lado de la oferta', it: 'Lato offerta', nl: 'Aanbodzijde' },
    'home.card3Body': { en: 'Landlords and operators can submit space for review. Listings stay anonymized to occupiers until you choose to reveal.', fr: "Les propriétaires et exploitants peuvent soumettre des espaces à l'examen. Les annonces restent anonymes pour les occupants jusqu'à ce que vous choisissiez de les révéler.", de: 'Eigentümer und Betreiber können Flächen zur Prüfung einreichen. Angebote bleiben für Nutzer anonym, bis Sie sie freigeben.', es: 'Propietarios y operadores pueden enviar espacios para revisión. Los anuncios permanecen anónimos para los ocupantes hasta que decidas revelarlos.', it: 'Proprietari e operatori possono inviare spazi per la revisione. Gli annunci restano anonimi per gli occupanti finché non scegli di rivelarli.', nl: 'Verhuurders en exploitanten kunnen ruimte ter beoordeling indienen. Aanbiedingen blijven anoniem voor gebruikers totdat u ze vrijgeeft.' },
    'home.createAccount': { en: 'Create Account', fr: 'Créer un compte', de: 'Konto erstellen', es: 'Crear cuenta', it: 'Crea account', nl: 'Account aanmaken' },
    'home.viewPricing':   { en: 'View Pricing', fr: 'Voir les tarifs', de: 'Preise ansehen', es: 'Ver precios', it: 'Vedi i prezzi', nl: 'Bekijk prijzen' },
    'home.browseCoverage':{ en: 'Browse coverage', fr: 'Parcourir la couverture', de: 'Abdeckung ansehen', es: 'Explorar cobertura', it: 'Esplora la copertura', nl: 'Dekking bekijken' },

    // Data & privacy request page/form
    'dr.lead':      { en: 'Use this form to exercise your data protection rights. Subject to applicable law, you can ask us to give you a copy of your data, correct it, delete it, stop using it, or withdraw consent. We aim to respond within 30 days.', fr: "Utilisez ce formulaire pour exercer vos droits en matière de protection des données. Sous réserve de la loi applicable, vous pouvez nous demander une copie de vos données, leur correction, leur suppression, l'arrêt de leur utilisation ou le retrait de votre consentement. Nous nous efforçons de répondre sous 30 jours.", de: 'Nutzen Sie dieses Formular, um Ihre Datenschutzrechte auszuüben. Vorbehaltlich des geltenden Rechts können Sie eine Kopie Ihrer Daten, deren Berichtigung oder Löschung, die Einschränkung der Verarbeitung oder den Widerruf Ihrer Einwilligung verlangen. Wir bemühen uns, innerhalb von 30 Tagen zu antworten.', es: 'Utiliza este formulario para ejercer tus derechos de protección de datos. Sujeto a la ley aplicable, puedes pedirnos una copia de tus datos, su corrección, su eliminación, que dejemos de usarlos o retirar tu consentimiento. Procuramos responder en un plazo de 30 días.', it: 'Usa questo modulo per esercitare i tuoi diritti sulla protezione dei dati. Nei limiti della legge applicabile, puoi chiederci una copia dei tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento o il ritiro del consenso. Cerchiamo di rispondere entro 30 giorni.', nl: 'Gebruik dit formulier om uw gegevensbeschermingsrechten uit te oefenen. Onder voorbehoud van toepasselijk recht kunt u ons vragen om een kopie van uw gegevens, correctie, verwijdering, beperking van het gebruik of intrekking van uw toestemming. We streven ernaar binnen 30 dagen te reageren.' },
    'dr.kindLabel': { en: 'What would you like to do?', fr: 'Que souhaitez-vous faire ?', de: 'Was möchten Sie tun?', es: '¿Qué te gustaría hacer?', it: 'Cosa desideri fare?', nl: 'Wat wilt u doen?' },
    'dr.k.access':     { en: 'Request a copy of my data (access)', fr: 'Demander une copie de mes données (accès)', de: 'Kopie meiner Daten anfordern (Auskunft)', es: 'Solicitar una copia de mis datos (acceso)', it: 'Richiedere una copia dei miei dati (accesso)', nl: 'Een kopie van mijn gegevens opvragen (inzage)' },
    'dr.k.correction': { en: 'Correct my data', fr: 'Corriger mes données', de: 'Meine Daten berichtigen', es: 'Corregir mis datos', it: 'Correggere i miei dati', nl: 'Mijn gegevens corrigeren' },
    'dr.k.deletion':   { en: 'Delete my data / close my account', fr: 'Supprimer mes données / fermer mon compte', de: 'Meine Daten löschen / Konto schließen', es: 'Eliminar mis datos / cerrar mi cuenta', it: "Eliminare i miei dati / chiudere l'account", nl: 'Mijn gegevens verwijderen / account sluiten' },
    'dr.k.withdraw':   { en: 'Withdraw my consent', fr: 'Retirer mon consentement', de: 'Meine Einwilligung widerrufen', es: 'Retirar mi consentimiento', it: 'Ritirare il consenso', nl: 'Mijn toestemming intrekken' },
    'dr.k.object':     { en: 'Object to or restrict processing', fr: "M'opposer au traitement ou le limiter", de: 'Der Verarbeitung widersprechen oder sie einschränken', es: 'Oponerme al tratamiento o restringirlo', it: 'Oppormi al trattamento o limitarlo', nl: 'Bezwaar maken tegen of verwerking beperken' },
    'dr.k.question':   { en: 'Ask a general privacy question', fr: 'Poser une question générale sur la confidentialité', de: 'Allgemeine Datenschutzfrage stellen', es: 'Hacer una pregunta general de privacidad', it: 'Porre una domanda generale sulla privacy', nl: 'Een algemene privacyvraag stellen' },
    'dr.companyOpt':   { en: 'Company (optional)', fr: 'Entreprise (facultatif)', de: 'Unternehmen (optional)', es: 'Empresa (opcional)', it: 'Azienda (facoltativo)', nl: 'Bedrijf (optioneel)' },
    'dr.details':      { en: 'Details of your request', fr: 'Détails de votre demande', de: 'Details Ihrer Anfrage', es: 'Detalles de tu solicitud', it: 'Dettagli della richiesta', nl: 'Details van uw verzoek' },
    'dr.submit':       { en: 'Submit Request', fr: 'Envoyer la demande', de: 'Anfrage senden', es: 'Enviar solicitud', it: 'Invia richiesta', nl: 'Verzoek verzenden' },
    'dr.errKind':      { en: 'Please choose a request type.', fr: 'Veuillez choisir un type de demande.', de: 'Bitte wählen Sie einen Anfragetyp.', es: 'Elige un tipo de solicitud.', it: 'Scegli un tipo di richiesta.', nl: 'Kies een verzoektype.' },
    'form.errName':    { en: 'Enter your name.', fr: 'Saisissez votre nom.', de: 'Geben Sie Ihren Namen ein.', es: 'Introduce tu nombre.', it: 'Inserisci il tuo nome.', nl: 'Voer uw naam in.' },
    'form.errEmailAny':{ en: 'Enter a valid email address.', fr: 'Saisissez une adresse e-mail valide.', de: 'Geben Sie eine gültige E-Mail-Adresse ein.', es: 'Introduce un correo electrónico válido.', it: "Inserisci un'e-mail valida.", nl: 'Voer een geldig e-mailadres in.' },

    // Language switcher
    'lang.label': { en: 'Language', fr: 'Langue', de: 'Sprache', es: 'Idioma', it: 'Lingua', nl: 'Taal' }
  };

  function t(key) {
    var e = T[key];
    if (!e) return null;            // unknown key -> keep HTML fallback
    var l = getLang();
    return e[l] || e.en || null;
  }

  function setText(el, v) { if (v != null) el.textContent = v; }
  function apply(root) {
    var scope = root || document;
    var lang = getLang();
    try { document.documentElement.setAttribute('lang', lang); } catch (e) {}
    scope.querySelectorAll('[data-i18n]').forEach(function (el) { var v = t(el.getAttribute('data-i18n')); if (v != null) el.textContent = v; });
    scope.querySelectorAll('[data-i18n-html]').forEach(function (el) { var v = t(el.getAttribute('data-i18n-html')); if (v != null) el.innerHTML = v; });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) { var v = t(el.getAttribute('data-i18n-placeholder')); if (v != null) el.setAttribute('placeholder', v); });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) { var v = t(el.getAttribute('data-i18n-aria')); if (v != null) el.setAttribute('aria-label', v); });
  }

  function switcherHTML() {
    var cur = getLang();
    var opts = LANGS.map(function (l) {
      return '<option value="' + l[0] + '"' + (l[0] === cur ? ' selected' : '') + '>' + l[1] + '</option>';
    }).join('');
    return '<select class="lang-switch" aria-label="' + (t('lang.label') || 'Language') +
      '" onchange="URBN_I18N.set(this.value)">' + opts + '</select>';
  }

  window.URBN_I18N = {
    langs: LANGS, supported: SUPPORTED,
    get: getLang, set: setLang, t: t, apply: apply, switcherHTML: switcherHTML, dict: T
  };
  // Translate static page content as soon as the DOM is ready. Injected chrome
  // (nav/footer) calls URBN_I18N.apply() itself right after injection.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { apply(); });
  } else { apply(); }
})();
