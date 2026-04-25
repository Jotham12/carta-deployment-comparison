# CARTA Deployment Comparison

This repository documents two deployment approaches for the Cube Analysis and Rendering Tool for Astronomy (CARTA):

1. **Kubernetes deployment**
2. **HPC deployment using Slurm as the resource manager**

The purpose of this repository is to show how CARTA can be deployed in both environments and how the main CARTA components can be combined with shared storage, authentication, backend execution, and monitoring services.

---

## Deployment Approaches

### 1. Kubernetes Deployment

The Kubernetes deployment uses Kubernetes to manage the CARTA controller and backend services. In this setup, CARTA backend instances are launched as Kubernetes pods on worker nodes.

This deployment includes:

- Kubernetes cluster setup
- CephFS storage integration
- Ceph-CSI plugin
- CARTA controller deployment
- MongoDB
- backend pod creation
- ingress configuration
- user directory isolation

Deployment guide:

[View Kubernetes Deployment](https://github.com/Jotham12/carta-deployment-comparison/tree/main/Kubernetes-deployment)

---

### 2. HPC Deployment using Slurm

The HPC deployment uses Slurm as the resource manager. In this setup, the CARTA controller runs on the login/control node and launches CARTA backend instances as Slurm jobs on compute nodes.

This deployment includes:

- Slurm controller setup
- compute node setup
- Munge authentication
- CephFS shared storage
- CARTA controller configuration
- backend job submission
- user directory isolation

Deployment guide:

[View HPC/Slurm Deployment](https://github.com/Jotham12/carta-deployment-comparison/tree/main/hpc-deployment)

---

## Architecture Diagram

The diagram below shows the CARTA components that this repository aims to combine across the two deployment approaches.

![Architecture Diagram](architecture-diagram.png)

The architecture shows the main components involved in running CARTA in a multi-user environment.

Users access CARTA through a browser. Requests are routed through DNS and NGINX to the CARTA controller. The controller provides the dashboard, serves the frontend, handles server-side logic, and communicates with MongoDB for persistent state.

The CARTA backend instances run on separate compute resources. In the Kubernetes deployment, these backend instances are launched as pods on Kubernetes worker nodes. In the HPC deployment, the backend instances are launched as Slurm jobs on compute nodes.

CephFS provides shared access to FITS image data, allowing backend instances to access the same image files across nodes. A container image registry or image store provides the runtime images required for backend execution. Prometheus and metrics storage support monitoring by collecting metrics from the running services.

Overall, the diagram represents the components that need to work together for CARTA deployment:

- browser access
- DNS and NGINX routing
- CARTA controller
- CARTA frontend
- CARTA backend instances
- MongoDB
- CephFS shared storage
- container image registry or image store
- metrics scraping and monitoring

---

## Repository Structure

```text
carta-deployment-comparison/
├── Kubernetes-deployment/
│   ├── carta-controller/
│   ├── scripts/
│   └── README.md
│
├── hpc-deployment/
│   └── README.md
│
├── local-deployment/
│
├── architecture-diagram.png
├── calico-installation-recovery.yaml
└── README.md
