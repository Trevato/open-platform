{{/*
Chart name, truncated to 63 characters.
*/}}
{{- define "provisioner.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified name: release-chart, truncated to 63 characters.
If the release name already contains the chart name, use it as-is.
*/}}
{{- define "provisioner.fullname" -}}
{{- if contains .Chart.Name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "provisioner.labels" -}}
app: provisioner
app.kubernetes.io/name: {{ include "provisioner.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
open-platform.sh/managed: "true"
{{- end }}

{{/*
Selector labels for matching pods.
*/}}
{{- define "provisioner.selectorLabels" -}}
app: provisioner
app.kubernetes.io/name: {{ include "provisioner.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
