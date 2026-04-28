# CARTA Controller Deployment on Kubernetes

This folder contains the Kubernetes deployment of the CARTA controller.

The deployment allows the CARTA controller to run inside Kubernetes and dynamically create CARTA backend pods for authenticated users. CephFS is used as shared storage, MongoDB is used for CARTA controller state, and `libnss-extrausers` is used for user and group mapping.

This README contains both the overview and the setup steps.

---

## Deployment Components

This deployment uses:

- Kubernetes for container orchestration
- `kubeadm` for Kubernetes cluster setup
- CephFS for shared persistent storage
- Ceph CSI for connecting CephFS to Kubernetes
- MongoDB for CARTA controller state
- `libnss-extrausers` for UID and GID mapping
- Kubernetes Secrets and ConfigMaps for configuration
- Kubernetes RBAC for backend pod management
- Kubernetes Service and optional Ingress for controller access

---

## Setup Structure

The setup is divided into two parts:

1. **Script-based infrastructure setup**
2. **CARTA controller deployment setup**

The script-based infrastructure setup prepares the Kubernetes cluster, storage layer, and MongoDB.

The CARTA controller deployment setup deploys the CARTA application resources after the infrastructure is ready.

---

# 1. Script-Based Infrastructure Setup

This part prepares the Kubernetes and storage infrastructure before the CARTA controller is deployed.

The scripts in the infrastructure layer automate the setup of a Kubernetes cluster using `kubeadm` with `containerd` as the container runtime.

---

## Infrastructure Files

### `common.sh`

[`common.sh`](./scripts/infrastructure-layer/common.sh)

Common setup script for all nodes, including the control-plane and worker nodes.

This script:

- disables swap
- configures kernel modules such as `overlay` and `br_netfilter`
- sets Kubernetes networking parameters
- installs the `containerd` runtime
- installs and configures `crictl`
- installs `kubelet`, `kubeadm`, and `kubectl`

### `master.sh`

[`master.sh`](./scripts/infrastructure-layer/master.sh)

Control-plane setup script.

This script:

- pulls the required Kubernetes images
- initializes the Kubernetes control plane using `kubeadm`
- configures `kubeconfig`
- installs the Calico network plugin

### `ceph-csi-plugin.sh`

[`ceph-csi-plugin.sh`](./scripts/infrastructure-layer/ceph-csi-plugin.sh)

Deploys the CephFS CSI plugin so Kubernetes can mount CephFS volumes.

### `cephfs-storageclass.yaml`

[`cephfs-storageclass.yaml`](./scripts/infrastructure-layer/cephfs-storageclass.yaml)

Defines the CephFS StorageClass.

### `cephfs-pvc.yaml`

[`cephfs-pvc.yaml`](./scripts/infrastructure-layer/cephfs-pvc.yaml)

Creates the CephFS PersistentVolumeClaim used by CARTA backend pods.

### `deploy-mongodb-community.sh`

[`deploy-mongodb-community.sh`](./scripts/infrastructure-layer/deploy-mongodb-community.sh)

Deploys MongoDB using the MongoDB Community Operator. MongoDB is used by the CARTA controller to store controller state.

---

## i. Setup Control-Plane Node

Run this on the control-plane node.

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer

# Run common setup
sudo bash common.sh

# Initialize the Kubernetes control plane
sudo bash master.sh
```

After the control plane is initialized, verify that the node is available:

```bash
kubectl get nodes
```

Expected result:

```text
NAME           STATUS   ROLES           AGE   VERSION
controlplane   Ready    control-plane   ...
```

---

## ii. Setup Worker Nodes

Run this on each worker node.

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

Verify the nodes from the control-plane node:

```bash
kubectl get nodes -o wide
```

Expected result:

```text
NAME           STATUS   ROLES           AGE   VERSION
controlplane   Ready    control-plane   ...
worker1        Ready    <none>          ...
worker2        Ready    <none>          ...
```

---

## iii. Create the CARTA Namespace

Create a namespace for CARTA resources:

```bash
kubectl create namespace carta
```

Verify:

```bash
kubectl get namespaces
```

Expected result:

```text
NAME    STATUS   AGE
carta   Active   ...
```

---

## iv. Deploy the CephFS CSI Plugin

Deploy the CephFS CSI plugin so that Kubernetes can mount CephFS volumes.

Script:

[`ceph-csi-plugin.sh`](./scripts/infrastructure-layer/ceph-csi-plugin.sh)

Run:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer
sudo bash ceph-csi-plugin.sh
```

Verify that the CephFS CSI pods are running:

```bash
kubectl get pods --all-namespaces | grep ceph
```

Expected result should include pods such as:

```text
csi-cephfsplugin-xxxxx                         Running
csi-cephfsplugin-provisioner-xxxxxxxxxx-xxxxx  Running
```

---

## v. Create the CephFS StorageClass

Apply the CephFS StorageClass.

Manifest:

[`cephfs-storageclass.yaml`](./scripts/infrastructure-layer/cephfs-storageclass.yaml)

Run:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer
kubectl apply -f cephfs-storageclass.yaml
```

Verify:

```bash
kubectl get storageclass
```

Expected result:

```text
NAME     PROVISIONER
cephfs   cephfs.csi.ceph.com
```

---

## vi. Create the CephFS PersistentVolumeClaim

Apply the CephFS PVC.

Manifest:

[`cephfs-pvc.yaml`](./scripts/infrastructure-layer/cephfs-pvc.yaml)

Run:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer
kubectl apply -f cephfs-pvc.yaml
```

Verify:

```bash
kubectl get pvc -n carta
```

Expected result:

```text
NAME                STATUS   ACCESS MODES   STORAGECLASS
cephfs-images-pvc   Bound    RWX            cephfs
```

---

## vii. Deploy MongoDB for CARTA Controller State

MongoDB is used by the CARTA controller to store controller state.

Script:

[`deploy-mongodb-community.sh`](./scripts/infrastructure-layer/deploy-mongodb-community.sh)

Run:

```bash
cd Kubernetes-deployment/scripts/infrastructure-layer
chmod +x deploy-mongodb-community.sh
./deploy-mongodb-community.sh
```

The script deploys:

- `mongodb-operator` namespace
- `mongodb` namespace
- MongoDB Community Operator
- MongoDB service account
- MongoDB RBAC resources
- MongoDB admin Secret
- MongoDB replica set
- NodePort services for MongoDB replica set members

Verify the MongoDB operator:

```bash
kubectl get pods -n mongodb-operator
```

Verify MongoDB:

```bash
kubectl get pods -n mongodb
kubectl get svc -n mongodb
kubectl get pvc -n mongodb
```

Expected result:

```text
mongodb-0   Running
mongodb-1   Running
mongodb-2   Running
```

---

# 2. CARTA Controller Deployment Setup

This part deploys the CARTA controller and the Kubernetes resources required by the controller.

It includes:

- creating the backend ConfigMap
- creating the CARTA controller configuration Secret
- creating the extra users Secret
- creating the `nsswitch.conf` ConfigMap
- configuring RBAC for backend pod management
- deploying the CARTA controller
- exposing the controller through a Service or Ingress

---

## CARTA Controller Files

### `carta-backend-config.yaml`

[`carta-backend-config.yaml`](./scripts/Application-layer/carta-backend-config.yaml)

Stores CARTA backend runtime configuration.

### `config.json`

[`config.json`](./scripts/Application-layer/config.json)

Stores CARTA controller configuration.

### `nsswitch.conf`

[`nsswitch.conf`](./scripts/Application-layer/nsswitch.conf)

Configures user and group lookup inside the controller container.

### `carta-controller.yaml`

[`carta-controller.yaml`](./scripts/Application-layer/carta-controller.yaml)

Deploys the CARTA controller and related Kubernetes resources.

### `carta-controller-service.yaml`

[`carta-controller-service.yaml`](./scripts/carta-controller-service.yaml)

Exposes the CARTA controller inside the Kubernetes cluster.

### `extrausers`

[`extrausers`](./scripts/Operational-layer/extrausers)

Contains user and group files used by `libnss-extrausers`.

### `deploy-ingress.sh`

[`deploy-ingress.sh`](./scripts/Operational-layer/deploy-ingress.sh)

Deploys ingress resources for external access.

---

## i. Create the Backend ConfigMap

Apply the backend ConfigMap:

```bash
cd Kubernetes-deployment/scripts/Application-layer
kubectl apply -f carta-backend-config.yaml
```

Verify:

```bash
kubectl get configmap carta-backend-config -n carta
```

---

## ii. Create the CARTA Controller Config Secret

The CARTA controller configuration is stored in `config.json`.

Create the Secret:

```bash
cd Kubernetes-deployment/scripts/Application-layer

kubectl create secret generic carta-config \
  -n carta \
  --from-file=config.json
```

Verify:

```bash
kubectl get secret carta-config -n carta
```

If the configuration changes later, recreate the Secret:

```bash
kubectl delete secret carta-config -n carta

kubectl create secret generic carta-config \
  -n carta \
  --from-file=config.json
```

---

## iii. Create the nsswitch ConfigMap

Create a ConfigMap from `nsswitch.conf`:

```bash
cd Kubernetes-deployment/scripts/Application-layer

kubectl create configmap nsswitch-conf \
  -n carta \
  --from-file=nsswitch.conf
```

Verify:

```bash
kubectl get configmap nsswitch-conf -n carta
```

---

## iv. Create the Extra Users Secret

The `extrausers` directory contains user and group files used by `libnss-extrausers`.

Create the Secret:

```bash
cd Kubernetes-deployment/scripts/Operational-layer

kubectl create secret generic carta-extrausers \
  -n carta \
  --from-file=extrausers
```

Verify:

```bash
kubectl get secret carta-extrausers -n carta
```

---

## v. Deploy the CARTA Controller

Apply the CARTA controller manifest:

```bash
cd Kubernetes-deployment/scripts/Application-layer
kubectl apply -f carta-controller.yaml
```

Verify:

```bash
kubectl get pods -n carta
kubectl get deployment -n carta
kubectl logs -n carta deployment/carta-controller
```

---

## vi. Deploy the CARTA Controller Service

Apply the service manifest:

```bash
cd Kubernetes-deployment/scripts
kubectl apply -f carta-controller-service.yaml
```

Verify:

```bash
kubectl get svc -n carta
```

Expected result:

```text
NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)
controller-service   ClusterIP   ...             <none>        8000/TCP
```

---

## vii. Test Access Using Port Forwarding

For testing, use port forwarding:

```bash
kubectl port-forward -n carta svc/controller-service 8000:8000
```

Open the following URL in a browser:

```text
http://localhost:8000
```

---

## viii. Deploy Ingress

If external access is required, deploy ingress:

```bash
cd Kubernetes-deployment/scripts/Operational-layer
chmod +x deploy-ingress.sh
./deploy-ingress.sh
```

Verify:

```bash
kubectl get ingress -n carta
kubectl get svc -n carta
```

---

# Verification

Check all CARTA resources:

```bash
kubectl get all -n carta
```

Check the CephFS PVC:

```bash
kubectl get pvc -n carta
```

Check MongoDB:

```bash
kubectl get pods -n mongodb
kubectl get svc -n mongodb
```

Check controller logs:

```bash
kubectl logs -n carta deployment/carta-controller
```

After logging in to CARTA, check whether a backend pod is created:

```bash
kubectl get pods -n carta
```

Expected result:

```text
carta-backend-<username>   Running
```

---

# Cleanup

Delete CARTA resources:

```bash
kubectl delete -f Kubernetes-deployment/scripts/Application-layer/carta-controller.yaml
kubectl delete -f Kubernetes-deployment/scripts/carta-controller-service.yaml
kubectl delete -f Kubernetes-deployment/scripts/Application-layer/carta-backend-config.yaml
```

Delete Secrets and ConfigMaps:

```bash
kubectl delete secret carta-config -n carta
kubectl delete secret carta-extrausers -n carta
kubectl delete configmap nsswitch-conf -n carta
```

Delete CephFS resources:

```bash
kubectl delete -f Kubernetes-deployment/scripts/infrastructure-layer/cephfs-pvc.yaml
kubectl delete -f Kubernetes-deployment/scripts/infrastructure-layer/cephfs-storageclass.yaml
```

Delete MongoDB resources:

```bash
kubectl delete namespace mongodb
kubectl delete namespace mongodb-operator
```

Delete the CARTA namespace:

```bash
kubectl delete namespace carta
```

Only delete namespaces if no important resources are still required.

---

# Folder Structure

```text
Kubernetes-deployment/
├── README.md
├── carta-controller/
└── scripts/
    ├── infrastructure-layer/
    │   ├── common.sh
    │   ├── master.sh
    │   ├── worker-node.sh
    │   ├── ceph-csi-plugin.sh
    │   ├── deploy-mongodb-community.sh
    │   ├── cephfs-storageclass.yaml
    │   └── cephfs-pvc.yaml
    │
    ├── Application-layer/
    │   ├── carta-backend-config.yaml
    │   ├── carta-controller.yaml
    │   ├── config.json
    │   └── nsswitch.conf
    │
    └── Operational-layer/
        ├── deploy-ingress.sh
        └── extrausers
```

---

# Expected Result

After completing the setup:

- Kubernetes nodes are ready
- CephFS is available through Ceph CSI
- the CephFS PVC is bound
- MongoDB is running for CARTA controller state
- the CARTA controller is running in Kubernetes
- the controller is accessible through a Service or Ingress
- authenticated users can start CARTA backend pods
- backend pods can access shared image data through CephFS

