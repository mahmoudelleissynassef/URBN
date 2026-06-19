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
    'a11y.skip':     { en: 'Skip to main content', fr: 'Aller au contenu principal', de: 'Zum Hauptinhalt springen', es: 'Saltar al contenido principal', it: 'Vai al contenuto principale', nl: 'Naar hoofdinhoud' },
    'brand.subsidiary': { en: 'a Heirstone Consulting company', fr: 'une société Heirstone Consulting', de: 'ein Unternehmen von Heirstone Consulting', es: 'una empresa de Heirstone Consulting', it: 'una società di Heirstone Consulting', nl: 'een Heirstone Consulting-bedrijf' },

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
    'home.open':          { en: 'Open', fr: 'Ouvrir', de: 'Öffnen', es: 'Abrir', it: 'Apri', nl: 'Openen' },
    'home.byCityTitle':   { en: 'Find offices by city', fr: 'Trouver des bureaux par ville', de: 'Büros nach Stadt finden', es: 'Encuentra oficinas por ciudad', it: 'Trova uffici per città', nl: 'Vind kantoren per stad' },
    'home.byCitySub':     { en: 'City guides to office space, serviced offices and coworking across our core African markets.', fr: 'Guides par ville sur les bureaux, les bureaux services et le coworking sur nos principaux marchés africains.', de: 'Stadtführer zu Büroflächen, Serviced Offices und Coworking in unseren afrikanischen Kernmärkten.', es: 'Guías por ciudad sobre oficinas, oficinas con servicios y coworking en nuestros principales mercados africanos.', it: 'Guide per città su uffici, uffici attrezzati e coworking nei nostri principali mercati africani.', nl: 'Stadsgidsen voor kantoorruimte, serviced offices en coworking in onze belangrijkste Afrikaanse markten.' },
    'home.marketInsights':{ en: 'Market insights', fr: 'Analyses de marché', de: 'Markteinblicke', es: 'Análisis de mercado', it: 'Analisi di mercato', nl: 'Marktinzichten' },
    'home.officesIn':     { en: 'Offices in', fr: 'Bureaux à', de: 'Büros in', es: 'Oficinas en', it: 'Uffici a', nl: 'Kantoren in' },
    'home.marketsSub':    { en: '16 cities across Africa and MENA. Grade A office inventory verified directly.', fr: '16 villes en Afrique et MENA. Offre de bureaux Grade A vérifiée directement.', de: '16 Städte in Afrika und MENA. Grade-A-Büroangebot direkt geprüft.', es: '16 ciudades en África y MENA. Inventario de oficinas Grade A verificado directamente.', it: '16 città in Africa e MENA. Inventario di uffici Grade A verificato direttamente.', nl: '16 steden in Afrika en MENA. Grade A-kantooraanbod direct geverifieerd.' },
    'home.allMarkets':    { en: 'All Markets', fr: 'Tous les marchés', de: 'Alle Märkte', es: 'Todos los mercados', it: 'Tutti i mercati', nl: 'Alle markten' },
    'home.districtsTitle':{ en: 'Prime Office Districts', fr: 'Quartiers de bureaux prime', de: 'Erstklassige Bürobezirke', es: 'Distritos de oficinas prime', it: 'Distretti di uffici prime', nl: 'Toplocaties voor kantoren' },
    'home.districtsSub':  { en: 'Key office locations with indicative rent bands.', fr: 'Emplacements de bureaux clés avec fourchettes de loyer indicatives.', de: 'Wichtige Bürostandorte mit indikativen Mietspannen.', es: 'Ubicaciones de oficinas clave con rangos de alquiler indicativos.', it: 'Località chiave per uffici con fasce di affitto indicative.', nl: 'Belangrijke kantoorlocaties met indicatieve huurbandbreedtes.' },
    'home.allDistricts':  { en: 'All Districts', fr: 'Tous les quartiers', de: 'Alle Bezirke', es: 'Todos los distritos', it: 'Tutti i distretti', nl: 'Alle wijken' },
    'home.district':      { en: 'District', fr: 'Quartier', de: 'Bezirk', es: 'Distrito', it: 'Distretto', nl: 'Wijk' },
    'home.grade':         { en: 'Grade', fr: 'Catégorie', de: 'Klasse', es: 'Categoría', it: 'Categoria', nl: 'Klasse' },
    'home.indicativeRent':{ en: 'Indicative rent / m² / mo', fr: 'Loyer indicatif / m² / mois', de: 'Richtmiete / m² / Mon.', es: 'Alquiler indicativo / m² / mes', it: 'Affitto indicativo / m² / mese', nl: 'Indicatieve huur / m² / mnd' },
    'home.notAvailable':  { en: 'Not available', fr: 'Non disponible', de: 'Nicht verfügbar', es: 'No disponible', it: 'Non disponibile', nl: 'Niet beschikbaar' },
    'home.districtsNote': { en: 'Indicative reference bands, not live quotes. Rent bars compare districts within the same currency only.', fr: 'Fourchettes de référence indicatives, pas des devis en temps réel. Les barres de loyer ne comparent que les quartiers de même devise.', de: 'Indikative Referenzspannen, keine Echtzeitangebote. Mietbalken vergleichen nur Bezirke derselben Währung.', es: 'Rangos de referencia indicativos, no cotizaciones en vivo. Las barras de alquiler solo comparan distritos de la misma moneda.', it: 'Fasce di riferimento indicative, non quotazioni in tempo reale. Le barre di affitto confrontano solo distretti della stessa valuta.', nl: 'Indicatieve referentiebandbreedtes, geen actuele offertes. Huurbalken vergelijken alleen wijken in dezelfde valuta.' },
    'home.avgRent':       { en: 'Avg Rent', fr: 'Loyer moyen', de: 'Durchschn. Miete', es: 'Alquiler medio', it: 'Affitto medio', nl: 'Gem. huur' },
    'home.listed':        { en: 'listed', fr: 'référencés', de: 'gelistet', es: 'listados', it: 'elencati', nl: 'vermeld' },
    'home.comingSoon':    { en: 'Coming soon', fr: 'Bientôt disponible', de: 'Demnächst', es: 'Próximamente', it: 'Prossimamente', nl: 'Binnenkort' },
    'home.viewOffices':   { en: 'View offices', fr: 'Voir les bureaux', de: 'Büros ansehen', es: 'Ver oficinas', it: 'Vedi uffici', nl: 'Bekijk kantoren' },
    'home.cities':        { en: 'CITIES', fr: 'VILLES', de: 'STÄDTE', es: 'CIUDADES', it: 'CITTÀ', nl: 'STEDEN' },
    'home.regions':       { en: 'REGIONS', fr: 'RÉGIONS', de: 'REGIONEN', es: 'REGIONES', it: 'REGIONI', nl: 'REGIO\'S' },
    'home.howTitle':      { en: 'How URBN Works', fr: 'Comment fonctionne URBN', de: 'So funktioniert URBN', es: 'Cómo funciona URBN', it: 'Come funziona URBN', nl: 'Hoe URBN werkt' },
    'home.step1Title':    { en: 'Browse Verified Offices', fr: 'Parcourez des bureaux vérifiés', de: 'Geprüfte Büros durchsuchen', es: 'Explora oficinas verificadas', it: 'Esplora uffici verificati', nl: 'Blader door geverifieerde kantoren' },
    'home.step1Body':     { en: 'Access a curated inventory of Grade A and A+ office buildings across 16 markets. Every listing is verified against the source. No recycled broker data. No stale availability.', fr: "Accédez à une sélection d'immeubles de bureaux Grade A et A+ sur 16 marchés. Chaque annonce est vérifiée à la source. Pas de données de courtiers recyclées. Pas de disponibilités obsolètes.", de: 'Greifen Sie auf ein kuratiertes Angebot von Grade-A- und A+-Bürogebäuden in 16 Märkten zu. Jedes Angebot wird an der Quelle geprüft. Keine recycelten Maklerdaten. Keine veralteten Verfügbarkeiten.', es: 'Accede a un inventario seleccionado de edificios de oficinas Grade A y A+ en 16 mercados. Cada anuncio se verifica en origen. Sin datos reciclados de brókeres. Sin disponibilidad obsoleta.', it: 'Accedi a un inventario selezionato di edifici per uffici Grade A e A+ in 16 mercati. Ogni annuncio è verificato alla fonte. Nessun dato di broker riciclato. Nessuna disponibilità obsoleta.', nl: 'Krijg toegang tot een samengesteld aanbod van Grade A- en A+-kantoorgebouwen in 16 markten. Elke aanbieding wordt bij de bron geverifieerd. Geen gerecyclede makelaarsdata. Geen verouderde beschikbaarheid.' },
    'home.step2Title':    { en: 'Shortlist Buildings', fr: 'Présélectionnez des immeubles', de: 'Gebäude in die Auswahl', es: 'Preselecciona edificios', it: 'Crea una rosa di edifici', nl: 'Maak een shortlist van gebouwen' },
    'home.step2Body':     { en: 'Filter by city, district, floor plate, parking, and fit-out condition. Save buildings to a shortlist and compare options. Or request a managed Market Scan for a curated shortlist within 48 hours.', fr: "Filtrez par ville, quartier, plateau, stationnement et état d'aménagement. Enregistrez des immeubles dans une liste restreinte et comparez les options. Ou demandez un Market Scan géré pour une sélection en 48 heures.", de: 'Filtern Sie nach Stadt, Bezirk, Etagenfläche, Parkplätzen und Ausbauzustand. Speichern Sie Gebäude in einer Auswahl und vergleichen Sie Optionen. Oder fordern Sie einen verwalteten Market Scan für eine kuratierte Auswahl innerhalb von 48 Stunden an.', es: 'Filtra por ciudad, distrito, planta, aparcamiento y estado de acondicionamiento. Guarda edificios en una lista y compara opciones. O solicita un Market Scan gestionado para una lista seleccionada en 48 horas.', it: "Filtra per città, distretto, piano, parcheggio e stato di allestimento. Salva edifici in una rosa e confronta le opzioni. Oppure richiedi un Market Scan gestito per una selezione entro 48 ore.", nl: 'Filter op stad, wijk, vloerveld, parkeren en afwerkingsniveau. Bewaar gebouwen op een shortlist en vergelijk opties. Of vraag een beheerde Market Scan aan voor een samengestelde shortlist binnen 48 uur.' },
    'home.step3Title':    { en: 'Request a Protected Introduction', fr: 'Demandez une mise en relation protégée', de: 'Geschützte Vermittlung anfordern', es: 'Solicita una presentación protegida', it: 'Richiedi una presentazione protetta', nl: 'Vraag een beschermde introductie aan' },
    'home.step3Body':     { en: 'URBN formally introduces you to the building. The introduction is timestamped, logged, and commission-protected for 24 months. You do not contact the landlord directly.', fr: "URBN vous présente formellement à l'immeuble. La mise en relation est horodatée, enregistrée et protégée par commission pendant 24 mois. Vous ne contactez pas le propriétaire directement.", de: 'URBN stellt Sie dem Gebäude offiziell vor. Die Vermittlung ist mit Zeitstempel versehen, protokolliert und 24 Monate provisionsgeschützt. Sie kontaktieren den Eigentümer nicht direkt.', es: 'URBN te presenta formalmente al edificio. La presentación queda fechada, registrada y protegida por comisión durante 24 meses. No contactas al propietario directamente.', it: "URBN ti presenta formalmente all'edificio. La presentazione è con marca temporale, registrata e protetta da commissione per 24 mesi. Non contatti direttamente il proprietario.", nl: 'URBN stelt u formeel voor aan het gebouw. De introductie wordt van een tijdstempel voorzien, vastgelegd en 24 maanden commissiebeschermd. U neemt niet rechtstreeks contact op met de verhuurder.' },
    'home.protTitle':     { en: 'Protected introductions', fr: 'Mises en relation protégées', de: 'Geschützte Vermittlungen', es: 'Presentaciones protegidas', it: 'Presentazioni protette', nl: 'Beschermde introducties' },
    'home.protSub':       { en: 'Building identity stays anonymous until you ask. Every reveal is reviewed before identity is shared, and every introduction is logged and commission-protected for 24 months.', fr: "L'identité de l'immeuble reste anonyme jusqu'à votre demande. Chaque révélation est examinée avant tout partage d'identité, et chaque mise en relation est enregistrée et protégée par commission pendant 24 mois.", de: 'Die Gebäudeidentität bleibt anonym, bis Sie fragen. Jede Offenlegung wird vor der Weitergabe der Identität geprüft, und jede Vermittlung wird protokolliert und 24 Monate provisionsgeschützt.', es: 'La identidad del edificio permanece anónima hasta que lo pidas. Cada revelación se revisa antes de compartir la identidad, y cada presentación se registra y se protege por comisión durante 24 meses.', it: "L'identità dell'edificio resta anonima finché non la richiedi. Ogni rivelazione è esaminata prima di condividere l'identità e ogni presentazione è registrata e protetta da commissione per 24 mesi.", nl: 'De identiteit van het gebouw blijft anoniem totdat u erom vraagt. Elke onthulling wordt beoordeeld voordat de identiteit wordt gedeeld, en elke introductie wordt vastgelegd en 24 maanden commissiebeschermd.' },
    'home.pi1Title':      { en: 'Reveal request', fr: 'Demande de révélation', de: 'Offenlegungsanfrage', es: 'Solicitud de revelación', it: 'Richiesta di rivelazione', nl: 'Onthullingsverzoek' },
    'home.pi1Body':       { en: "You request a building's full details from an anonymized listing.", fr: "Vous demandez les détails complets d'un immeuble à partir d'une annonce anonymisée.", de: 'Sie fordern die vollständigen Angaben eines Gebäudes aus einem anonymisierten Angebot an.', es: 'Solicitas los detalles completos de un edificio a partir de un anuncio anonimizado.', it: 'Richiedi i dettagli completi di un edificio da un annuncio anonimizzato.', nl: 'U vraagt de volledige gegevens van een gebouw op uit een geanonimiseerde aanbieding.' },
    'home.pi2Title':      { en: 'URBN review', fr: 'Examen URBN', de: 'URBN-Prüfung', es: 'Revisión de URBN', it: 'Revisione URBN', nl: 'URBN-beoordeling' },
    'home.pi2Body':       { en: 'Our team reviews and approves before any identity is shared.', fr: "Notre équipe examine et approuve avant tout partage d'identité.", de: 'Unser Team prüft und genehmigt, bevor eine Identität geteilt wird.', es: 'Nuestro equipo revisa y aprueba antes de compartir cualquier identidad.', it: "Il nostro team esamina e approva prima di condividere qualsiasi identità.", nl: 'Ons team beoordeelt en keurt goed voordat enige identiteit wordt gedeeld.' },
    'home.pi3Title':      { en: 'Introduction logged', fr: 'Mise en relation enregistrée', de: 'Vermittlung protokolliert', es: 'Presentación registrada', it: 'Presentazione registrata', nl: 'Introductie vastgelegd' },
    'home.pi3Body':       { en: 'The introduction is timestamped and recorded against your account.', fr: 'La mise en relation est horodatée et enregistrée sur votre compte.', de: 'Die Vermittlung wird mit Zeitstempel versehen und Ihrem Konto zugeordnet.', es: 'La presentación queda fechada y registrada en tu cuenta.', it: 'La presentazione è con marca temporale e registrata sul tuo account.', nl: 'De introductie wordt van een tijdstempel voorzien en op uw account vastgelegd.' },
    'home.pi4Title':      { en: '24-month protection', fr: 'Protection de 24 mois', de: '24 Monate Schutz', es: 'Protección de 24 meses', it: 'Protezione di 24 mesi', nl: 'Bescherming van 24 maanden' },
    'home.pi4Body':       { en: 'Commission protection runs for 24 months from introduction.', fr: 'La protection de commission court pendant 24 mois à compter de la mise en relation.', de: 'Der Provisionsschutz läuft 24 Monate ab der Vermittlung.', es: 'La protección de comisión dura 24 meses desde la presentación.', it: 'La protezione della commissione dura 24 mesi dalla presentazione.', nl: 'De commissiebescherming loopt 24 maanden vanaf de introductie.' },
    'home.pi5Title':      { en: 'Tracked to close', fr: "Suivi jusqu'à la signature", de: 'Bis zum Abschluss verfolgt', es: 'Seguimiento hasta el cierre', it: 'Tracciato fino alla chiusura', nl: 'Gevolgd tot afsluiting' },
    'home.pi5Body':       { en: 'Site visits, offers and the transaction are tracked end to end.', fr: "Les visites, les offres et la transaction sont suivies de bout en bout.", de: 'Besichtigungen, Angebote und die Transaktion werden durchgängig verfolgt.', es: 'Las visitas, las ofertas y la transacción se rastrean de principio a fin.', it: 'Sopralluoghi, offerte e transazione sono tracciati end to end.', nl: 'Bezichtigingen, biedingen en de transactie worden van begin tot eind gevolgd.' },
    'home.statMarkets':   { en: 'Active Markets', fr: 'Marchés actifs', de: 'Aktive Märkte', es: 'Mercados activos', it: 'Mercati attivi', nl: 'Actieve markten' },
    'home.statVerified':  { en: 'Verified', fr: 'Vérifiée', de: 'Geprüft', es: 'Verificada', it: 'Verificata', nl: 'Geverifieerd' },
    'home.statSupply':    { en: 'Office supply', fr: 'Offre de bureaux', de: 'Büroangebot', es: 'Oferta de oficinas', it: 'Offerta di uffici', nl: 'Kantooraanbod' },
    'home.statGrade':     { en: 'Grade Standard Only', fr: 'Standard de catégorie uniquement', de: 'Nur Klassenstandard', es: 'Solo estándar de categoría', it: 'Solo standard di categoria', nl: 'Alleen klassestandaard' },
    'home.statProtection':{ en: 'Introduction Protection', fr: 'Protection des mises en relation', de: 'Vermittlungsschutz', es: 'Protección de presentaciones', it: 'Protezione delle presentazioni', nl: 'Introductiebescherming' },
    'home.ctaTitle':      { en: 'Know Your Options Before You Land.', fr: "Connaissez vos options avant d'arriver.", de: 'Kennen Sie Ihre Optionen, bevor Sie landen.', es: 'Conoce tus opciones antes de aterrizar.', it: 'Conosci le tue opzioni prima di arrivare.', nl: 'Ken uw opties voordat u aankomt.' },
    'home.ctaSub':        { en: 'Request a curated Market Scan and receive a verified shortlist of buildings within 48 hours.', fr: 'Demandez un Market Scan sélectionné et recevez une liste restreinte vérifiée en 48 heures.', de: 'Fordern Sie einen kuratierten Market Scan an und erhalten Sie innerhalb von 48 Stunden eine geprüfte Gebäudeauswahl.', es: 'Solicita un Market Scan seleccionado y recibe una lista verificada de edificios en 48 horas.', it: 'Richiedi un Market Scan curato e ricevi una rosa verificata di edifici entro 48 ore.', nl: 'Vraag een samengestelde Market Scan aan en ontvang binnen 48 uur een geverifieerde shortlist van gebouwen.' },
    'home.ctaScan':       { en: 'Request Market Scan', fr: 'Demander un Market Scan', de: 'Market Scan anfordern', es: 'Solicitar Market Scan', it: 'Richiedi Market Scan', nl: 'Market Scan aanvragen' },
    // Region labels (match URBN_DATA.markets[].region)
    'region.GCC':            { en: 'GCC', fr: 'CCG', de: 'GCC', es: 'CCG', it: 'CCG', nl: 'GCC' },
    'region.North Africa':   { en: 'North Africa', fr: 'Afrique du Nord', de: 'Nordafrika', es: 'Norte de África', it: 'Nord Africa', nl: 'Noord-Afrika' },
    'region.Levant':         { en: 'Levant', fr: 'Levant', de: 'Levante', es: 'Levante', it: 'Levante', nl: 'Levant' },
    'region.East Africa':    { en: 'East Africa', fr: "Afrique de l'Est", de: 'Ostafrika', es: 'África Oriental', it: 'Africa orientale', nl: 'Oost-Afrika' },
    'region.West Africa':    { en: 'West Africa', fr: "Afrique de l'Ouest", de: 'Westafrika', es: 'África Occidental', it: 'Africa occidentale', nl: 'West-Afrika' },
    'region.Southern Africa':{ en: 'Southern Africa', fr: 'Afrique australe', de: 'Südliches Afrika', es: 'África Austral', it: 'Africa australe', nl: 'Zuidelijk Afrika' },
    // Country labels (translate the country portion; city names stay proper nouns)
    'country.Egypt':        { en: 'Egypt', fr: 'Égypte', de: 'Ägypten', es: 'Egipto', it: 'Egitto', nl: 'Egypte' },
    'country.UAE':          { en: 'UAE', fr: 'EAU', de: 'VAE', es: 'EAU', it: 'EAU', nl: 'VAE' },
    'country.Saudi Arabia': { en: 'Saudi Arabia', fr: 'Arabie saoudite', de: 'Saudi-Arabien', es: 'Arabia Saudí', it: 'Arabia Saudita', nl: 'Saoedi-Arabië' },
    'country.KSA':          { en: 'KSA', fr: 'Arabie saoudite', de: 'Saudi-Arabien', es: 'Arabia Saudí', it: 'Arabia Saudita', nl: 'Saoedi-Arabië' },
    'country.Morocco':      { en: 'Morocco', fr: 'Maroc', de: 'Marokko', es: 'Marruecos', it: 'Marocco', nl: 'Marokko' },
    'country.Jordan':       { en: 'Jordan', fr: 'Jordanie', de: 'Jordanien', es: 'Jordania', it: 'Giordania', nl: 'Jordanië' },
    'country.Tunisia':      { en: 'Tunisia', fr: 'Tunisie', de: 'Tunesien', es: 'Túnez', it: 'Tunisia', nl: 'Tunesië' },
    'country.Algeria':      { en: 'Algeria', fr: 'Algérie', de: 'Algerien', es: 'Argelia', it: 'Algeria', nl: 'Algerije' },
    'country.Nigeria':      { en: 'Nigeria', fr: 'Nigéria', de: 'Nigeria', es: 'Nigeria', it: 'Nigeria', nl: 'Nigeria' },
    'country.Kenya':        { en: 'Kenya', fr: 'Kenya', de: 'Kenia', es: 'Kenia', it: 'Kenya', nl: 'Kenia' },
    'country.South Africa': { en: 'South Africa', fr: 'Afrique du Sud', de: 'Südafrika', es: 'Sudáfrica', it: 'Sudafrica', nl: 'Zuid-Afrika' },
    'country.Ghana':        { en: 'Ghana', fr: 'Ghana', de: 'Ghana', es: 'Ghana', it: 'Ghana', nl: 'Ghana' },
    'country.Ethiopia':     { en: 'Ethiopia', fr: 'Éthiopie', de: 'Äthiopien', es: 'Etiopía', it: 'Etiopia', nl: 'Ethiopië' },
    'country.Rwanda':       { en: 'Rwanda', fr: 'Rwanda', de: 'Ruanda', es: 'Ruanda', it: 'Ruanda', nl: 'Rwanda' },
    'country.Angola':       { en: 'Angola', fr: 'Angola', de: 'Angola', es: 'Angola', it: 'Angola', nl: 'Angola' },
    "country.Côte d'Ivoire":{ en: "Côte d'Ivoire", fr: "Côte d'Ivoire", de: 'Elfenbeinküste', es: 'Costa de Marfil', it: "Costa d'Avorio", nl: 'Ivoorkust' },
    'country.Senegal':      { en: 'Senegal', fr: 'Sénégal', de: 'Senegal', es: 'Senegal', it: 'Senegal', nl: 'Senegal' },
    'country.Tanzania':     { en: 'Tanzania', fr: 'Tanzanie', de: 'Tansania', es: 'Tanzania', it: 'Tanzania', nl: 'Tanzania' },

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

    // Access / request-access modal (injected site-wide by urbn.js)
    'access.heading':   { en: 'Create your URBN account', fr: 'Créez votre compte URBN', de: 'Erstellen Sie Ihr URBN-Konto', es: 'Crea tu cuenta de URBN', it: 'Crea il tuo account URBN', nl: 'Maak uw URBN-account aan' },
    'access.createFree':{ en: 'Create a free account →', fr: 'Créer un compte gratuit →', de: 'Kostenloses Konto erstellen →', es: 'Crear una cuenta gratuita →', it: 'Crea un account gratuito →', nl: 'Maak een gratis account aan →' },
    'access.haveAccount':{ en: 'I already have an account', fr: "J'ai déjà un compte", de: 'Ich habe bereits ein Konto', es: 'Ya tengo una cuenta', it: 'Ho già un account', nl: 'Ik heb al een account' },
    'access.preferLead':{ en: 'Prefer URBN to set you up?', fr: 'Vous préférez que URBN s’en charge ?', de: 'Möchten Sie, dass URBN das übernimmt?', es: '¿Prefieres que URBN lo gestione?', it: 'Preferisci che sia URBN a occuparsene?', nl: 'Liever dat URBN het regelt?' },
    'access.callback':  { en: 'Request a callback', fr: 'Demander un rappel', de: 'Rückruf anfordern', es: 'Solicitar una llamada', it: 'Richiedi di essere ricontattato', nl: 'Vraag om teruggebeld te worden' },
    'access.introBody': { en: 'A free account unlocks <strong style="color:var(--text);">full floor-by-floor availability, asking rents, and protected introductions</strong> across every market we cover. A verified corporate email is required.', fr: "Un compte gratuit débloque <strong style=\"color:var(--text);\">la disponibilité étage par étage, les loyers demandés et les mises en relation protégées</strong> sur tous les marchés couverts. Une adresse e-mail professionnelle vérifiée est requise.", de: 'Ein kostenloses Konto schaltet <strong style="color:var(--text);">die etagengenaue Verfügbarkeit, Angebotsmieten und geschützte Vermittlungen</strong> in allen abgedeckten Märkten frei. Eine geprüfte geschäftliche E-Mail ist erforderlich.', es: 'Una cuenta gratuita desbloquea <strong style="color:var(--text);">la disponibilidad planta por planta, las rentas solicitadas y las presentaciones protegidas</strong> en todos los mercados que cubrimos. Se requiere un correo corporativo verificado.', it: "Un account gratuito sblocca <strong style=\"color:var(--text);\">la disponibilità piano per piano, i canoni richiesti e le presentazioni protette</strong> in tutti i mercati coperti. È richiesta un'e-mail aziendale verificata.", nl: 'Een gratis account ontgrendelt <strong style="color:var(--text);">de beschikbaarheid per verdieping, vraaghuren en beschermde introducties</strong> in alle markten die we dekken. Een geverifieerd zakelijk e-mailadres is vereist.' },
    'access.preferBody': { en: '<strong style="color:var(--text);">Prefer URBN to set you up?</strong> Leave your details and our team will reach out to arrange access.', fr: "<strong style=\"color:var(--text);\">Vous préférez que URBN s'en charge ?</strong> Laissez vos coordonnées et notre équipe vous contactera pour organiser l'accès.", de: '<strong style="color:var(--text);">Möchten Sie, dass URBN das übernimmt?</strong> Hinterlassen Sie Ihre Angaben und unser Team meldet sich, um den Zugang einzurichten.', es: '<strong style="color:var(--text);">¿Prefieres que URBN lo gestione?</strong> Deja tus datos y nuestro equipo te contactará para organizar el acceso.', it: '<strong style="color:var(--text);">Preferisci che sia URBN a occuparsene?</strong> Lascia i tuoi dati e il nostro team ti contatterà per organizzare l\'accesso.', nl: '<strong style="color:var(--text);">Liever dat URBN het regelt?</strong> Laat uw gegevens achter en ons team neemt contact op om toegang te regelen.' },
    'access.targetMarket': { en: 'Target Market', fr: 'Marché cible', de: 'Zielmarkt', es: 'Mercado objetivo', it: 'Mercato target', nl: 'Doelmarkt' },
    'access.selectMarket': { en: 'Select market...', fr: 'Sélectionner un marché...', de: 'Markt auswählen...', es: 'Selecciona un mercado...', it: 'Seleziona un mercato...', nl: 'Selecteer een markt...' },
    'access.areaPh':    { en: 'e.g. 800', fr: 'ex. 800', de: 'z. B. 800', es: 'p. ej. 800', it: 'es. 800', nl: 'bijv. 800' },
    'access.consent':   { en: 'I agree to URBN processing these details to assess and grant access, per the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Use</a>.', fr: "J'accepte que URBN traite ces informations pour évaluer et accorder l'accès, conformément à la <a href=\"/privacy\">politique de confidentialité</a> et aux <a href=\"/terms\">conditions d'utilisation</a>.", de: 'Ich stimme zu, dass URBN diese Angaben verarbeitet, um den Zugang zu prüfen und zu gewähren, gemäß der <a href="/privacy">Datenschutzerklärung</a> und den <a href="/terms">Nutzungsbedingungen</a>.', es: 'Acepto que URBN procese estos datos para evaluar y conceder el acceso, según la <a href="/privacy">Política de privacidad</a> y los <a href="/terms">Términos de uso</a>.', it: "Accetto che URBN tratti questi dati per valutare e concedere l'accesso, secondo l'<a href=\"/privacy\">Informativa sulla privacy</a> e i <a href=\"/terms\">Termini d'uso</a>.", nl: 'Ik ga ermee akkoord dat URBN deze gegevens verwerkt om toegang te beoordelen en te verlenen, volgens het <a href="/privacy">Privacybeleid</a> en de <a href="/terms">Gebruiksvoorwaarden</a>.' },
    'access.errEmail':  { en: 'Enter a valid corporate email address.', fr: 'Saisissez une adresse e-mail professionnelle valide.', de: 'Geben Sie eine gültige geschäftliche E-Mail-Adresse ein.', es: 'Introduce un correo corporativo válido.', it: "Inserisci un'e-mail aziendale valida.", nl: 'Voer een geldig zakelijk e-mailadres in.' },
    'access.errCompany':{ en: 'Enter your company name.', fr: "Saisissez le nom de votre entreprise.", de: 'Geben Sie Ihren Firmennamen ein.', es: 'Introduce el nombre de tu empresa.', it: "Inserisci il nome della tua azienda.", nl: 'Voer uw bedrijfsnaam in.' },
    'access.errMarket': { en: 'Please select a target market.', fr: 'Veuillez sélectionner un marché cible.', de: 'Bitte wählen Sie einen Zielmarkt.', es: 'Selecciona un mercado objetivo.', it: 'Seleziona un mercato target.', nl: 'Selecteer een doelmarkt.' },
    'access.errConsent':{ en: 'Please confirm you accept the Privacy Policy and Terms of Use.', fr: "Veuillez confirmer que vous acceptez la politique de confidentialité et les conditions d'utilisation.", de: 'Bitte bestätigen Sie, dass Sie die Datenschutzerklärung und die Nutzungsbedingungen akzeptieren.', es: 'Confirma que aceptas la Política de privacidad y los Términos de uso.', it: "Conferma di accettare l'Informativa sulla privacy e i Termini d'uso.", nl: 'Bevestig dat u het Privacybeleid en de Gebruiksvoorwaarden accepteert.' },
    'access.cancel':    { en: 'Cancel', fr: 'Annuler', de: 'Abbrechen', es: 'Cancelar', it: 'Annulla', nl: 'Annuleren' },

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
