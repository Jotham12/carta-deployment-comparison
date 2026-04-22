#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${NAMESPACE:-carta}"
WORKDIR="${WORKDIR:-/var/lib/extrausers}"
USERS_BASEDIR="${USERS_BASEDIR:-/home}"

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Error: required command not found: $1" >&2
        exit 1
    }
}

prompt_password() {
    local username="$1"
    local pass1 pass2
    while true; do
        read -rsp "Enter password for ${username}: " pass1
        echo
        read -rsp "Confirm password for ${username}: " pass2
        echo

        if [[ -z "${pass1}" ]]; then
            echo "Password cannot be empty."
            continue
        fi

        if [[ "${pass1}" != "${pass2}" ]]; then
            echo "Passwords do not match. Try again."
            continue
        fi

        printf '%s' "${pass1}"
        return 0
    done
}

hash_password() {
    local password="$1"
    printf '%s' "${password}" | openssl passwd -6 -stdin
}

create_user_dir() {
    local username="$1"
    local uid="$2"
    local gid="$3"
    local userdir="${USERS_BASEDIR}/${username}"

    echo "==> Creating directory ${userdir}"
    sudo mkdir -p "${userdir}"
    sudo chown -R "${uid}:${gid}" "${userdir}"
    sudo chmod 700 "${userdir}"
}

require_cmd kubectl
require_cmd openssl
require_cmd sudo

echo "==> Creating working directory: ${WORKDIR}"
sudo mkdir -p "${WORKDIR}"
sudo chown "$(id -u):$(id -g)" "${WORKDIR}"
cd "${WORKDIR}"

echo "==> Ensuring namespace exists: ${NAMESPACE}"
kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

echo "==> Prompting for user passwords"
SANELE_PASSWORD="$(prompt_password sanele)"
JOTHAM_PASSWORD="$(prompt_password jotham)"
SANS_PASSWORD="$(prompt_password sans)"

echo "==> Hashing passwords"
SANELE_HASH="$(hash_password "${SANELE_PASSWORD}")"
JOTHAM_HASH="$(hash_password "${JOTHAM_PASSWORD}")"
SANS_HASH="$(hash_password "${SANS_PASSWORD}")"

unset SANELE_PASSWORD JOTHAM_PASSWORD SANS_PASSWORD

SHADOW_DAYS="$(($(date +%s) / 86400))"

echo "==> Writing passwd"
cat > passwd <<'EOF'
sanele:x:1001:1001:Sanele Dlamini:/home/sanele:/bin/bash
jotham:x:1002:1002:Jotham User:/home/jotham:/bin/bash
sans:x:1003:1003:Sans User:/home/sans:/bin/bash
EOF

echo "==> Writing group"
cat > group <<'EOF'
sanele:x:1001:
jotham:x:1002:
sans:x:1003:
EOF

echo "==> Writing shadow"
cat > shadow <<EOF
sanele:${SANELE_HASH}:${SHADOW_DAYS}:0:99999:7:::
jotham:${JOTHAM_HASH}:${SHADOW_DAYS}:0:99999:7:::
sans:${SANS_HASH}:${SHADOW_DAYS}:0:99999:7:::
EOF

echo "==> Writing nsswitch.conf"
cat > nsswitch.conf <<'EOF'
passwd: compat extrausers
group: compat extrausers
shadow: compat extrausers
EOF

chmod 644 passwd group nsswitch.conf
chmod 600 shadow

echo "==> Creating user directories with ownership and permissions"
create_user_dir sanele 1001 1001
create_user_dir jotham 1002 1002
create_user_dir sans 1003 1003

echo "==> Creating/updating secret: carta-extrausers"
kubectl -n "${NAMESPACE}" create secret generic carta-extrausers \
  --from-file=passwd \
  --from-file=group \
  --from-file=shadow \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Creating/updating configmap: nsswitch-conf"
kubectl -n "${NAMESPACE}" create configmap nsswitch-conf \
  --from-file=nsswitch.conf \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Verifying resources"
kubectl -n "${NAMESPACE}" get secret carta-extrausers
kubectl -n "${NAMESPACE}" get configmap nsswitch-conf

echo "==> Verifying directories"
ls -ld "${USERS_BASEDIR}/sanele" "${USERS_BASEDIR}/jotham" "${USERS_BASEDIR}/sans"

echo "==> Done"
echo "Files created in: ${WORKDIR}"
