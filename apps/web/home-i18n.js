// Bilingual brand copy for the ZORONA home page.
(() => {
  'use strict';

  const copy = {
    ar: {
      title: 'ZORONA | مطعم لبناني وتركي',
      description: 'مطعم لبناني وتركي في مكان واحد — أصالة لبنان ومشاوي تركيا ومقبلات وأطباق تجمع العائلة والأصدقاء. استكشف المنيو وعروض اليوم واحجز طاولتك.',
      brandLine: 'مطبخ لبناني وتركي',
      navLabel: 'القائمة الرئيسية',
      home: 'الرئيسية',
      menu: 'المنيو',
      offers: 'عروض اليوم',
      reservation: 'حجز طاولة',
      account: 'حسابي',
      heroKicker: 'ZORONA · مطعم لبناني وتركي',
      heroTitle: 'نكهات لبنان وتركيا<br><em>على مائدة واحدة</em>',
      heroLead: 'من المشاوي التركية والمقبلات اللبنانية إلى أطباق أصيلة تجمع العائلة والأصدقاء.',
      menuCta: 'استكشف المنيو',
      reservationCta: 'احجز طاولتك',
      shortcuts: 'اختصارات ZORONA',
      menuSmall: 'أطباق لبنانية وتركية',
      offersSmall: 'اكتشف عرض اليوم',
      bookingSmall: 'اختر الوقت وعدد الضيوف',
      todayTitle: 'اختيار اليوم من ZORONA',
      todayBadge: 'عرض اليوم',
      todayAction: 'اكتشف العرض',
      bookingKicker: 'مائدتك بانتظارك',
      bookingTitle: 'خلّي زيارتك القادمة تبدأ من هنا',
      bookingLead: 'اختر الموعد المناسب وأرسل طلب الحجز مباشرة.',
      bookingAction: 'احجز طاولتك الآن',
      aboutKicker: 'تجربة ZORONA',
      aboutTitle: 'لبنان وتركيا، بضيافة من القلب',
      aboutText: 'من المقبلات اللبنانية والمشاوي التركية إلى الأطباق الأصيلة التي نحب مشاركتها؛ نحتفي بالمطبخين معًا، بنفس القدر من الاهتمام.',
      footerLine: 'مطعم لبناني وتركي',
      offerAlt: 'طبق لبناني أو تركي مميز من ZORONA',
      menuAction: 'تصفح القائمة والمنتجات',
      offerAction: 'شوف العرض الحالي وتفاصيله'
    },
    en: {
      title: 'ZORONA | Lebanese & Turkish Restaurant',
      description: 'ZORONA brings Lebanon and Türkiye together through Lebanese mezze, Turkish grills and authentic dishes made for sharing. Explore the menu, daily offers and table reservations.',
      brandLine: 'LEBANESE & TURKISH CUISINE',
      navLabel: 'Main navigation',
      home: 'Home',
      menu: 'Menu',
      offers: 'Today’s Offers',
      reservation: 'Reservations',
      account: 'My Account',
      heroKicker: 'ZORONA · LEBANESE & TURKISH CUISINE',
      heroTitle: 'Lebanese & Turkish flavors<br><em>at one table</em>',
      heroLead: 'From Turkish grills and Lebanese mezze to authentic dishes made for sharing with family and friends.',
      menuCta: 'Explore the Menu',
      reservationCta: 'Book a Table',
      shortcuts: 'Explore ZORONA',
      menuSmall: 'Lebanese & Turkish dishes',
      offersSmall: 'Discover today’s offer',
      bookingSmall: 'Choose a time and party size',
      todayTitle: 'Today at ZORONA',
      todayBadge: 'Today’s Offer',
      todayAction: 'Explore Offer',
      bookingKicker: 'YOUR TABLE AWAITS',
      bookingTitle: 'Let your next visit start here',
      bookingLead: 'Choose a convenient time and send your reservation request.',
      bookingAction: 'Reserve Your Table',
      aboutKicker: 'THE ZORONA EXPERIENCE',
      aboutTitle: 'Lebanon and Türkiye, with heartfelt hospitality',
      aboutText: 'From Lebanese mezze and Turkish grills to authentic dishes made to share, we give both culinary traditions equal care and attention.',
      footerLine: 'Lebanese & Turkish Restaurant',
      offerAlt: 'A signature Lebanese or Turkish dish from ZORONA',
      menuAction: 'Browse the menu and dishes',
      offerAction: 'See the current offer and details'
    }
  };

  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  };

  function apply(language) {
    const t = copy[language] || copy.ar;
    document.title = t.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t.description;

    setText('.app-header .brand span', t.brandLine);
    const languageToggle = document.querySelector('#lang-toggle');
    if (languageToggle) languageToggle.setAttribute('aria-label', language === 'en' ? 'Change language' : 'تغيير اللغة');
    const nav = document.querySelector('#app-header-nav');
    if (nav) {
      nav.setAttribute('aria-label', t.navLabel);
      const links = nav.querySelectorAll('a');
      [t.home, t.menu, t.offers, t.reservation, t.account].forEach((label, index) => {
        if (links[index]) links[index].textContent = label;
      });
    }

    setText('.app-hero-kicker', t.heroKicker);
    const heroTitle = document.querySelector('#hero-title');
    if (heroTitle) heroTitle.innerHTML = t.heroTitle;
    setText('.app-hero-lead', t.heroLead);

    const primaryCta = document.querySelector('.app-primary-cta');
    if (primaryCta) primaryCta.innerHTML = t.menuCta + ' <span aria-hidden="true">←</span>';
    setText('.app-secondary-cta', t.reservationCta);

    const quickActions = document.querySelectorAll('.app-quick-action');
    if (quickActions[0]) {
      setTextWithin(quickActions[0], '.app-quick-copy strong', t.menu);
      setTextWithin(quickActions[0], '.app-quick-copy small', t.menuSmall);
      setTextWithin(quickActions[0], '.app-quick-arrow', '←');
    }
    if (quickActions[1]) {
      setTextWithin(quickActions[1], '.app-quick-copy strong', t.offers);
      setTextWithin(quickActions[1], '.app-quick-copy small', language === 'en' ? t.offerAction : t.offerAction);
    }
    if (quickActions[2]) {
      setTextWithin(quickActions[2], '.app-quick-copy strong', t.reservation);
      setTextWithin(quickActions[2], '.app-quick-copy small', t.bookingSmall);
    }
    const shortcuts = document.querySelector('#home-actions');
    if (shortcuts) shortcuts.setAttribute('aria-label', t.shortcuts);

    setPlaceholderText('.today-offer-badge', ['عرض اليوم', 'Today’s Offer'], t.todayBadge);
    setPlaceholderText('.today-offer-title', ['اختيار اليوم من ZORONA', 'Today at ZORONA'], t.todayTitle);
    const todayAction = document.querySelector('.today-offer-action');
    if (todayAction) todayAction.innerHTML = t.todayAction + ' <span aria-hidden="true">←</span>';

    setText('.booking-cta .app-eyebrow', t.bookingKicker);
    setText('.booking-cta h3', t.bookingTitle);
    setText('.booking-cta p:not(.app-eyebrow)', t.bookingLead);
    const bookingAction = document.querySelector('.booking-cta-action a');
    if (bookingAction) bookingAction.textContent = t.bookingAction + ' ←';

    setText('#about .app-eyebrow', t.aboutKicker);
    setText('#about h2', t.aboutTitle);
    setText('#about > p:last-child', t.aboutText);
    setText('#contact span', t.footerLine);
    const offerImage = document.querySelector('.today-offer-media img');
    if (offerImage) offerImage.alt = t.offerAlt;
  }

  function setPlaceholderText(selector, placeholders, value) {
    const node = document.querySelector(selector);
    if (node && placeholders.includes(node.textContent.trim())) node.textContent = value;
  }

  function setTextWithin(parent, selector, value) {
    const node = parent.querySelector(selector);
    if (node) node.textContent = value;
  }

  window.addEventListener('arabisk:language-updated', event => {
    apply(event.detail?.language);
  });
  apply(localStorage.getItem('ARABISK_LANG') === 'en' ? 'en' : 'ar');
})();