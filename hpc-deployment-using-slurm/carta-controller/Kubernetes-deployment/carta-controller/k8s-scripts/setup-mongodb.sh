#!/usr/bin/env bash
set -euo pipefail

# ------------------------------------------------------------
# References
# cert-manager install docs:
# https://cert-manager.io/docs/installation/kubectl/
#
# cert-manager manifest used here:
# https://github.com/cert-manager/cert-manager/releases/download/v1.19.2/cert-manager.yaml
#
# MongoDB Community Operator guide:
# https://rohinpandey.medium.com/guide-mongodb-kubernetes-community-operator-c85faac0fc84
# ------------------------------------------------------------

# -----------------------------
# Configurable values
# -----------------------------
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.19.2}"
MONGODB_VERSION="${MONGODB_VERSION:-6.0.4}"
MONGODB_MEMBERS="${MONGODB_MEMBERS:-3}"
MONGODB_NAMESPACE="${MONGODB_NAMESPACE:-mongodb}"
MONGODB_OPERATOR_NAMESPACE="${MONGODB_OPERATOR_NAMESPACE:-mongodb-operator}"
STORAGE_CLASS="${STORAGE_CLASS:-cephfs}"
STORAGE_SIZE="${STORAGE_SIZE:-5Gi}"

# External DNS names used in replicaSetHorizons and TLS SANs
HORIZON_1_HOST="${HORIZON_1_HOST:-db-node-1.example.com}"
HORIZON_2_HOST="${HORIZON_2_HOST:-db-node-2.example.com}"
HORIZON_3_HOST="${HORIZON_3_HOST:-db-node-3.example.com}"

HORIZON_1_PORT="${HORIZON_1_PORT:-30017}"
HORIZON_2_PORT="${HORIZON_2_PORT:-30018}"
HORIZON_3_PORT="${HORIZON_3_PORT:-30019}"

WORKDIR="${WORKDIR:-$PWD/mongodb-setup}"

echo "==> Creating working directory: ${WORKDIR}"
mkdir -p "${WORKDIR}"
cd "${WORKDIR}"

echo "==> Checking required commands"
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed."; exit 1; }
command -v snap >/dev/null 2>&1 || { echo "snap is required but not installed."; exit 1; }

if ! command -v helm >/dev/null 2>&1; then
  echo "==> Installing helm"
  sudo snap install helm --classic
else
  echo "==> helm already installed"
fi

echo "==> Installing cert-manager"
kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER_VERSION}/cert-manager.yaml"

echo "==> Waiting for cert-manager to be ready"
kubectl rollout status deployment/cert-manager -n cert-manager --timeout=300s
kubectl rollout status deployment/cert-manager-cainjector -n cert-manager --timeout=300s
kubectl rollout status deployment/cert-manager-webhook -n cert-manager --timeout=300s

echo "==> Creating namespaces"
kubectl create namespace "${MONGODB_OPERATOR_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace "${MONGODB_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

echo "==> Adding MongoDB Helm repo"
helm repo add mongodb https://mongodb.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update

echo "==> Installing/upgrading MongoDB Community Operator"
helm upgrade --install community-operator mongodb/community-operator \
  --namespace "${MONGODB_OPERATOR_NAMESPACE}" \
  --set operator.watchNamespace="*"

echo "==> Waiting for MongoDB Community Operator deployment"
kubectl rollout status deployment/community-operator -n "${MONGODB_OPERATOR_NAMESPACE}" --timeout=300s

echo "==> Waiting for MongoDB Community CRD"
kubectl wait --for=condition=Established crd/mongodbcommunity.mongodbcommunity.mongodb.com --timeout=300s

echo "==> Writing TLS manifest"
cat > mongodb-tls.yaml <<EOF
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: selfsigned-issuer
  namespace: ${MONGODB_NAMESPACE}
spec:
  selfSigned: {}
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: mongodb-ca
  namespace: ${MONGODB_NAMESPACE}
spec:
  isCA: true
  commonName: mongodb-ca
  secretName: mongodb-ca
  privateKey:
    algorithm: RSA
    size: 2048
  issuerRef:
    name: selfsigned-issuer
    kind: Issuer
---
apiVersion: cert-manager.io/v1
kind: Issuer
metadata:
  name: mongodb-ca-issuer
  namespace: ${MONGODB_NAMESPACE}
spec:
  ca:
    secretName: mongodb-ca
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: mongodb-cert
  namespace: ${MONGODB_NAMESPACE}
spec:
  secretName: mongodb-cert
  commonName: mongodb
  issuerRef:
    name: mongodb-ca-issuer
    kind: Issuer
  dnsNames:
    - mongodb-svc
    - mongodb-svc.${MONGODB_NAMESPACE}.svc
    - mongodb-svc.${MONGODB_NAMESPACE}.svc.cluster.local
    - mongodb-0.mongodb-svc.${MONGODB_NAMESPACE}.svc.cluster.local
    - mongodb-1.mongodb-svc.${MONGODB_NAMESPACE}.svc.cluster.local
    - mongodb-2.mongodb-svc.${MONGODB_NAMESPACE}.svc.cluster.local
    - ${HORIZON_1_HOST}
    - ${HORIZON_2_HOST}
    - ${HORIZON_3_HOST}
EOF

echo "==> Applying TLS manifest"
kubectl apply -f mongodb-tls.yaml

echo "==> Waiting for CA certificate"
kubectl wait --for=condition=Ready certificate/mongodb-ca -n "${MONGODB_NAMESPACE}" --timeout=300s

echo "==> Waiting for MongoDB server certificate"
kubectl wait --for=condition=Ready certificate/mongodb-cert -n "${MONGODB_NAMESPACE}" --timeout=300s

echo "==> Writing MongoDB manifest"
cat > mongodb-community.yaml <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: mongodb-database
  namespace: ${MONGODB_NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mongodb-database
  namespace: ${MONGODB_NAMESPACE}
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["patch", "delete", "get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: mongodb-database
  namespace: ${MONGODB_NAMESPACE}
subjects:
  - kind: ServiceAccount
    name: mongodb-database
    namespace: ${MONGODB_NAMESPACE}
roleRef:
  kind: Role
  name: mongodb-database
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Secret
metadata:
  name: admin-user
  namespace: ${MONGODB_NAMESPACE}
type: Opaque
stringData:
  password: admin123
---
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: mongodb
  namespace: ${MONGODB_NAMESPACE}
spec:
  members: ${MONGODB_MEMBERS}
  type: ReplicaSet
  version: "${MONGODB_VERSION}"
  security:
    authentication:
      modes:
        - SCRAM
    tls:
      enabled: true
      certificateKeySecretRef:
        name: mongodb-cert
      caCertificateSecretRef:
        name: mongodb-ca
  users:
    - name: admin
      db: admin
      passwordSecretRef:
        name: admin-user
      roles:
        - name: root
          db: admin
      scramCredentialsSecretName: my-scram
  replicaSetHorizons:
    - horizon: ${HORIZON_1_HOST}:${HORIZON_1_PORT}
    - horizon: ${HORIZON_2_HOST}:${HORIZON_2_PORT}
    - horizon: ${HORIZON_3_HOST}:${HORIZON_3_PORT}
  additionalMongodConfig:
    storage.wiredTiger.engineConfig.journalCompressor: zlib
  statefulSet:
    spec:
      serviceName: mongodb-svc
      template:
        spec:
          serviceAccountName: mongodb-database
          containers:
            - name: mongod
              resources:
                limits:
                  cpu: "1"
                  memory: 2Gi
                requests:
                  cpu: 500m
                  memory: 1Gi
      volumeClaimTemplates:
        - metadata:
            name: data-volume
          spec:
            storageClassName: ${STORAGE_CLASS}
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: ${STORAGE_SIZE}
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc-0
  namespace: ${MONGODB_NAMESPACE}
spec:
  type: NodePort
  ports:
    - name: mongodb
      port: 27017
      targetPort: 27017
      protocol: TCP
      nodePort: ${HORIZON_1_PORT}
  selector:
    statefulset.kubernetes.io/pod-name: mongodb-0
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc-1
  namespace: ${MONGODB_NAMESPACE}
spec:
  type: NodePort
  ports:
    - name: mongodb
      port: 27017
      targetPort: 27017
      protocol: TCP
      nodePort: ${HORIZON_2_PORT}
  selector:
    statefulset.kubernetes.io/pod-name: mongodb-1
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc-2
  namespace: ${MONGODB_NAMESPACE}
spec:
  type: NodePort
  ports:
    - name: mongodb
      port: 27017
      targetPort: 27017
      protocol: TCP
      nodePort: ${HORIZON_3_PORT}
  selector:
    statefulset.kubernetes.io/pod-name: mongodb-2
EOF

echo "==> Applying MongoDB manifest"
kubectl apply -f mongodb-community.yaml

echo "==> Current resources"
kubectl get pods -n "${MONGODB_OPERATOR_NAMESPACE}" || true
kubectl get pods -n "${MONGODB_NAMESPACE}" || true
kubectl get svc -n "${MONGODB_NAMESPACE}" || true
kubectl get mongodbcommunity -n "${MONGODB_NAMESPACE}" || true
kubectl get certificates -n "${MONGODB_NAMESPACE}" || true

echo "==> Done"
echo "Files created:"
echo "  ${WORKDIR}/mongodb-tls.yaml"
echo "  ${WORKDIR}/mongodb-community.yaml"
