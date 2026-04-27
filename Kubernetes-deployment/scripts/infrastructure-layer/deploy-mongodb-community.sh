#!/usr/bin/env bash

set -euo pipefail

echo "Creating MongoDB namespaces..."

kubectl create namespace mongodb-operator --dry-run=client -o yaml | kubectl apply -f -
kubectl create namespace mongodb --dry-run=client -o yaml | kubectl apply -f -

echo "Adding MongoDB Helm repository..."

helm repo add mongodb https://mongodb.github.io/helm-charts || true
helm repo update

echo "Installing MongoDB Community Operator..."

helm upgrade --install community-operator mongodb/community-operator \
  --namespace mongodb-operator \
  --set operator.watchNamespace="*"

echo "Waiting for MongoDB Community Operator to be ready..."

kubectl rollout status deployment/community-operator \
  -n mongodb-operator \
  --timeout=180s

echo "Creating MongoDB RBAC, Secret, MongoDBCommunity resource, and NodePort services..."

cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: mongodb-database
  namespace: mongodb
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: mongodb-database
  namespace: mongodb
rules:
  - apiGroups:
      - ""
    resources:
      - secrets
    verbs:
      - get
  - apiGroups:
      - ""
    resources:
      - pods
    verbs:
      - patch
      - delete
      - get
---
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: mongodb-database
  namespace: mongodb
subjects:
  - kind: ServiceAccount
    name: mongodb-database
    namespace: mongodb
roleRef:
  kind: Role
  name: mongodb-database
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: v1
kind: Secret
metadata:
  name: admin-user
  namespace: mongodb
type: Opaque
stringData:
  password: admin123
---
apiVersion: mongodbcommunity.mongodb.com/v1
kind: MongoDBCommunity
metadata:
  name: mongodb
  namespace: mongodb
spec:
  members: 3
  type: ReplicaSet
  version: "6.0.4"
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
    - horizon: db-node-1.example.com:30017
    - horizon: db-node-2.example.com:30018
    - horizon: db-node-3.example.com:30019
  security:
    authentication:
      modes:
        - SCRAM
  additionalMongodConfig:
    storage.wiredTiger.engineConfig.journalCompressor: zlib
  statefulSet:
    spec:
      template:
        spec:
          containers:
            - name: mongod
              resources:
                limits:
                  cpu: "1"
                  memory: 2Gi
                requests:
                  cpu: 500m
                  memory: 1Gi
          affinity:
            podAntiAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                - labelSelector:
                    matchExpressions:
                      - key: app
                        operator: In
                        values:
                          - mongodb
                  topologyKey: "kubernetes.io/hostname"
      volumeClaimTemplates:
        - metadata:
            name: data-volume
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 5G
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc-0
  namespace: mongodb
spec:
  type: NodePort
  ports:
    - name: mongodb
      port: 27017
      targetPort: 27017
      protocol: TCP
      nodePort: 30017
  selector:
    app: mongodb-svc
    statefulset.kubernetes.io/pod-name: mongodb-0
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc-1
  namespace: mongodb
spec:
  type: NodePort
  ports:
    - name: mongodb
      port: 27017
      targetPort: 27017
      protocol: TCP
      nodePort: 30018
  selector:
    app: mongodb-svc
    statefulset.kubernetes.io/pod-name: mongodb-1
---
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc-2
  namespace: mongodb
spec:
  type: NodePort
  ports:
    - name: mongodb
      port: 27017
      targetPort: 27017
      protocol: TCP
      nodePort: 30019
  selector:
    app: mongodb-svc
    statefulset.kubernetes.io/pod-name: mongodb-2
EOF

echo "Waiting for MongoDB pods to be created..."

sleep 10

echo "MongoDB pods:"
kubectl get pods -n mongodb

echo "MongoDB services:"
kubectl get svc -n mongodb

echo "MongoDB PVCs:"
kubectl get pvc -n mongodb

echo "Done."
echo
echo "To keep watching MongoDB status, run:"
echo "kubectl get pods -n mongodb -w"
