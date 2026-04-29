# CARTA HPC Deployment Using Slurm

This document outlines the steps required to deploy CARTA in an HPC environment using Slurm as the resource manager. In this setup, the CARTA controller runs on the login/control node and launches CARTA backend processes on Slurm compute nodes.

The deployment uses:

- Slurm for workload management
- Munge for authentication between Slurm nodes
- MariaDB and SlurmDBD for Slurm accounting
- `nss_slurm` for exposing Slurm job users on compute nodes
- CephFS for shared user and data directories
- PAM authentication for CARTA user login
- CARTA controller configuration through `config.json`

The main goal of this setup is to allow users to authenticate through the CARTA controller on the login node and launch CARTA backend sessions on compute nodes managed by Slurm. Each backend session is launched in the authenticated user's own home directory, for example `/home/{username}`.

---


Deployment Overview
===

The HPC deployment consists of the following main components:

| Component | Node | Purpose |
|---|---|---|
| CARTA controller | Login node | Authenticates users and launches CARTA backend jobs |
| Slurm controller | Login node | Manages the Slurm cluster |
| SlurmDBD | Login node | Provides Slurm accounting support |
| MariaDB | Login node | Stores Slurm accounting data |
| Munge | Login and compute nodes | Provides authentication between Slurm services |
| Slurmd | Compute nodes | Runs jobs submitted by Slurm |
| CephFS | Login and compute nodes | Provides shared user and data directories |
| CARTA backend | Compute nodes | Runs user CARTA backend sessions inside the user's folder |

---

Repository Scripts
===

This deployment uses two main infrastructure setup scripts.

**Login/control node setup script**

```text
https://github.com/Jotham12/carta-deployment-comparison/blob/main/hpc-deployment/scripts/infrastructure-setup/login-node.sh
```

This script is used on the login/control node. It installs and configures:

- Munge
- MariaDB
- SlurmDBD
- Slurm controller
- Slurm configuration files
- `nss_slurm`
- Firewall rules
- Slurm services

**Compute node setup script**

```text
https://github.com/Jotham12/carta-deployment-comparison/blob/main/hpc-deployment/scripts/infrastructure-setup/compute-node.sh
```

This script is used on each compute node. It installs and configures:

- Munge
- Slurmd
- Slurm worker configuration
- `nss_slurm`
- Firewall rules
- Compute node Slurm services

---

Cluster Layout
===

A simple deployment can use the following layout:

| Hostname | Role | Services |
|---|---|---|
| `vm1` | Login/control node | CARTA controller, `slurmctld`, `slurmdbd`, MariaDB, Munge |
| `vm2` | Compute node | `slurmd`, Munge, CARTA backend |
| `vm3` | Compute node | `slurmd`, Munge, CARTA backend |

The login node controls the cluster, while the compute nodes execute CARTA backend sessions.

The Slurm configuration used by the setup defines the nodes and partition as follows:

```text
NodeName=vm2 NodeAddr=192.168.1.28 CPUs=4 Boards=1 SocketsPerBoard=4 CoresPerSocket=1 ThreadsPerCore=1 RealMemory=32093 State=UNKNOWN
NodeName=vm3 NodeAddr=192.168.1.26 CPUs=2 RealMemory=2048 State=UNKNOWN
PartitionName=debug Nodes=vm2,vm3 Default=YES MaxTime=INFINITE State=UP
```

Update these values based on the actual hostnames, IP addresses, CPU count, and memory available in your environment.

---

Shared Directory
===

The scripts use the following shared directory:

```text
/data/slurm
```

This directory is used to share files between the login node and compute nodes.

The login-node script copies the Munge key into this shared directory:

```text
/data/slurm/munge.key
```

The compute-node script expects to find the Munge key in this location before it can configure Munge.

The compute nodes also expect the Slurm configuration file to be available in the shared directory:

```text
/data/slurm/slurm.conf
```

Make sure `/data/slurm` is available on all nodes before running the scripts.

---

Login Node Setup
===

The login/control node is responsible for running the main Slurm services and the CARTA controller.

On the login node, download or copy the login-node setup script:

```bash
wget https://raw.githubusercontent.com/Jotham12/carta-deployment-comparison/main/hpc-deployment/scripts/infrastructure-setup/login-node.sh
```

Make the script executable:

```bash
chmod +x login-node.sh
```

Run the script:

```bash
./login-node.sh
```

The script performs the following tasks:

- Creates the `munge` user and group
- Creates the `slurm` user and group
- Installs required packages
- Configures Munge
- Copies the Munge key to `/data/slurm`
- Clones the Slurm source repository
- Builds and installs `nss_slurm`
- Configures MariaDB for Slurm accounting
- Creates the Slurm accounting database
- Creates the `slurmdbd.conf` file
- Creates the `slurm.conf` file
- Creates the cgroup configuration
- Opens required firewall ports
- Starts `slurmdbd`
- Starts `slurmctld`

The login node script creates the following important files:

```text
/etc/slurm/slurm.conf
/etc/slurm/slurmdbd.conf
/etc/slurm-llnl/cgroup.conf
```

---

Munge Configuration
===

Munge is used by Slurm for authentication between the login node and compute nodes.

The login node must have a Munge key at:

```text
/etc/munge/munge.key
```

The login-node setup script expects this key to already exist. If the key does not exist, create it before running the script.

Example:

```bash
sudo create-munge-key
```

Set the correct ownership and permissions:

```bash
sudo chown munge:munge /etc/munge/munge.key
sudo chmod 0400 /etc/munge/munge.key
```

After the login-node script runs, it copies the Munge key to:

```text
/data/slurm/munge.key
```

The compute nodes use this shared Munge key so that all Slurm nodes can authenticate with each other.

---

Slurm Accounting Database
===

The login-node script installs MariaDB and configures a Slurm accounting database.

The database configuration used in the script is:

```bash
SLURM_DB_NAME="slurm_acct_db"
SLURM_DB_USER="slurm"
SLURM_DB_PASS="hashmi12"
```

The script creates the database and grants privileges to the Slurm database user.

The generated `slurmdbd.conf` file uses:

```text
StorageType=accounting_storage/mysql
StorageHost=localhost
StorageLoc=slurm_acct_db
StorageUser=slurm
StoragePass=hashmi12
```

For production deployments, replace the default password with a stronger password and keep it private.

---

Slurm Configuration
===

The login-node script generates the main Slurm configuration file:

```text
/etc/slurm/slurm.conf
```

This file defines:

- Cluster name
- Slurm controller host
- Slurm user
- State save location
- Slurm ports
- Accounting configuration
- Node definitions
- Partition definitions
- `nss_slurm` launch parameters

The configuration includes:

```text
ClusterName=cluster
SlurmctldHost=vm1
SlurmUser=slurm
AccountingStorageType=accounting_storage/slurmdbd
AccountingStorageHost=localhost
AccountingStoragePort=6819
AccountingStorageEnforce=associations
SlurmctldPort=6817
SlurmdPort=6818
LaunchParameters=enable_nss_slurm
```

The `LaunchParameters=enable_nss_slurm` setting enables integration with `nss_slurm`.

After the login node is configured, copy the generated Slurm configuration file to the shared directory so that compute nodes can use it:

```bash
sudo cp /etc/slurm/slurm.conf /data/slurm/slurm.conf
```

---

Compute Node Setup
===

The compute nodes run `slurmd` and execute CARTA backend jobs submitted through Slurm.

Before running the compute-node script, make sure the following files exist on the shared filesystem:

```text
/data/slurm/munge.key
/data/slurm/slurm.conf
```

On each compute node, download or copy the compute-node setup script:

```bash
wget https://raw.githubusercontent.com/Jotham12/carta-deployment-comparison/main/hpc-deployment/scripts/infrastructure-setup/compute-node.sh
```

Make the script executable:

```bash
chmod +x compute-node.sh
```

Run the script:

```bash
./compute-node.sh
```

The compute-node script performs the following tasks:

- Creates the `munge` user and group
- Creates the `slurm` user and group
- Installs compute-node packages
- Copies the shared Munge key from `/data/slurm/munge.key`
- Configures Munge
- Clones the Slurm source repository
- Builds and installs `nss_slurm`
- Copies `slurm.conf` from `/data/slurm/slurm.conf`
- Creates the cgroup configuration
- Opens the compute-node Slurm firewall port
- Starts Munge
- Starts `slurmd`

Run this script on every compute node that should be part of the Slurm cluster.

---

Firewall Ports
===

The deployment uses the following Slurm ports:

| Port | Service | Node |
|---|---|---|
| `6817` | `slurmctld` | Login/control node |
| `6818` | `slurmd` | Compute nodes |
| `6819` | `slurmdbd` | Login/control node |

The login-node script opens:

```bash
sudo ufw allow 6817
sudo ufw allow 6818
sudo ufw allow 6819
```

The compute-node script opens:

```bash
sudo ufw allow 6818
```

If another firewall is used, allow these ports manually.

---

User and Directory Preparation
===

For CARTA to run correctly in the HPC environment, user accounts and directories must exist consistently across the login and compute nodes.

This setup requires:

- Creating user accounts explicitly on compute nodes
- Creating user accounts on the login node
- Creating user home directories
- Preparing per-user directories on CephFS
- Assigning correct ownership to user directories
- Restricting access with `chmod 700`

The CARTA backend is launched inside the authenticated user's folder. This means that each user must have a valid home directory, and the same directory path must be visible from the login node and the compute nodes.

For example, if the username is `jotham`, the backend should start inside:

```text
/home/jotham
```

Create the user account:

```bash
sudo useradd -m -s /bin/bash jotham
```

Create the user home directory on the shared filesystem if needed:

```bash
sudo mkdir -p /home/jotham
```

Assign ownership:

```bash
sudo chown jotham:jotham /home/jotham
```

Restrict access so that only the user can access their directory:

```bash
sudo chmod 700 /home/jotham
```

If CephFS is mounted at `/home` or used to store user data, make sure the same path is available on the login node and all compute nodes.

The same UID and GID should be used for the user on every node. This prevents permission problems when CARTA backend processes access files on CephFS.

---

CARTA Controller Configuration
===

The CARTA controller is configured using a `config.json` file on the login node.

Create or edit the controller configuration file:

```bash
nano config.json
```

Use the following configuration:

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
        "uri": "mongodb://admin:admin123@mongodb-svc.mongodb.svc.cluster.local:27017/CARTA?authSource=admin",
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

This configuration defines:

- PAM-based authentication
- CARTA public and private key locations
- MongoDB connection settings
- CARTA controller port
- CARTA controller network interface
- Backend launch command
- Backend kill command
- User root folder template
- User base folder template
- Controller log file
- Dashboard appearance and login text

The following settings are important because they make the backend start in the user's own directory:

```json
"rootFolderTemplate": "/home/{username}",
"baseFolderTemplate": "/home/{username}"
```

When a user logs in, `{username}` is replaced with the authenticated username. For example, if the user is `jotham`, CARTA uses:

```text
/home/jotham
```

This ensures that each CARTA backend session starts inside that user's own folder.

---

PAM Authentication
===

This deployment uses PAM authentication for CARTA login.

The PAM provider is configured in `config.json`:

```json
"authProviders": {
    "pam": {
        "publicKeyLocation": "/carta-host-keys/carta_public.pem",
        "privateKeyLocation": "/carta-host-keys/carta_private.pem",
        "issuer": "carta.example.com"
    }
}
```

The public and private keys must exist on the login node:

```text
/carta-host-keys/carta_public.pem
/carta-host-keys/carta_private.pem
```

Create the key directory if it does not exist:

```bash
sudo mkdir -p /carta-host-keys
```

Make sure the CARTA controller can read the keys.

---

Backend Launch and Kill Commands
===

The controller configuration defines the backend launch command:

```json
"processCommand": "/usr/bin/carta_backend"
```

It also defines the backend kill command:

```json
"killCommand": "/usr/bin/carta-kill-script"
```

In this HPC deployment, the backend launch command should start the CARTA backend through Slurm and ensure that the backend runs inside the authenticated user's folder.

For example, if the user is `jotham`, the backend should be launched with the working directory set to:

```text
/home/jotham
```

The kill command should stop the corresponding backend process or Slurm job when the user session ends.

Make sure the following files exist and are executable:

```bash
/usr/bin/carta_backend
/usr/bin/carta-kill-script
```

Set executable permissions if needed:

```bash
sudo chmod +x /usr/bin/carta_backend
sudo chmod +x /usr/bin/carta-kill-script
```

The backend launch script should respect the user folder defined by:

```json
"baseFolderTemplate": "/home/{username}"
```

This is important so that users only work inside their own directories and do not start CARTA sessions from a shared or system-level location.

---

User Folder Templates
===

The controller uses folder templates to make sure each user starts inside their own directory.

The following settings are used:

```json
"rootFolderTemplate": "/home/{username}",
"baseFolderTemplate": "/home/{username}"
```

This means that when a user logs in, CARTA will use that user's home directory as the starting location.

For example, if the user is `jotham`, CARTA will use:

```text
/home/jotham
```

The backend is then launched from this user's folder, so the folder must exist and have correct ownership.

Example:

```bash
sudo mkdir -p /home/jotham
sudo chown jotham:jotham /home/jotham
sudo chmod 700 /home/jotham
```

---

Starting the CARTA Controller
===

After configuring Slurm, user directories, and `config.json`, start the CARTA controller on the login node.

Before starting the controller, stop any existing CARTA controller process that may already be running:

```bash
sudo pkill -f "node dist/index.js"
```

Wait briefly for the old process to stop:

```bash
sleep 2
```

Start the CARTA controller as the `carta` user:

```bash
sudo -u carta -H bash -lc 'cd /home/ubuntu/carta-deployment-comparison/hpc-deployment/carta-controller/hpc-deployment-using-slurm/carta-controller && npm run start'
```

This command does the following:

- Runs the controller as the `carta` user
- Uses the `carta` user's home environment with `-H`
- Changes into the CARTA controller directory
- Starts the controller using `npm run start`

The complete restart command is:

```bash
sudo pkill -f "node dist/index.js"
sleep 2
sudo -u carta -H bash -lc 'cd /home/ubuntu/carta-deployment-comparison/hpc-deployment/carta-controller/hpc-deployment-using-slurm/carta-controller && npm run start'
```

The CARTA controller should now start on the login node using the configuration defined in `config.json`.

---

Expected Result
===

After the setup is complete:

- The login node runs the CARTA controller.
- The login node runs `slurmctld`, `slurmdbd`, MariaDB, and Munge.
- Each compute node runs `slurmd` and Munge.
- User home directories exist on the shared filesystem.
- Users authenticate through PAM.
- The CARTA controller launches backend sessions through the configured backend command.
- CARTA backend processes run on Slurm compute nodes.
- Each CARTA backend session is launched inside the authenticated user's folder.
- Users start in their own `/home/{username}` directory.

---

Clean Up
===

To stop Slurm services on the login node:

```bash
sudo systemctl stop slurmctld
sudo systemctl stop slurmdbd
sudo systemctl stop munge
```

To stop Slurm services on a compute node:

```bash
sudo systemctl stop slurmd
sudo systemctl stop munge
```

To stop the CARTA controller:

```bash
sudo pkill -f "node dist/index.js"
```

To disable services on the login node:

```bash
sudo systemctl disable slurmctld
sudo systemctl disable slurmdbd
sudo systemctl disable munge
```

To disable services on a compute node:

```bash
sudo systemctl disable slurmd
sudo systemctl disable munge
```

Only remove configuration files and user directories if they are no longer required.

---


