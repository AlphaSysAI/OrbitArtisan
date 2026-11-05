#!/usr/bin/env bash
# Construit et signe l'application Android SolineBTP (TWA).
# Résultat : dist/solinebtp-<version>.aab (Play Store) et dist/solinebtp-<version>.apk (test sur téléphone).
# Mot de passe de la clé : variable SOLINE_KEYSTORE_PASSWORD, sinon demandé au clavier.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
KEYSTORE="${SOLINE_KEYSTORE:-$HOME/SolineBTP-android-cles/solinebtp-upload.keystore}"
ALIAS="solinebtp-upload"
BUILD_TOOLS="$ANDROID_HOME/build-tools/36.0.0"

if [[ -z "${SOLINE_KEYSTORE_PASSWORD:-}" ]]; then
  read -r -s -p "Mot de passe de la clé Android : " SOLINE_KEYSTORE_PASSWORD; echo
fi

[[ -f local.properties ]] || echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew --no-daemon -q bundleRelease assembleRelease

VERSION=$(grep -m1 'versionName' app/build.gradle | sed -E 's/.*"([^"]+)".*/\1/; s/.*versionName //')
mkdir -p dist
AAB="dist/solinebtp-$VERSION.aab"
APK="dist/solinebtp-$VERSION.apk"

cp app/build/outputs/bundle/release/app-release.aab "$AAB"
"$JAVA_HOME/bin/jarsigner" -keystore "$KEYSTORE" -storepass:env SOLINE_KEYSTORE_PASSWORD \
  -sigalg SHA256withRSA -digestalg SHA-256 "$AAB" "$ALIAS" >/dev/null

"$BUILD_TOOLS/zipalign" -f -p 4 app/build/outputs/apk/release/app-release-unsigned.apk "$APK.tmp"
"$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$ALIAS" \
  --ks-pass env:SOLINE_KEYSTORE_PASSWORD --out "$APK" "$APK.tmp"
rm -f "$APK.tmp" "$APK.idsig"

"$JAVA_HOME/bin/jarsigner" -verify "$AAB" >/dev/null && "$BUILD_TOOLS/apksigner" verify "$APK"
echo "Prêt : $AAB (Play Store) et $APK (test)"
