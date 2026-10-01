(function () {
    const config = window.RouterForgeAds;
    const consent = window.RouterForgeConsent;
    if (!config || !config.enabled || !/^ca-pub-\d{16}$/.test(config.publisherId) || !consent?.hasAdvertisingConsent?.()) return;

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + config.publisherId;
    document.head.append(script);
}());
