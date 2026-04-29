# CARTA Deployment Comparison

This repository compares two deployment approaches for the Cube Analysis and Rendering Tool for Astronomy (CARTA):

1. **Kubernetes deployment**
2. **HPC deployment using Slurm as the resource manager**

The purpose of this repository is to document how CARTA can be deployed in both environments and how the main CARTA components can be combined with shared storage, authentication, backend execution, and monitoring services.

3. ***Use Deployment Mode/ local-deployment**
This deployment isn't part of the comparison we put it here for a single user who wants to observe the usses of CARTA we added a bash script under the local-deployment folder `installing_carta.sh` 
---

## Deployment Guides

### Kubernetes Deployment

The Kubernetes deployment uses Kubernetes to manage CARTA services. In this setup, CARTA backend instances are launched as pods on worker nodes.

- Overview: [Kubernetes Deployment README](https://github.com/Jotham12/carta-deployment-comparison/tree/main/Kubernetes-deployment)
- Setup steps: [Kubernetes Deployment SETUP](https://github.com/Jotham12/carta-deployment-comparison/tree/main/Kubernetes-deployment)

### HPC Deployment using Slurm

The HPC deployment uses Slurm as the resource manager. In this setup, the CARTA controller runs on the login/control node and launches backend instances as Slurm jobs on compute nodes.

- Overview: [HPC Deployment README](https://github.com/Jotham12/carta-deployment-comparison/tree/main/hpc-deployment)
- Setup steps: [HPC Deployment SETUP](https://github.com/Jotham12/carta-deployment-comparison/tree/main/hpc-deployment)

---

## Architecture Diagram

The diagram below shows the CARTA components that this repository aims to combine across the two deployment approaches.

![Architecture Diagram](diagram1.png)

Users access CARTA through a browser. Requests are routed through DNS and NGINX to the CARTA controller. The controller provides the dashboard, serves the frontend, handles server-side logic, and communicates with MongoDB for persistent state.

The backend execution layer differs between the two deployments:

- in the Kubernetes deployment, CARTA backend instances are launched as Kubernetes pods
- in the HPC deployment, CARTA backend instances are launched as Slurm jobs on compute nodes

CephFS provides shared access to FITS image data. A container image registry or image store provides runtime images where containers are used. Prometheus and metrics storage support monitoring.

---

## Repository Structure

```text
carta-deployment-comparison/
├── Kubernetes-deployment/
│   ├── README.md
│   ├── SETUP.md
│   ├── carta-controller/
│   └── scripts/
│
├── hpc-deployment/
   ├── README.md
   ├── SETUP.md
   ├── carta-controller/
   └── scripts/
