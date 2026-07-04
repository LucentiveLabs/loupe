#!/usr/bin/env bash
# security-dast.sh — PASSIVE dynamic security probe of live domains.
#
# Passive-only policy (no active fuzzing against production with real users/
# data): checks response security headers, TLS validity, and runs nuclei's
# safe/passive templates only. Report-oriented — surfaces gaps; does not
# attack. Active fuzzing (ZAP) belongs on staging.
#
# Usage: security-dast.sh ["<url1> <url2> ..."]   (defaults to the live domains)
set -uo pipefail

# Default target: where Loupe is published (labs.lucentive.io/libraries/loupe).
DOMAINS="${1:-https://labs.lucentive.io}"
REQUIRED_HEADERS="strict-transport-security content-security-policy x-frame-options x-content-type-options referrer-policy"
GAPS=0

for url in $DOMAINS; do
  echo "== $url =="
  host="$(printf '%s' "$url" | sed -E 's#^https?://##; s#/.*##')"

  # Response security headers (passive GET, follow redirects).
  hdrs="$(curl -sSL -D - -o /dev/null --max-time 25 "$url" 2>/dev/null || true)"
  if [ -z "$hdrs" ]; then echo "  ⚠️  no response (unreachable?)"; GAPS=$((GAPS+1)); continue; fi
  for h in $REQUIRED_HEADERS; do
    if printf '%s' "$hdrs" | grep -qi "^$h:"; then echo "  ✅ $h"; else echo "  ⚠️  MISSING $h"; GAPS=$((GAPS+1)); fi
  done

  # TLS: certificate expiry (passive handshake).
  exp="$(printf '' | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed 's/notAfter=//')"
  echo "  TLS expiry: ${exp:-unknown}"

  # nuclei is OPT-IN (DAST_NUCLEI=1) and restricted to non-intrusive DETECTION
  # templates only — ssl/tech/dns at info severity, with active families
  # explicitly excluded. Broad http/exposure/CVE tags pull XSS/POST/exploit
  # probes that would violate the passive-on-prod policy, so they are NOT used.
  # The curl header + openssl TLS checks above are the always-on passive baseline;
  # active fuzzing (ZAP / full nuclei) runs only against staging, never prod.
  if [ "${DAST_NUCLEI:-0}" = "1" ] && command -v nuclei >/dev/null 2>&1; then
    nuclei -silent -u "$url" -tags ssl,tech,dns -severity info \
      -exclude-tags fuzz,intrusive,dos,cve,sqli,xss,rce,lfi,ssrf,injection,brute-force \
      -timeout 15 -rate-limit 10 2>/dev/null | sed 's/^/  nuclei(passive): /' | head -15
  fi
done

echo "== DAST result: header/reachability gaps = $GAPS (report-only) =="
exit 0
