CARTA Deployed on Kubernetes


The scripts will be categorised into three:


1.Infrastructure Layer

This layer prepares the Kubernetes cluster and the storage environment required for CARTA. It covers cluster bootstrapping with kubeadm, worker-node participation, CephFS integration through Ceph-CSI, namespace creation, and persistent storage provisioning.

Main responsibilities

initialize the Kubernetes cluster
configure node access through kubeconfig
deploy Ceph-CSI components
create the carta namespace
create the StorageClass and PersistentVolumeClaim for shared CephFS storage

Scripts and files in this layer

setup-kubeadm.sh — prepares the control-plane and worker nodes for Kubernetes
setup-cephfs-csi.sh — deploys the Ceph-CSI CephFS driver
cephfs-storageclass.yaml — defines the CephFS StorageClass
cephfs-pvc.yaml — creates the shared PersistentVolumeClaim
namespace.yaml — creates the carta namespace


Outcome
After completing this layer, the cluster is running, storage is available through CephFS, and the environment is ready for CARTA application deployment.


2.Application Deployment Layer

This layer deploys the CARTA controller and the supporting application resources inside Kubernetes. It includes controller configuration, secrets, config maps, RBAC, mounted identity files, and backend execution behavior.

Main responsibilities

deploy the CARTA controller into the carta namespace
provide controller configuration through Secret and ConfigMap
mount supporting files such as nsswitch.conf, host keys, and extrausers
define RBAC resources for backend pod management
build and use the modified controller image
configure backend startup to open user-specific directories

Scripts and files in this layer

deploy-carta-controller.sh — applies the controller deployment resources
controller-secret.yaml — stores config.json
controller-configmap.yaml — stores backend runtime parameters
controller-deployment.yaml — deploys the CARTA controller
rbac.yaml — creates the service account, role, and role binding
Dockerfile — builds the modified CARTA controller image

Outcome
After completing this layer, the CARTA controller is deployed and able to create and manage backend sessions for authenticated users.


3.Operational Setup and Maintenance Layer

This layer covers the configuration needed to make the deployment usable and maintainable in practice. It focuses on user identity consistency, storage permissions, access control, and external connectivity.

Main responsibilities

create per-user directories on CephFS
assign correct UIDs and GIDs for user isolation
restrict directory access with appropriate permissions
ensure PAM-based authentication works with the mounted identity files
expose the deployment through Ingress and external access mechanisms
verify that the platform is functioning correctly

Scripts and files in this layer

create-user-directories.sh — creates user directories on CephFS
set-directory-permissions.sh — applies ownership and chmod 700
ingress.yaml — exposes the CARTA controller externally
metallb-config.yaml — provides load-balanced access where required
validate-deployment.sh — checks pod status, storage mounts, and service availability

Outcome
After completing this layer, users can authenticate, access only their own directories, and use CARTA through the deployed entry point.
