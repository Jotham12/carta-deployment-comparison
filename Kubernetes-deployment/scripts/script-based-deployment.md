# CARTA Controller Deployment on Kubernetes

This document explains how to deploy the CARTA controller on Kubernetes and configure it to launch CARTA backend pods for authenticated users.

The deployment uses:

- Kubernetes for container orchestration
- CephFS for shared persistent storage
- Ceph CSI for connecting CephFS to Kubernetes
- MongoDB for CARTA controller state
- `libnss-extrausers` for user and group mapping
- Kubernetes Secrets and ConfigMaps for configuration
- Kubernetes RBAC for backend pod management
- Kubernetes Service, port forwarding, or SSH tunnelling for controller access

---

## Deployment Overview

The deployment follows these steps:

1. Create the Kubernetes cluster.
2. Connect CephFS to Kubernetes using Ceph CSI.
3. Create the CARTA namespace.
4. Create the CephFS PersistentVolumeClaim.
5. Deploy MongoDB for CARTA controller state.
6. Create the CARTA backend ConfigMap.
7. Create the CARTA controller configuration Secret.
8. Create extra users for UID/GID mapping.
9. Create the `nsswitch.conf` ConfigMap.
10. Deploy the CARTA controller.
11. Set CephFS file permissions.
12. Access the CARTA controller through port forwarding or SSH tunnelling.

---

# 1. Create the Kubernetes Cluster

The Kubernetes cluster is created using `kubeadm`.

The cluster consists of:

- one control-plane node
- one or more worker nodes
- `containerd` as the container runtime
- a pod network plugin such as Calico

---

## 1.1 Setup Control-Plane Node

Run the following commands on the control-plane node:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer

# Run common setup
sudo bash common.sh

# Initialize the Kubernetes control plane
sudo bash master.sh
```

Verify the node:

```bash
kubectl get nodes
```

Expected output:

```text
NAME           STATUS   ROLES           AGE   VERSION
controlplane   Ready    control-plane   ...
```

---

## 1.2 Setup Worker Nodes

Run the following commands on each worker node:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer

# Run common setup on each worker node
sudo bash common.sh
```

After the control-plane node has been initialized, copy the `kubeadm join` command from the control-plane output and run it on each worker node.

Example:

```bash
sudo kubeadm join <master-ip>:6443 --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

Verify all nodes from the control-plane node:

```bash
kubectl get nodes -o wide
```

Expected output:

```text
NAME           STATUS   ROLES           AGE   VERSION
controlplane   Ready    control-plane   ...
worker1        Ready    <none>          ...
worker2        Ready    <none>          ...
```

---

# 2. Connect CephFS to Kubernetes

CARTA backend pods require access to shared image data. This deployment uses CephFS because it supports shared `ReadWriteMany` access.

CephFS is connected to Kubernetes using the Ceph CSI plugin.

Run:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer
sudo bash ceph-csi-plugin.sh
```

Verify that the CephFS CSI pods are running:

```bash
kubectl get pods --all-namespaces | grep ceph
```

Expected output should include pods similar to:

```text
csi-cephfsplugin-xxxxx                         Running
csi-cephfsplugin-provisioner-xxxxxxxxxx-xxxxx  Running
```

---

# 3. Create the CARTA Namespace

Create the namespace first because the PVC and CARTA resources are deployed into the `carta` namespace.

```bash
kubectl create namespace carta
```

Verify:

```bash
kubectl get namespaces
```

Expected output:

```text
NAME    STATUS   AGE
carta   Active   ...
```

---

# 4. Create the CephFS PersistentVolumeClaim

Create the CephFS PVC used by CARTA backend pods.

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cephfs-images-pvc
  namespace: carta
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: cephfs
  resources:
    requests:
      storage: 1Gi
EOF
```

Verify:

```bash
kubectl get pvc -n carta
```

Expected output:

```text
NAME                STATUS   ACCESS MODES   STORAGECLASS
cephfs-images-pvc   Bound    RWX            cephfs
```

---

# 5. Deploy MongoDB for CARTA Controller State

MongoDB is used by the CARTA controller to store controller state and session-related data.

---

## 5.1 Install Helm

```bash
sudo snap install helm --classic
```

---

## 5.2 Deploy MongoDB Community Operator

Create the namespaces:

```bash
kubectl create ns mongodb-operator
kubectl create ns mongodb
```

Add the MongoDB Helm repository:

```bash
helm repo add mongodb https://mongodb.github.io/helm-charts
helm repo update
```

Install the MongoDB Community Operator:

```bash
helm install community-operator mongodb/community-operator \
  --namespace mongodb-operator \
  --set operator.watchNamespace="*"
```

Verify:

```bash
kubectl get pods -n mongodb-operator
```

---

## 5.3 Create MongoDB Community Resource

Create a file called:

```bash
nano mongodb-community.yaml
```

Paste the following content:

```yaml
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
  members: 1
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
      volumeClaimTemplates:
        - metadata:
            name: data-volume
          spec:
            storageClassName: cephfs
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 5Gi
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
```

Apply the file:

```bash
kubectl apply -f mongodb-community.yaml
```

Verify MongoDB:

```bash
kubectl get pods -n mongodb
kubectl get svc -n mongodb
kubectl get pvc -n mongodb
```

Expected output:

```text
mongodb-0   Running
```

---

# 6. Create the CARTA Backend ConfigMap

Create a file called:

```bash
nano carta-backend-config.yaml
```

Paste the following content:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: carta-backend-config
  namespace: carta
data:
  enable_scripting: "false"
  exit_timeout: "0"
  idle_timeout: "14400"
  initial_timeout: "30"
  omp_threads: "8"
```

Apply the ConfigMap:

```bash
kubectl apply -f carta-backend-config.yaml
```

Verify:

```bash
kubectl get configmap carta-backend-config -n carta
```

---

# 7. Create the CARTA Controller Config Secret

The CARTA controller configuration is stored in `config.json`.

Create the file:

```bash
nano config.json
```

Paste the following content:

```json
{
  "$schema": "https://cartavis.org/schemas/controller_config_schema_2.json",
  "controllerConfigVersion": "2.0",
  "authProviders": {
    "pam": {
      "publicKeyLocation": "/carta-host-keys/carta_public.pem",
      "privateKeyLocation": "/carta-host-keys/carta_private.pem",
      "issuer": "carta.example.com"
    }
  },
  "database": {
    "uri": "mongodb://admin:admin123@mongodb-svc-0.mongodb.svc.cluster.local:27017/CARTA?authSource=admin&replicaSet=mongodb",
    "databaseName": "CARTA"
  },
  "serverPort": 8000,
  "serverInterface": "0.0.0.0",
  "processCommand": "/usr/bin/carta_backend",
  "killCommand": "/usr/bin/carta-kill-script",
  "rootFolderTemplate": "/home/{username}",
  "baseFolderTemplate": "/home/{username}",
  "logFile": "/var/log/carta/controller.log",
  "dashboard": {
    "bannerColor": "#d2dce5",
    "backgroundColor": "#f6f8fa",
    "bannerImage": "/usr/lib/node_modules/carta-controller/public/images/carta_logo.svg",
    "infoText": "Welcome to the CARTA server.",
    "loginText": "<span>Please enter your login credentials:</span>",
    "footerText": "<span>If you have any problems, comments or suggestions, please <a href='mailto:admin@carta.example.com'>contact us.</a></span>"
  }
}
```

Create the Kubernetes Secret:

```bash
kubectl create secret generic carta-config \
  -n carta \
  --from-file=config.json
```

Verify:

```bash
kubectl get secret carta-config -n carta
```

If you edit `config.json` later, recreate the Secret:

```bash
kubectl delete secret carta-config -n carta

kubectl create secret generic carta-config \
  -n carta \
  --from-file=config.json
```

---

# 8. Create Extra Users

The `extrausers` files are used by `libnss-extrausers` to provide user and group mappings inside the CARTA controller and backend containers.

Create the directory:

```bash
mkdir -p ~/extrausers
cd ~/extrausers
```

---

## 8.1 Create `passwd`

```bash
cat > passwd <<'EOF'
sanele:x:1001:1001:Sanele Dlamini:/home/sanele:/bin/bash
jotham:x:1002:1002:Jotham User:/home/jotham:/bin/bash
sans:x:1003:1003:Sans User:/home/sans:/bin/bash
EOF
```

---

## 8.2 Create `group`

```bash
cat > group <<'EOF'
sanele:x:1001:
jotham:x:1002:
sans:x:1003:
EOF
```

---

## 8.3 Generate Password Hashes

Generate a password hash for each user:

```bash
openssl passwd -6
```

Copy the generated hashes and replace the placeholders in the `shadow` file.

---

## 8.4 Create `shadow`

```bash
cat > shadow <<'EOF'
sanele:$6$HASH_SANELE:19300:0:99999:7:::
jotham:$6$HASH_JOTHAM:19300:0:99999:7:::
sans:$6$HASH_SANS:19300:0:99999:7:::
EOF
```

Replace the following placeholders with the generated password hashes:

```text
HASH_SANELE
HASH_JOTHAM
HASH_SANS
```

---

## 8.5 Create the Extra Users Secret

```bash
kubectl -n carta create secret generic carta-extrausers \
  --from-file=passwd \
  --from-file=group \
  --from-file=shadow \
  --dry-run=client -o yaml | kubectl apply -f -
```

Verify:

```bash
kubectl -n carta get secret carta-extrausers
```

---

# 9. Create the `nsswitch.conf` ConfigMap

The `nsswitch.conf` file tells the operating system inside the container to use `extrausers` as a source for user and group lookup.

Create the file:

```bash
nano nsswitch.conf
```

Paste the following content:

```text
passwd: files extrausers
group: files extrausers
shadow: files extrausers
gshadow: files

hosts: files dns
networks: files

protocols: db files
services: db files
ethers: db files
rpc: db files

netgroup: nis
```

Create the ConfigMap:

```bash
kubectl create configmap nsswitch-conf \
  -n carta \
  --from-file=nsswitch.conf
```

Verify:

```bash
kubectl get configmap nsswitch-conf -n carta
```

---

# 10. Deploy the CARTA Controller

Create a file called:

```bash
nano carta-controller.yaml
```

Paste the following content:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: carta-controller-role
  namespace: carta
rules:
  - apiGroups:
      - ""
    resources:
      - pods
    verbs:
      - get
      - list
      - create
      - delete
  - apiGroups:
      - ""
    resources:
      - pods/log
    verbs:
      - get
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: carta-controller-sa
  namespace: carta
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: carta-controller-role-binding
  namespace: carta
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: carta-controller-role
subjects:
  - kind: ServiceAccount
    name: carta-controller-sa
    namespace: carta
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: carta-controller
  namespace: carta
  labels:
    app: carta-controller
spec:
  replicas: 1
  selector:
    matchLabels:
      app: carta-controller
  template:
    metadata:
      labels:
        app: carta-controller
    spec:
      serviceAccountName: carta-controller-sa
      containers:
        - name: carta-controller
          image: sjotham/carta-controller:k8s-test
          imagePullPolicy: Always
          env:
            - name: K8S_NAMESPACE
              value: "carta"
            - name: K8S_IMAGES_PVC
              value: "cephfs-images-pvc"
            - name: CARTA_CONFIG
              value: "/etc/carta/config.json"
            - name: K8S_BACKEND_IMG
              value: "quay.io/aikema/carta_k8s_backend"
          ports:
            - containerPort: 8000
          securityContext:
            privileged: true
          volumeMounts:
            - mountPath: /etc/carta
              name: carta-config
            - mountPath: /var/lib/extrausers
              name: nss-extrausers
            - name: carta-host-keys
              mountPath: /carta-host-keys
            - name: nsswitch
              mountPath: /etc/nsswitch.conf
              subPath: nsswitch.conf
      volumes:
        - name: nsswitch
          configMap:
            name: nsswitch-conf
            items:
              - key: nsswitch.conf
                path: nsswitch.conf
        - name: carta-config
          secret:
            secretName: carta-config
        - name: carta-host-keys
          hostPath:
            path: /etc/carta
            type: Directory
        - name: nss-extrausers
          secret:
            secretName: carta-extrausers
            defaultMode: 0644
---
apiVersion: v1
kind: Service
metadata:
  name: controller-service
  namespace: carta
spec:
  selector:
    app: carta-controller
  ports:
    - protocol: TCP
      port: 8000
      targetPort: 8000
```

Apply the manifest:

```bash
kubectl apply -f carta-controller.yaml
```

Verify:

```bash
kubectl get pods -n carta
kubectl get deployment -n carta
kubectl get svc -n carta
```

Check the controller logs:

```bash
kubectl logs -n carta deployment/carta-controller
```

---

# 11. Set CephFS File Permissions

Create user directories on the CephFS mount.

Example:

```bash
cd /mnt/mycephfs
mkdir -p sanele jotham sans
```

Set ownership and permissions:

```bash
# User: sanele
sudo chown -R 1001:1001 sanele
sudo chmod 700 sanele

# User: jotham
sudo chown -R 1002:1002 jotham
sudo chmod 700 jotham

# User: sans
sudo chown -R 1003:1003 sans
sudo chmod 700 sans
```

Verify:

```bash
ls -ld sanele jotham sans
```

Expected output:

```text
drwx------ 2 1001 1001 ... sanele
drwx------ 2 1002 1002 ... jotham
drwx------ 2 1003 1003 ... sans
```

---

# 12. Access the CARTA Controller

For testing, use port forwarding:

```bash
kubectl port-forward -n carta svc/controller-service 8000:8000
```

Open:

```text
http://localhost:8000
```

If accessing the controller from your local machine through the VM, use an SSH tunnel.

Example:

```bash
ssh -L 8000:10.152.183.203:8000 ubuntu@154.114.10.78
```

Then open this on your local machine:

```text
http://localhost:8000
```

---

# 13. Verify Backend Pod Creation

After logging in to CARTA, check whether a backend pod is created:

```bash
kubectl get pods -n carta
```

Expected output:

```text
carta-backend-<username>   Running
```

Check backend logs:

```bash
kubectl logs -n carta <backend-pod-name>
```

---

# 14. Troubleshooting

Check all CARTA resources:

```bash
kubectl get all -n carta
```

Check MongoDB:

```bash
kubectl get pods -n mongodb
kubectl get svc -n mongodb
kubectl get pvc -n mongodb
```

Check CephFS PVC:

```bash
kubectl get pvc -n carta
```

Describe a failing pod:

```bash
kubectl describe pod -n carta <pod-name>
```

Check recent events:

```bash
kubectl get events -n carta --sort-by=.metadata.creationTimestamp
```

Check controller logs:

```bash
kubectl logs -n carta deployment/carta-controller
```

Check backend logs:

```bash
kubectl logs -n carta <backend-pod-name>
```

---

# Expected Final State

After completing the deployment:

- Kubernetes nodes are ready.
- CephFS is connected to Kubernetes using Ceph CSI.
- The CephFS PVC is bound.
- MongoDB is running for CARTA controller state.
- The CARTA controller is running in the `carta` namespace.
- The controller service is available on port `8000`.
- Users can authenticate through the controller.
- The controller can dynamically create CARTA backend pods.
- Backend pods can access shared CephFS storage.
- User directories are isolated using UID/GID ownership and permissions.

---

# Notes

