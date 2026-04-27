# CARTA Controller Deployment on Kubernetes

This document outlines the steps required to deploy the CARTA controller on Kubernetes. The setup follows the same structure as the CARTA Kubernetes controller deployment guide, but is adapted for a deployment that uses CephFS as shared storage and `libnss-extrausers` for user and group mapping. :contentReference[oaicite:0]{index=0}

The deployment allows the CARTA controller to run inside Kubernetes and dynamically create CARTA backend pods for users.

This setup uses:

- Kubernetes for container orchestration
- CephFS for shared persistent storage
- Ceph CSI for connecting CephFS to Kubernetes
- `libnss-extrausers` for UID and GID mapping
- Kubernetes Secrets and ConfigMaps for configuration
- Kubernetes RBAC for backend pod management
- A Kubernetes Service and optional Ingress for access to the controller

---

Prerequisites
===

Before deploying CARTA on Kubernetes, make sure the following components are available.

* A working Kubernetes cluster.

  This can be created using `kubeadm`, Minikube, Kind, MicroK8s, or any other Kubernetes distribution.

  For a kubeadm-based setup, the following scripts can be used as a reference:
 The control-plane node can be prepared using:

  [master-node.sh](https://github.com/Jotham12/carta-deployment-comparison/blob/main/Kubernetes-deployment/scripts/infrastructure-layer/master-node.sh)

  Worker nodes can be prepared using:

  [worker-node.sh](https://github.com/Jotham12/carta-deployment-comparison/blob/main/Kubernetes-deployment/scripts/infrastructure-layer/worker-node.sh)

  MongoDB To Stores CARTA controller state/session-related data

  ```bash
  https://github.com/Jotham12/carta-deployment-comparison/blob/main/Kubernetes-deployment/scripts/infrastructure-layer/deploy-mongodb-community.sh
  ```
* An ingress controller.

  An ingress controller is required if the CARTA controller will be accessed externally through a domain name or reverse proxy.

  NGINX Ingress can be installed using:

  ```bash
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.1/deploy/static/provider/cloud/deploy.yaml
  ```

* CephFS shared storage.

  CARTA backend pods need shared storage that supports multiple pod attachments. CephFS is used because it supports `ReadWriteMany` access.

  The following Ceph information is required:

  - Ceph cluster FSID
  - Ceph monitor addresses
  - CephFS filesystem name
  - Ceph client user
  - Ceph client key
  - CephFS data pool name

* Ceph CSI.

  Ceph CSI is used to allow Kubernetes to dynamically provision and mount CephFS volumes.

  Reference:

  ```text
  https://github.com/ceph/ceph-csi/blob/devel/docs/cephfs/deploy.md
  ```

* User and group mapping support.

  The `libnss-extrausers` library is used to inject additional users and groups into the CARTA controller container.

  Reference:

  ```text
  https://github.com/deepin-community/libnss-extrausers
  ```

---

Deployment Overview
===

The deployment consists of the following Kubernetes resources:

| Resource | Purpose |
|---|---|
| `carta` namespace | Isolates CARTA resources |
| `carta-backend-config` ConfigMap | Stores backend runtime configuration |
| `nsswitch-conf` ConfigMap | Allows containers to read extra users |
| `carta-config` Secret | Stores the CARTA controller configuration |
| `carta-extrausers` Secret | Stores extra user and group files |
| `cephfs-secret` Secret | Stores Ceph client credentials |
| `cephfs` StorageClass | Defines CephFS dynamic provisioning |
| `cephfs-images-pvc` PVC | Provides shared image storage |
| `carta-controller-sa` ServiceAccount | Used by the CARTA controller |
| `carta-controller-role` Role | Gives pod management permissions |
| `carta-controller-role-binding` RoleBinding | Connects the Role to the ServiceAccount |
| `carta-controller` Deployment | Runs the CARTA controller |
| `controller-service` Service | Exposes the controller inside the cluster |
| Optional Ingress | Exposes the controller outside the cluster |

---

Create the CARTA Namespace
===

Create a dedicated namespace for CARTA:

```bash
kubectl create namespace carta
```

All CARTA resources in this setup will be deployed into the `carta` namespace.

---

Install Ceph CSI for CephFS
===

Clone the Ceph CSI repository:

```bash
git clone https://github.com/ceph/ceph-csi.git
cd ceph-csi/deploy/cephfs/kubernetes
```

Apply the CephFS CSI manifests:

```bash
kubectl create -f csidriver.yaml
kubectl create -f csi-provisioner-rbac.yaml
kubectl create -f csi-nodeplugin-rbac.yaml
kubectl create -f csi-config-map.yaml
kubectl create -f ../../ceph-conf.yaml
kubectl create -f csi-cephfsplugin-provisioner.yaml
kubectl create -f csi-cephfsplugin.yaml
```

---

Configure Ceph CSI
===

Ceph CSI needs to know how to connect to the Ceph cluster. This is done using the `ceph-csi-config` ConfigMap.

Create or update a file called:

```bash
csi-config-map.yaml
```

Example configuration:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ceph-csi-config
data:
  config.json: |-
    [
      {
        "clusterID": "YOUR-CEPH-FSID",
        "monitors": [
          "10.102.36.3:6789",
          "10.102.36.5:6789",
          "10.102.36.7:6789"
        ]
      }
    ]
```

Replace `YOUR-CEPH-FSID` with the output of:

```bash
ceph fsid
```

Apply the ConfigMap:

```bash
kubectl apply -f csi-config-map.yaml
```

---

Create the CephFS Secret
===

The CephFS Secret stores the Ceph client user and key used by Kubernetes to mount CephFS volumes.

Create a file called:

```bash
cephfs-secret.yaml
```

Add the following content:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cephfs-secret
  namespace: carta
stringData:
  userID: allvms
  userKey: YOUR-CEPH-CLIENT-KEY
```

Replace `YOUR-CEPH-CLIENT-KEY` with the Ceph client key.

Apply the Secret:

```bash
kubectl apply -f cephfs-secret.yaml
```

---

Create the CephFS StorageClass
===

The StorageClass tells Kubernetes how to dynamically create CephFS volumes.

Create a file called:

```bash
cephfs-storageclass.yaml
```

Add the following content:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cephfs
provisioner: cephfs.csi.ceph.com
parameters:
  clusterID: YOUR-CEPH-FSID
  fsName: cephfs
  pool: cephfs_data
  csi.storage.k8s.io/provisioner-secret-name: cephfs-secret
  csi.storage.k8s.io/provisioner-secret-namespace: carta
  csi.storage.k8s.io/controller-expand-secret-name: cephfs-secret
  csi.storage.k8s.io/controller-expand-secret-namespace: carta
  csi.storage.k8s.io/node-stage-secret-name: cephfs-secret
  csi.storage.k8s.io/node-stage-secret-namespace: carta
reclaimPolicy: Retain
allowVolumeExpansion: true
mountOptions:
  - debug
```

Replace the following values:

| Value | Description |
|---|---|
| `YOUR-CEPH-FSID` | Your Ceph cluster FSID |
| `cephfs` | Your CephFS filesystem name |
| `cephfs_data` | Your CephFS data pool |

Apply the StorageClass:

```bash
kubectl apply -f cephfs-storageclass.yaml
```

---

Create the CARTA Images PersistentVolumeClaim
===

The CARTA controller requires a PersistentVolumeClaim for image data. This PVC is mounted by CARTA backend pods and must support multiple attachments.

Create a file called:

```bash
cephfs-images-pvc.yaml
```

Add the following content:

```yaml
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
      storage: 10Gi
```

Apply the PVC:

```bash
kubectl apply -f cephfs-images-pvc.yaml
```

---

ConfigMaps, PersistentVolumeClaims, and Secrets
===

This section defines the configuration objects required by the CARTA controller and backend pods.

---

Backend ConfigMap
---

A backend configuration file is dynamically generated from the `carta-backend-config` ConfigMap. This allows backend settings such as scripting, timeout values, and OpenMP threads to be configured through Kubernetes.

Create a file called:

```bash
carta-backend-config.yaml
```

Add the following content:

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

---

Controller Config
---

The controller configuration is stored as a Kubernetes Secret named `carta-config`. This Secret contains the CARTA controller configuration directory.

Create a local configuration directory:

```bash
mkdir -p carta-config
```

Create a controller configuration file:

```bash
nano carta-config/config.json
```

Example minimal configuration:

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
        "uri": "mongodb://admin:admin123@mongodb-svc.mongodb.svc.cluster.local:27017/CARTA?authSource=admin&replicaSet=mongodb",
        "databaseName": "CARTA"
    },
    "serverPort": 8000,
    "serverInterface": "0.0.0.0",
    "processCommand": "/usr/bin/carta_backend",
    "killCommand": "/usr/bin/carta-kill-script",
    "rootFolderTemplate": "/images",
    "baseFolderTemplate": "/images",
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
  --from-file=carta-config \
  -n carta
```

If the configuration changes later, delete and recreate the Secret:

```bash
kubectl delete secret carta-config -n carta
kubectl create secret generic carta-config \
  --from-file=carta-config \
  -n carta
```

---

Extra Users
---

The `libnss-extrausers` library is used to provide additional users and groups inside the CARTA controller container. The controller can then use these user and group IDs when launching backend pods.

Create a local directory:

```bash
mkdir -p extrausers
```

The directory should contain:

```bash
extrausers/
├── passwd
├── group
└── shadow
```


Create the Kubernetes Secret:

```bash
kubectl create secret generic carta-extrausers \
  --from-file=extrausers \
  -n carta
```

---

nsswitch ConfigMap
---

The container must be configured to read users and groups from `/var/lib/extrausers`. This is done by mounting a custom `nsswitch.conf`.

Create a file called:

```bash
nsswitch-conf.yaml
```

Add the following content:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nsswitch-conf
  namespace: carta
data:
  nsswitch.conf: |
    passwd:         files extrausers
    group:          files extrausers
    shadow:         files extrausers
    gshadow:        files

    hosts:          files dns
    networks:       files

    protocols:      db files
    services:       db files
    ethers:         db files
    rpc:            db files

    netgroup:       nis
```

Apply the ConfigMap:

```bash
kubectl apply -f nsswitch-conf.yaml
```

---

Service Account Creation and Configuration
===

The CARTA controller needs permission to create, list, get, and delete CARTA backend pods. It also needs permission to read pod logs.

This is done using a Kubernetes ServiceAccount, Role, and RoleBinding.

Create a file called:

```bash
carta-controller-rbac.yaml
```

Add the following content:

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
```

Apply the RBAC configuration:

```bash
kubectl apply -f carta-controller-rbac.yaml
```

---

Deploy the CARTA Controller
===

Create a file called:

```bash
carta-controller-deployment.yaml
```

Add the following content:

```yaml
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
          command:
            - /bin/sh
            - -c
          args:
            - sed -i 's/"--starting_folder", "${username}", //; s/"--starting_folder", username, //' /opt/carta-controller/dist/podHandlers.js && exec /usr/bin/carta-controller
          env:
            - name: K8S_NAMESPACE
              value: "carta"
            - name: K8S_IMAGES_PVC
              value: "cephfs-images-pvc"
            - name: CARTA_CONFIG
              value: /etc/carta/config.json
            - name: K8S_BACKEND_IMG
              value: "quay.io/aikema/carta_k8s_backend"
          ports:
            - containerPort: 8000
          securityContext:
            privileged: true
          volumeMounts:
            - name: carta-config
              mountPath: /etc/carta
            - name: nss-extrausers
              mountPath: /var/lib/extrausers
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
```

Apply the deployment:

```bash
kubectl apply -f carta-controller-deployment.yaml
```

---

Making the Service Accessible
===

A Kubernetes Service is used to expose the CARTA controller inside the cluster. An Ingress can then be used to expose the service externally.

---

Service
---

Create a file called:

```bash
controller-service.yaml
```

Add the following content:

```yaml
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

Apply the Service:

```bash
kubectl apply -f controller-service.yaml
```

---

Testing with Port Forwarding
---

Before configuring ingress, test the controller using port forwarding:

```bash
kubectl port-forward -n carta svc/controller-service 8000:8000
```

Open the following URL in a browser:

```text
http://localhost:8000
```

Or test using `curl`:

```bash
curl http://localhost:8000
```

---

Ingress
---

If NGINX Ingress is being used, create a file called:

```bash
carta-controller-ingress.yaml
```

Add the following content:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: carta-controller-ingress
  namespace: carta
spec:
  ingressClassName: nginx
  rules:
    - host: carta.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: controller-service
                port:
                  number: 8000
```

Replace `carta.example.com` with the actual domain name.

Apply the Ingress:

```bash
kubectl apply -f carta-controller-ingress.yaml
```

---

Expected Result
===

After completing the deployment, the CARTA controller should be running in the `carta` namespace. Users can access the controller through the configured service, port-forwarding, or ingress.

When a user starts a CARTA session, the controller should dynamically create a CARTA backend pod in Kubernetes. The backend pod uses the configured CephFS PersistentVolumeClaim for shared image data and uses the extra user files for UID and GID mapping.

---

Clean Up
===

To remove the CARTA controller deployment, run:

```bash
kubectl delete -f carta-controller-ingress.yaml
kubectl delete -f controller-service.yaml
kubectl delete -f carta-controller-deployment.yaml
kubectl delete -f carta-controller-rbac.yaml
kubectl delete -f carta-backend-config.yaml
kubectl delete -f nsswitch-conf.yaml
kubectl delete pvc cephfs-images-pvc -n carta
kubectl delete secret carta-config -n carta
kubectl delete secret carta-extrausers -n carta
kubectl delete secret cephfs-secret -n carta
```

To delete the namespace:

```bash
kubectl delete namespace carta
```

Only delete the namespace if no important CARTA resources are still required.

---

Summary
===

This setup deploys the CARTA controller on Kubernetes and allows it to dynamically launch CARTA backend pods. CephFS is used as shared persistent storage through Ceph CSI, while `libnss-extrausers` is used to provide user and group mappings inside the controller and backend containers.

The main Kubernetes resources used in this deployment are:

- `carta` namespace
- `carta-backend-config` ConfigMap
- `nsswitch-conf` ConfigMap
- `carta-config` Secret
- `carta-extrausers` Secret
- `cephfs-secret` Secret
- `cephfs` StorageClass
- `cephfs-images-pvc` PersistentVolumeClaim
- `carta-controller-sa` ServiceAccount
- `carta-controller-role` Role
- `carta-controller-role-binding` RoleBinding
- `carta-controller` Deployment
- `controller-service` Service
- Optional Ingress for external access
