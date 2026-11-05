/**
 * Application Android (TWA : le site affiché en plein écran par Chrome).
 *
 * L'application s'ouvre sur `ANDROID_APP_START_URL` (paramètre `source`). Le
 * marqueur est gardé dans le sessionStorage de l'onglet de l'application : il ne
 * fuit pas vers Chrome, contrairement à un cookie (cookies partagés avec Chrome).
 *
 * Dans l'application, aucun achat ni renvoi vers un paiement (règles Google Play) :
 * les éléments `.hide-in-android-app` sont masqués, `.show-in-android-app` affichés.
 */
export const ANDROID_APP_PACKAGE = "fr.solinebtp.app";
export const ANDROID_APP_SOURCE = "android-app";
export const ANDROID_APP_START_URL = `/app?source=${ANDROID_APP_SOURCE}`;
export const ANDROID_APP_HTML_ATTRIBUTE = "data-android-app";

/** Exécuté avant l'affichage : pose l'attribut sur <html>. */
export const ANDROID_APP_DETECTION_SCRIPT = `(function(){try{var k="soline_android_app",s=window.sessionStorage;var q=new URLSearchParams(location.search).get("source")==="${ANDROID_APP_SOURCE}";var r=document.referrer.indexOf("android-app://${ANDROID_APP_PACKAGE}")===0;if(q||r)s.setItem(k,"1");if(s.getItem(k)==="1")document.documentElement.setAttribute("${ANDROID_APP_HTML_ATTRIBUTE}","")}catch(e){}})();`;

export function isInAndroidApp(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute(ANDROID_APP_HTML_ATTRIBUTE);
}
