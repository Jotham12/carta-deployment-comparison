#!/usr/bin/env bash
set -euo pipefail

# Reference:
# https://kubernetes.io/docs/concepts/services-networking/ingress/

NAMESPACE="${NAMESPACE:-carta}"
INGRESS_NAME="${INGRESS_NAME:-controller-ingress}"
INGRESS_CLASS="${INGRESS_CLASS:-nginx}"
SERVICE_NAME="${SERVICE_NAME:-controller-service}"
SERVICE_PORT="${SERVICE_PORT:-8000}"
MANIFEST_FILE="${MANIFEST_FILE:-controller-ingress.yaml}"

echo "==> Ensuring namespace exists: ${NAMESPACE}"
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

echo "==> Installing NGINX Ingress Controller"
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml

echo "==> Waiting for ingress-nginx controller to be ready"
kubectl rollout status deployment/ingress-nginx-controller \
  -n ingress-nginx \
  --timeout=300s

echo "==> Writing ingress manifest to ${MANIFEST_FILE}"
cat > "${MANIFEST_FILE}" <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${INGRESS_NAME}
  namespace: ${NAMESPACE}
spec:
  ingressClassName: ${INGRESS_CLASS}
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${SERVICE_NAME}
                port:
                  number: ${SERVICE_PORT}
EOF

echo "==> Applying ingress manifest"
kubectl apply -f "${MANIFEST_FILE}"

echo "==> Verifying ingress"
kubectl get ingress -n "${NAMESPACE}"
kubectl describe ingress "${INGRESS_NAME}" -n "${NAMESPACE}"

echo "==> Done"
echo "Manifest written to: ${MANIFEST_FILE}"
