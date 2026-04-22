#!/usr/bin/env bash
set -euo pipefail

# References:
# https://canonical.com/microk8s/docs/how-to-ceph
# https://canonical-microceph.readthedocs-hosted.com/v19.2.0-squid/how-to/mount-cephfs-share/

# -----------------------------
# Configurable values
# -----------------------------
KUBECTL_VERSION="${KUBECTL_VERSION:-v1.35.0}"
MICROCEPH_CHANNEL="${MICROCEPH_CHANNEL:-latest/stable}"
MICROK8S_CHANNEL="${MICROK8S_CHANNEL:-1.28/stable}"
LOOP_SIZE="${LOOP_SIZE:-2G}"
LOOP_DIR="${LOOP_DIR:-/mnt}"
FS_NAME="${FS_NAME:-newFs}"
META_POOL="${META_POOL:-cephfs_meta}"
DATA_POOL="${DATA_POOL:-cephfs_data}"

echo "==> Installing kubectl..."
cd /tmp
curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl"
curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256"
echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check
chmod +x kubectl
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm -f kubectl kubectl.sha256

echo "==> Verifying kubectl installation..."
kubectl version --client

echo "==> Removing old MicroCeph (if installed)..."
if snap list microceph >/dev/null 2>&1; then
    sudo snap remove microceph --purge
fi

echo "==> Installing MicroCeph..."
sudo snap install microceph --channel="${MICROCEPH_CHANNEL}"

echo "==> Bootstrapping MicroCeph cluster..."
sudo microceph cluster bootstrap

echo "==> Creating loop-backed disks and adding them to MicroCeph..."
for l in a b c; do
    loop_file="$(sudo mktemp -p "${LOOP_DIR}" XXXX.img)"
    sudo truncate -s "${LOOP_SIZE}" "${loop_file}"

    loop_dev="$(sudo losetup --show -f "${loop_file}")"
    minor="${loop_dev##/dev/loop}"

    if [ -e "/dev/sdi${l}" ]; then
        sudo rm -f "/dev/sdi${l}"
    fi

    sudo mknod -m 0660 "/dev/sdi${l}" b 7 "${minor}"
    sudo microceph disk add --wipe "/dev/sdi${l}"
done

echo "==> Setting Ceph configuration..."
sudo microceph.ceph config set global osd_pool_default_size 2
sudo microceph.ceph config set mgr mgr_standby_modules false
sudo microceph.ceph config set osd osd_crush_chooseleaf_type 0

echo "==> Creating CephFS pools..."
sudo microceph.ceph osd pool create "${META_POOL}"
sudo microceph.ceph osd pool create "${DATA_POOL}"

echo "==> Creating CephFS filesystem..."
sudo microceph.ceph fs new "${FS_NAME}" "${META_POOL}" "${DATA_POOL}"

echo "==> Checking Ceph status..."
sudo microceph.ceph status

echo "==> Listing CephFS filesystems..."
sudo microceph.ceph fs ls

echo "==> Installing MicroK8s..."
sudo snap install microk8s --channel="${MICROK8S_CHANNEL}" --classic

echo "==> Waiting for MicroK8s to become ready..."
sudo microk8s status --wait-ready

echo "==> Disabling rook-ceph (if enabled)..."
sudo microk8s disable rook-ceph --force || true

echo "==> Connecting MicroK8s to external Ceph..."
sudo microk8s connect-external-ceph \
    --ceph-conf /etc/ceph/ceph.conf \
    --keyring /etc/ceph/ceph.keyring

echo "==> Setting up kubeconfig..."
mkdir -p "${HOME}/.kube"
sudo microk8s config > "${HOME}/.kube/config"
chmod 600 "${HOME}/.kube/config"

echo "==> Done."
