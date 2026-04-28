# CARTA Controller Deployment on Kubernetes

This folder contains the Kubernetes deployment of the CARTA controller.

The deployment allows the CARTA controller to run inside Kubernetes and dynamically create CARTA backend pods for authenticated users. CephFS is used as shared storage, MongoDB is used for CARTA controller state, and `libnss-extrausers` is used for user and group mapping.

For the full step-by-step deployment commands, see:

[SETUP.md](./SETUP.md)

---

## Deployment Components

This deployment uses:

- Kubernetes for container orchestration
- `kubeadm` for cluster setup
- CephFS for shared persistent storage
- Ceph CSI for connecting CephFS to Kubernetes
- MongoDB for CARTA controller state
- `libnss-extrausers` for UID and GID mapping
- Kubernetes Secrets and ConfigMaps for configuration
- Kubernetes RBAC for backend pod management
- Kubernetes Service and optional Ingress for controller access

---

## Setup Structure

The setup is divided into two separate parts:

1. **Script-based infrastructure setup**
2. **CARTA controller deployment setup**

This separation is used to avoid mixing cluster/storage preparation with the application deployment.

---

## 1. Script-Based Infrastructure Setup

This part prepares the Kubernetes and storage infrastructure before the CARTA controller is deployed. The two scripts common.sh and master.sh automate the setup of a Kubernetes cluster using kubeadm with containerd as the container runtime.

- ['common.sh'](./scripts/infrastructure-layer/worker.sh)
   Common setup script for all nodes (control plane and worker nodes). This script:
  - Disables swap
  - Configures kernel modules (overlay, br_netfilter)
  - Sets up networking parameters
  - Installs containerd runtime
  - Installs and configures crictl
  - Installs kubelet, kubeadm, and kubectl

- [`master-node.sh`](./scripts/infrastructure-layer/master.sh)
  Control plane (master) node setup script. This script:
  - Pulls required Kubernetes images
  - Initializes the control plane using kubeadm
  - Configures kubeconfig
  - Installs Calico network plugin
## Usage
## i.  Setup Control Plane Node

Run the common setup script first, then initialize the Kubernetes control plane.

```bash 
# Run common setup
sudo bash common.sh

# Initialize control plane
sudo bash master.sh

## ii. Setup Worker Nodes
Run this script on worker node
```bash
# Run common setup on each worker node
sudo bash common.sh

# Join the cluster using the command from master node output
sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>


It includes:

- setting up the Kubernetes control-plane node
- setting up and joining worker nodes
- deploying Ceph CSI
- creating the CephFS StorageClass
- creating the CephFS PersistentVolumeClaim
- deploying MongoDB for CARTA controller state

Main files:


- [`ceph-csi-plugin.sh`](./scripts/infrastructure-layer/ceph-csi-plugin.sh)
- [`deploy-mongodb-community.sh`](./scripts/infrastructure-layer/deploy-mongodb-community.sh)
- [`cephfs-storageclass.yaml`](./scripts/infrastructure-layer/cephfs-storageclass.yaml)
- [`cephfs-pvc.yaml`](./scripts/infrastructure-layer/cephfs-pvc.yaml)

Follow the infrastructure setup section here:

[Script-Based Infrastructure Setup](./SETUP.md#script-based-infrastructure-setup)

---

## 2. CARTA Controller Deployment Setup

This part deploys the CARTA controller and the Kubernetes resources required by the controller.

It includes:

- creating the `carta` namespace
- creating the backend ConfigMap
- creating the CARTA controller configuration Secret
- creating the extra users Secret
- creating the `nsswitch.conf` ConfigMap
- configuring RBAC for backend pod management
- deploying the CARTA controller
- exposing the controller through a Service or Ingress

Main files:

- [`carta-backend-config.yaml`](./scripts/Application-layer/carta-backend-config.yaml)
- [`config.json`](./scripts/Application-layer/config.json)
- [`nsswitch.conf`](./scripts/Application-layer/nsswitch.conf)
- [`carta-controller.yaml`](./scripts/Application-layer/carta-controller.yaml)
- [`carta-controller-service.yaml`](./scripts/carta-controller-service.yaml)
- [`extrausers`](./scripts/Operational-layer/extrausers)
- [`deploy-ingress.sh`](./scripts/Operational-layer/deploy-ingress.sh)

Follow the CARTA controller setup section here:

[CARTA Controller Deployment Setup](./SETUP.md#carta-controller-deployment-setup)

---

## Folder Structure

```text
Kubernetes-deployment/
├── README.md
├── SETUP.md
├── carta-controller/
└── scripts/
    ├── infrastructure-layer/
    │   ├── master-node.sh
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
