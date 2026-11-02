// Applies the saved interface language before the first paint so an Arabic session never
// flashes an LTR layout. This lives in a file rather than inline in index.html because the
// production Content-Security-Policy is `script-src 'self'` and blocks inline scripts.
;(function () {
  try {
    var lang = localStorage.getItem('asas_lang') === 'ar' ? 'ar' : 'en'
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  } catch (error) {
    /* localStorage can be unavailable in privacy modes; the document defaults stay LTR. */
  }
})()
