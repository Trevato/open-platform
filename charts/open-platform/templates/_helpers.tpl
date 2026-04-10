{{/*
open-platform — Helm template helpers
Ports the variable derivation logic from scripts/generate-config.sh
*/}}

{{/*
Standard Helm fullname — release name truncated to 63 chars.
*/}}
{{- define "op.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart label value.
*/}}
{{- define "op.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Standard labels.
*/}}
{{- define "op.labels" -}}
helm.sh/chart: {{ include "op.chart" . }}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Platform domain — required.
*/}}
{{- define "op.domain" -}}
{{- required "domain is required" .Values.domain }}
{{- end }}

{{/*
Service prefix — defaults to empty string.
*/}}
{{- define "op.prefix" -}}
{{- .Values.servicePrefix | default "" }}
{{- end }}

{{/*
Admin username — defaults to "opadmin".
*/}}
{{- define "op.adminUser" -}}
{{- .Values.admin.username | default "opadmin" }}
{{- end }}

{{/*
Admin email — defaults to admin@{domain}.
*/}}
{{- define "op.adminEmail" -}}
{{- if .Values.admin.email }}
{{- .Values.admin.email }}
{{- else }}
{{- printf "admin@%s" (include "op.domain" .) }}
{{- end }}
{{- end }}

{{/*
Domain TLD — extract last segment (e.g., "sh" from "open-platform.sh").
*/}}
{{- define "op.domainTld" -}}
{{- $parts := splitList "." (include "op.domain" .) }}
{{- last $parts }}
{{- end }}

{{/*
TLS mode — defaults to "selfsigned".
*/}}
{{- define "op.tlsMode" -}}
{{- .Values.tls.mode | default "selfsigned" }}
{{- end }}

{{/*
TLS email — defaults to admin email.
*/}}
{{- define "op.tlsEmail" -}}
{{- if .Values.tls.email }}
{{- .Values.tls.email }}
{{- else }}
{{- include "op.adminEmail" . }}
{{- end }}
{{- end }}

{{/*
Skip TLS verify — true unless tls.mode=letsencrypt.
Returns string "true" or "false" for direct YAML use.
*/}}
{{- define "op.skipTlsVerify" -}}
{{- if eq (include "op.tlsMode" .) "letsencrypt" }}false{{- else }}true{{- end }}
{{- end }}

{{/*
Service host — returns {prefix}{svc}.{domain}.
Usage: {{ include "op.svcHost" (list . "forgejo") }}
*/}}
{{- define "op.svcHost" -}}
{{- $ctx := index . 0 -}}
{{- $svc := index . 1 -}}
{{- printf "%s%s.%s" (include "op.prefix" $ctx) $svc (include "op.domain" $ctx) -}}
{{- end }}

{{/*
Service URL — returns https://{prefix}{svc}.{domain}.
Usage: {{ include "op.svcUrl" (list . "forgejo") }}
*/}}
{{- define "op.svcUrl" -}}
{{- printf "https://%s" (include "op.svcHost" (list (index . 0) (index . 1))) -}}
{{- end }}

{{/*
Forgejo external URL.
*/}}
{{- define "op.forgejoUrl" -}}
{{- include "op.svcUrl" (list . "forgejo") }}
{{- end }}

{{/*
Forgejo internal URL — K8s service DNS, HTTP, no TLS.
*/}}
{{- define "op.forgejoInternalUrl" -}}
{{- print "http://forgejo-http.forgejo.svc.cluster.local:3000" }}
{{- end }}

{{/*
SMTP host — external if configured, else bundled Mailpit.
*/}}
{{- define "op.smtpHost" -}}
{{- if .Values.smtp.external }}
{{- required "smtp.host is required when smtp.external is true" .Values.smtp.host }}
{{- else }}
{{- print "mailpit-smtp.mailpit.svc.cluster.local" }}
{{- end }}
{{- end }}

{{/*
SMTP port — external if configured, else 1025 (Mailpit).
*/}}
{{- define "op.smtpPort" -}}
{{- if .Values.smtp.external }}
{{- .Values.smtp.port | default 587 }}
{{- else }}
{{- print "1025" }}
{{- end }}
{{- end }}

{{/*
SMTP from address — external if configured, else forgejo@{domain}.
*/}}
{{- define "op.smtpFrom" -}}
{{- if and .Values.smtp.external .Values.smtp.from }}
{{- .Values.smtp.from }}
{{- else }}
{{- printf "forgejo@%s" (include "op.domain" .) }}
{{- end }}
{{- end }}

{{/*
Mailpit enabled — true if SMTP is not external.
Returns string "true" or "false".
*/}}
{{- define "op.mailpitEnabled" -}}
{{- if .Values.smtp.external }}false{{- else }}true{{- end }}
{{- end }}

{{/*
MetalLB enabled — true if network.mode=loadbalancer.
Returns string "true" or "false".
*/}}
{{- define "op.metallbEnabled" -}}
{{- if eq .Values.network.mode "loadbalancer" }}true{{- else }}false{{- end }}
{{- end }}

{{/*
Cloudflare tunnel enabled — true if primary tls.mode=cloudflare OR any extraDomain uses cloudflare.
Returns string "true" or "false".
*/}}
{{- define "op.cloudflareEnabled" -}}
{{- if eq (include "op.tlsMode" .) "cloudflare" -}}true
{{- else -}}
  {{- $found := false -}}
  {{- range .Values.extraDomains -}}
    {{- if eq ((.tls).mode | default "") "cloudflare" -}}
      {{- $found = true -}}
    {{- end -}}
  {{- end -}}
  {{- if $found -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- end }}

{{/*
cert-manager enabled — true if primary tls.mode=letsencrypt OR any extraDomain uses letsencrypt.
Returns string "true" or "false".
*/}}
{{- define "op.certManagerEnabled" -}}
{{- if eq (include "op.tlsMode" .) "letsencrypt" -}}true
{{- else -}}
  {{- $found := false -}}
  {{- range .Values.extraDomains -}}
    {{- if eq ((.tls).mode | default "") "letsencrypt" -}}
      {{- $found = true -}}
    {{- end -}}
  {{- end -}}
  {{- if $found -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- end }}

{{/*
Per-component install flags.
*/}}
{{- define "op.traefikInstall" -}}
{{- if hasKey (default dict .Values.traefik) "install" -}}
{{- .Values.traefik.install -}}
{{- else -}}
{{- true -}}
{{- end -}}
{{- end -}}

{{- define "op.cnpgInstall" -}}
{{- if hasKey (default dict .Values.cnpg) "install" -}}
{{- .Values.cnpg.install -}}
{{- else -}}
{{- true -}}
{{- end -}}
{{- end -}}

{{- define "op.corednsManage" -}}
{{- if hasKey (default dict .Values.coredns) "manage" -}}
{{- .Values.coredns.manage -}}
{{- else -}}
{{- true -}}
{{- end -}}
{{- end -}}

{{/*
All domains — returns a list of all domain names (primary + extras).
Usage: {{ include "op.allDomains" . }}
Returns a JSON array string. Use `fromJson` to iterate.
*/}}
{{- define "op.allDomains" -}}
{{- $domains := list (include "op.domain" .) }}
{{- range .Values.extraDomains }}
{{- $domains = append $domains .name }}
{{- end }}
{{- $domains | toJson }}
{{- end }}

{{/*
TLS mode for a specific domain — returns the domain's tls.mode or falls back to primary.
Usage: {{ include "op.domainTlsMode" (list . "espodev.com") }}
*/}}
{{- define "op.domainTlsMode" -}}
{{- $ctx := index . 0 -}}
{{- $domainName := index . 1 -}}
{{- if eq $domainName (include "op.domain" $ctx) -}}
  {{- include "op.tlsMode" $ctx -}}
{{- else -}}
  {{- $mode := "" -}}
  {{- range $ctx.Values.extraDomains -}}
    {{- if eq .name $domainName -}}
      {{- $mode = ((.tls).mode | default "") -}}
    {{- end -}}
  {{- end -}}
  {{- if $mode -}}{{ $mode }}{{- else -}}{{ include "op.tlsMode" $ctx }}{{- end -}}
{{- end -}}
{{- end }}

{{/*
Domain slug — converts domain name to a k8s-safe label (dots to dashes).
Usage: {{ include "op.domainSlug" "espodev.com" }}
*/}}
{{- define "op.domainSlug" -}}
{{- . | replace "." "-" }}
{{- end }}

{{/*
Extra domains env — serializes extraDomains for the bootstrap Job as pipe-delimited entries.
Format: "name:tlsMode|name:tlsMode" (e.g., "espodev.com:letsencrypt|dev.test:selfsigned")
Empty string if no extra domains.
*/}}
{{- define "op.extraDomainsEnv" -}}
{{- $entries := list }}
{{- range .Values.extraDomains }}
  {{- $mode := (.tls).mode | default "" }}
  {{- $entries = append $entries (printf "%s:%s" .name $mode) }}
{{- end }}
{{- join "|" $entries }}
{{- end }}
