#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-carta}"
POD_NAME="${POD_NAME:-uploader}"
PVC_NAME="${PVC_NAME:-cephfs-images-pvc}"
IMAGE="${IMAGE:-busybox}"
SLEEP_SECONDS="${SLEEP_SECONDS:-3600}"
MANIFEST_FILE="${MANIFEST_FILE:-uploader.yaml}"

echo "==> Ensuring namespace exists: ${NAMESPACE}"
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

echo "==> Writing ${MANIFEST_FILE}"
cat > "${MANIFEST_FILE}" <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: ${POD_NAME}
  namespace: ${NAMESPACE}
spec:
  restartPolicy: Never
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ${PVC_NAME}
  containers:
    - name: uploader
      image: ${IMAGE}
      command:
        - sleep
        - "${SLEEP_SECONDS}"
      volumeMounts:
        - name: data
          mountPath: /data
EOF

echo "==> Applying ${MANIFEST_FILE}"
kubectl apply -f "${MANIFEST_FILE}"

echo "==> Current pod status"
kubectl get pod "${POD_NAME}" -n "${NAMESPACE}"

echo "==> Done"
echo "Manifest written to: ${MANIFEST_FILE}"
