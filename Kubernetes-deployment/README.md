# CARTA Deployment on Kubernetes

This document outlines the steps required to deploy the CARTA controller on a Kubernetes cluster using CephFS shared storage and Kubernetes backend pods.

The deployment is organised into three layers:

- `Infrastructure-layer` — prepares Kubernetes and CephFS storage
- `Application-layer` — deploys CARTA controller, MongoDB, backend configuration, and controller configuration
- `Operational-layer` — configures external access and extra user identity files

The Kubernetes deployment uses:

- `kubeadm` for Kubernetes cluster setup
- Ceph-CSI for CephFS storage integration
- a shared CephFS PersistentVolumeClaim for CARTA image data
- Kubernetes RBAC so the controller can create and manage backend pods
- extra user identity files for UID/GID mapping
- Ingress for external access to the controller

---

# Prerequisites

Before deploying CARTA on Kubernetes, make sure the following are available:

- A Kubernetes cluster with one control-plane node and at least one worker node
- `kubectl` configured on the control-plane node
- A working Ceph cluster
- A CephFS filesystem
- Ceph client credentials with access to the CephFS filesystem
- Ceph-CSI support for CephFS
- A PersistentVolumeClaim that supports `ReadWriteMany`
- User identity files for mapping users inside the controller and backend pods
- Ingress support for exposing the CARTA controller

The repository is organised as follows:

```text
Kubernetes-deployment/
├── scripts/
│   ├── Infrastructure-layer/
│   │   ├── ceph-csi-plugin.sh
│   │   ├── cephfs-pvc.yaml
│   │   ├── cephfs-storageclass.yaml
│   │   ├── master-node.sh
│   │   └── worker-node.sh
│   │
│   ├── Application-layer/
│   │   ├── carta-backend-config.yaml
│   │   ├── carta-controller.yaml
│   │   ├── config.json
│   │   ├── mongodb-comunity.yaml
│   │   └── nsswitch.conf
│   │
│   └── Operational-layer/
│       ├── deploy-ingress.sh
│       └── extrausers
